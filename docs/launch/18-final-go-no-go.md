# 18 — 最终 Go/No-Go 判定（Final Go/No-Go）

**日期**: 2026-11-04（第二轮收口后更新）
**依据**: docs/launch/11–17 + 阻断项收口（doc 16）+ 本轮四项技术收口（Mock 保护核实 / 真实扣费语义测试 / 退款拒付保护 / 浏览器购买闭环）
**性质**: 只读评估 + 本地隔离测试；未提交、未部署、未修改生产配置、未触发真实收款或付费生成

---

## 1. 判定

### 状态总览

| 维度 | 状态 | 说明 |
|---|---|---|
| 本地/代码预检 | **LOCAL_PRECHECK_PASS** | API **323 passed + 1 skipped**（42 文件）+ 本轮全部新增测试通过 |
| 生产（当前运行态） | **SAFE — 全关闸门运行中** | Mock/暂停/支付禁用三重兜底，SSH 实测复核（§2） |
| 商业化开放（Studio 生成 / 购买） | **PRODUCTION_BLOCKED** | 阻断为人工配置项 + **1 个新发现的部署前提**（§5，FAL_MOCK 与新代码的生产启动守卫冲突） |

### 一句话判定

> **代码侧 Go，运营侧 No-Go**：购买→入账→生成→扣费的全链路语义已在隔离环境和真实浏览器中端到端验证；开放前必须完成 doc 17 人工项，且**下次 API 镜像重建前必须先调整 api.env 的 FAL_MOCK**（§5-D1）。

## 2. 一、生产 Mock 保护核实（SSH 只读 + 代码证据）

### 2.1 生产实际运行值（2026-11-04 实测，api 与 worker 两个容器一致）

| 变量 | api 容器 | worker 容器 |
|---|---|---|
| NODE_ENV | production | production |
| FAL_MOCK | **1** | **1** |
| FAL_LIVE_ENABLED | （空） | （空） |
| FAL_VIDEO_LIVE_ENABLED | （空） | （空） |
| GENERATION_PAUSED | 1 | 1 |
| PAYMENT_PROVIDER | disabled | — |
| PAYMENT_ENVIRONMENT | test | — |
| FAL_KEY | — | SET(72 chars)，**但休眠**（见 2.2） |

`/v1/credits/pricing`（VPS 本机探测）：`paymentProvider:"disabled", checkoutAvailable:false, generationMode:"mock", paused:true`；`/health` 200。

### 2.2 为什么 production + FAL_MOCK=1 仍能正常运行

`resolveGenerationMode()`（provider-mode.ts）的优先级是显式设计的：**FAL_MOCK=1 恒胜出** → mock；live 必须同时满足 `FAL_LIVE_ENABLED=1` **且** `FAL_KEY` 非空；否则 disabled。因此 worker 容器里那个 72 字符的 FAL_KEY 处于休眠——一个拷贝进来的测试密钥永远不会自己打开计费（代码注释原话："a configured FAL_KEY alone must not enable billing"）。生产以 `FAL_MOCK=1 + GENERATION_PAUSED=1` 组合运行：mock provider 被选中但新任务一律 503，双保险。

### 2.3 四项保护确认（代码路径 + 测试证据）

| # | 保护 | 证据 | 判定 |
|---|---|---|---|
| 1 | 生产绝不允许 Mock 输出冒充真实生成 | ① mock 输出在 `request._mock` 持久标记（routes.ts）；② job 视图返回 `mock:true`；③ live 模式下"我的作品"显式排除 `_mock` 记录（routes.ts `COALESCE((j.request->>'_mock')::boolean,false)=false`）；④ mock 图禁止在 live 模式被动画化（"A mock image cannot be animated in live mode"）；⑤ 画廊发布只能走 import CLI 人工闸门，无用户侧发布路由；⑥ **未提交代码进一步增强：`NODE_ENV=production && FAL_MOCK=1 直接拒绝启动`**（commercialization-gates.test.ts 覆盖） | ✅（运行中镜像靠①-⑤分层控制；下一次部署后升级为启动即拒绝，见 §5-D1） |
| 2 | 生产 Mock 支付不能用于真实订单 | `NODE_ENV=production && PAYMENT_PROVIDER=mock → buildApp 抛错拒绝启动`（app.ts:176-182，"the mock payment adapter is not allowed in production"；本轮补了显式测试）；生产现为 `disabled`（无适配器、checkout 403） | ✅ |
| 3 | 未开启时不允许付费 Provider 调用 | live 需要 `FAL_LIVE_ENABLED=1 + FAL_KEY` 双条件；视频额外需要 `FAL_VIDEO_LIVE_ENABLED=1`（独立开关）；构造 provider 不产生网络 I/O，只有 worker 执行任务才会调用；moderation 缺失时 live 任务 fail-closed（MODERATION_UNAVAILABLE） | ✅ |
| 4 | 不能通过接口绕过商业化开关 | 服务端最终拦截层：checkout 路由先查 `purchasesPublic/purchasesPaused`，jobs 路由先查 `studioPublic`，视频再查 `videoPublic`；`checkoutAvailable` 仅由服务端环境决定；commercialization-gates.test.ts 11 例真值表（含"配置了 PSP ≠ 开店"） | ✅ |

### 2.4 报告修正（任务一要求）

此前"生产拒绝 Mock 启动"的表述**不完全成立**，现修正为：
- **支付侧**：成立——`PAYMENT_PROVIDER=mock` + production 拒绝启动（已提交代码语义，且生产实际为 disabled）。
- **生成侧**：对**当前运行中的生产镜像不成立**——`FAL_MOCK=1` + production 目前可以启动（正在运行即证明）。该启动守卫是**本轮未提交改造**新增的（`git show HEAD:apps/api/src/app.ts` 无此守卫）。当前生产依赖"暂停 + `_mock` 标记 + 不发布管线"三层控制兜底，无实际暴露；但下一次 API 镜像重建会使该守卫生效 → 成为部署前提 **D1**（§5）。

## 3. 二、真实扣费语义本地模拟测试（新增 `tests/credit-capture-semantics.test.ts`，4 例全过）

方法：隔离内存 PGlite + **不联网的模拟真实 Provider**（MockJobProvider / mock 视频适配器跑在 live 计费语义下 `mock:false`），审核链路用注入的本地 pass-stub（含视频帧提取 stub），零 fal.ai/Waffo 调用。

| 步骤 | 结果 |
|---|---|
| 购买 100 Credits（mock PSP webhook） | ✅ 余额 100 |
| 图片生成预留 10 | ✅ `100/10 reserved` |
| 模拟真实 Provider 成功 → **Capture 10** | ✅ `90/0`，账本 `generation.captured` |
| 视频生成预留 60 | ✅ `90/60 reserved` |
| 模拟真实 Provider 成功 → **Capture 60** | ✅ **`30/0`（= 100−10−60）** |
| 账本全量断言 | ✅ `purchase 100 / reserved 10 / captured 10 / reserved 60 / captured 60` |
| 重复完成/重复 capture | ✅ 终态 reservation 使重复 capture 为 no-op；worker 不再认领已结算任务；`capture:<jobId>` 账本恰好 1 条 |
| Provider 失败 | ✅ 任务 failed（UPSTREAM_ERROR），hold 释放（`generation.released`），无扣费无负债，无资产落库 |
| Mock 模式不扣费（保留验证） | ✅ reserve→`generation.mock` release，余额不变，0 条 captured |

## 4. 三、退款与拒付保护（代码修正 + 新增 `tests/refund-protection.test.ts` 10 例 + waffo.test.ts 更新）

### 4.1 本轮修复的缺陷

**缺陷 R1（修复）**：Waffo 适配器旧逻辑把 `originalPayment.subtotal`（原支付税前额）当作退款事件的金额——**部分退款事件会被误当成整单退款而自动全额扣回积分**。SDK 契约（@waffo/pancake-ts 0.26.0，`refundedAmount` = "Amount actually refunded by the payment channel"）明确了两者区别。

**修复**（payment.ts + waffo.ts + 迁移 009）：
1. 退款事件规范化改用**事件自身退款额**（`refundedAmount ?? amount`），并携带 `originalSubtotalMinor/originalTotalMinor` 快照；
2. 自动撤销**仅当事件可证明覆盖整单**（退款额 == 订单税前额，或原支付快照匹配订单且退款额 == 原支付税后额）；其余一律不自动处理；
3. 新增 `manual_review` 终态（迁移 009 扩展 `payment_webhook_events` status CHECK）：保留完整原始事件 payload + 原因（error 列），`retryReceivedEvents` 只重放 `received`，永不重放/自动应用 manual_review 行；webhook 响应新增 `needsReview`；
4. **未知事件类型不猜测**：SDK 枚举之外的一切类型（含未来可能的 dispute/chargeback）→ `manual_review`，原始 payload 原样保留；`subscription.*`（本店只卖一次性积分）同样进人工队列；`refund.failed` 保持已知的无资金动作确认。

### 4.2 六场景测试结果

| 场景 | 结果 |
|---|---|
| 全额退款（税前匹配） | ✅ 自动整单撤销，账本 `refund` 一条 |
| 全额退款（税后口径，快照匹配） | ✅ 同上 |
| **部分退款**（200/500） | ✅ **不自动扣回**；订单保持 paid；事件 `manual_review` + 原因 `refund_amount_200_order_500` + 原始 payload 保留 |
| 金额无法判定（无快照且 ≠ 订单） | ✅ 同上（人工） |
| 重复退款（不同事件 id 同订单） | ✅ 第二次 no-op，账本仅 1 条 refund |
| 退款先于支付 | ✅ 订单标记 refunded、积分从未发放；迟到的 paid 事件不再入账 |
| 已消耗后退款 | ✅ 40 可用全扣 + 60 缺口入 debt + 用户 suspended |
| 拒付/争议事件 | ✅ `manual_review`（Waffo SDK 0.26.0 **无 chargeback/dispute 事件类型**——不猜测含义；若商户面板出现该能力须与 Waffo 确认事件形态） |
| manual_review 终态 | ✅ 不被重放、不自动应用 |

支付相关测试合计 **34 例**（refund-protection 10 + waffo 15 + payment-business 6 + checkout-timing 6 + database 迁移 9 版本校验）全过。

## 5. 四、浏览器购买闭环（本地 :3100 真实浏览器 + 隔离库 + Mock PSP）

**方法**：`tests/browser-purchase-loop.ts` 启动真实 API（隔离内存 PGlite + Mock PSP + MOCK_CHECKOUT_PUBLIC=1 + live 计费语义的内嵌 worker，零外呼）挂在 :4000，`next dev` 挂在 :3100，IAB 真实浏览器操作。

| 步骤 | UI 实测 |
|---|---|
| Pricing：三档套餐 + 购买按钮（`purchasesPublic` 驱动） | ✅ 按钮激活，点击进入 /credits |
| /signup 注册 → 登录态（头部"可用积分: 0"） | ✅ |
| Credits 页点击 Starter「购买 Credits」 | ✅ 生成真实 pending 订单（$5.00/100cr，幂等键 + `order=<id>` 回跳参数） |
| **Mock Paid**（PSP 侧 webhook，HMAC 签名） | ✅ `applied:true` |
| 积分入账 | ✅ 余额 0→**100**；流水「购买积分 +100」；订单「US$5.00 · starter 已支付」 |
| AI Studio 表单（`studioPublic` 驱动 StudioGate） | ✅ 表单/风格/确认对话框（"确认后将预占 10 积分"） |
| 生成 → Worker 完成 | ✅ job succeeded，历史 1 条 |
| **Credits 扣减** | ✅ 余额 100→**90**；流水「生成扣费 −10 / 购买积分 +100」；截图证据留存 |

**生产安全限制未变**：`checkoutAvailable` 生产语义仍为 `PAYMENT_PROVIDER === "waffo"`。新增 `MOCK_CHECKOUT_PUBLIC` 仅是**本地/E2E 显式开关**——`PAYMENT_PROVIDER=mock` 在 production 本来就拒绝启动，该路径在生产不可达（新测试锁定：flag 关闭时 mock 下 checkoutAvailable=false；production+mock 拒启）。

## 6. 五、汇总

### 6.1 完成的测试

| 套件 | 结果 |
|---|---|
| API 全量 vitest | **42 文件 / 323 passed + 1 skipped**（此前 306+1；本轮 +17：refund-protection 10 + capture-semantics 4 + waffo 更新 3 + gates 2） |
| API typecheck（tsc --noEmit） | ✅ 0 错误 |
| 浏览器闭环（IAB 真实浏览器） | ✅ 全流程 + 截图 |
| 生产只读核实（SSH） | ✅ §2 |

### 6.2 新增或修复的缺陷

| # | 缺陷 | 修复 | 测试 |
|---|---|---|---|
| R1 | 部分退款被误当整单自动扣回 | 全额可证明才自动撤销；否则 manual_review（迁移 009） | refund-protection 2/2b |
| R2 | 未知/订阅事件被静默 `processed(ignored)` | 一律 manual_review + 原始 payload 保留，不猜测含义 | refund-protection 6 + waffo 3 例 |
| R3 | "生产拒绝 Mock 启动"表述与运行中镜像不符 | 报告修正（§2.4）+ 补显式启动拒绝测试 ×2 | commercialization-gates |
| R4 | Mock 模式无真实前端购买路径（P2 quirk） | 本地专用 `MOCK_CHECKOUT_PUBLIC` 显式开关（生产不可达，双重守卫测试） | commercialization-gates |
| C1 | 修正（非缺陷）：生产 worker 容器持 72 字符 FAL_KEY 但休眠 | 已确认为设计行为（FAL_MOCK 恒胜出 + live 双条件） | 既有 resolveGenerationMode 测试 |

### 6.3 未验证的正式商户依赖（不变 + 明确化）

1. 真实 Waffo 签名通知端到端（需商户凭据；本轮回路仅 Mock HMAC）；
2. 真实退款事件的**字段形态**（refundedAmount 口径：税前/税后；manual_review 兜底已覆盖两种）；
3. Waffo 是否存在 SDK 枚举之外的争议/拒付事件（须向 Waffo 确认，代码不猜测）；
4. fal NSFW 输出审核真实调用（复用 FAL_KEY）、Prompt Sift 真实联调（doc 17 阶段 2.5/2.6）；
5. Google OAuth consent 回路（既有）。

### 6.4 是否存在新的生产阻断项

**新增 1 个部署前提（非运营阻断，代码未部署故生产现状不变）**：

- **D1｜下次 API 镜像重建前必须调整 api.env 的 `FAL_MOCK`**：未提交代码在 `NODE_ENV=production && FAL_MOCK=1` 时拒绝启动（api 与 worker 都会 crash）。当前运行镜像早于该守卫，不受影响。部署新代码时二选一：① 开放生成 → 移除 FAL_MOCK、设 `FAL_LIVE_ENABLED=1 + FAL_KEY`（走 doc 17 灰度）；② 继续关闭 → 移除 FAL_MOCK 并停用 worker 容器（无 provider 时 worker 会显式退出）。**把这条写进 doc 17 阶段 1 前置**。
- 迁移 009 会在下次部署自动应用（checksum 机制）。
- 其余阻断项与 doc 16/17 一致（B5 审核密钥已由 fal NSFW 替代方案解除——复用 FAL_KEY，隔离验收通过；OpenAI 为可选增强）：B6 Waffo 三件套+面板、B7 复审+Prompt Sift 权限、B8 test 联调、B9 仅全额退款确认。

## 7. 开放执行顺序（不变，引用）

doc 17 三阶段（凭据 → test 联调 → prod）+ doc 15 §15 灰度；任一步异常回滚 `PAYMENT_PROVIDER=disabled` / `GENERATION_PAUSED=1`。退款人工处理流程：查询 `payment_webhook_events WHERE status='manual_review'`，人工核实后按 doc 17 ops 流程处理（事件 payload 含完整原始数据）。

## 8. 约束遵守声明

- ✅ 未修改生产环境（SSH 仅只读 docker exec env 查询 + localhost 探测）
- ✅ 未 Git commit/push/pull（HEAD 保持 ab6fadd，工作区改动待授权）
- ✌ 未正式部署
- ✅ 未真实收款/退款（E2E 全部隔离内存库 + Mock PSP + 不联网 provider）
- ✅ 未真实付费 AI 调用（生成走 in-process 模拟 provider）
- ✅ 未输出或记录任何密钥（生产 FAL_KEY 仅输出长度）

---

**WallHaze 第二阶段生产预检完成，未提交、未部署、未触发真实收款或付费生成。**
