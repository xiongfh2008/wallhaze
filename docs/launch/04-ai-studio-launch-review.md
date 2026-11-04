# 04 — AI Studio 开放审查（AI Studio Launch Review）

范围：生成全链路（同步遗留路由 + 异步 Job/Worker + fal Provider）、商业化开关设计与真值表、防重复付费、预算控制。

## 1. 生成链路（商业化正路 = 异步 Job 端点）

```
POST /v1/generations/jobs（requireUser + 闸门 + 参数校验 + 视频/图片分发）
  → enqueueJob：事务内 预算检查→插 job→reserve credits（jobs.ts:166-276）
  → Worker claimJob：FOR UPDATE SKIP LOCKED，lease token（jobs.ts:290-349）
  → provider 调用（fal.provider / video.providers；FAL_MOCK/FAL_LIVE_ENABLED/FAL_VIDEO_LIVE_ENABLED fail-closed 判定，provider-mode.ts:19-46）
  → 输入审核（Prompt Sift enforce + 本地 blocklist，moderation.ts:89-285）
  → 输出审核（OpenAI Moderation 抽帧；未配置=永不落盘，output-moderation.ts:77-207）
  → 私有存储（R2/local，签名 URL /v1/creations/:id?exp&sig）
  → completeJob：capture credits → captureJob 预算 → image_assets 30d 过期
```

审核/存储/预算全部 fail-closed（moderation.test.ts 覆盖故障注入）。

## 2. 商业化开关设计（本轮新增实现）

**原则**：服务端最终拦截（路由层，客户端不可绕过）；默认全关；配置好凭证≠开放；前端只做展示降级；状态不可读=关闭（fail-closed）；暂停购买不影响资金流。

| 环境变量 | 默认 | 控制 | 拦截点 |
|---|---|---|---|
| `PURCHASES_PUBLIC_ENABLED` | 关 | 新建 Checkout | `POST /v1/payments/checkout` 顶部 503（routes.ts） |
| `PURCHASES_PAUSED` | 否 | 运营暂停售卖 | 同上；webhook/refund/sync/订单查询不受影响 |
| `STUDIO_PUBLIC_ENABLED` | 关 | 新建生成任务 | `POST /v1/generations/jobs` 503（在 GENERATION_PAUSED 之后） |
| `VIDEO_PUBLIC_ENABLED` | 关 | 付费视频任务 | 同路由 isVideo 分支 503，**独立于图片闸门** |
| `FAL_LIVE_ENABLED`+`FAL_KEY` | 关 | Provider 真实调用 | provider-mode（原防护保留，纵深防御） |
| `FAL_VIDEO_LIVE_ENABLED` | 关 | 视频 Provider | 同上 |
| `GENERATION_PAUSED` | 关 | 全停生成 | API 拒新任务 + Worker 拒领（原机制保留） |

状态暴露：`GET /v1/credits/pricing` 返回 `purchasesPublic/purchasesPaused/studioPublic/videoPublic`（videoPublic 服务端已组合 `studioPublic && videoPublic`）→ 前端状态驱动渲染（见 07 前端改造）。

### 真值表（已测：tests/commercialization-gates.test.ts，9 用例）

| PURCHASES_PUBLIC | PURCHASES_PAUSED | checkout | webhook/退款/sync | STUDIO_PUBLIC | 图片任务 | VIDEO_PUBLIC | 视频任务 |
|---|---|---|---|---|---|---|---|
| 0 | 0 | **503** | ✅ | 0 | **503** | 0 | **503** |
| 1 | 0 | ✅ | ✅ | 1 | ✅ 202 | 0 | **503** |
| 1 | 1 | **503**(paused) | ✅ | 1 | ✅ | 1 | ✅ |
| 0 | 0 | 503 | ✅ | 0 | 503 | 1 | **503**（studio 优先） |
| 1 | 0 | ✅ | ✅ | 0 | 503 | 1 | 503 |

配套防护（均有用例）：
- 生产 + `FAL_MOCK=1` → 拒绝启动（mock 冒充真实付费生成，本轮新增）；
- 生产 + `PAYMENT_PROVIDER=mock` → 拒绝启动（原有）；
- 同步遗留路由 `POST /v1/generations`（无认证、无计费）在 live 模式 503 —— **计费绕用 P0 已封堵**。

## 3. fal 链路防重复付费 ✅

- Job 预留唯一（reservation PK=job_id）→ 一任务最多一次结算；
- Worker `attempt>1` 即拒绝重新提交真实供应商（worker.ts:579-591）——进程重启/重试不会双倍调 fal；
- fal 调用无跨进程幂等键（P2 记录）：单 Worker 实例 + lease 排他下安全；多实例需 PSP 式幂等键（fal-ai queue API 支持）——写入 09 runbook 扩容前提。
- Checkout 侧同构问题（外部先行）已在 02 文档修复。

## 4. 预算控制 ✅

- `USER_DAILY_COST_LIMIT_MICROS` / `PLATFORM_DAILY_COST_LIMIT_MICROS`，单位**微美元**（1 USD = 1,000,000），UTC 日界，`generation_budgets` 表 reserved→spent 结转；
- 超限 → 新任务 429/503（RATE_LIMITED），老任务不中断；
- **上线参数建议**（写入配置模板）：用户 $5/日、平台 $200/日 起步，观察后放宽；平台 0 = 全停。

## 5. 上线操作（三段式，详单在 09 runbook）

1. 配置凭证（不开放）：WAFFO_*、FAL_KEY、OUTPUT_MODERATION、R2_* → 全量回归；
2. 开 Studio：`STUDIO_PUBLIC_ENABLED=1` → 观察任务/预算/审核日志；
3. 开购买：`PURCHASES_PUBLIC_ENABLED=1`（如需视频另开 `VIDEO_PUBLIC_ENABLED=1`）。任一环节异常 → 对应开关回 0 即收口，无需回滚代码。
