# 13 — 生产依赖可用性（Production Dependencies）

**日期**: 2026-11-03
**方法**: VPS SSH 只读 + 容器运行时检查 + 代码审查

## 1. 依赖状态总表

| 依赖 | 验证级别 | 状态 | 说明 |
|---|---|---|---|
| PostgreSQL | CONFIG_VERIFIED | ✅ | 容器 healthy，运行 5 天，迁移至 v8 |
| R2 存储 | CONFIG_VERIFIED | ✅ | STORAGE_DRIVER=r2，凭据完整，worker healthy 端到端验证 |
| 图片签名 URL | CONFIG_VERIFIED | ✅ | IMAGE_URL_SECRET SET(64)，canDownloadMediaPath 注册表驱动 |
| Waffo Prompt Sift | PRODUCTION_UNVERIFIED | ⚠️ | 路由已实现（RSA-SHA256 + hold-and-retry），但 WAFFO_MERCHANT_ID/KEY 为空 |
| OpenAI 输出审核 | PRODUCTION_UNVERIFIED | ⚠️ | OUTPUT_MODERATION_API_KEY ABSENT → fail-closed |
| Waffo Checkout | PRODUCTION_UNVERIFIED | ⚠️ | WAFFO 三件套 EMPTY → checkout=false |
| Waffo Webhook | PRODUCTION_UNVERIFIED | ⚠️ | 路由在线（403-guarded），待开关切换 |
| fal.ai 生成 | MOCK_E2E_PASS | ✅ | Mock 全流程通过；live 路径通过 306 API tests |
| Worker | MOCK_E2E_PASS | ✅ | healthy，mock 模式运行 |
| 成本守卫 | CONFIG_VERIFIED | ✅ | 平台 $100/日 + 用户 $10/日 |
| 暂停开关 | CONFIG_VERIFIED | ✅ | GENERATION_PAUSED=1（新任务 503） |
| 视频独立暂停 | CONFIG_VERIFIED | ✅ | FAL_VIDEO_LIVE_ENABLED 空 |

## 2. 关键安全机制核查

### 内容审核 fail-closed

| 阶段 | 状态 | 行为 |
|---|---|---|
| Prompt Sift（输入） | 代码就绪，凭据缺失 → unavailable | live 任务 fail-closed（MODERATION_UNAVAILABLE） |
| 输出审核（post-generation） | 代码就绪，key 缺失 → unavailable | live 生成不存储/不发布（OUTPUT_MODERATION_UNAVAILABLE） |
| 参考图（入口） | 代码就绪，同上 | 上传被拒（422/503） |
| Gallery 异步复查 | 代码就绪，job 未启动 | gallery-rescan 容器未创建 |

**结论**：所有审核阶段均为 fail-closed。当前生产状态（GENERATION_PAUSED=1 + mock）下无绕过风险。

### 图片签名 URL

- IMAGE_URL_SECRET SET(64 字符)
- 签名逻辑：HMAC-SHA256(jobId + expires)，60 分钟 TTL
- 私有 R2 存储桶（公开访问关闭），仅签名 URL 可读

### 成本守卫

- PLATFORM_DAILY_COST_LIMIT_MICROS = 100,000,000 ($100/日)
- USER_DAILY_COST_LIMIT_MICROS = 10,000,000 ($10/日)
- 超限 → 新任务 RATE_LIMITED 拒绝
- Waffo 审核凭据缺失时双保险：审核 fail-closed → 生成不可能实际消费

### 暂停机制

| 开关 | 控制范围 | 当前状态 |
|---|---|---|
| GENERATION_PAUSED=1 | 新生成任务 503 | ✅ 暂停 |
| PURCHASES_PAUSED | 新 Checkout 请求拒绝 | 未设（但 PUBLIC_ENABLED 也未设，等效） |
| PURCHASES_PUBLIC_ENABLED | Checkout 入口 | ABSENT → false |
| FAL_LIVE_ENABLED | live 图片生成 | EMPTY → 禁用 |
| FAL_VIDEO_LIVE_ENABLED | live 视频生成 | EMPTY → 禁用 |

## 3. 生产不可用项汇总

| # | 不可用项 | 阻断什么 | 恢复条件 |
|---|---|---|---|
| 1 | 真实 AI 生成 | 用户无法生成壁纸 | OUTPUT_MODERATION_API_KEY + GENERATION_PAUSED=0 + FAL_LIVE_ENABLED=1 |
| 2 | Waffo Checkout | 用户无法购买 Credits | WAFFO 三件套 + PAYMENT_PROVIDER=waffo |
| 3 | 输出内容审核 | fail-closed 时所有 live 生成被拒 | 同 #1 |
| 4 | Gallery 异步复查 | 新生成内容不会被自动复查 | 同 #1 + GALLERY_RESCAN_MANIFEST_URL |
| 5 | 真实 Waffo Webhook 处理 | Webhook 被拒绝 | PAYMENT_PROVIDER=waffo |

## 4. 防损测试结论

| 测试 | 结果 |
|---|---|
| 未认证请求不能创建生成任务 | ✅ 401 |
| 未认证请求不能创建 Checkout | ✅ 401 |
| GENERATION_PAUSED=1 时新任务 503 | ✅（306 API tests 含用例） |
| PAYMENT_PROVIDER=disabled 时 Checkout 403 | ✅（生产探测确认） |
| 输出审核缺失时 live 生成 fail-closed | ✅（moderation.test.ts 28 用例） |
| Prompt Sift 缺失时 live 任务 fail-closed | ✅（moderation.test.ts） |
| 成本超限时新任务拒绝 | ✅（payment-business.test.ts） |
