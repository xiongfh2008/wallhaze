# 17 — Waffo 人工配置手册（Manual Setup Runbook）

**日期**: 2026-11-04
**适用**: 持有 Waffo 商户后台账号与 VPS 访问权限的操作者
**性质**: 代码已就绪，本手册覆盖所有必须在 Waffo 面板 / VPS 上人工完成的事项

> 每一步都标注了验证方法。按顺序执行；阶段 2（test 联调）全部通过之前不要进入阶段 3（切 prod）。

---

## 阶段 0：前置确认

| # | 事项 | 在哪 | 验证 |
|---|---|---|---|
| 0.1 | Waffo 商户审核通过 | Waffo 面板 | 商户状态显示 Active/Approved |
| 0.2 | Store 已创建 | Waffo 面板 | Store ID 可见 |
| 0.3 | 网站合规页可访问 | wallhaze.com/terms /privacy /about | 200；模型名仅在 About+Terms 披露（Waffo 审核口径） |
| 0.4 | **D1：下次 API/worker 镜像重建前移除 `FAL_MOCK`** | VPS api.env | 新代码在 `NODE_ENV=production && FAL_MOCK=1` 时拒绝启动（api 与 worker 都会 crash）。开放生成 → 删 FAL_MOCK、设 `FAL_LIVE_ENABLED=1 + FAL_KEY`；继续关闭 → 删 FAL_MOCK 并停用 worker 容器。当前运行中的旧镜像不受影响，仅约束**下一次重建**。 |

## 阶段 1：凭据注入（生成开放前的 OUTPUT_KEY 可先行）

VPS `~/wallhaze-app/api.env`（root@94.72.126.85，改后 `docker compose restart`）：

| 变量 | 值 | 说明 |
|---|---|---|
| `WAFFO_MERCHANT_ID` | 面板商户 ID | Prompt Sift + Checkout 共用 |
| `WAFFO_STORE_ID` | 面板 Store ID | 同上 |
| `WAFFO_PRIVATE_KEY` | 面板生成的 API 私钥 | 支持 PEM 或 raw-base64（normalizePem 已兼容 df98017） |
| `OUTPUT_MODERATION_API_KEY` | OpenAI sk-…（**可选增强**，不设也生效） | 缺省时输出审核走 fal NSFW（复用 FAL_KEY，无需此钥） |
| `GALLERY_RESCAN_MANIFEST_URL` | manifest URL（生成开放后） | Gallery 异步复查 |

**注入后验证**：
```bash
# 容器内（只读探测，不改状态）
docker exec wallhaze-app-api-1 node -e \
  "console.log(['WAFFO_MERCHANT_ID','WAFFO_STORE_ID','WAFFO_PRIVATE_KEY','OUTPUT_MODERATION_API_KEY'].map(k=>k+'='+(process.env[k]?'SET('+process.env[k].length+')':'EMPTY')).join('\n'))"
```
预期：四项全部 SET。**不要把密钥值输出到终端或日志。**

## 阶段 2：Waffo 面板配置 + test 联调

### 2.1 Webhook URL 登记
- URL：`https://api.wallhaze.com/v1/payments/webhook`（备选别名 `/v1/webhooks/waffo`，同一处理器）
- 事件：`order.completed`、`refund.succeeded`（如面板支持勾选 `refund.failed` 也登记——代码显式忽略，仅作留痕）
- 路由当前 403-guarded：`PAYMENT_PROVIDER=disabled` 时一律 403，属预期；切换后自动放行

### 2.2 产品映射（三档套餐）
在面板创建三个一次性购买产品，价格与 `credit_packages` 对齐：

| 面板产品 | 价格 | 对应 packageId |
|---|---|---|
| Starter Credits | $5.00 USD | starter |
| Creator Credits | $20.00 USD | creator |
| Studio Credits | $69.00 USD | studio |

然后执行映射 CLI（先 `--check` 只读核对，再写入）：
```bash
cd apps/api
npm run waffo:check          # 只读：核对凭据与产品映射现状
npm run waffo:setup          # 把面板 Product ID 写入 payment_products
```
验证：`SELECT package_id, product_id FROM payment_products WHERE provider='waffo';` → 3 行。

### 2.3 Prompt Sift 权限（M4）
确认商户账号已开通内容审核（Prompt Sift）权限。未开通时 live 生成 fail-closed（`MODERATION_UNAVAILABLE`），这是预期保护而非故障。

### 2.4 退款策略（P1-1 前提）
将产品配置为**仅允许全额退款**（或关闭用户自助退款、走工单）。当前实现的部分退款按"整单撤销"处理——面板侧限制是前提。同时在 Terms 保留"退款将撤销全部 Credits"的表述。

**人工审核队列（迁移 009 起）**：部分退款/金额不明/未知类型事件不会自动动账——查询
`SELECT event_id,error,received_at,payload FROM payment_webhook_events WHERE status='manual_review' ORDER BY received_at;`
人工核实后按结论处理（补记账或联系用户），处理后可将该行状态更新为 `processed` 并在工单留痕。

### 2.5 PAYMENT_ENVIRONMENT=test 联调
```bash
# api.env
PAYMENT_PROVIDER=waffo
PAYMENT_ENVIRONMENT=test
GENERATION_PAUSED=0            # 仅联调期间
STUDIO_PUBLIC_ENABLED=1
PURCHASES_PUBLIC_ENABLED=1
```
重启后按序验证（全部在 Waffo test 环境）：
1. `GET /v1/credits/pricing` → `checkoutAvailable:true, paymentProvider:"waffo"`
2. 浏览器真实走一次 test 支付 → 回跳 Credits 页 → 余额到账
3. `POST /v1/payments/orders/:id/sync` → 状态一致（拉取式兜底）
4. Waffo 面板发起一笔 test 退款 → Credits 全额撤销、账本出现 `refund:<orderId>`、事件幂等
5. 用错误签名向 webhook 发探针 → 403（日志留痕）
6. `payment_webhook_events` 中事件 environment 均为 test

### 2.6 输出审核真实联调（生成开放前提）
输出审核默认后端为 fal NSFW（`fal-ai/imageutils/nsfw`，复用 FAL_KEY，$0.001/图；隔离验收见 `tests/fal-nsfw-moderation.test.ts`）。test 联调期间提交一次真实 live 图片生成：
- 成功路径：任务 succeeded 且 `moderation_logs` 出现 post_generation allow 记录（fal NSFW 后端）
- fail-closed 路径（对照）：临时清空 `FAL_KEY` → live 任务拒绝存储/发布
- 覆盖范围说明：该分类器判定成人性内容（NSFW 概率）；暴力/自残/换脸/版权等由 Prompt Sift 上游政策类目 + 本地禁止词 + 人工复核/举报流程兜底，不可判定一律拒绝

## 阶段 3：切 prod（真实收款）

| # | 动作 | 验证 |
|---|---|---|
| 3.1 | 面板产品从 test 发布到 prod | 产品状态 Live |
| 3.2 | `PAYMENT_ENVIRONMENT=prod` + 重启 | `/v1/credits/pricing` 正常，日志无环境告警 |
| 3.3 | 首笔最小额真实支付（Starter $5） | 到账 100cr；webhook applied；对账 `reconcile` 通过 |
| 3.4 | 首笔真实退款（同单） | 全额撤销 + debt/suspend 行为符合 §4 预期 |
| 3.5 | 观察 24h：fal 消费 vs Credit 扣减、审核拒绝率、webhook 失败率 | doc 15 §15 阶段 4 灰度 |

## 回滚

任何阶段异常：api.env 恢复 `PAYMENT_PROVIDER=disabled`（+ 联调期还原 `GENERATION_PAUSED=1`）→ 重启 → 站点回到"全关"安全态。回滚不影响已入账 Credits（账本不可变）。
