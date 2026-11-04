# 39 张壁纸生成前最后核对 — 修改报告

日期：2026-11-03
基线：master @ 9c92c8f（本地未提交，未部署）
范围：仅检查与必要修正。**未调用任何付费 AI 服务，未自动设置 verified，未 Git 提交，未部署。**

---

## 一、结论速览

| # | 任务 | 结果 |
|---|---|---|
| 1 | klein/4b 计费描述修正 | 已修正：$0.005/MP（官方），保留 $3 预算上限 + 69 次请求上限 + 实际计费记录双重限成本 |
| 2 | 7 张壁纸素材关联证据 | 8/8 PASS（含 aurora-veil-wide），内容复用确认非授权违规，授权状态零改动 |
| 3 | Seed 与 media-rights.json 一致性 | check-rights ok；media-rights.test.ts 8/8 通过；66 verified 种子 = 59 直配 + 7 已知复用 |
| 4 | 新图先进 private-media | 已确认：CSV outputPath → private-media/incoming-regeneration/，39 张无公开泄漏 |
| 5 | 66 公开 + 39 待审核 + SEO 复验 | 66/66 可下载；39 张 noindex+nofollow 且不在 sitemap；SEO 审计 P1=P2=P3=0 |
| 6 | 修改报告 | 本文档 |

---

## 二、修改清单（8 个修改文件 + 2 个新增）

### 修改

| 文件 | 修改内容 |
|---|---|
| `apps/web/scripts/media/generate-regen-plan-v2.mjs` | 计费模型 `$0.03/次` → `$0.005/MP`；每行 `estimatedCost` 按目标尺寸实算（768×1368 = $0.0053，576×1024 = $0.0029）；保留 69 次请求上限 + $3 预算上限 |
| `apps/web/scripts/media/generate-readiness.mjs` | 成本计算改为按 MP 求和；Cost Basis 表改为 per-MP 计费描述 + 保守预估 + 最坏情况上限（69 × 4.2 MP ≈ $1.45）+ 双重成本控制行；固化「7 known gaps」说明段落（原为手工补写，重新生成时曾丢失） |
| `apps/web/scripts/media/generate-review-md.mjs` | 第 9 节成本估算改为 $0.005/MP 口径（~$0.21 + ~$0.03 ≈ ~$0.25） |
| `apps/web/scripts/media/check-rights.mjs` | 修复派生 webp（`-640/-960/-1280/-1920/-480.webp`，由 build-derivatives.mjs 从已注册原图生成）被误报为「unregistered public image」的 214 条误报；现按原图注册状态识别合法派生 |
| `docs/media-review/regeneration-plan.csv` | 39 行 `estimatedCost` 列按 per-MP 重算（$0.03 → $0.0053 / $0.0029），其余列经逐行比对确认未变化 |
| `docs/media-review/regeneration-readiness.md` | 由修正后脚本重新生成（成本表 + known-gaps 段落） |
| `docs/media-review/pending-wallpapers-review.md` | 由修正后脚本重新生成（第 9 节成本口径 + 日期） |
| `apps/web/docs/seo-audit/page-inventory.csv` | 复审运行 seo:audit 时脚本自动更新的累计清单 |

### 新增

| 文件 | 用途 |
|---|---|
| `apps/web/scripts/media/verify-style-linkage.mjs` | 常驻校验：7+1 张复用作品 ↔ 实际 assetId 关联、注册表权限字段、公开文件 sha256 实算比对（只读，不改任何授权状态） |
| `docs/media-review/style-linkage-evidence.md` | 关联证据报告（8/8 PASS） |

---

## 三、计费描述修正（任务 1）

- 官方口径：fal-ai/flux-2/klein/4b 按**输出兆像素**计费 **$0.005/MP**（fal.ai 官方模型页，generate-demo.mjs 自 2026-10-24 已采用该口径），非固定 $0.03/次。
- 修正后的成本口径（39 张，目标 768×1368 / 1368×768 / 576×1024）：
  - 每张实算：1.05 MP → $0.0053；0.59 MP → $0.0029
  - 首轮 39 次 ≈ **$0.13**；含 30 次重试上限 ≈ **$0.29**
  - 最坏情况（端点输出放大到 1536px 级 ≈ 4.2 MP）：69 次 ≈ **$1.45**，仍低于 $3 预算上限
- 双重限制：① 生成脚本硬性 69 次请求上限 + $3.00 预算上限；② 每次请求的实际计费记录写入 generation ledger，成本以实际记录与保守预估孰高控制。
- 已同步修正 3 个脚本与 2 份生成的报告/CSV；历史报告（如 COMMUNITY-DEMO-REPORT.md 中的 $0.031 实际支出记录）为既有事实记录，未改动。

## 四、7 张壁纸素材关联证据（任务 2）

执行 `node scripts/media/verify-style-linkage.mjs` → `docs/media-review/style-linkage-evidence.md`（**8/8 PASS**）：

| 作品 | 实际渲染 assetId | 关联方式 | verified | 展示 | 下载 | sha256 实算比对 |
|---|---|---|---|---|---|---|
| galaxy-tide | style.starry-galaxy | resolveWallpaper() 回退 style 预览 | yes | yes | yes | 匹配 |
| stillwater-dawn | style.mountain-lake | 同上 | yes | yes | yes | 匹配 |
| abyssal-bloom | style.deep-ocean | 同上 | yes | yes | yes | 匹配 |
| aurora-veil | wallpaper.aurora-veil | 独立注册条目 | yes | yes | yes | 匹配 |
| quiet-geometry | style.architecture-minimal | style 回退 | yes | yes | yes | 匹配 |
| dewline | style.macro-nature | style 回退 | yes | yes | yes | 匹配 |
| soft-horizon | style.soft-gradient | style 回退（self-authored） | yes | yes | yes | 匹配 |
| aurora-veil-wide | wallpaper.aurora-veil | imageOverride 复用同文件 | yes | yes | yes | 匹配 |

结论：这些作品按 `lib/wallpapers.ts` 中 `resolveWallpaper()` 的既定回退（`seed.imageOverride ?? style.image`）复用已授权素材；被复用素材本身均为 `reviewStatus: verified` + `canPubliclyDisplay: true` + `canOfferDownload: true`。**这是内容复用，不是授权违规。** 所有 `evidenceStatus / reviewStatus / canPubliclyDisplay / canOfferDownload` 字段零改动，未新增或自动设置 verified。

## 五、Seed 与 media-rights.json 一致性（任务 3）

- `node scripts/media/check-rights.mjs` → **ok**：184 资产（149 公开 / 27 隔离私有），公开文件哈希无漂移、无非 verified 公开资产；本地 private-media 完整性已核验。
  - 修正项：此前 214 条失败全部为派生 webp 误报（见第二节），修复后无真实失败。
- `npx vitest run tests/media-rights.test.ts` → **8/8 通过**（含 31 个归档原件与公开预览的溯源校验）。
- 种子 ↔ 注册表：105 个种子 = 66 verified/self-authored + 39 review-pending；66 = 59 个 `wallpaper.<id>` 直配 + 7 个已记录的素材复用（第四节），无未解释缺口。
- 新 39 张发布门槛（regeneration-readiness.md §5）：注册表条目 + `reviewStatus=verified` + 展示/下载权限 + sha256 与文件字节匹配 + 生成记录（prompt/seed/model）+ 人工审核记录（reviewedBy/reviewedAt）——全部就绪前不得晋级。

## 六、private-media 流程确认（任务 4）

- `regeneration-plan.csv`：39 行 outputPath 全部为 `private-media/incoming-regeneration/<id>.png`；finalPublicPath 标记为 `(hold) public/...`，仅人工审核通过后复制。
- readiness 检查项确认：`outputPath corrected to private-media/incoming-regeneration/ = Yes`；`No outputPath points to public/ = Yes`。
- 实测：`private-media/incoming-regeneration/` 尚未创建（本轮未发生任何生成调用）；39 个 pending id 在 `public/images/wallpapers/` 中**零泄漏**（.jpg/.png/.webp 全查）。

## 七、66 公开 + 39 待审核状态及 SEO 复验（任务 5）

数据层（wallpapers.ts + media-rights.json + public/ 实测）：

- 66 张已审核作品：66/66 `canOfferDownload=true` 且 `canPubliclyDisplay=true`，图片文件均存在；displayOnly 种子 0 个。
- 39 张待审核：无注册表条目、无公开文件；页面渲染为受限占位（License Review）。
- 注册表 149 个公开资产全部 `reviewStatus=verified`。

SEO（`next build` + 本地生产预览 + `npm run seo:audit -- --label=pre-regen-recheck`）：

- sitemap locs = **546**（12 静态路径 × 7 语言 = 84，66 公开作品 × 7 语言 = 462），universe = 546。
- P1 = 0，P2 = 0，P3 = 0；orphans = 0；broken（known/unknown）= 0。
- 39 张待审核详情页（如 `/wallpapers/sakura-nights`）：HTTP 200，`<meta name="robots" content="noindex, nofollow"/>`，Title 带 "License Review"，**不在 sitemap**。
- 审计产物：`apps/web/docs/seo-audit/*-pre-regen-recheck.*`（未提交）。

---

## 八、待人工事项（生成后）

1. 人工视觉审核 39 张新图（版权、水印、质量）。
2. 人工确认后由 ingestion 脚本写入注册表并计算 sha256，再晋级 seed license。
3. 晋级通过后从 `private-media/incoming-regeneration/` 复制到 `public/images/wallpapers/`，并更新 IMAGE_DIMENSIONS 为 sharp 实测值。
4. 复跑 `npm run rights:check` 与 `verify-style-linkage.mjs`、`npm run test`、`npm run seo:audit`。

## 九、边界确认

- 未调用任何付费 AI 生成服务（fal 请求次数：0）。
- 未自动设置任何 verified；未修改任何授权状态。
- 未执行 git add / commit / push；未部署生产环境；未向 GSC 提交。
