# 19 — 商业化快速上线交付（Launch Delivery）

**日期**: 2026-11-04
**范围**: 静态（文生图/图片编辑）+ 动态（文生视频/图生视频）+ Waffo Credits 购买 + 作品管理，本次同步开放
**性质**: 只读预检 + 本地隔离测试与必要修复；未部署、未改生产、未发生真实收款或付费调用
**结论**: **BLOCKED**（缺正式凭据与审核能力 — §1）；凭据就绪后按 §6 手册执行即为 READY_FOR_CONTROLLED_DEPLOY

---

## 1. 最新上线阻断项清单

### A 类：凭据/配置缺失（生产 api.env 实测，2026-11-04 只读 SSH）

| # | 阻断项 | 生产现状 | 阻断什么 | 解除方式 |
|---|---|---|---|---|
| B1 | ~~`OUTPUT_MODERATION_API_KEY`（OpenAI）~~ **已解除（有条件）** | 未设置（不再需要） | 输出审核默认后端改为 fal NSFW（复用 FAL_KEY，doc 19a）；OpenAI 路径保留为可选增强 | 以替代方案验收通过为条件（`tests/fal-nsfw-moderation.test.ts` 15 例 + 四模式 E2E 已过） |
| B2 | `WAFFO_MERCHANT_ID / STORE_ID / PRIVATE_KEY` | **全部为空** | Waffo 正式收款 + Prompt Sift 输入审核 | 人工注入正式（prod）凭据（§2） |
| B3 | `PAYMENT_PROVIDER` / `PAYMENT_ENVIRONMENT` | disabled / test | 正式收款 | 凭据就绪后切 `waffo` / `prod`（§6 第五步） |
| B4 | `FAL_MOCK=1` + LIVE 开关空 + `GENERATION_PAUSED=1` | mock+暂停 | 真实生成 | `FAL_MOCK` 移除 + `FAL_LIVE_ENABLED=1` + `FAL_VIDEO_LIVE_ENABLED=1` + `GENERATION_PAUSED=0`（§3；**顺序见 D1**） |
| B5 | 三/四个公众闸门 | 全关（正确） | 公众入口 | 最后一步统一开放（§6 第八步） |

### B 类：部署前提（本轮确认）

| # | 事项 | 说明 |
|---|---|---|
| D1 | **下次 API/worker 镜像重建前必须先移除 `FAL_MOCK`** | 未提交代码在 `NODE_ENV=production && FAL_MOCK=1` 时拒绝启动（api+worker 都会 crash）；运行中的旧镜像不受影响。操作顺序：先改 api.env 再部署新镜像（§6 第五步） |
| D2 | **迁移 009 随部署自动应用** | `payment_webhook_events` 新增 `manual_review` 状态（部分退款/未知事件人工队列）；启动即迁移，无需手工 SQL |
| D3 | 工作区 83 个 dirty 文件待授权提交 | 部署归档前必须先提交（本次未获 Git 授权，未执行） |

### C 类：本轮已修复（不再阻断）

| # | 修复 | 证据 |
|---|---|---|
| C1 | **图片成本上界失真**：`GENERATION_COST_BOUND_MICROS` $4.00 → **$0.05**。旧值 200 倍于真实最坏成本（2048²=4.19MP × $0.005/MP ≈ $0.021），在 $10/日用户预算下只能生成 **2 张图/天**，无法支撑真实用户使用。新值保留 2.4× 余量，只影响预算记账，不影响 Credits 定价 | `src/business/pricing.ts`；全套 325 测试过 |
| C2 | 部分退款误整单扣回 → `manual_review` 保护 + 迁移 009（上一轮修复，本轮复核） | `tests/refund-protection.test.ts` 10 例 |
| C3 | "生产拒绝 Mock 启动"表述修正（仅支付侧对运行镜像成立） | doc 18 §2.4 |

### 无阻断确认（复核，不重复全面审计）

- 四种生成模式的扣费语义（预留/捕获/释放/幂等/不透支）✅ `tests/full-commerce-e2e.ts` + `credit-capture-semantics` 4 例
- 重复 Worker 完成不重复扣费；超时/租约防重复提交（单 Worker + lease fencing + `UPSTREAM_UNCERTAIN` 不重提）✅
- 关闭新购买不影响已发生支付回调/退款/对账（`PURCHASES_PAUSED=1` 语义，测试锁定）✅
- 关闭视频不影响静态生成、不取消既有任务（视频独立闸门，路由级拦截）✅
- 七语言页面 200（zh/ja/ko/es/fr/de 直连 + en 经默认语言重定向）✅ 本轮探测；布局/溢出此前审计已过（doc 12/15），本轮未改前端

## 2. Waffo 正式配置操作步骤（人工）

> 本地 `apps/api/.env` 已有一套 **test 模式**凭据（MID 26 位 / SID 26 位 / KEY 1628 位 raw-base64，`normalizePem` 兼容）。**正式收款需要 prod 凭据**——在 Waffo 商户面板确认商户已开通正式收款后获取 prod 密钥（或确认同一 Store 已切 live 并签发 prod key）。不要直接把 test 凭据用于 prod 环境（`PAYMENT_ENVIRONMENT` 与事件 `mode` 强校验，test 事件永远无法结算 prod 订单，反之亦然）。

1. 面板：确认商户正式收款权限（已过审）+ Store 状态。
2. 面板：三档一次性产品（USD）：Starter $5.00 / Creator $20.00 / Studio $69.00，与 `credit_packages` 一致；记录 prod Product ID。
3. 面板：Webhook 登记 `https://api.wallhaze.com/v1/payments/webhook`（仅此一个；别名 `/v1/webhooks/waffo` 同处理器）；事件勾 `order.completed` + `refund.succeeded`（`refund.failed` 可选，代码确认为无资金动作）。
4. 面板：退款策略设为**仅允许全额退款**（当前实现部分退款进人工队列不自动动账——若 Waffo 确认会发部分退款事件，需人工处理流程，见 §7 对账）。
5. VPS `api.env` 注入 prod 三件套（支持 PEM 或 raw-base64）：`WAFFO_MERCHANT_ID` / `WAFFO_STORE_ID` / `WAFFO_PRIVATE_KEY`；**严禁**将密钥写入代码/聊天/日志。
6. 本地执行 `npm run waffo:check`（只读）→ `npm run waffo:setup`（写入 `payment_products` 三行映射）。
7. 验证（test 阶段先做）：真实签名 webhook 端到端 + 拉取式 `POST /v1/payments/orders/:id/sync` + 退款撤销 + 幂等（同事件 id 重放 no-op）。入账幂等三层：事件表唯一键 → 订单状态机 → 账本幂等键（`order:<id>` / `refund:<id>`）。

## 3. fal.ai 图片/视频配置步骤（人工 + 首次真实验证）

代码侧已就绪并核对（本轮）：

| 模式 | Provider（fal.ai 端点） | 参数要点 | 真实运行证据 |
|---|---|---|---|
| A 文生图 | `fal-ai/flux-2/klein/4b` | `{width,height}` ≤2048/步长4、`enable_safety_checker`、输出 PNG/JPEG | ✅ 已有（批量生成 48 张 + 社区 demo，$ 计费实测 $0.005/MP） |
| B 图片编辑 | `fal-ai/flux-2/klein/4b/base/edit` | 参考图 dataURI ≤5MB + prompt | ✅ 端点已修正（/base/edit）；真实调用随受限测试（§6 第六步） |
| C 文生视频 | `queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video` | `duration:"3"/"4"/"5"`（秒）、`aspect_ratio` 9:16/16:9/1:1、`generate_audio:false` | ⚠️ **从未真实调用**——列入第六步受限测试首跑 |
| D 图生视频 | `queue.fal.run/fal-ai/wan/v2.2-5b/image-to-video` | 首帧 dataURI、`num_frames≤161`、24fps、720p、`video_quality:"high"` | ✅ 已有（live-demo 批量实跑成功）；$0.15/条 |

输出与扣费保障（代码级已验证）：返回必须是 MP4（worker 校验 + `video/mp4` 落库）、`durationSeconds`/宽高入库、签名 URL 浏览器播放与 `&download=1` 下载（E2E 已断言 200）、前端循环播放（LiveVideoPlayer loop）；防重复付费：单 Worker 串行认领 + lease 排他 + 超时标记 `UPSTREAM_UNCERTAIN` 不再重提 + 预算按保守 costBound 记账（视频 $0.50/$0.65/$0.80 vs 实际 $0.15/$0.25/$0.34/$0.42）。

VPS `api.env` 步骤：① 删除 `FAL_MOCK`（D1，**先于镜像重建**）② 注入 `FAL_KEY`（本地根 `.env.local` 已有 72 位可用 key，复制值本身，不落聊天）③ `FAL_LIVE_ENABLED=1`、`FAL_VIDEO_LIVE_ENABLED=1` ④ api 与 worker 两个容器共用同一 api.env，重启两者 ⑤ `curl /v1/credits/pricing` 确认 `generationMode:"live"`、`video.available:true, mock:false`。

## 4. 审核服务配置步骤（人工）— OpenAI 依赖已移除

**输出审核默认后端 = fal NSFW（`fal-ai/imageutils/nsfw`，复用 FAL_KEY，$0.001/图）**；OpenAI 路径保留为可选增强（设了 `OUTPUT_MODERATION_API_KEY` 仍优先生效）。覆盖范围：NSFW 分类器判定成人性内容（概率阈值 `FAL_NSFW_THRESHOLD`，默认 0.5）；暴力/自残/换脸/版权不由该分类器判定——由上游 Prompt Sift 政策类目 + 本地禁止词兜底，下游人工复核与举报处理（用户产出默认私有，公开画廊走人工导入闸门 + 复查）。任一层不可判定 → fail-closed 拒绝存储/发布。

| 层 | 依赖 | 状态 | 步骤 |
|---|---|---|---|
| 输入 Prompt Sift | WAFFO 三件套（与支付同钥） | 代码就绪；凭据缺 → live fail-closed | 注入 §2 凭据即生效；真实联调放第六步 |
| 本地禁限词 | `config/blocklist.json`（102 词，5 类） | ✅ 恒生效 | 无 |
| 输出图片审核 | **FAL_KEY（已有，复用）**；可选 `FAL_NSFW_THRESHOLD` | ✅ 隔离验收通过（15 例） | 无需注入新密钥；验证：live 图片任务 succeeded 且 `moderation_logs` 有 post_generation allow 记录 |
| 视频抽帧审核 | 同上 + ffmpeg（镜像内已验证） | ✅ 同上 | 逐帧 fal 审核；抽帧失败/任一帧异常 → 整条拒绝 |
| 参考图入口筛查 | 同上（创建时复筛） | ✅ 同上 | 违规图 → 422；审核服务不可用 → 503（fail-closed，测试锁定） |
| （可选）OpenAI 增强 | `OUTPUT_MODERATION_API_KEY` | 保留兼容 | 若设置则优先生效，无需其它改动 |
| Gallery 异步复查 | `GALLERY_RESCAN_MANIFEST_URL` | 未设（生成开放后补） | manifest 就绪后注入 |

账务正确性（已验证）：预生成拒绝 → 释放；生成后审核拒绝 → **不存储不发布**、扣费归入成本不退 Credits（`providerBilled` 语义）；审核服务不可用 → live 任务拒绝（credits 释放）。**任何一层缺凭据 = 不开付费生成（任务 §6）。**

## 5. 完整 E2E 结果（本地隔离库 + Mock PSP/不联网 Provider，本轮实跑）

`tests/full-commerce-e2e.ts` — **12 步全过**：

```
1 signup 200 → 2 定价核对（图10 / i2v5s=40 / t2v 3·4·5=40·50·60）
3 购买 100cr（mock webhook HMAC）→ 3b 重复回调 no-op（credits-once）
4 文生图 → 预留10 → 捕获10 → 90（签名预览URL）
5 图片编辑（参考图过审）→ 捕获10 → 80
6 Provider 失败 → 任务 failed、hold 释放 → 仍 80、无负债
7 文生视频 3s → 捕获40 → 40（MP4+签名URL+时长断言）
8 图生视频 5s（源=自家文生图结果）→ 捕获40 → 恰好 0
9 零余额再下单被拒（409）→ 钱包永不透支
10 作品列表 4/4；图片+视频下载 200（owner-scoped 签名URL）
11/12 账本序列逐条断言（purchase + 4×reserved/captured + 1×released）；DB：1 订单/1 事件/4 成功任务/1 失败/4 资产/4 捕获
FULL_COMMERCE_E2E_PASS
```

配套回归：API 全量 **42 文件 / 325 passed + 1 skipped**、tsc 0 错误；浏览器闭环（上一轮）：Pricing→购买→Mock Paid→入账→Studio 生成→扣减全程 UI 验证 + 截图；视频专项：扣费语义/失败释放/重复完成不重复扣（`credit-capture-semantics` 4 例）；退款 7 形态（`refund-protection` 10 例）。

## 6. 正式部署操作手册（人工执行，每步验证后再进下一步）

> 前置：Git 提交授权（D3）→ 构建/推送镜像 → 以下顺序执行。

**第一步 凭据准备**：§2 Waffo prod 三件套、§3 FAL_KEY、§4 OpenAI key。全部到手前不部署。

**第二步 fal/Waffo 面板**：产品三档 + Webhook URL 登记 + 仅全额退款策略。

**第三步 审核配置**：API key 注入清单——
```
WAFFO_MERCHANT_ID=<prod>          WAFFO_STORE_ID=<prod>
WAFFO_PRIVATE_KEY=<prod PEM或raw-base64>
# OUTPUT_MODERATION_API_KEY 不再必填（OpenAI 为可选增强；默认 fal NSFW 复用 FAL_KEY）
# FAL_NSFW_THRESHOLD=0.5           # 可选：fal NSFW 拦截阈值
FAL_KEY=<fal key>                 # 不再有 FAL_MOCK（D1）；同时供输出审核使用
FAL_LIVE_ENABLED=1                FAL_VIDEO_LIVE_ENABLED=1
GALLERY_RESCAN_MANIFEST_URL=<manifest（可后补）>
# 闸门保持关闭：
GENERATION_PAUSED=1  STUDIO_PUBLIC_ENABLED  VIDEO_PUBLIC_ENABLED
PURCHASES_PUBLIC_ENABLED          # 三者不设=关
PAYMENT_PROVIDER=disabled         PAYMENT_ENVIRONMENT=test
PLATFORM_DAILY_COST_LIMIT_MICROS=100000000   USER_DAILY_COST_LIMIT_MICROS=10000000
```

**第四步 基础设施核查**：PostgreSQL healthy（迁移将自动到 v9）、R2 凭据、api+worker 容器、磁盘、`pg_backups`/备份任务在跑、预算两值确认。

**第五步 部署新代码（一切保持关闭）**：api.env 先改（D1：移除 FAL_MOCK）→ 拉新镜像 → `docker compose up -d`（api+worker 重启，迁移 009 自动应用）→ 验证：`/health` 200、`/v1/credits/pricing` = `{generationMode:"live", paused:true, checkoutAvailable:false, video.available:true}`、`payment_webhook_events` 表含 manual_review 状态、web 端 `deploy:vinext`。

**第六步 受限真实小额验证（须单独授权！）**：临时对测试账号开放（环境不开放公众）——
1. `PAYMENT_ENVIRONMENT=test` 先行：Waffo test 支付+退款端到端；
2. 切 `PAYMENT_PROVIDER=waffo` + `PAYMENT_ENVIRONMENT=prod` + `GENERATION_PAUSED=0` + `STUDIO_PUBLIC_ENABLED=1`（仅测试账号可用的最小开放）；
3. 真实 $5 Starter 一单 → 入账 100cr → 依次真实执行：文生图、图片编辑、文生视频 3s、图生视频 5s 各一次 → 核对 fal 后台计费 vs `generation_budgets.spent`、任务/文件/账本一致；
4. 全额退款该单 → Credits 全撤 + manual_review 无残留。

**第七步 对账验证**：`payment_orders` vs Waffo 后台；`credit_ledger` 汇总 = 入账−退款；`generation_budgets` vs fal 账单；`moderation_logs` 各层有记录；webhook failed=0。

**第八步 正式开放（同步，静态+动态同时）**：
```
PURCHASES_PUBLIC_ENABLED=1   STUDIO_PUBLIC_ENABLED=1   VIDEO_PUBLIC_ENABLED=1
PAYMENT_PROVIDER=waffo       PAYMENT_ENVIRONMENT=prod   GENERATION_PAUSED=0
```
重启 api+worker → 七语言抽查 → 观察 ≥30 分钟（错误率/审核日志/预算余量/webhook failed）→ 按日对账。

## 7. 一键暂停与回滚操作手册

| 场景 | api.env 动作 | 生效 | 影响面 |
|---|---|---|---|
| 暂停购买（已付回调/退款/对账**照常**） | `PURCHASES_PAUSED=1` → 重启 api | 新 checkout 503 | 已入账 Credits 不受影响；既有任务照跑 |
| 暂停全部 AI（老任务可完成） | `GENERATION_PAUSED=1` → 重启 api+worker | 新任务 503；worker 拒领新任务 | 已在跑任务完成并正常结算 |
| 仅停视频 | `VIDEO_PUBLIC_ENABLED=0` → 重启 api | 视频新任务 503；静态不受影响 | **既有视频任务不取消、不丢、不重复扣**（结算与任务表无关闸门） |
| 完整收口 | `PURCHASES_PUBLIC_ENABLED=0`+`PURCHASES_PAUSED=1`+`STUDIO_PUBLIC_ENABLED=0`+`VIDEO_PUBLIC_ENABLED=0`+`GENERATION_PAUSED=1` → 重启 | 站点可浏览，商业化全关 | 资金安全；对账继续 |
| 前端异常 | `deploy:vinext` 回退上一构建 | 秒级 | — |
| API 代码回滚 | 上一镜像 tag（当前回退链 ai-live-demos-batch1）重启 | 闸门默认关，安全 | **禁止回滚迁移**；资金表只追加，异常先收口再人工对账 |
| manual_review 事件处理 | `SELECT event_id,error,received_at,payload FROM payment_webhook_events WHERE status='manual_review';` → 人工核实 → 处理并留痕 | 不自动动账 | — |

## 8. 上线就绪结论

# BLOCKED

**依据（任务规则：没有正式凭据和审核能力时必须输出 BLOCKED）**：
1. 生产缺 `OUTPUT_MODERATION_API_KEY` → 审核能力不成立，按任务 §6 不得开启付费生成；
2. 生产缺 Waffo prod 三件套（现有本地凭据为 test 模式）→ 正式收款能力不成立；
3. `FAL_MOCK`/LIVE 开关/闸门仍处安全关闭态（正确），需按 §6 顺序人工切换。

**代码/测试侧已就绪**：四模式商业化全链路（含真实扣费语义、退款人工保护、防重复付费、下载与账本）在隔离环境全部通过；唯一代码级修复（图片成本上界 $4.00→$0.05，否则 $10/日预算只能生成 2 张图/天）已完成并回归。**人工凭据注入 + §6 手册执行完毕后，即达到 READY_FOR_CONTROLLED_DEPLOY。**

未获单独授权事项：Git 提交（D3）、真实付费测试（§6 第六步）、正式开放（§6 第八步）。
