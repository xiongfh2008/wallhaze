# 14 — P1 上线阻断评估（Go-Live Risks）

**日期**: 2026-11-03
**方法**: 逐项代码审查 + 自动化测试证据 + 生产配置交叉核查

## P1-1 部分退款语义

| 维度 | 评估 |
|---|---|
| **当前实现** | `applyNormalizedEvent()` refunded 分支统一全额扣回（`order.credits`），不区分部分退款/多次退款/拒付。`refundedMinor()` 取 `originalPayment.subtotal`（原始支付税前额），因此部分退款事件也会通过金额校验并全额撤销 |
| **可复现条件** | Waffo 发送 `refund.succeeded` 且 `refundedAmount < originalPayment.total` |
| **可能后果** | 用户被扣回全部 Credits（而非按比例），账本 `refund:<orderId>` 只出现一次 |
| **临时控制** | Credits 套餐为一次性购买，Waffo 面板可配置为仅允许全额退款；账本不可变（reconcile 可验证） |
| **上线阻断** | **不阻断**（前提：Waffo 面板设置仅允许全额退款） |
| **建议** | 与 Waffo 确认退款策略后决定是否升级为按比例扣减；如果保留整单撤销，在 Terms 中明确"退款撤销全部 Credits" |

## P1-2 生产预算定值

| 维度 | 评估 |
|---|---|
| **当前实现** | 生产 api.env 已设置：PLATFORM=$100/日，USER=$10/日（实测确认） |
| **可复现条件** | 单用户每日生成超过 $10 的 fal.ai 消费 → RATE_LIMITED |
| **可能后果** | 用户无法继续生成（预期行为）；平台总计超 $100 → 全平台暂停 |
| **临时控制** | 已设置数值 ✅；代码 `env.ts:generateStaticParams` 有 zod 验证 |
| **上线阻断** | **不阻断** — 数值已合理设置，可在运行时调整 |
| **建议** | 初始运行期间观察实际消费，逐步调整。如需紧急暂停：GENERATION_PAUSED=1 |

## P1-3 多进程限流

| 维度 | 评估 |
|---|---|
| **当前实现** | 限流计数器存储在进程内存（`rate-limit.ts`），单实例下准确；多实例下每个实例独立计数，全局限流被放大 N 倍 |
| **可复现条件** | 部署 ≥2 个 API 容器实例 |
| **可能后果** | 全局限流阈值被放大 N 倍（例如 100/min × 2 = 200/min） |
| **临时控制** | 当前生产仅运行 1 个 API 容器（`wallhaze-app-api-1`），单实例限制准确 |
| **上线阻断** | **不阻断**（单实例前提成立） |
| **建议** | 扩容前迁 Redis/DB 计数（09 runbook 已列为前提）；在 docker-compose 中限制 `deploy.replicas: 1` |

## P1-4 fal.ai 跨进程幂等

| 维度 | 评估 |
|---|---|
| **当前实现** | fal 调用使用 `AbortSignal.timeout` + lease 排他锁，单 Worker 下同一 job 不会被两个 Worker 同时处理；但 fal.ai 端无幂等键（重试可能产生两次 fal 生成） |
| **可复现条件** | Worker 超时 → 重试 → fal.ai 收到第二次请求 |
| **可能后果** | 双倍 fal.ai 消费（但用户只看到第一个结果，第二个结果被丢弃） |
| **临时控制** | 单 Worker + lease 排他 + `UPSTREAM_UNCERTAIN` 错误码（重试时不再调用 fal） |
| **上线阻断** | **不阻断**（单 Worker 下安全） |
| **建议** | 多 Worker 扩容前在 fal payload 中加入 `requestId` 幂等键；监控 fal 面板请求数 |

## P1-5 Prompt Sift 正式权限

| 维度 | 评估 |
|---|---|
| **当前实现** | Prompt Sift 代码完整（RSA-SHA256 签名、hold-and-retry、三层审核），但 WAFFO_MERCHANT_ID/KEY 为空 → 服务报告 disabled → live 任务 fail-closed |
| **可复现条件** | 用户提交 live 生成任务 → MODERATION_UNAVAILABLE → Credits 释放 |
| **可能后果** | 用户无法生成（预期行为：审核不可用即阻止生成） |
| **临时控制** | GENERATION_PAUSED=1 + FAL_MOCK=1 双保险，生产不可能触达 Prompt Sift |
| **上线阻断** | **不阻断**（生成本身已暂停） |
| **建议** | 生成开放前必须：① 确认 Waffo Prompt Sift 已在商户侧开通 ② 注入凭据 ③ 真实联调验证 |

## 汇总

| P1 | 阻断生产上线？ | 约束条件 |
|---|---|---|
| P1-1 | **否**（前提：Waffo 面板仅允许全额退款） | Terms 中明确退款撤销全部 Credits |
| P1-2 | **否**（已设置 $100/$10） | 运行期间监控实际消费 |
| P1-3 | **否**（单实例） | 扩容前迁 Redis |
| P1-4 | **否**（单 Worker） | 扩容前接入 fal 幂等键 |
| P1-5 | **否**（生成已暂停） | 生成开放前必须完成 |

**结论：5 项 P1 均不构成生产上线阻断** — 每项都有明确的临时控制措施。生成开放前必须完成 P1-5（Prompt Sift 权限确认）和 P1-2 的预算微调。
