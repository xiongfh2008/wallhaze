# P0 / P1 / P2 问题清单（商业化上线）

状态口径：`已修复` = 本轮本地已修复并有回归用例；`待办` = 需上线时人工/后续处理。

## P0（上线前必须为零）

| # | 问题 | 位置 | 状态 |
|---|------|------|------|
| P0-1 | Checkout 外部先行时序：外部成功+本地失败→孤儿会话；同幂等键重试→第二个外部 Checkout；Webhook 早到 bounced | payment.ts checkout() | **已修复**（先本地 INSERT 后外部 createCheckout；6 个时序回归用例） |
| P0-2 | 同步遗留路由 `POST /v1/generations` 无认证无计费，live 模式可免费触发真实付费生成（计费绕过） | generation.routes.ts | **已修复**（live 模式 503 拦截 + GEN-28 改造） |
| P0-3 | 商业化无业务开关：配置好 PSP/AI 凭证即等于对公众开放，无法受控发布/暂停 | env.ts / app.ts / routes.ts | **已修复**（PURCHASES/STUDIO/VIDEO_PUBLIC_ENABLED + PURCHASES_PAUSED，真值表 9 用例） |
| P0-4 | 前端硬编码 Coming Soon / disabled，与后端状态脱节，开启后前端无法展示 | studio/page.tsx、pricing/page.tsx | **已修复**（状态驱动渲染 + 七语言文案） |
| P0-5 | 生产环境 FAL_MOCK=1 可启动，mock 结果可能被当作真实付费生成 | app.ts | **已修复**（生产启动拒绝，用例覆盖） |

## P1（上线前处理或明确接受）

| # | 问题 | 位置 | 状态 |
|---|------|------|------|
| P1-1 | 退款未区分部分退款/多次部分退款/拒付，一律全额扣回 | payment.ts applyNormalizedEvent | 待办：用 Waffo 真实事件样本核对（02 文档 M2） |
| P1-2 | 生产预算上限未定值：USER/PLATFORM_DAILY_COST_LIMIT_MICROS 未设=无限制 | config/env.ts | 待办：配置模板给出建议值（用户 $5/日、平台 $200/日 起步） |
| P1-3 | 进程内限流/预算计数：多实例部署限制被放大 | rate-limit.ts | 待办：单实例上线；扩容前迁 Redis/DB 计数（09 runbook 前提） |
| P1-4 | fal 调用无跨进程幂等键（单 Worker + lease 排他下安全） | worker.ts / fal.provider.ts | 待办：多 Worker 扩容前接入 fal queue 幂等 |
| P1-5 | Prompt Sift 审核权限需在 Waffo 商户侧确认已开通 | 运维 | 人工项 M4 |

## P2（不阻塞上线，排期处理）

| # | 问题 | 位置 | 状态 |
|---|------|------|------|
| P2-1 | R2 PUT 单发无重试/补偿，超时结果不确定 | r2-storage.ts:135-199 | 排期：失败补偿任务或幂等重传 |
| P2-2 | 孤儿外部会话（P0-1 修复前的历史订单）无对账入口 | payment_webhook_events | 排期：运营对账脚本 |
| P2-3 | 正式站本机探测 500（部署环境问题，非代码） | 生产环境 | 部署时排查 |
| P2-4 | debt 恢复无频控（退款后立即重购无限制） | wallet.ts | 观察项 |

## 验收结论

P0 全部已修复并有测试证据；P1-1/P1-5 为人工核对项（不涉及代码）；P1-2/3/4 已写入配置模板与 runbook 前提。本地验收判定不受 P2 影响。
