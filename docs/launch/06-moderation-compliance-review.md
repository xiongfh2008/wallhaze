# 06 — 审核与合规审查（Moderation & Compliance Review）

范围：输入审核、输出审核、社区/图库审核、私有媒体生命周期。

## 1. 输入审核（Prompt Sift + 本地黑名单）✅

- Waffo Prompt Sift（[moderation.ts:89-285](file:///d:/Project/wallhaze/apps/api/src/business/moderation.ts#L89-L285)）：`enforce` 默认策略；服务故障 → `unavailable` → **fail-closed**（拒绝生成，不放行）；live 模式必须配置，否则任务失败。
- 本地 blocklist 二次过滤（blocklist.ts:110-125），`scripts/blocklist-check.mjs` 可独立巡检。
- Moderation 日志落库（moderation_logs，migration 008），含 prompt 哈希、不落原文明文敏感信息（ISO-1 用例验证日志无敏感泄漏）。

## 2. 输出审核 ✅

- [output-moderation.ts:77-207](file:///d:/Project/wallhaze/apps/api/src/business/output-moderation.ts#L77-L207)：生成结果先审核后落盘；图片整帧 + 视频按 ffmpeg 采样抽帧；任一 blocked → 结果丢弃、credits 释放、用户提示内容违规。
- **未配置 OpenAI Moderation key = 永不落盘**（fail-closed）：live 生成必须配置，否则全部失败——这是刻意的合规安全阀（G17 用例）。
- `has_nsfw_concepts` 类供应商信号同样处理（GEN-03 用例：422 CONTENT_FILTERED）。

## 3. 图库/社区审核 ✅

- 社区投稿导入/下架脚本（community:import / community:unpublish）+ manifest 扫描（moderation:scan-gallery）。
- 商业化相关边界：**AI 生成作品只进私有 creations（30 天过期）**，不进公开图库；进入公开图库需人工审核流程（media-rights 机制，66 公开/39 待审，另见 docs/media-review/）。

## 4. 私有媒体与下载 ✅

- R2 私有桶 + SigV4 签名 URL（exp+sig），过期失效；未签名路径不可枚举。
- 用户隔离：creations 按用户查询（G20 用例）；worker 落盘前输出审核拦截（G17/G19）。
- 30 天过期清理与隐私政策一致（media-lifecycle 用例 + 「keeps the 30-day policy constant aligned」用例）。

## 5. 合规边界与人工事项

| 事项 | 状态 |
|------|------|
| 未成年人/年龄声明、隐私政策、服务条款页面 | **人工项**：上线前法务/内容自查（不阻塞本地验收） |
| Waffo 支付合规（商户协议、退款政策公示） | 人工项（09 runbook M1） |
| Prompt Sift 审核权限（商户密钥开通 moderation scope） | 人工项 M4 |
| 用户内容投诉/举报通道 | 人工项：建议 credits 页脚加举报邮箱 |

## 6. 测试证据

moderation.test.ts：live 链路 fail-closed、输出审核拦截、视频抽帧、重扫；generation 用例覆盖 422/502 错误映射；ISO-1 日志无敏感信息。
