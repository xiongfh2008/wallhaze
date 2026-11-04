# 09 — 生产上线 Runbook 与回滚手册

前提：本地验收完成（见 10 文档）；P0 清零；配置按 deploy-config-template.md 填好。

## 1. 上线前置检查（人工，M 项）

| # | 检查 | 通过标准 |
|---|------|---------|
| M1 | Waffo 商户后台：Webhook 地址已登记（**只登记一个**，见 02 §2）、环境切 live、币种 USD | 后台截图留档 |
| M2 | Waffo 退款事件样本核对（部分退款语义，P1-1） | 确认或完成 03 §6 升级 |
| M3 | WAFFO_PRIVATE_KEY 托管与轮换流程 | 密钥不在代码/聊天中 |
| M4 | Prompt Sift / moderation scope 已开通 | 试调用成功 |
| M5 | 生产 DNS/Domain：api.wallhaze.com 可达、证书有效 | curl 200 |
| M6 | wallhaze.com 部署环境 500 问题排查（P2-3） | 首页 200 |
| M7 | 法务/合规页面：隐私政策、服务条款、退款政策、举报通道 | 页面可访问 |

## 2. 数据库迁移（生产 PG）

```bash
# 在生产机（只前滚，禁止手写 SQL 改数据）
psql $DATABASE_URL -f apps/api/migrations/001_core.sql   # …至 008，逐个执行
# 幂等性核对：重复执行应报"已存在"而非破坏；上线前在 staging 演练一遍
```

无数据回填需求；credit_packages 三档由 002 提供。

## 3. 部署顺序

```bash
# API（先于前端，保证新端点/闸门字段可用）
npm run build && pm2 restart wallhaze-api   # 或 systemd
pm2 restart wallhaze-worker                 # Worker 单实例（P1-3 前提）
# Web（Cloudflare）
npm run build:vinext && npm run deploy:vinext
```

## 4. 分阶段开放（三段式）

| 阶段 | 环境变量动作 | 验证（curl） |
|---|---|---|
| 0 冒烟 | 全闸门关闭部署 | `GET /v1/credits/pricing` → 全 false；首页 200 |
| 1 开 Studio | `STUDIO_PUBLIC_ENABLED=1` 重启 api+worker | mock→live 切换后：注册→充值(跳转 Waffo test)→生成→签名 URL 下载 全链路；预算/审核日志有记录 |
| 2 开购买 | `PURCHASES_PUBLIC_ENABLED=1` 重启 api | pricing→true；小额真实订单：支付→webhook→入账→生成→退款→扣回 |
| 3 开视频 | `VIDEO_PUBLIC_ENABLED=1` | 视频任务端到端 + 失败释放 |

每阶段观察 ≥30 分钟：错误率、worker 日志（upstream:failed/timeout）、payment_webhook_events failed=0、预算余量。

## 5. 回滚手册（按故障分层）

| 故障 | 动作 | 生效 |
|---|---|---|
| 生成服务异常/滥用/预算告急 | `GENERATION_PAUSED=1` 重启 | 新任务 503，老任务可完成；Worker 拒领 |
| 只停视频 | `VIDEO_PUBLIC_ENABLED=0` | 视频新任务 503 |
| 支付异常/刷单 | `PURCHASES_PAUSED=1`（或 `PAYMENT_PROVIDER=disabled`） | 新购买 503；**webhook/退款/sync 照常**，资金流不受损 |
| Studio 整体下线 | `STUDIO_PUBLIC_ENABLED=0` | 前端自动回落 Coming Soon |
| 前端异常 | 回退上一版 vinext 部署（`deploy:vinext` 指向旧构建）或环境变量回退 | 秒级 |
| API 代码回滚 | 回退上一构建产物重启 | 闸门默认关，安全 |
| 数据库 | **禁止回滚迁移**；资金表只追加，出问题冻结闸门后人工对账 | — |

**一键全收口**：四个闸门全部置 0 重启 —— 站点正常浏览，商业化全关，资金安全。

## 6. 扩容前提（P1-3/P1-4 记录）

多 API 实例前：限流/预算迁 Redis/DB 计数；多 Worker 前接 fal queue 幂等键；Webhook 仍只登记一个地址。

## 7. 日常对账

- 每日：`payment_orders` vs Waffo 后台成交笔数/金额；
- 每周：`credit_ledger` 汇总 = 入账-退款；`generation_budgets` 平台消耗 vs fal 账单（Pricing API 动态核对单价，05 文档 §5）。
