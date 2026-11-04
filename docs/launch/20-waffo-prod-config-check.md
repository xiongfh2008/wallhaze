# 20 — Waffo Production 配置核对（Config Check）

**日期**: 2026-11-04
**方法**: 代码审读 + 生产只读探测（SSH/psql SELECT，值不外泄）+ 隔离环境组合测试（`tests/waffo-prod-switch.test.ts` 6 例全过）
**约束遵守**: 未 Git 提交、未改生产配置/数据库、未重启服务、未创建订单、未调创建商品 API、未运行 --apply/--publish

---

## 结论速览

| # | 问题 | 结论 |
|---|---|---|
| 1 | Waffo 连接是否就绪 | **未就绪** — 生产三件套全部为空（商户已过审、prod Key/Store 已在手，仅差注入） |
| 2 | 三商品映射是否正确 | **生产 `payment_products` 为空** → 需执行 §3 绑定方案（等人工批准）；套餐价格三档与本地一致（$5/$20/$69 USD） |
| 3 | Webhook 地址是否正确 | **正确** — `https://api.wallhaze.com/v1/payments/webhook` 经 Cloudflare/nginx/TLS 到 API，当前 403 守卫属预期；别名同处理器；**只登记这一个 URL** |
| 4 | 配置缺失项 | 见 §5 |
| 5 | 下一步人工操作 | 见 §6 |
| 6 | 能否进入受控部署 | **凭据注入 + 映射绑定完成前：否**；完成后按 doc 19 §6 手册执行 |

## 1. 商户凭据（第一项）

- 生产 api.env 实测：`WAFFO_MERCHANT_ID=EMPTY`、`WAFFO_STORE_ID=EMPTY`、`WAFFO_PRIVATE_KEY=EMPTY`，`PAYMENT_ENVIRONMENT=test`、`PAYMENT_PROVIDER=disabled`。本地 `apps/api/.env` 持有 **test 模式**三件套（不可用于 prod：环境强校验，test 事件无法结算 prod 订单）。
- 注入要求（人工）：值仅进 VPS `api.env`（root@94.72.126.85），不落代码/聊天/日志；注入后用 `docker exec … node -e` 探测 SET(长度) 自检。
- **`npm run waffo:check` 无数据库写操作——已核实**：`--check` 分支在 `openDatabase()` 之前 `return`（waffo-setup.ts:146），连数据库连接都不建立；仅向 Waffo GraphQL 发一次只读 `stores` 查询并打印商户/Store 状态。⚠️ 两个注意：① 若附加 `--webhook-url` 会向 Waffo 登记回调（写配置）——本轮不用；② **裸跑 `npm run waffo:setup`（无 --check/--apply）会打开数据库并执行 `migrate()`**——在有未应用迁移的库上会触发 DDL，生产上避免裸跑。

## 2. 商品映射（第二项）

生产只读实测：`credit_packages` 三档正确（starter 100/500、creator 500/2000、studio 2000/6900，均 active，USD）；`payment_products` **0 行**；`payment_orders` 0 行；迁移版本 v1–v8。

生产已有三个商品（面板侧）→ **不调用创建 API**，用以下绑定方案（等人工批准后执行）。产品 ID 占位符由操作者在 Waffo 面板复制（格式 `PROD_…`，22 位后缀）；执行前先核对面板价格与套餐一致。

```sql
-- Waffo prod 商品绑定（幂等；UNIQUE(provider,package_id) 防重复）
BEGIN;
INSERT INTO payment_products(provider, package_id, product_id) VALUES
  ('waffo', 'starter', 'PROD_<STARTER_PROD_ID>'),
  ('waffo', 'creator', 'PROD_<CREATOR_PROD_ID>'),
  ('waffo', 'studio',  'PROD_<STUDIO_PROD_ID>')
ON CONFLICT (provider, package_id) DO NOTHING;
-- 人工核对：三行、且 product_id 与面板一致
SELECT package_id, product_id FROM payment_products WHERE provider='waffo' ORDER BY package_id;
COMMIT;
```

受控替代方案（二选一）：把三条 INSERT 交由部署窗口的迁移执行人粘贴执行（与 doc 19 §6 第五步同窗口）；或批准后由 `waffo:setup --apply` 执行——**但那会创建新商品**，与"绑定现有商品"不符，故推荐 SQL。

## 3. Webhook（第三项）

- 链路：Cloudflare（api.wallhaze.com proxied）→ nginx（sites-enabled/api.wallhaze.com，Let's Encrypt 证书）→ 127.0.0.1 API 容器。公网 POST 实测两个路径均 **403**（disabled 守卫，fail-closed 正确，证明路由全通）。
- 代码保障（已核实）：`request.rawBody` 捕获原始字节（app.ts 内容解析器）→ 官方 SDK `verifyWebhook` RSA-SHA256 + 时间戳容差 → `event.mode` 必须等于 `PAYMENT_ENVIRONMENT`（test 事件在 prod 配置下被 403）→ `order.completed`→paid（税前小计对账）、`refund.succeeded`→refunded（全额自动/部分进 manual_review）、其余类型→人工队列。
- 登记：**面板只登记一个 URL** `https://api.wallhaze.com/v1/payments/webhook`；`/v1/webhooks/waffo` 是同处理器别名，**不要**单独登记（防重复投递）。`PAYMENT_PROVIDER=disabled` 期间不会收到正式通知——无需预先做任何事。

## 4. 安全开关组合验证（第四项，隔离实测 6/6 PASS）

组合：`PAYMENT_PROVIDER=waffo + PAYMENT_ENVIRONMENT=prod + PURCHASES_PUBLIC_ENABLED=0 + PURCHASES_PAUSED=1`

| 验证 | 结果 |
|---|---|
| 新 Checkout 被拒 | ✅ 503，订单表 0 行 |
| pricing 端点 | ✅ `paymentProvider:"waffo", checkoutAvailable:true, purchasesPublic:false, purchasesPaused:true` → 前端 `purchasesOpen=false` → **购买按钮不开放**（web 侧 resolveCommercialGates 已有测试） |
| 合法 prod 签名 webhook（order.completed） | ✅ 200 applied:true，100cr 入账，订单 paid（关购买 ≠ 聋 webhook） |
| 篡改载荷 / test 模式事件 | ✅ 均 403（RSA + 环境强校验） |
| 历史支付/退款处理 | ✅ 全额退款自动撤销（余额→0，订单 refunded）；部分退款 → `manual_review` 人工队列、不动账；历史 received 事件经 ops 重放入账 |
| 代码侧 | ✅ boot 时 `PAYMENT_PROVIDER=waffo` 强制要求商户 ID+KEY（缺则拒绝启动） |

## 5. 配置缺失项汇总

| # | 缺失 | 位置 | 影响 |
|---|---|---|---|
| 1 | WAFFO prod 三件套 | VPS api.env | Checkout/Prompt Sift/webhook 验签全不可用 |
| 2 | `PAYMENT_ENVIRONMENT=prod`（现为 test） | VPS api.env | prod 事件会被 403 |
| 3 | payment_products 三行映射 | 生产 DB | waffo 下 checkout 报 "Payment is not configured for this package" |
| 4 | ~~OUTPUT_MODERATION_API_KEY~~（已解除） | — | 输出审核默认后端改为 fal NSFW（复用 FAL_KEY，doc 19 §4）；OpenAI 为可选增强 |
| 5 | 迁移 009 未应用（v8） | 生产 DB | 随下次部署自动应用（manual_review 状态） |
| 6 | D1：FAL_MOCK=1 仍在 | VPS api.env | 新代码 production+mock 拒绝启动 → **重建镜像前必须先移除** |
| 7 | Prompt Sift 权限确认 | Waffo 面板 | 凭据注入后首次真实联调验证 |

## 6. 下一步人工操作（最短路径，按序）

1. **注入凭据**：Waffo prod 三件套 → VPS api.env（安全方式，值不外泄）。
2. **只读验证**：`npm run waffo:check`（已核实无 DB 写）→ 预期输出 `{ok:true, environment:…, store:{id,name,status}}`。
3. **批准并执行 §3 SQL**（绑定现有三商品）→ 核对三行映射。
4. **面板登记 Webhook**（仅 `/v1/payments/webhook` 一个）+ 确认仅全额退款策略。
5. ~~OUTPUT_MODERATION_API_KEY 注入~~ 已解除：输出审核默认 fal NSFW（复用 FAL_KEY），无需新密钥。
6. 此后进入 doc 19 §6 受控部署手册（第五步起：D1 先移除 FAL_MOCK → 部署 → 受限真实小额测试需单独授权 → 对账 → 开放）。

**完成后停止。**
