# WallHaze 真实 AI 壁纸生成准备与费用安全检查报告

- 日期：2026-10-23
- 范围：`apps/api`、`apps/web`（本地 PGlite + Mock Provider）
- 结论：**安全上已具备单次真实测试条件，但尚未获得授权，也未执行任何真实 fal.ai 请求。** 本轮新增了显式 live 开关、暂停开关、平台日预算、真实任务重试防护、Mock 标识与模式展示；仍需你提供 FAL_KEY 并批准一次付费调用。

## 1. 当前 Mock / 真实模式切换条件

| 配置 | 结果 |
|---|---|
| `FAL_MOCK=1`（当前） | Mock Provider；不联网、不计费；前端显示“模拟生成模式” |
| `FAL_KEY` 有值但 `FAL_MOCK=1` | **仍然 Mock**，真实调用不会发生 |
| `FAL_LIVE_ENABLED=1` + `FAL_KEY` + `FAL_MOCK` 非真 | **live**：Worker 与同步路由才使用真实 fal.ai |
| `FAL_KEY` 有值但缺少 `FAL_LIVE_ENABLED` | **disabled**：不创建真实 Provider，不会因“有 Key”自动扣费 |
| `FAL_MOCK=0` 且无 Key | disabled；本机 `EMBED_WORKER=1` 时启动直接失败（在打开 PGlite 之前） |
| `GENERATION_PAUSED=1` | 异步 Job 创建返回 503；Worker 不领取任何任务；不调用 Provider |

前端展示：`/v1/credits/pricing` 返回运行时 `generationMode`（mock/live/disabled）与 `paused`；Studio 在 mock 时显示明确提示，disabled/paused 时关闭提交 gate；Mock 作品在 My Creations 带“模拟”标记。

## 2. 当前是否具备真正生成 AI 壁纸的能力

**否（当前进程）。** 当前 `generationMode=mock`，`FAL_KEY` 未配置，返回的是程序生成的渐变 PNG。代码路径、端点与参数已就绪；启用真实 Provider 需要显式配置与授权。

## 3. FAL_KEY 配置状态

**未配置**（只检查是否存在，未读取/输出值）。`FAL_MOCK=1`，`FAL_LIVE_ENABLED` 未配置。

## 4. Mock 钱包不扣费的原因

这是**有意设计**，不是账务故障：

- Job 创建时仍预占 10 Credits（事务内 `reserve`）；
- Mock 完成走 `completeJob(..., mock:true)`：释放预占（ledger reason `generation.mock`），不执行 capture；
- 因此钱包 200 → 200；
- Mock 仅作用于 `_mock` Job / Mock Provider 模式；正式 Job 走 capture。既有测试 `does not charge Credits for a mock success` 与 `releases reserved credits when the worker fails` 覆盖两侧。

## 5. 正式模式 Credits 预占与结算证明

- `enqueueJob` 在同一数据库事务中：预算检查 → 插入 Job → `reserve`；余额不足/预算不足会整体回滚，**不存在绕过预占的创建路径**。
- Worker 成功：`completeJob` → capture（余额减少、reserved 归零、ledger 记录一次）。
- 失败/超时/存储失败/租约丢失：`failJob` → release；可能已计费的上游成本保留在预算 `spent`。
- 幂等：`credit_reservations` 主键、Job 终态检查、lease token fencing；重复完成被拒绝。
- 测试证据：`routes-business` 的“Worker 失败释放”、`jobs` 的“storage 失败释放”“mock 不扣费”“lease fencing”“重复完成不双扣”。

## 6. 文生图模型与 API 参数

- 端点：`https://fal.run/fal-ai/flux-2/klein/4b`
- 请求：`prompt`、`image_size`（官方枚举或 `{width,height}`）、`num_images:1`、`enable_safety_checker:true`、`output_format:"png"`
- 输出：`images[0].url` + 可选 `width/height/content_type`；`has_nsfw_concepts`
- Prompt：服务端 Prompt Builder 组合（场景 + 风格 + 调色/光线/材质/构图 + 设备构图），持久化 `_composed`
- 错误：401/403/422/429/5xx、超时、NSFW、空 images 都有分类

## 7. 图生图模型与 API 参数

- 端点：`https://fal.run/fal-ai/flux-2/klein/4b/base/edit`（本轮已修正）
- 必填：`image_urls`（最多 4 张，当前 1 张 data URI）、`prompt`
- 可选：`image_size`、`num_images`、`output_format`、`enable_safety_checker`
- 输出同上；输入会被缩放到 1 MP（官方计费说明）
- 参考图在结算后从 Job 请求中剥离（测试覆盖）

## 8. 模型价格与费用估算

官方公开价格：

- 文生图 **$0.005 / MP**
- 编辑 **$0.009 / MP 输入 + $0.009 / MP 输出**；输入按 1 MP 计

| 场景 | 像素 | 成本 |
|---|---|---|
| 文生图 1280×720 | 0.92 MP | ≈ **$0.0046** |
| 文生图 1920×1080 | 2.07 MP | ≈ **$0.0104** |
| 编辑 1920×1080（1 MP 输入） | 3.07 MP | ≈ **$0.0277** |
| 编辑 2048×2048（1 MP 输入） | 5.19 MP | ≈ **$0.0467** |

Credits 收入：10 Credits = Starter $0.50 / Creator $0.40 / Studio $0.345。即使最大编辑成本 $0.047 也低于单次收入，统一 10 Credits 在当前价格下毛利为正；如后续调整尺寸上限或模型价格，需要重新核算。

预算记账使用 **保守上界 $4/Job**（`costBoundMicros=4,000,000`），因此平台/用户日预算不会被低估，但会偏保守（1 个 Job 占 $4 额度）。

## 9. 平台全局预算控制

本轮新增：

- `PLATFORM_DAILY_COST_LIMIT_MICROS`（非负；**0 = 硬停**）
- `generation_budgets` 新增 `scope='platform', scope_id='global'` 行，与用户预算在同一事务内 `FOR UPDATE` 检查并预占
- 超限返回 `SERVICE_UNAVAILABLE`，不创建 Job、不预占 Credits、不调用 Provider
- 测试：平台预算允许 1 个 Job、拒绝第 2 个；0 预算直接拒绝

当前本地未设置该变量（无平台上限）；真实测试前建议设为 `4000000`（恰好允许 1 个 Job）。

## 10. Worker 防重复收费机制

- `claimJob` 使用 `FOR UPDATE SKIP LOCKED`、lease token、attempt 计数；旧 Worker 完成后会被 fencing 拒绝。
- **新增 live 重试防护**：真实模式下，任何 `attempt > 1` 的重新领取（即上次执行可能已调用 Provider）**不会再次调用 Provider**，直接以 `UPSTREAM_UNCERTAIN` 失败：释放用户 Credits、保留可能的上游成本，Job 不再自动重试。
- Mock 模式仍允许免费重跑（测试需要）。
- Provider 超时不自动重试；Job 进入 failed 后由用户显式重新提交（新 Job，新预占）。
- 这保证“Worker 崩溃恢复不会自动产生第二次付费调用”；代价是结果不确定的 Job 需要人工核对（报告会保留 Job ID）。

## 11. 图片存储与下载机制

- Provider 返回 URL 必须是 `fal.media` / `v3.fal.media` / `v3b.fal.media`，禁止重定向、禁止端口/凭据；
- 下载上限 10 MB，校验 MIME 与文件头（PNG/JPEG/WebP）；
- 通过 `PrivateStorage` 保存（本地为 `LocalStorage(.data/images)`，未配置时内存）；
- `image_assets` 绑定 Job + user，记录 mime/size；**未记录实际宽高**（当前 UI 显示请求尺寸，见阻塞项）；
- 私有访问：本人 cookie 或短期签名 URL；下载端点同样 owner-scoped；
- 存储失败：Job 失败、Credits 释放、可能的上游成本保留；
- 临时 fal CDN URL 只用于下载，不写进资产记录；失败任务不会留下资产行；
- 孤儿清理：删除作品会删资产；目前**没有**定时扫描存储目录的孤儿清理任务（阻塞项）。

## 12. PGlite 与正式 PostgreSQL 的差异

| 项目 | 本地 PGlite | 正式 PostgreSQL |
|---|---|---|
| 进程 | 单进程 WASM，不能多连接并发 | 多连接、多 Worker 安全 |
| Worker | `EMBED_WORKER=1` 内嵌 | 独立 `npm run worker` + supervisor |
| 崩溃恢复 | 手动 `npm run stop`、自动备份/探测 | 数据库自身 WAL/备份 |
| 数据 | 本地 `.data/pglite-dev`，可丢失 | 持久化、备份、监控 |
| 本报告验证 | PGlite 隔离测试 + 本地浏览器 | 未连接/未验证生产 |

## 13. 本轮修复与新增代码

- `business/provider-mode.ts`：显式 mock/live/disabled；Key 单独不启用计费
- `config/env.ts`：`FAL_LIVE_ENABLED`、`PLATFORM_DAILY_COST_LIMIT_MICROS`
- `server.ts` / `worker.ts` / `app.ts`：统一模式选择；`EMBED_WORKER` 无 Provider 时启动失败
- `routes.ts`：暂停返回 503；pricing 暴露 `generationMode`/`paused`；creations 返回 `mock`，live 模式过滤 `_mock`
- `jobs.ts`：平台日预算；同一事务预占
- `worker.ts`：暂停时不领取；live `attempt>1` 不再调用 Provider
- `GeneratorSection.tsx`：运行时 mock 模式提示；paused/disabled 关闭 gate；错误码细化
- `CloudCreations.tsx`：Mock 作品“模拟”标识
- `generation-error.ts`：`SERVICE_UNAVAILABLE`、`UPSTREAM_UNCERTAIN` 映射
- 七语言新增：mock 模式提示、不确定结果提示、Mock 标识

## 14. 自动化测试结果

| 检查 | 结果 |
|---|---|
| API TypeScript | 通过 |
| API Vitest | **206 passed，1 skipped**（29 个文件） |
| API Build | 通过 |
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **171 passed**（22 个文件） |
| Web Build | 通过 |

新增测试：模式选择 5、平台预算/0 预算/暂停/真实重试防护 4、路由暂停与模式 2（累计 +11）。所有测试默认拒绝真实出站（`tests/setup.ts` 的 deny-all fetch guard）；本轮日志中 fal 域名出现 **0** 次。

## 15. 仍然存在的上线阻塞

1. **真实 fal.ai 未验证**：无 FAL_KEY、无付费批准；真实模型对 1920×1080/2048 自定义尺寸的接受度未验证。
2. **实际宽高未持久化**：Provider 返回的 width/height 在异步 Job 管道中被丢弃；前端显示请求尺寸。
3. **对象存储**：当前 LocalStorage 是本机磁盘；生产需要 R2/S3 等持久化、共享、带生命周期的存储。
4. **孤儿资产清理**：没有定时扫描存储的清理任务。
5. **生产 PostgreSQL/多 Worker**：未在本轮验证；PGlite 仅开发。
6. **平台预算运营**：已实现但无管理界面/告警；当前本地未设上限。
7. **编辑画质**：端点已修正，但真实主体融合质量未验证。
8. Mock 作品：本地 mock 模式下会进入云端作品库，但已明确标注“模拟”；live 模式的列表会过滤 `_mock`。

## 16. 准备执行的单次真实测试方案（等待批准）

| 项目 | 值 |
|---|---|
| 范围 | 仅文生图 1 次；不测试编辑 |
| 模型 | `fal-ai/flux-2/klein/4b` |
| 数量 | 1 张 |
| 尺寸 | 1280×720（约 0.92 MP） |
| Prompt | `a quiet violet horizon over a calm sea, minimal, cinematic, 16:9` |
| 风格 | 现有“抽象与极简”或“自然风景” |
| 账号 | 当前本地测试账号（200 Credits，非生产） |
| 费用上限 | ≈ **$0.0046**（$0.005/MP）；预算预占按 $4 保守上界 |
| Credits | 10（成功 capture，失败 release） |
| 调用次数 | **1 次，禁止自动重试** |
| 测试后 | 立即 `GENERATION_PAUSED=1`，停止 Worker，移除 FAL_KEY/FAL_LIVE_ENABLED |
| 成功判定 | Job `succeeded`、PNG 资产、`/v1/creations` 可见、钱包 200→190、ledger `generation.captured` |
| 失败判定 | Job failed + errorCode；钱包不变；预算 spent 保留可能成本；不自动重试 |

费用约束：`PLATFORM_DAILY_COST_LIMIT_MICROS=4000000`（恰好 1 个 Job 的保守预占）、`USER_DAILY_COST_LIMIT_MICROS=4000000`；如担心并发，保持 `EMBED_WORKER=1` 且不启动第二个 Worker。

## 17. 需要你配合的配置步骤

1. 在 `apps/api/.env` 填入 `FAL_KEY=...`（不要发到聊天）。
2. 设置 `FAL_MOCK=0`、`FAL_LIVE_ENABLED=1`、`PLATFORM_DAILY_COST_LIMIT_MICROS=4000000`（可选 `USER_DAILY_COST_LIMIT_MICROS=4000000`）。
3. 确认 `EMBED_WORKER=1`，且没有第二个 Worker 进程。
4. `npm run stop` → `npm run start`；确认 `/v1/credits/pricing` 返回 `"generationMode":"live"`、`"paused":false`。
5. 由你确认后，执行 1 次生成；我负责核对 Job、钱包、ledger、资产与日志。
6. 测试后恢复 `FAL_MOCK=1`、移除 `FAL_LIVE_ENABLED`/`FAL_KEY`，设置 `GENERATION_PAUSED=1` 并重启。

## 18. 是否可以安全申请一次真实生成授权

**可以申请，但尚未执行。** 现在的控制点：显式 live 开关、Mock 默认、Credits 同一事务预占、平台/用户双预算、暂停开关、live 重试防护、存储失败释放、Job 级日志。唯一未满足的是你的付费授权与实际 FAL_KEY。

---

**状态区分**

- 已具备并不依赖真实调用的安全控制：**完成**
- Mock 端到端与账务/预算/暂停测试：**通过**
- 真实 fal.ai 调用：**未执行（等待授权 + FAL_KEY）**
- 生产上线：**未执行**，存在第 15 节阻塞项
