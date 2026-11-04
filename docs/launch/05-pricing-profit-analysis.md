# 05 — 定价与利润核算（Pricing & Profit Analysis）

数据截至 2026-11-03，来源 fal.ai 官方模型页（见文末链接）。

## 1. Credits 汇率（系统内定值）

套餐（002_packages.sql）：starter 100cr/$5、creator 500cr/$20、studio 2000cr/$69。
→ **1 credit ≈ $0.05**（按 starter 口径）。

## 2. 单次成本 vs 收入

| 业务 | 收费（credits → USD） | fal 官方成本 | 毛利 | 毛利率 |
|---|---|---|---|---|
| 文生图 klein/4b（~1-2MP） | 10cr = $0.50 | $0.005/MP → **$0.005~0.019** | ~$0.48 | **~96%** |
| 图片编辑 /base/edit（1MP 入 + 1MP 出） | 10cr = $0.50 | **$0.018** | ~$0.48 | ~96% |
| 视频 I2V Wan2.2-5B（≤5s 720p） | 40cr = $2.00 | **$0.15/段** | ~$1.85 | ~92% |
| 视频 T2V Kling V3 Std 3s | 40cr = $2.00 | $0.084/s → **$0.252**（无音频） | ~$1.75 | ~87% |
| 视频 T2V Kling V3 Std 4s | 50cr = $2.50 | **$0.336** | ~$2.16 | ~87% |
| 视频 T2V Kling V3 Std 5s | 60cr = $3.00 | **$0.42** | ~$2.58 | ~86% |

内部成本护栏对照：图片 `SUPPLIER_COST_LIMIT=4,000,000µ$`（$4）与视频 500k-800kµ$（$0.5-0.8）均为**硬上限**而非实际成本，实际成本远低于护栏，护栏只兜异常（如高分辨率大图）。✅ 合理。

## 3. 关键假设与不确定性（必须标注）

1. **Waffo 支付费率未知**——本表毛利率未扣支付通道费。假设 2.9%~5% + 固定费，对上述各项毛利率影响 <5 个百分点；上线前以 Waffo 合同费率复核（人工项）。
2. fal 按**输出计费**（MP/时长），高分辨率/更长时长按比例上调（fal pricing 页原文"Settings such as resolution, duration, and quality may affect the final cost"）。
3. **失败请求计费规则**：fal 官方 FAQ——5xx 服务端失败不计费；**422 无效输入仍计费**。系统对 422 类失败仍释放用户 credits（保守对用户有利），差额由平台吸收——在预算护栏内可控，记录备查。
4. klein/4b 页面 $0.005/MP 与 fal 旧文档 $0.009/MP 不一致，以模型页为准；Kling 汇总页 $0.14/s 与模型页 $0.084/s 不一致，以模型页为准。
5. 无公开量价折扣；账户级协议折扣需 Contact Sales。

## 4. 盈亏平衡速算

固定成本≈0（Cloudflare 免费层起步）。单张图净利 ≈$0.48：**每 100 张图收入 $50，fal 成本约 $1~2**。视频单段净利 $1.75~2.58。主要经营风险是支付通道费与滥用（预算双闸 + 限流已防护）。

## 5. 建议

- 上线后接入 [fal Pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing) 动态读取单价，防调价导致的负毛利；
- 如需更高视频利润率，可评估 Wan 720p→1080p 计价变化后再定 T2V 档位价格（现价已安全）；
- Waffo 费率确认后回填本表（人工项 M1）。

## 来源

- [fal-ai/flux-2/klein/4b](https://fal.ai/models/fal-ai/flux-2/klein/4b/llms.txt)：$0.005/MP
- [klein/4b base/edit](https://fal.ai/models/fal-ai/flux-2/klein/4b/base/edit/llms.txt)：$0.009/MP（入+出，示例 $0.018）
- [Wan v2.2-5b I2V](https://fal.ai/models/fal-ai/wan/v2.2-5b/image-to-video/llms.txt)：$0.15/段
- [Kling v3 Standard T2V](https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video)：$0.084/s（无音频）
- [fal FAQ](https://docs.fal.ai/model-apis/faq)：失败计费规则
