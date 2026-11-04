# 10 — 最终上线准备度（Final Launch Readiness）

**判定：LOCAL_READY**（本地验收就绪；生产开放需按 runbook 分阶段执行人工项）

## 1. 交付物清单（docs/launch/）

| 文档 | 内容 |
|---|---|
| 01-system-inventory.md | 架构、17 项功能清单、开关缺口分析 |
| 02-waffo-integration-review.md | checkout 时序 P0 修复、双路由、退款、对账 |
| 03-wallet-and-refund-review.md | 账本不变量、预留状态机、退款矩阵 |
| 04-ai-studio-launch-review.md | 生成链路、开关真值表、防重复付费、预算 |
| 05-pricing-profit-analysis.md | 官方价核算（毛利率 86%~96%）、假设标注 |
| 06-moderation-compliance-review.md | 输入/输出/图库审核 fail-closed、合规人工项 |
| 07-i18n-seo-review.md | 七语言状态化、SEO 基线保持 |
| 08-e2e-test-results.md | P/G/E 场景矩阵、全量回归数字 |
| 09-production-runbook.md | 分阶段上线 + 分层回滚手册 |
| deploy-config-template.md | 生产配置模板（无密钥） |
| issues-p0-p1-p2.md | P0×5 已修复 / P1×5 / P2×4 |
| screenshots/ | 15 张 UI 验收截图 |

## 2. 修改文件清单（本轮商业化改造，均未提交）

**apps/api**（生产逻辑）：
- `src/business/payment.ts` — P0-1 修复：订单先持久化后外部 Checkout
- `src/modules/generation/generation.routes.ts` — P0-2 修复：遗留同步路由 live 模式 503
- `src/config/env.ts` + `src/app.ts` — P0-3/P0-5：四业务闸门 + 生产 FAL_MOCK 拒启动
- `src/business/routes.ts` — checkout/jobs 闸门拦截 + pricing 状态暴露
- `tests/commercialization-gates.test.ts`（新）、`tests/payment-checkout-timing.test.ts`（新）+ 4 个既有测试文件适配

**apps/web**（状态驱动 UI）：
- `lib/api/credits.ts` — CommercialGates（fail-closed）
- `components/studio/StudioGate.tsx`（新）、`components/pricing/CheckoutButton.tsx`（新）
- `app/[locale]/studio/page.tsx`、`app/[locale]/pricing/page.tsx` — 状态化渲染
- `components/GeneratorSection.tsx` — studioPublic 探测
- `messages/{en,zh,ja,ko,es,fr,de}.json` — pricingPausedCta/pricingClosedCta
- `tests/studio-gate.dom.test.ts`（新）、`tests/checkout-button.dom.test.ts`（新）

（`lib/wallpapers.ts`、WallpaperBrowser、wallpapers/page、media 脚本与 seo-audit 文档为上一任务遗留未提交改动，本轮未触碰、已保留。）

## 3. 测试证据汇总

- API：**306 passed / 1 skipped**（40 文件）；Web：**307 passed**（41 文件）
- typecheck ×2、lint、`next build`、`build:vinext`、api build 全绿
- `audit:waffo` 0 issues；`seo:audit` 546 URL 不变、无新增问题；`rights:check` 通过

## 4. 上线阻塞项（非代码）

1. **M1-M7 人工检查**（runbook §1）：Waffo 后台配置/退款样本/密钥托管/合规页面；
2. **P1-1** 部分退款语义（等 Waffo 事件样本）；
3. **P1-2** 预算上限生产定值（模板已给建议）；
4. **P2-3** wallhaze.com 部署环境 500（与代码无关）。

## 5. 边界确认

✅ 未 git commit/push；✅ 未 wrangler deploy；✅ 未改生产数据/商户配置/真实商品/Webhook；✅ 无真实支付/退款；✅ 未调用收费 fal API（全部 Mock）；✅ 未改生产密钥、未输出密钥；✅ 本地测试全程隔离库 + Mock。

## 6. 上线当日流程（摘要）

配置模板填值 → 冒烟（闸门全关）→ 开 Studio → 开购买 → 开视频，每阶段按 runbook §4 验证；异常按 §5 回滚表一键收口。
