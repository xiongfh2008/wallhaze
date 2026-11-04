# 08 — E2E 测试结果（本地 Mock，隔离数据库）

环境：PGlite 隔离内存库 + MockPaymentAdapter + Mock 视频 Provider + Prompt Sift/输出审核 fail-closed 注入。**全程零真实付费、零真实 fal 调用、零生产数据。**

## 1. 执行汇总

| 套件 | 位置 | 结果 |
|---|---|---|
| API 全量 | apps/api `npm run test` | **40 文件 / 306 passed / 1 skipped**（新增 commercialization-gates 9 例、payment-checkout-timing 6 例） |
| Web 全量 | apps/web `npm run test` | **41 文件 / 307 passed**（新增 studio-gate 4 例、checkout-button 6 例） |
| Typecheck | api + web | 零错误 |
| Lint | web | 零错误（25 条存量 warning 位于未改动 scripts/*.mjs） |
| Build | web `next build` + `build:vinext`、api `tsc` | 全部成功 |
| audit:waffo | web | **Issues: 0** |
| seo:audit | web | sitemap **546** 不变、broken=0；P1 全部为已知生产站探测问题（P2-3），无新增 |
| rights:check | web | 通过（27 pending / 8 restricted，本地私有完整性 checked） |

## 2. 支付场景 P（Mock Adapter + 隔离库，全部通过）

| 场景 | 断言 | 用例 |
|---|---|---|
| P01 正常下单 | 订单先持久化（provider 调用时 DB 已有该单） | timing:order-first |
| P02 幂等键复用 | 同 key 重复下单复用同一订单/未过期 session | payment-business + timing |
| P03 并发竞争 | Promise.all 同 key → 同一 orderId、单一外部会话 | timing:concurrent |
| P04 外部失败恢复 | createCheckout 抛错 → 订单保留 pending，重试同 orderId，无第二外部会话 | timing:resume |
| P05 Webhook 早到 | 外部 session 建立前收到 paid → 正常结算入账 | timing:early-webhook |
| P06 金额/币种不符 | 拒绝应用、记录 anomaly、不入账 | payment-business |
| P07 签名无效 | 403，事件持久化 failed 保留 | payment-business |
| P08/P09 双路由 | 两地址同签名、同幂等表，event_id 去重 | payment-business |
| P10 已付订单重复 paid | applied=false 幂等跳过 | payment-business |
| P11 全额退款 | paid→refunded，credits 扣回/转 debt | payment-business + wallet |
| P12 pending 退款 | 标记 refunded、不产生入账 | payment-business |
| P13 pull sync | pending 拉取状态；暂停期可用 | payment-business + gates |
| P14 事件 replay | retryReceivedEvents 重放未应用事件 | payment-business |
| P15-P17 暂停购买 | checkout 503(paused)；webhook/退款/sync/查询全正常 | gates:paused |
| P18 owner 隔离 | 他人订单 404 | payment-business |
| P19 redirect 白名单 | 非白名单 success URL 拒绝 | payment-business |
| P20 生产 mock 拒启动 | NODE_ENV=production + mock → throw | app 构建守卫 |

## 3. 生成场景 G（Mock Provider，全部通过）

| 场景 | 断言 | 用例 |
|---|---|---|
| G01 预留/结算 | 创建→reserve；成功→capture（账本终态断言） | jobs.test |
| G02 失败释放 | provider 失败→release，预算按 providerBilled 保守记账 | jobs.test |
| G03 lease 排他 | SKIP LOCKED + leaseToken；重复 complete/fail CONFLICT | jobs.test |
| G04 视频定价权威 | videoJobPricing() 定价（40/50/60cr） | video-jobs.test |
| G05 视频失败释放 | 失败释放视频预留 | video-jobs.test |
| G06 防重复付费 | attempt>1 拒绝重新提交真实供应商 | worker.test |
| G07 输入审核 fail-closed | Prompt Sift 故障→拒绝 | moderation.test |
| G08 输出审核拦截 | blocked 结果不落盘、释放 credits | moderation.test |
| G09 视频抽帧审核 | 采样帧 blocked→拒绝 | moderation.test |
| G10 预算超限 | 用户/平台日限→RATE_LIMITED | jobs.test |
| G11 GENERATION_PAUSED | API 503 + Worker 拒领 | jobs.test |
| G12 私有下载 | 签名 URL 有效/过期/未签名拒绝 | storage/sign 用例 |
| G13 30 天过期 | 资产过期清理与隐私政策一致 | media-lifecycle.test |
| G14 日志无敏感信息 | 密钥/prompt/参考图不泄漏 | ISO-1 |
| G15 开关真值表 | 见 04 文档 5 行真值表 ×9 用例 | commercialization-gates.test |
| G16 遗留路由封堵 | live 模式同步路由 503 | GEN-28 + gates |
| G17 生产 mock 生成拒绝 | 启动 throw | gates |
| G18-G20 端到端注册→生成→签名下载 | user 隔离 + 终态断言 | generation-api/jobs |

## 4. 组合场景 E（全部通过）

| 场景 | 内容 |
|---|---|
| E01 充值→生成 | 100cr 入账→图 10cr→终态 balance 90 / ledger 2 行 |
| E02 购买暂停下的老订单结算 | P15 + 钱包终态 |
| E03 退款→再生成 | 扣回后 debt，再充值先还债 |
| E04 视频独立闸门 | studio 开+video 关：图 202 / 视频 503 / 预留无泄漏 |
| E05 定价端点状态 | pricing 反映 4 闸门组合 |
| E06 并发同 key 下单 | 单订单单外部会话 |
| E07 全停后恢复 | PAUSED→恢复→新任务正常 |
| E08 前端状态渲染 | studio gate 开/关/不可达 ×checkout 按钮状态（web dom 测试） |

## 5. 已知限制

- 测试浏览器的 window.fetch 被扩展包装（chrome-extension），开放态页面探测在自动化浏览器中失败 → 页面展示关闭态（fail-closed 正确行为）；开放态 UI 由 dom 单测 + API 实测 + bundle 内联三重证据覆盖。
- 真实 Waffo live 支付与真实 fal 计费不在本地验收范围（任务边界），列入 runbook 分阶段上线验证。
