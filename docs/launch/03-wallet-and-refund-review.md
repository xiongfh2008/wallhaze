# 03 — 钱包与退款审查（Wallet & Refund Review）

范围：credit_wallets / credit_ledger / credit_reservations 状态机 + 退款全路径。基线：wallet.test.ts + jobs.test.ts + 本轮新增商业化用例，全绿。

## 1. 数据模型与不变量 ✅

[migrations/001_core.sql](file:///d:/Project/wallhaze/apps/api/migrations/001_core.sql)：
- `credit_ledger` 只追加——触发器拒绝 UPDATE/DELETE；`(user_id, idempotency_key)` 唯一约束防重复入账；
- `credit_reservations` 主键=job_id（一任务一预留）；`(user_id,idempotency_key)` 唯一防重复扣减；
- 余额=派生（balance+reserved-debt 一致性由每次操作在同一事务内维护）。

## 2. 预留状态机 ✅

`credit()` / `reserve()` / `capture()` / `release()`（[wallet.ts:152-318](file:///d:/Project/wallhaze/apps/api/src/business/wallet.ts#L152-L318)）：
- credit：先查幂等键 → 同额 no-op、异额冲突；先还债再增余额；
- reserve：校验用户状态/债务/可用余额 → 插入 reservation + reserved 增加 + ledger 追加；
- capture：reserved → 实扣（status pending→captured）；release：退回余额（pending→released）；
- 重复 capture/release 幂等 no-op（status 判断）。

## 3. 任务与钱包的耦合 ✅

`enqueueJob`（[jobs.ts:166-276](file:///d:/Project/wallhaze/apps/api/src/business/jobs.ts#L166-L276)）单事务：预算检查 → 写 budgets → 插 job → reserve；`completeJob`（L386-441）校验 leaseToken + running 状态 → 存媒体 → capture → 预算 reserved→spent；`failJob`（L504-557）按 providerBilled 保守记账 → release。Worker 非重启安全：`attempt>1` 直接失败释放（[worker.ts:579-591](file:///d:/Project/wallhaze/apps/api/src/business/worker.ts#L579-L591)），绝不二次向供应商提交。

## 4. 退款场景矩阵（已测）

| 场景 | 行为 | 验证 |
|------|------|------|
| paid 后全额退款 | 扣回 credits，不足转 debt，ledger 记录 | ✅ refund-before-paid + 退款用例 |
| pending 时收到 refunded | 标记 refunded，无入账 | ✅ |
| 重复 refunded 事件 | 幂等跳过 | ✅ |
| 退款后订单状态机 | refunded 终态，不再接受 paid 事件 | ✅ |
| 暂停购买下的退款 | webhook 不受 PURCHASES_PAUSED 影响，照常结算/退款 | ✅ 本轮新增 |

## 5. 用户隔离 ✅

订单查询/钱包/sync 全部带 userId 过滤（payment-business「owner isolation」用例覆盖）。

## 6. 遗留 P1（不阻塞，已入清单）

1. **部分退款语义**：任何 `refunded` 按全额扣回。若 Waffo 发送 partial-refund 变体，需：按 `amountMinor` 差额扣 credits + 新增 `partially_refunded` 状态。上线前用真实事件样本核对（02 文档 M2）。
2. **debt（负余额）恢复策略**：用户退款后欠账，再次充值自动先还债（已实现）；但对「退款后立即重新购买」无限制——低风险，记录备查。
