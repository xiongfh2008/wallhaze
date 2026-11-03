# 15 — 生产预检汇总（Production Precheck Summary）

**日期**: 2026-11-03
**判定**: LOCAL_PRECHECK_PASS + PRODUCTION_MANUAL_REQUIRED

---

## 1. 本地 HEAD 与修改状态

```
HEAD: df98017
Branch: master
Dirty files: 36 (apps/api + apps/web + docs/launch + docs/media-review)
```

Dirty 文件分属两组：
- **T2 商业化改造**：app.ts / payment.ts / routes.ts / env.ts / generation.routes.ts + 5 test files + StudioGate/CheckoutButton/pricing 组件 + 7 语言消息（P0-3 闸门 + P0-4 状态驱动 UI）
- **T1 SEO 审计遗留**：wallpapers.ts / WallpaperBrowser / seo-audit CSV×6 / media 脚本×4 / 7 语言 messages / docs/media-review

两组均已通过 306 API + 307 Web tests。

## 2. 正式配置已确认项

| 配置 | 状态 | 说明 |
|---|---|---|
| PAYMENT_PROVIDER=disabled | ✅ | 生产不可能交易 |
| GENERATION_PAUSED=1 | ✅ | 新生成任务 503 |
| FAL_MOCK=1 | ✅ | Mock 模式 |
| FAL_LIVE_ENABLED / VIDEO_LIVE_ENABLED | 空 | live 不可用 |
| STUDIO/VIDEO/PURCHASES_PUBLIC_ENABLED | ABSENT → false | Studio 关闭 |
| PLATFORM_DAILY_COST_LIMIT | $100/day | ✅ 已设置 |
| USER_DAILY_COST_LIMIT | $10/day | ✅ 已设置 |
| DATABASE_URL | SET(109) | ✅ |
| STORAGE_DRIVER=r2 | SET | ✅ R2 fail-closed |
| IMAGE_URL_SECRET | SET(64) | ✅ 签名 URL |
| SITE_URL / API_PUBLIC_URL / CORS | SET | ✅ |
| 4 个业务闸门 | 全 ABSENT → false | ✅ Studio/Pricing 关闭 |
| Webhook 路由 | 在线但 403-guarded | ✅ 正确 |

## 3. 正式配置待人工项

| # | 缺失配置 | 阻断什么 | 何时需要 |
|---|---|---|---|
| 1 | OUTPUT_MODERATION_API_KEY | live 生成 fail-closed | Studio 开放前 |
| 2 | WAFFO_MERCHANT_ID / STORE_ID / PRIVATE_KEY | Waffo Checkout + Prompt Sift | 支付开放前 |
| 3 | PAYMENT_ENVIRONMENT → live | 真实交易 | 支付开放时 |
| 4 | GALLERY_RESCAN_MANIFEST_URL | Gallery 异步复查 | 生成开放后 |
| 5 | GENERATION_PAUSED=0 | Studio 开放 | Studio 开放时 |
| 6 | PAYMENT_ENVIRONMENT 从 test 切 prod | 真实收款 | 支付正式开放时 |

## 4. Waffo 核查结果

| 检查 | 判定 | 说明 |
|---|---|---|
| 商户审核状态 | MANUAL_REQUIRED | 生产 WAFFO_MERCHANT_ID 为空，无法验证 |
| Store 状态 | MANUAL_REQUIRED | 同上 |
| 三档套餐映射 | ✅ 代码就绪 | credit_packages 表有 3 档（002 迁移） |
| USD 币种 | ✅ | 002 迁移固定 USD |
| Waffo Product ID | MANUAL_REQUIRED | waffo-setup --apply 需在有凭据后执行 |
| Checkout test/prod 隔离 | ✅ | PAYMENT_ENVIRONMENT 环境检查 + adapter mode 匹配 |
| Webhook 回调地址 | ✅ 已部署 | /v1/payments/webhook + /v1/webhooks/waffo（403-guarded） |
| Webhook 签名验证 | ✅ 代码就绪 | 官方 SDK verifyWebhook + RSA-SHA256 + 时间戳容差 |
| 订单同步接口 | ✅ 代码就绪 | /v1/payments/orders/:id/sync（拉取式） |
| 退款事件处理 | ✅ 代码就绪 | refund.succeeded → 全额扣回 + debt/suspend |

## 5. 四种商业化开放状态测试

| 场景 | 后端闸门 | 前端渲染 | 判定 |
|---|---|---|---|
| A 全关 | ✅ 正确拒绝 | ✅ Coming Soon | PASS |
| B 仅 Studio | ✅ checkout 关闭 | ✅ 表单可见 | PASS |
| C Studio+购 | ✅ mock checkout 可用（受限） | ⚠️ 按钮 driven by waffo-only | PASS（自动化覆盖） |
| D 全开 | ✅ | 同上 | PASS（自动化覆盖） |

**说明**: checkoutAvailable 硬编码为 `PAYMENT_PROVIDER === "waffo"`，Mock 模式下前端购买按钮不出现。Mock 购买流程通过自动化测试验证（6 个 payment-business 用例 + 9 个 commercialization-gates 用例）。

## 6. 真实浏览器 E2E

| 步骤 | 结果 | 验证方式 |
|---|---|---|
| 首页加载 | ✅ 200 | headless Chromium |
| 进入 AI Studio | ✅ Coming Soon | curl + headless |
| 未登录尝试生成 | ✅ 401 | curl |
| 登录测试用户 | ✅（自动化测试覆盖） | PGlite 隔离库 |
| Credits 余额查看 | ✅（自动化覆盖） | API + DB |
| Pricing 访问 | ✅ 200 | headless |
| Mock Checkout | ✅（payment-business.test.ts） | 隔离库 |
| 余额变化 | ✅ credits-once 断言 | 隔离库 |
| 静态壁纸生成 | ✅（moderation.test.ts pass 场景） | 隔离库 |
| Job 状态 | ✅ | API 端点 |
| 扣减记录 | ✅ ledger `order:<id>` | DB |
| 下载图片 | ✅ 签名 URL | API 端点 |
| 参考图编辑 | ✅ 422/503 screening | API |
| Mock 视频生成 | ✅（video-jobs.test.ts） | 隔离库 |
| 我的作品 | ✅ | API |
| 关闭 Studio → 拒绝 | ✅ GENERATION_PAUSED=1 → 503 | API |
| 关闭购买 → 拒绝 | ✅ checkoutAvailable=false | API |
| 历史订单/账本可查询 | ✅ | API |

## 7. 七语言截图与问题

| 语言 | 页面 | 状态 | 问题 |
|---|---|---|---|
| en | / /terms /privacy /studio /pricing /faq /help /about | ✅ 全部 200 | 无 |
| zh | 同上 | ✅ | 无 |
| ja / ko / es / fr / de | 同上 | ✅（build 通过 + i18n-parity 通过） | 无 |

**截图**: `apps/web/.screenshots/audit-{home,terms,privacy,studio,pricing,faq,help,about}.png` + `brand-{desktop,mobile,footer}.png` + `grid-{desktop,tablet,mobile}.png` + `demos-{desktop,mobile}.png`

**已知 UI 问题**: 无（水平溢出全部 ≤0，模型名零泄露，Coming Soon 一致）

## 8. 内容审核可用性

| 阶段 | 代码 | 凭据 | fail-closed 行为 |
|---|---|---|---|
| Prompt Sift | ✅ 官方规范实现 | ⚠️ WAFFO 凭据空 | live → MODERATION_UNAVAILABLE |
| 输出审核 | ✅ OpenAI + ffmpeg | ⚠️ API_KEY 缺失 | live → 不存储/不发布 |
| 参考图 | ✅ 入口筛查 | 同上 | 上传 422/503 |
| Gallery 复查 | ✅ job 容器 | 同上 + manifest URL | job 不启动 |

## 9. Worker/R2/数据库核对

| 项 | 状态 |
|---|---|
| Worker | healthy，mock 模式，运行 13 小时 |
| PostgreSQL | healthy，迁移至 v8，运行 5 天 |
| R2 | r2 fail-closed 凭据完整 |
| 图片签名 URL | HMAC-SHA256 + 60min TTL |
| 成本守卫 | 平台 $100/日 + 用户 $10/日 |
| 数据库表 | payment_orders=0, credit_wallets=2, payment_webhook_events=0 |

## 10. 五项 P1 的生产阻断判断

| P1 | 阻断？ | 理由 |
|---|---|---|
| P1-1 部分退款 | 否 | 前提：Waffo 面板仅允许全额退款；Terms 明确说明 |
| P1-2 预算定值 | 否 | 已设置 $100/$10；可运行时调整 |
| P1-3 多进程限流 | 否 | 单实例部署；扩容前迁 Redis |
| P1-4 fal 幂等 | 否 | 单 Worker + lease 排他；扩容前接 fal 幂等键 |
| P1-5 Prompt Sift 权限 | 否 | 生成已暂停；开放前必须完成 |

**5 项 P1 均不构成生产上线阻断**。

## 11. 自动化回归结果

| 套件 | 命令 | 退出码 | 通过 | 失败 | 跳过 |
|---|---|---|---|---|---|
| API vitest | npm run test | 0 | 306 | 0 | 1 |
| API typecheck | npx tsc --noEmit | 0 | — | — | — |
| API build | npm run build | 0 | — | — | — |
| Web vitest | npm run test | 0 | 307 | 0 | 0 |
| Web typecheck | npm run typecheck | 0 | — | — | — |
| Web lint | npm run lint | 0 | 0 err, 10 warn | — | — |
| Web next build | npm run build | 0 | — | — | — |
| Web vinext build | npm run build:vinext | 0 | — | — | — |
| Web rights:check | npm run rights:check | 0 | — | — | — |
| Web audit:waffo | npm run audit:waffo | 0 | Issues: 0 | — | — |

**未覆盖场景**：
- Waffo 真实签名通知的端到端处理（需 Waffo 面板发送，当前 403-guarded）
- OpenAI 输出审核的真实 API 调用（需 API key）
- R2 的真实上传/下载（需生产 R2 凭据 + 网络访问）
- Gallery rescan 的真实运行（需 manifest URL + 审核凭据）

## 12. 修改文件

见 git log `c6e8473..HEAD`（含 T1 修正 + T2 P0-3 商业化闸门 + T2 Studio 开放态 + 本报告）。完整清单见各提交 message。

## 13. 剩余缺陷

| # | 缺陷 | 严重度 | 说明 |
|---|---|---|---|
| 1 | Mock checkout 的 checkoutAvailable 硬编码 | P2 | Mock 模式下前端购买按钮不出现；通过自动化测试覆盖 |
| 2 | 部分退款语义未按比例 | P1-1 | 前提：Waffo 面板仅允许全额退款 |
| 3 | OUTPUT_MODERATION_API_KEY 缺失 | 部署前提 | 需人工注入 |
| 4 | WAFFO 凭据缺失 | 部署前提 | 需人工注入 |
| 5 | Google OAuth consent round-trip 未验证 | 既有 | 与本轮无关 |

## 14. 正式部署前人工清单

1. ✅ P0×5 已修复并有测试
2. ⬜ OUTPUT_MODERATION_API_KEY 注入 api.env
3. ⬜ WAFFO_MERCHANT_ID / STORE_ID / PRIVATE_KEY 确认（Prompt Sift + Checkout）
4. ⬜ Waffo 面板：Webhook URL 登记（`/v1/payments/webhook`）+ 产品映射（waffo:setup --apply）
5. ⬜ Waffo Prompt Sift 权限确认（M4）
6. ⬜ Waffo 退款事件样本核对（M2 / P1-1）
7. ⬜ PAYMENT_ENVIRONMENT 确认（test 先跑通再切 prod）
8. ⬜ 真实 Waffo 测试通知端到端验证
9. ⬜ GENERATION_PAUSED=0 + 小额预算灰度
10. ⬜ Waffo 复审通过后 PAYMENT_PROVIDER=waffo

## 15. 建议的灰度开放顺序

```
阶段 1（当前）: 全部关闭 ✅
  → 免费浏览/下载正常，Studio Coming Soon，Pricing 价格展示但不可购买

阶段 2: 仅开放 Studio（生成）
  → OUTPUT_MODERATION_API_KEY 注入
  → STUDIO_PUBLIC_ENABLED=1 + GENERATION_PAUSED=0
  → 用户可生成但不可购买（Credits 通过手动充值或试用额度）
  → 小额成本限制 ($10/$100) + 监控 fal.ai 消费

阶段 3: 开放购买
  → Waffo 审核通过
  → PAYMENT_PROVIDER=waffo + PAYMENT_ENVIRONMENT=test
  → Waffo test 环境端到端验证
  → 切 PAYMENT_ENVIRONMENT=prod + waffo:setup --publish
  → 小额灰度（$10/用户/日）

阶段 4: 逐步扩大
  → 监控成本/审核/退款
  → 逐步提高 USER_DAILY_COST_LIMIT
  → 开放 VIDEO_PUBLIC_ENABLED=1
  → 移除 GENERATION_PAUSED（如仍在）
```
