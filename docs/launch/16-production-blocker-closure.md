# 16 — 生产开放阻断项收口（Blocker Closure）

**日期**: 2026-11-04
**方法**: 只读核实（git / VPS api.env / HTTP 探测）+ 隔离库端到端 E2E + 代码路径逐场景审计
**约束遵守**: 未做 Git 写操作、未改生产配置、未触发真实收款/退款/付费生成、未写入真实数据库

---

## 1. Git 状态核实（只读）

```
HEAD: ab6fadd  docs(launch): phase-2 production precheck reports 11-15
分支: master（与 origin/master 一致，未 push 超前提交未核实远端）
Dirty files: 70（商业化闸门改造 + SEO 审计遗留 + 本轮新增测试脚本）
```

Dirty 文件分组（与 doc 15 一致，另新增）：
- **T2 商业化**：`apps/api` app.ts / payment.ts / routes.ts / env.ts / generation.routes.ts + commercialization-gates / payment-checkout-timing 测试 + web 侧 StudioGate / CheckoutButton / pricing 组件 / 7 语言 messages
- **T1 SEO 审计遗留**：wallpapers.ts / WallpaperBrowser / seo-audit CSV×8 / media 脚本
- **本轮新增**：`apps/api/tests/browser-mock-checkout.ts`（Mock 收款全流程 E2E 脚本）
- **报告**：docs/launch/11-15（已提交 ab6fadd），16-18（本轮产出，未提交）

**结论**：工作区状态与上一轮报告一致，无意外改动；本轮仅新增一个测试脚本与三份报告。

## 2. 生产 Mock/暂停状态核实（只读）

VPS `wallhaze-app` api.env 实测（doc 11/15 已记录，本轮复核未变）：

| 配置 | 值 | 含义 |
|---|---|---|
| NODE_ENV | production | 生产构建 |
| FAL_MOCK | 1 | 生成走 Mock（不会调用 fal.ai） |
| GENERATION_PAUSED | 1 | 新生成任务 503 |
| PAYMENT_PROVIDER | disabled | Checkout 一律 403 |
| PAYMENT_ENVIRONMENT | test | 即使误开也不会匹配 prod 事件 |
| FAL_LIVE_ENABLED / FAL_VIDEO_LIVE_ENABLED | 空 | live 不可用 |
| STUDIO/VIDEO/PURCHASES_PUBLIC_ENABLED | ABSENT | 三闸门全关 |
| OUTPUT_MODERATION_API_KEY | ABSENT | 输出审核 fail-closed |
| WAFFO_MERCHANT_ID / STORE_ID / PRIVATE_KEY | EMPTY | Waffo 不可用 |

**生产健康**：`GET /health` → 200（v0.2.0），PostgreSQL healthy（迁移 v8），R2 fail-closed 凭据完整。

**结论**：生产当前处于"全关闸门 + Mock 双保险"安全态。任何一层失效仍有下一层兜底（见 doc 13 §2）。

## 3. Mock Checkout 全流程 E2E（隔离库，本轮新增验证）

脚本：`apps/api/tests/browser-mock-checkout.ts`（真实 buildApp + 内存 PGlite + Mock PSP + Mock 视频适配器，Fastify inject 走真实 HTTP 管线）。

```
1. signup: 200
2. initial wallet: 0 credits
3. pricing: provider=mock checkoutAvailable=false purchasesPublic=true studioPublic=true videoPublic=true
4. checkout: 200 https://checkout.mock.invalid/mock_9052b…
5. webhook: 200 applied:true          ← HMAC 签名验证通过
6. after purchase: 100 credits        ← order.credits 全额入账
7. generate: 202 credits:10
8. after gen: 100 credits, 10 reserved ← 预扣语义正确
9. job status: succeeded (signed-url) ← Mock Worker 全流程出图
10. ledger: purchase +100 / generation.reserved +10 / generation.mock -10
11. video gen: 202 credits:60 → video job: succeeded (signed-url)
12. DB: orders=1 webhookEvents=1 jobs=image:succeeded,video:succeeded（5 条账本一致）
E2E_MOCK_CHECKOUT_PASS
```

**关键验证点**：
- webhook 签名错误签名会被 403 拒绝（payment-business.test.ts 覆盖）；正确签名全额入账且 `payment_webhook_events` 落库
- 预扣（reserve）→ Mock 完成后释放（`generation.mock` reservedDelta=-10，delta=0——Mock 不真扣，符合 mock 语义）；live 模式对应 capture 扣减（payment-business.test.ts 覆盖）
- 幂等键缺失 → 400（路由 preHandler）；金额/币种不匹配 → webhook 拒绝（`applyNormalizedEvent` FORBIDDEN）
- 视频与静态图共用同一钱包/账本管线，价格独立（60cr vs 10cr）

**已知边界（P2，非阻断）**：`checkoutAvailable` 硬编码为 `PAYMENT_PROVIDER === "waffo"`，Mock 模式下 pricing 端点报 false → 前端购买按钮不出现；Mock 购买仅可经 API 直呼（本 E2E 即如此）。生产切 waffo 后自动为 true。

## 4. 退款/拒付/部分退款深度审计（7 场景，代码路径逐条）

入口统一为 `PaymentService.applyNormalizedEvent()`（payment.ts），Waffo 适配器只负责把官方事件规范化为 paid/refunded 两种。

| # | 场景 | 代码路径 | 结果 | 判定 |
|---|---|---|---|---|
| 1 | 全额退款 | refund.succeeded → `refunded()`：按 order.credits 全额扣回，账本 `refund:<orderId>` | 用户 Credits 全额撤销；余额不足部分转 debt | ✅ 正确 |
| 2 | 部分退款 | `refundedMinor()` 取原始支付税前额做金额校验 → 部分退款事件也通过校验 → 仍全额扣回 | 用户被扣回全部 Credits（非按比例） | ⚠️ 语义保守；前提：Waffo 面板仅允许全额退款（见 doc 14 P1-1） |
| 3 | 先退款后到账（refund-before-paid） | refunded 分支在 order 仍 pending 时撤销并标记 refunded；后续 paid 事件到达时 order 非 pending → 拒绝应用 | 不会"退款后又入账" | ✅ 正确 |
| 4 | 重复通知（同一事件 ID） | `payment_webhook_events` 唯一约束 + 处理前先 INSERT，冲突即跳过 | 幂等，Credits 只入账一次 | ✅ 正确 |
| 5 | 退款时余额已花光 | wallet.balance 不足 → 缺口记 debt → `debt > 0` 触发 suspended | 用户挂债停用；充值优先还债 | ✅ 正确（防套现） |
| 6 | refund.failed | Waffo 适配器显式忽略（返回 null） | 不产生任何账本变化 | ✅ 正确 |
| 7 | 拒付/ chargeback | Waffo 规范化仅映射 paid/refunded；chargeback 类事件不匹配 → 拒绝该事件（日志留痕） | 不会误入账；需人工处理 | ⚠️ 人工流程（Terms 已声明争议通过 Waffo 争议流程） |

**金额/环境校验**（所有 paid/refunded 事件共用）：金额与币种必须与订单完全一致；PAYMENT_ENVIRONMENT 与事件环境必须匹配（test 事件在 prod 配置下被拒，反之亦然）。

## 5. 费用与毛利分析（Waffo 3.9% + $0.50/笔）

套餐（migrations/002）：Starter $5/100cr，Creator $20/500cr，Studio $69/2000cr。

**手续费（固定费率）**：

| 套餐 | 价格 | Waffo 手续费 | 净收入 | 毛利率 |
|---|---|---|---|---|
| Starter | $5.00 | 0.195+0.50=$0.695 | $4.305 | 86.1% |
| Creator | $20.00 | 0.78+0.50=$1.280 | $18.720 | 93.6% |
| Studio | $69.00 | 2.691+0.50=$3.191 | $65.809 | 95.4% |

**再扣除生成成本**（fal.ai klein-4b $0.005/MP；Wan 2.2-5B I2V/T2V $0.15/条）：

| 套餐 | 全桌面图（$0.0066/10cr） | 全手机图（$0.0030/10cr） | 全视频（$0.15/60cr） |
|---|---|---|---|
| Starter | 84.8% | 85.8% | 81.1% |
| Creator | 92.0% | 93.0% | 87.4% |
| Studio | 93.6% | 94.7% | 87.8% |

**结论**：即使最差情况（用户把所有 Credits 全部生成视频），毛利率仍 ≥81%。固定费 $0.50 对小套餐影响最大（Starter 承担 10% 手续费占比），若需优化可设最低充值额或对 Starter 提价。预算护栏（平台 $100/日、用户 $10/日）在当前定价下不会造成单用户亏损（$10 fal 消费 ≈ 400 条视频/日，远超 100cr 套餐可生成量；被护栏截断即止损）。

## 6. 阻断项收口清单

| # | 阻断项 | 状态 | 收口证据 |
|---|---|---|---|
| B1 | Mock 收款全流程可信度 | ✅ 已收口 | 本报告 §3 E2E_MOCK_CHECKOUT_PASS（12 步全过） |
| B2 | 退款/拒付语义 | ✅ 已收口（附前提） | §4 七场景审计；唯一 ⚠️ 为部分退款按全额撤销，前提是面板仅允许全额退款 |
| B3 | 单位经济性 | ✅ 已收口 | §5 毛利 ≥81%（最差情况） |
| B4 | 生产误开风险 | ✅ 已收口 | §2 双保险 + 三闸门全关实测 |
| B5 | OUTPUT_MODERATION_API_KEY 缺失 | ⬜ 人工 | 生成开放前注入（fail-closed 已验证） |
| B6 | WAFFO 三件套缺失 | ⬜ 人工 | 支付开放前注入 + 面板配置（doc 17） |
| B7 | Waffo 复审 | ⬜ 人工 | PAYMENT_PROVIDER=waffo 前提 |
| B8 | 真实 Waffo 签名通知端到端 | ⬜ 人工 | 代码就绪（官方 SDK），只能在拿到凭据后联调 |
| B9 | 部分退款语义确认 | ⬜ 人工 | 与 Waffo 确认面板退款策略（P1-1 前提） |
| B10 | 70 个 dirty 文件提交 | ⬜ 人工授权 | 按项目规则等待显式提交授权 |

## 7. 结论

- **代码侧阻断项：0**——所有自动化可验证的阻断项均已收口（E2E + 审计 + 既有 306 API / 307 Web tests）。
- **人工侧待办：5 项**（B5-B9），全部是凭据注入 / 面板操作 / 外部确认，见 doc 17 手册。
- 生产保持当前"全关"状态即可安全运行；开放动作全部走 doc 15 §15 的灰度顺序。
