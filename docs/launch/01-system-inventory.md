# 01 — 系统功能与配置核查（System Inventory）

基线：本地 master 分支 `df98017`，31 个未提交修改文件（SEO/壁纸授权修复，保留不回退）。
核查方式：只读通读 apps/api/src、apps/web 商业化相关代码 + migrations。未做任何写操作。

## 1. 架构总览

```
浏览器 (apps/web: Next.js 16.4 / vinext / Cloudflare, 7 语言)
   │  HttpOnly Cookie wh_session + NEXT_PUBLIC_API_BASE_URL
   ▼
API (apps/api: Fastify, VPS)  ──► PostgreSQL（生产）/ PGlite（本地）
   │                                ▲
   ├─► Waffo Pancake (@waffo/pancake-ts)   │ FOR UPDATE SKIP LOCKED
   ├─► Waffo Prompt Sift（复用商户密钥）     │
   ├─► fal.ai（图片 flux-2/klein/4b + edit；视频 Wan2.2 5B I2V / Kling V3）── Worker 独立进程
   ├─► OpenAI Moderation（输出审核，视频抽帧）
   └─► Cloudflare R2（私有媒体 + SigV4 签名 URL）
```

- 图片/视频生成走**异步 Job 队列**：`POST /v1/generations/jobs` → `enqueueJob()`（[jobs.ts:167](file:///d:/Project/wallhaze/apps/api/src/business/jobs.ts#L167)）→ Worker `claimJob()`（[jobs.ts:294](file:///d:/Project/wallhaze/apps/api/src/business/jobs.ts#L294)）→ `completeJob()`/`failJob()`。
- `modules/generation/*` 是 Provider 层（fal 真实/(mock) 调用边界），由 `business/worker.ts` 驱动；不是独立的同步商业路径。

## 2. 功能清单

| # | 功能 | 已有实现 | 当前启用 | 前端开关 | 后端开关 | 配置依赖 | 风险点 | 需改文件 | 验收方式 |
|---|------|---------|---------|---------|---------|---------|--------|---------|---------|
| 1 | Google OAuth 登录 | ✅ 完整（state cookie + session） | 视凭证 | 账号菜单 | `GOOGLE_CLIENT_ID/SECRET` 缺失=诚实禁用 | GOOGLE_*、OAUTH_STATE_SECRET | 密钥复用已防（强制独立 secret） | 无 | E2E 登录 |
| 2 | Credits 钱包 | ✅ 余额/预留/账本，append-only 触发器 | ✅（随 API） | API base URL 可达 | 无独立开关 | 数据库 | — | 见 #3 开关 | 场景 A-O |
| 3 | Credits 购买（Waffo Checkout） | ✅ checkout/webhook×2/sync/refund/replay | ⚠️ `PAYMENT_PROVIDER` 默认 **mock** | `CREDIT_WALLET_SERVICES_CONFIGURED`（base URL） | `PAYMENT_PROVIDER=mock/waffo/disabled`；**无购买暂停开关** | WAFFO_MERCHANT_ID/STORE_ID/PRIVATE_KEY | **P0: checkout 外部先行时序**（见 §4） | payment.ts、env.ts、routes.ts | P01-P20 |
| 4 | Webhook 双路由 | ✅ `/v1/payments/webhook` 与 `/v1/webhooks/waffo` 同一 `receiveProviderWebhook`（[routes.ts:839-910](file:///d:/Project/wallhaze/apps/api/src/business/routes.ts#L839-L910)） | ✅ | — | — | — | 双地址需登记一个，防运维混淆 | 无（运维项） | P08/P09 |
| 5 | 订单同步/对账 | ✅ `/v1/payments/orders/:id/sync` + `retryReceivedEvents()` | ✅ | Credits 页 | — | — | 孤儿外部会话无本地记录（P0 关联） | payment.ts | P13 |
| 6 | 退款 | ✅ 全额退款事件：paid→扣回 credits；pending→标记 refunded 不入账 | ✅ | — | — | — | **部分退款未区分**（P1，见 03 文档） | payment.ts | P15-P17 |
| 7 | AI Studio 静态图生成 | ✅ 异步 Job 全链路 | ⚠️ 代码就绪，页面 Coming Soon | `/studio` 硬编码 Coming Soon（[studio/page.tsx:105](file:///d:/Project/wallhaze/apps/web/app/[locale]/studio/page.tsx#L105)） | `FAL_MOCK/FAL_LIVE_ENABLED+FAL_KEY`；**无 Studio 公开开关** | FAL_KEY | 开关缺失 → 无法受控开放 | env.ts、app.ts、routes.ts、studio/page.tsx | G01-G03 |
| 8 | 图片编辑（/edit） | ✅ `FAL_EDIT_ENDPOINT`（fal.endpoints.ts:1-12），refDataUri 走真实 edit | 同上 | GeneratorSection 参考图上传 | 同上 | 同上 | 上传校验待验收 | 无 | G03 |
| 9 | 动态壁纸视频 | ✅ Wan2.2 I2V / Kling T2V Provider + `videoJobPricing()` 权威定价 | ⚠️ `FAL_VIDEO_LIVE_ENABLED` 默认关 | LiveWallpaperStudio | `FAL_LIVE_ENABLED+FAL_VIDEO_LIVE_ENABLED`；**无视频独立业务开关** | 同上 + ffmpeg/ffprobe | 图片开放≠视频开放需显式保证 | env.ts、routes.ts:959 | G04-G05 |
| 10 | 预算控制 | ✅ `USER/PLATFORM_DAILY_COST_LIMIT_MICROS`（微单位）；平台 0=全停 | 未设=无限制 | — | 环境变量 | env.ts:72-82 | 未设上限+真实计费=裸奔（P1 运维项） | 无（上线参数） | G14 |
| 11 | 输入审核 | ✅ Prompt Sift（enforce 默认）+ 本地 blocklist，故障 fail-closed | ✅（live 模式） | — | `WAFFO_MODERATION_*` | WAFFO 商户密钥 | Prompt Sift 权限需人工核实 | 无 | G18/G19 |
| 12 | 输出审核 | ✅ OpenAI Moderation 抽帧，未配置=永不落盘（fail-closed） | ✅（live 模式） | — | `OUTPUT_MODERATION_*` | API key | 未配置则 live 生成全部失败 | 无 | G17 |
| 13 | 私有存储 + 签名 URL | ✅ R2/local 双驱动，SigV4 签名 `/v1/creations/:id` 带 exp+sig | ✅ | — | `STORAGE_DRIVER=r2` | R2_*、IMAGE_URL_SECRET | R2 PUT 单发无重试（P2 补偿项） | 无 | G20 |
| 14 | 我的作品 | ✅ creations 列表/详情，按用户隔离 | ✅ | Credits/Studio 页 | — | — | — | 无 | G20 |
| 15 | Pricing 页 | ⚠️ 购买按钮硬编码 disabled（任务书确认） | 关闭 | 硬编码 | 无 | — | 状态未数据驱动 | pricing/page.tsx | UI 验收 |
| 16 | 限流/防护 | ✅ rate-limit + request-guard（Sec-Fetch-Site/Origin）+ CORS 白名单 | ✅ | — | `CORS_ALLOWED_ORIGINS` | — | 进程内计数，多实例放大 | 无 | 安全专项 |
| 17 | 生成暂停 | ✅ `GENERATION_PAUSED=1` → 503 | 关 | — | ✅ | env.ts:28-29 | 暂停不影响老任务恢复 | 无 | E07 |

## 3. 开关现状与缺口（对应任务书第 2 节）

已有底层开关：`PAYMENT_PROVIDER`（含生产安全的 `disabled`）、`PAYMENT_ENVIRONMENT`、`FAL_MOCK`、`FAL_LIVE_ENABLED`、`FAL_VIDEO_LIVE_ENABLED`、`GENERATION_PAUSED`、预算双限。

**缺口：没有「商业化业务状态」层** —— 无法在不重启/不改底层凭证的情况下：
- 受控开放购买入口（区分「商户配置好」与「允许购买」）；
- 受控开放 Studio 入口（页面当前硬编码 Coming Soon，与后端状态无关）；
- 视频与图片解耦开关（当前只有 FAL 层视频开关，无业务层）；
- 暂停新购买但保留老订单 Webhook/退款/对账。

方案（真值表与实现见 04-ai-studio-launch-review.md §开关设计，代码在 env.ts/routes.ts/app.ts）：新增
`PURCHASES_PUBLIC_ENABLED`、`STUDIO_PUBLIC_ENABLED`、`VIDEO_PUBLIC_ENABLED`、`PURCHASES_PAUSED`，默认全关；服务端路由最终拦截；前端仅做展示降级；状态不可读=关闭（fail-closed）。

## 4. 已确认的 P0/P1 候选（详见 P0/P1/P2 清单）

| 级别 | 问题 | 位置 |
|------|------|------|
| P0 | `PaymentService.checkout()` 新订单**先外部 createCheckout 后本地 INSERT**：外部成功+本地失败→孤儿会话；同 idempotency-key 重试→新 UUID→**第二个外部 Checkout**；创建期间 Webhook 提前到达→NOT_FOUND 回滚（依赖 PSP 重试）。与 fal HTTP200 响应丢失事故同构 | [payment.ts:470-530](file:///d:/Project/wallhaze/apps/api/src/business/payment.ts#L470-L530) |
| P1 | 退款仅支持全额语义；部分退款/多次部分退款/拒付未区分，`refunded` 一律全额扣回 | [payment.ts:286-302](file:///d:/Project/wallhaze/apps/api/src/business/payment.ts#L286-L302) |
| P1 | 前端 `/studio`、`/pricing` 状态硬编码，与后端开放状态无联动 | studio/page.tsx:105、pricing/page.tsx |
| P1 | `USER/PLATFORM_DAILY_COST_LIMIT_MICROS` 生产未设定上限策略（推荐参数另行输出） | env.ts:72-82 |
| P2 | R2 PUT 单发设计，超时结果不确定，无补偿任务 | r2-storage.ts:135-199 |

## 5. 数据库迁移清单（现状）

001_core（钱包/账本/预算/任务）→ 002_packages → 003_payment_products → 004_checkout_url → 005_media → 006_media_lifecycle → 007_cleanup_claim → 008_moderation_logs。
商业化开关若走环境变量实现，则**本轮零新迁移**；若需持久化运营开关，需新增 009（可选，见配置模板）。

## 6. 测试资产现状

- API：`apps/api/tests/`（generation-api、fal-provider、provider-mode、rate-limit、request-guard、errors、mock-image 等）。
- Web：`apps/web` vitest，基线 297/297 通过。
- 支付场景 P01-P20、生成 G01-G20、组合 E01-E08 尚无系统化用例 —— 本轮在隔离 PGlite + Mock adapter 上补齐（见 08-e2e-test-results.md）。
