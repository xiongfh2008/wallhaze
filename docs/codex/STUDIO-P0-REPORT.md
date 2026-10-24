# WallHaze AI Studio 无法生成壁纸故障定位与修复报告

- 日期：2026-10-23
- 范围：`apps/api`、`apps/web`（本地 PGlite + Mock Provider）
- 安全约束：未调用真实付费 fal.ai、未执行真实支付、未改钱包余额、未关闭认证/Credits/预算、未 Git 提交、未操作旧项目
- 结论先行：**在“已登录 + Mock Provider”的当前环境无法复现生成失败**；两条完整链路均成功。审计中修复了 3 个真实缺陷（参考图编辑端点、确认按钮文案、过期静态 gate），并补齐失败诊断。真实 fal.ai 仍未验证（无 FAL_KEY，需你批准付费测试）。

## A. 故障定位

| 问题 | 结论 |
|---|---|
| 1. 点击后是否发出请求 | 是。浏览器发出 `POST /v1/generations/jobs` |
| 2. 请求端点 | `http://localhost:4000/v1/generations/jobs`（Fastify，异步 Job API） |
| 3. HTTP Status | `202 Accepted`（创建）；随后 `GET /v1/generations/jobs/:id` → `200`；图片 URL → `200` |
| 4. 业务错误码 | 成功链路无错误码；失败路径的错误码为 `UPSTREAM_ERROR` / `UPSTREAM_TIMEOUT` / `STORAGE_FAILED`（已加入 UI 区分） |
| 5. 第一个失败环节 | 当前环境未复现失败。真实 image-to-image 路径存在确定的失败点：编辑端点写成了 `/edit`，官方是 `/base/edit`（已修复）。Text-to-image 端点本身正确 |
| 6. 真正根因 | （a）本机没有 `FAL_KEY` 且 `FAL_MOCK=1`，真实 fal.ai 根本不会执行，只能返回 Mock 渐变图；（b）参考图编辑端点错误，真实编辑必失败；（c）确认按钮缺翻译、失败码被笼统显示，造成“像坏了”的观感；（d）旧的 FE04-A 静态 gate 常量仍残留，虽未被 Studio 使用，但属于回归隐患 |
| 7. 涉及文件 | `apps/api/src/modules/generation/fal.endpoints.ts`、`apps/api/src/business/worker.ts`、`apps/api/src/business/routes.ts`、`apps/web/components/GeneratorSection.tsx`、`apps/web/lib/studio/pricing.ts`、`apps/web/messages/*.json` |
| 8. 修复方式 | 端点改为官方 `/base/edit`；补 `generator.confirm` 七语言文案；删除静态 gate 常量并只保留运行时 gate；Worker/Job 增加结构化日志；失败码映射为具体提示 |

### 实际证据（本机 Mock，无真实费用）

| 项目 | 文生图 | 参考图（Mock） |
|---|---|---|
| Job ID | `5bd2d284-a5c1-499f-975e-3a61f35d1214` | `6728bfdb-cf88-491e-94d8-b551057822b9` |
| 创建 | `202`（38.9 ms） | `202`（11.8 ms） |
| Worker | claimed → succeeded（63 ms） | claimed → succeeded（99 ms） |
| 输出 | 79,211 bytes，`image/png`，`mock:true` | 79,211 bytes，`image/png`，`mock:true` |
| Job 查询 | `200` | `200` |
| 图片访问 | `200` | Job 返回 `hasImageUrl:true` |
| 钱包 | 200（未扣费） | 200（未扣费） |
| My Creations | 云端列表包含该作品 | 云端列表包含该作品 |
| 日志泄漏检查 | 日志中 prompt/参考图出现 0 次 | 同左 |

另有一条更早的浏览器任务 `476a0962-0a89-455c-a587-159cc48210ff` 同样 `202 → succeeded → image 200`，说明失败不是当前后端链路的稳定复现。

### 关于“登录状态”的核查

- 当前浏览器 Session 有效（Header 显示“账户”），200 Credits，价格 10，生成成功。
- 生成**不要求 Google 登录**；邮箱密码 Session 即可。没有绕过认证、没有改 Google 绑定策略、没有伪造 Session。
- 如果另一个浏览器里按钮是禁用的，最可能原因是该浏览器没有有效 Session（登录页并显示登录状态并不矛盾——登录页也可在已登录时访问）。这不是后端生成故障。

## B. 完成情况

| 项目 | 状态 |
|---|---|
| 9. 前端 | 已修复：确认按钮文案、失败码具体提示；Studio 使用运行时 gate（session + 服务端价格 + 钱包） |
| 10. 后端 | 已修复：参考图编辑端点；Job 创建日志 |
| 11. Worker | 已补强：claim/succeeded/failed 结构化日志；原有 lease/fencing 逻辑未改 |
| 12. Provider 参数 | 文生图参数与官方 schema 一致；编辑改为官方 `/base/edit`；`image_urls`、`image_size`、`output_format` 与官方一致 |
| 13. Storage | Mock 资产成功落盘（79,211 bytes PNG），Job 关联 asset；未改动存储实现 |
| 14. Credits | 未改动事务逻辑；Mock 成功释放预占，余额保持 200；既有测试覆盖失败释放/重复结算 |
| 15. 认证/Session | 未发现生成相关认证缺陷；OAuth 全量测试仍通过；密码会话可正常生成 |

### 本轮修复清单

1. **参考图端点**：`FAL_EDIT_ENDPOINT` 从 `.../klein/4b/edit` 改为官方 `.../klein/4b/base/edit`；测试改为直接引用生产常量，防止再次漂移。
2. **确认按钮**：补 `generator.confirm`（7 语言），不再显示原始 key。
3. **移除过期静态 gate**：删除 `CREDITS_SERVICES` / `currentCreditsGate`（始终 false 的死代码）及其测试；Studio 的 `resolveCreditsGate` 只吃运行时事实。
4. **诊断**：API 记录 `generation.job.created`（jobId/credits/mock），Worker 记录 `claimed/succeeded/failed`（jobId/attempt/errorCode/bytes/mime）；不记录 prompt、参考图、Key、Cookie。
5. **错误区分**：`STORAGE_FAILED`、`UPSTREAM_TIMEOUT`、`UPSTREAM_ERROR`、`RATE_LIMITED`、`CONFLICT` 映射到不同文案（新增图片保存失败提示）；纯函数 + 测试。

## C. 测试与验收

| 检查 | 结果 |
|---|---|
| API TypeScript | 通过 |
| API Vitest | **195 passed，1 skipped**（28 个文件） |
| API Build | 通过 |
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **171 passed**（22 个文件） |
| Web Build | 通过 |
| 文生图完整 Mock（浏览器） | 通过：选择风格/尺寸/提示词 → 确认 → Job → 图片预览 → 打开原图 |
| 参考图模式 Mock（浏览器 API） | 通过：data URI 参考图 → Job 202 → succeeded；真实主体融合未验证 |
| 失败/存储失败/超时/取消/禁用 | 自动化覆盖（见下） |
| 权限/积分/隔离 | 自动化覆盖 |
| My Creations | 云端作品列表显示新作品；Studio 内“我的图库”是设备本地记录，Mock 结果按设计不写入本地历史 |

失败与一致性测试证据：

- `tests/routes-business.test.ts`：Worker 失败时释放预占积分；跨站写入/未认证读取被拒绝。
- `tests/jobs.test.ts`：无余额拒绝创建；预算限制；独占领取/陈旧租约 fencing；Storage 失败释放；Mock 成功不扣费；参考图在结算后从 Job 请求中剥离。
- `tests/generation-flow.test.ts`：取消、超时、http/network 映射、迟到响应不覆盖新任务。
- `tests/isolation.test.ts`：日志不含 Key/prompt/参考图；Mock 全链路零外网；跨用户私有图片 404/401。
- 新增：`tests/fal-provider.test.ts`（官方端点、编辑 payload、不可信图片 host 拒绝）；`tests/generation-error.test.ts`（错误码映射）。

## D. 真实生成能力

| 问题 | 结论 |
|---|---|
| 24. 是否通过真实 fal.ai 验证 | **否** |
| 25. 缺少什么 | `FAL_KEY` 未配置；`FAL_MOCK=1`；本轮未获付费调用授权；真实模型对 1920×1080 自定义尺寸的接受度需要在一次受控调用中确认 |
| 26. 是否有真实收费调用 | **没有** |
| 27. 预算/费用保护 | 本地未配置 `USER_DAILY_COST_LIMIT_MICROS`，也未开启 `GENERATION_PAUSED`；Mock 模式不产生费用。真实测试前必须先设上限并保持单次调用 |
| 28. 是否可申请最小真实测试 | 可以，计划见下，等待批准 |

### 官方端点与价格（已核对公开文档）

- 文生图：`fal-ai/flux-2/klein/4b`（本项目已使用）
- 图生图/编辑：`fal-ai/flux-2/klein/4b/base/edit`（本轮修正）
- 文生图计费：**$0.005 / 百万像素**
- 编辑计费：**$0.009 / 百万像素输入 + $0.009 / 百万像素输出**；输入会缩放到 1 MP
- 参考：[文生图](https://fal.ai/models/fal-ai/flux-2/klein/4b/api)、[编辑](https://fal.ai/models/fal-ai/flux-2/klein/4b/base/edit/api)

### 建议的最小真实测试（需你明确批准）

1. 模型：`fal-ai/flux-2/klein/4b`（先只测文生图）
2. 调用次数：**1 次，禁止自动重试**
3. Prompt：`a quiet violet horizon over a calm sea, minimal, cinematic, 16:9`
4. 尺寸：`1280×720`（0.92 MP）
5. 预计费用：约 **$0.0046**（0.92 × $0.005）；若用 1920×1080 则约 **$0.0104**
6. 预计 Credits：10（成功时 capture；失败释放）
7. 成功判定：Job `succeeded`、资产为有效 PNG、`/v1/creations` 可访问、钱包 200→190、ledger 出现 `generation.captured`
8. 停止方式：只跑一次；不启用 mock 失败重试；测试后立即 `GENERATION_PAUSED=1` 并停 Worker；删除临时 `FAL_KEY`
9. 防超预算：设置 `USER_DAILY_COST_LIMIT_MICROS=40000`（$0.04 上限）或更低；单次调用前确认钱包与预算
10. 参考图真实测试（可选、单独批准）：1 次编辑，0.92 MP 输出 + 1 MP 输入，预计约 **$0.0173**

## 状态区分

| 状态 | 项目 |
|---|---|
| 已定位根因并修复 | 参考图编辑端点、确认按钮文案、过期静态 gate、失败诊断 |
| Mock 端到端测试通过 | 文生图 + 参考图链路（浏览器/接口）、My Creations 云端记录、额度不扣减 |
| 真实 fal.ai 已验证 | 否 |
| 真实 fal.ai 待授权验证 | 是（需 FAL_KEY + 单次付费批准） |
| 仍存在阻塞 | 真实 fal 凭据/授权；真实模型自定义尺寸验收；本地仍是 Mock/PGlite，生产需 PostgreSQL + 独立 Worker |

## 复现步骤（当前本机）

1. 打开 `http://localhost:3100/zh/studio`（已登录，Header 显示“账户”）。
2. 选择风格（如赛博朋克）、保持桌面 16:9。
3. 输入 Prompt，点击“生成壁纸” → 确认对话框（按钮现在显示“确认生成”）。
4. 确认后约 0.1 s 完成，预览显示图片，并出现“开发用 Mock 预览——未调用 AI 模型，也未扣除积分”。
5. 积分保持 200；`/zh/my-creations` 的“云端作品”出现该作品。

如果这次仍出现失败，请把 Job ID（或页面上的错误文字）发我；后端日志现在按 `jobId` 关联 claim/succeeded/failed，可直接定位到具体阶段。
