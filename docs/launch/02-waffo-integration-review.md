# 02 — Waffo 支付集成审查（Waffo Integration Review）

范围：apps/api 支付全链路（checkout / webhook×2 / sync / replay / refund / adapter 装配）。基线：payment-business.test.ts 19 用例 + 本轮新增 payment-checkout-timing.test.ts 6 用例，25 用例全绿。

## 1. Checkout 时序（P0，已修复）

**修复前缺陷**（原 payment.ts L470-530）：新订单先 `adapter.createCheckout()`（外部 Waffo）再 `INSERT payment_orders`。三种事故模式：
1. 外部成功 + 本地写入失败 → 孤儿外部 Checkout 会话（无本地记录、无法对账）；
2. 响应丢失后用户重试 → 新 `randomUUID` → **第二个**外部会话（与 fal HTTP200 响应丢失事故同构）；
3. Webhook 早于 INSERT 到达 → 未知订单 → 事务回滚 → 依赖 PSP 重试。

**修复后**（payment.ts `PaymentService.checkout()`）：
- 先 INSERT（pending、checkout 列 NULL、幂等键唯一约束）→ 订单持久化先于任何外部调用；
- 再 `createCheckout()` → 成功后 UPDATE checkout 三列；
- 外部失败 → 订单保留 pending，同 Idempotency-Key 重试**复用同一订单**（先查未过期 hosted session，过期/缺失才重建，重建仍用同一 orderId）；
- 并发竞争 → 23505 分支复用胜者订单，绝不创建第二个外部会话；
- Webhook 早到 → 订单已存在，可正常结算（回归用例：早到 Webhook 全额入账 ✅）。

## 2. Webhook 双路由一致性 ✅

`/v1/payments/webhook` 与 `/v1/webhooks/waffo` 注册同一 `receiveProviderWebhook`（[routes.ts:839-910](file:///d:/Project/wallhaze/apps/api/src/business/routes.ts#L839-L910)）→ 同签名验证、同一 `PaymentService.receive()`、同一 `payment_webhook_events` 幂等表（event_id 去重）。重复/乱序事件安全跳过（applied=false）。
运维要求（写入 09 runbook）：**Waffo 商户后台两个通知地址只登记一个**，另一个保留作手动切换备份；两者共用同一商户密钥。

## 3. Webhook 金额/币种/商户校验 ✅

`applyNormalizedEvent`（[payment.ts:248-303](file:///d:/Project/wallhaze/apps/api/src/business/payment.ts#L248-L303)）：按本地订单校验 amount/currency 一致（金额不符 → 记录 anomaly，不入账）；订单已 paid → 跳过；事件先持久化再应用（同事务），应用失败整体回滚、事件不丢、可 replay（`retryReceivedEvents`）。

## 4. 订单同步（Pull 对账）✅

`POST /v1/payments/orders/:id/sync`：pending 订单主动向 PSP 拉取状态（Mock 返回 null → applied=false）；paid/refunded 订单 sync 幂等返回现值。**这是 webhook 全灭时的兜底路径**；Credits 页前端已有 `/v1/orders` 列表 + sync 调用（lib/api/credits.ts:93-122）。

## 5. 退款 ✅（P1 记录）

`refunded` 事件：paid → `wallet.refund()` 扣回全额 credits（负余额转为 debt，不销账）；pending → 直接标记 refunded、不产生入账。重复退款事件幂等。
**P1（本轮不修，记入清单）**：协议未区分部分退款/多次部分退款/拒付——任何 refunded 均按全额处理。上线前人工核对 Waffo 事件样本；若 PSP 会发部分退款事件，需在 03 文档的方案中升级（见下）。

## 6. Adapter 装配与环境隔离 ✅

[app.ts:143-193](file:///d:/Project/wallhaze/apps/api/src/app.ts#L143-L193)：`PAYMENT_PROVIDER=waffo` 时强制 merchant/private key，缺失拒绝启动；`NODE_ENV=production` + `PAYMENT_PROVIDER=mock` 拒绝启动（本轮又补了 `FAL_MOCK` 的同类防护）。`PAYMENT_ENVIRONMENT=test|live` 传入 Waffo client（waffo.ts:117-148 用 merchantExternalId + metadata.orderId + `checkout_${orderId}` 幂等键）。
本轮新增业务闸门：`PURCHASES_PUBLIC_ENABLED` / `PURCHASES_PAUSED`（见 04 文档真值表）——**暂停购买不影响 webhook/退款/sync/订单查询**（有专门回归用例）。

## 7. 待人工事项（不阻塞本地验收）

| # | 事项 | 归属 |
|---|------|------|
| M1 | Waffo 商户后台确认 webhook 地址、test→live 切换、金额币种=USD 与 payment_products 一致 | 运维清单（09） |
| M2 | 退款事件样本核对（部分退款语义） | P1 |
| M3 | `WAFFO_PRIVATE_KEY` 轮换流程与密钥托管 | 运维清单（09） |
