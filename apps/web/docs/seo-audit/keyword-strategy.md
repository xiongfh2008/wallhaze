# WallHaze — Keyword Strategy（2026-11-23）

本轮关键词布局与长尾扩展的总策略。配套文件：

- [keyword-mapping.csv](keyword-mapping.csv) — 逐关键词映射表（Keyword → Locale → URL → Action）
- [seo-implementation-report.md](seo-implementation-report.md) — 本轮实施记录与测试结果

## 0. 第二轮重审计增量（2026-11-23 当日晚间，commit 0a074a7 之后）

重跑整轮审计后的增量实施（详见实施报告「第二轮」章节）：

1. **数据修正**：上一轮实施报告 E.3 中「cyberpunk 12 张，可作第 3 合集候选」为**错误数据**——实测公开 cyberpunk 作品仅 **6 张**（把 category=digital 的宽口径 27 张误计入）。cyberpunk 不满足 ≥8 张门槛，**不建页**，保留为图库筛选词。
2. **新增第 3 个合集页 `/wallpapers/collections/sci-fi`**：sci-fi 风格实测 **10 张公开作品**（星门/环形空间站/黑洞航行/银河山岳等），达标建页；七语言文案 + sitemap + hreflang 全量。
3. **首页补合集内链**：生产审计（7 项全 PASS）唯一 NOTE = 首页原始 HTML 无任何 `/wallpapers/collections/*` 链接。已在首页 Featured Wallpapers 区块补「精选合集」入口行（复用 collections 命名空间，无新增 i18n 键）。
4. 生产环境其余信号（title 后缀本地化、alt 本地化、canonical/hreflang、sitemap image 节点 658 条、robots、Googlebot-Image 200）复核全部 PASS，未改动。

## 1. 数据基线（诚实声明）

- **无当前 GSC 查询导出**。仓库内仅存在 2026-11-12 的索引诊断导出（`docs/seo-gsc-evidence/`、`docs/SEO-GSC-diagnosis.md`）与 [phase4-priority.md](../seo-growth/phase4-priority.md) 记录的 28 天样本：Web 2 点击 / 26 展示；Image 0 点击 / 8 展示；韩国为唯一有点击国家（查询「드림코어 들판」Web pos 6 / Image pos 21）。
- 历史查询信号（드림코어 들판 / ki hintergrundbilder / ai 壁紙 アニメ / wallpaper ki / nebelhaft）**样本过小，仅作为方向参考，不作为当前热门关键词**。
- 本文档所有搜索量/难度均为空 —— 不虚构任何数字。

## 2. 页面类型 × 主搜索意图

| 页面 | 主意图 | 主关键词（en） | 状态 |
|---|---|---|---|
| 首页 `/` | 浏览免费壁纸 + 进入 AI 创作 | free aesthetic wallpapers / AI wallpaper studio | 本轮已优化（7 语言） |
| 图库 `/wallpapers` | 按设备/风格找免费壁纸 | free aesthetic wallpapers for phone, tablet & desktop | 本轮已优化（7 语言） |
| Studio `/studio` | 用 AI 生成壁纸 | AI wallpaper generator / custom wallpaper | 本轮已优化（7 语言） |
| 详情 `/wallpapers/[slug]` | 下载某张具体作品 | 每张 1 主词 + 2–4 辅词（见 CSV） | 本轮补齐 title 后缀本地化 + 48 张 alt 六语补译 |
| 合集 `/wallpapers/collections/{dreamcore,anime,sci-fi}` | 按主题聚合浏览 | dreamcore wallpapers / anime wallpapers / sci-fi wallpapers | 第一轮新增 dreamcore/anime；第二轮重审计后新增 sci-fi（10 张达标） |

**明确不做**：AMOLED 分类页（"dark" 风格族仅 2–3 张真 AMOLED 作品，内容不足）；**cyberpunk 分类页（第二轮实测公开作品仅 6 张，不达 ≥8 门槛，修正上一轮"12 张"误计）**；其余潜在主题（liminal space、dark academia、aliencore 等）保留为图库筛选词，作品数量达 ≥8 张已授权公开后再评估建页。

## 3. 七语言关键词映射（自然搜索表达，非直译）

| 语言 | 核心词 | 主要落点 |
|---|---|---|
| en | free aesthetic wallpapers · AI wallpaper generator · dreamcore wallpaper · hand drawn anime wallpaper | 首页/图库/Studio/合集/详情 |
| zh | 免费壁纸 · AI壁纸生成器 · 动漫手机壁纸 · 手绘动漫壁纸 · 梦核壁纸 | 首页/图库/Studio/合集/详情 |
| ja | AI壁紙 · アニメ壁紙 · スマホ壁紙 · AI壁紙生成 · ドリームコア壁紙 | 首页/图库/Studio/合集/详情 |
| ko | AI 배경화면 · 애니 배경화면 · 드림코어 배경화면 · 감성 폰 배경화면 · 무료 배경화면 | 首页/图库/Studio/合集/详情（ko 为唯一有点击市场，质量优先） |
| es | fondos de pantalla anime · fondos de pantalla aesthetic · generador de fondos con IA | 首页/图库/Studio/合集/详情 |
| fr | fond d'écran anime · fond d'écran esthétique · générateur de fond d'écran IA | 首页/图库/Studio/合集/详情 |
| de | KI Hintergrundbilder · Anime Hintergrundbilder · KI Wallpaper erstellen · Hintergrundbilder fürs Handy | 首页/图库/Studio/合集/详情 |

规则：

1. Title/Description 按各语言自然表达撰写，不直译（已通过 seo:audit 长度与重复校验）。
2. Alt 描述画面真实主体，与页面图片一致；本轮为 48 张 b2/后续批次壁纸补齐 6 语言 alt（此前为「本地化标题 — 英文描述」混拼）。
3. 详情页 `<title>` 后缀从硬编码英文 "Free Wallpaper" 改为本地化 `meta.detailTitleSuffix`（zh「免费壁纸」/ ja「無料壁紙」/ ko「무료 배경화면」/ es「Fondo de pantalla」/ fr「Fond d'écran」/ de「Gratis Wallpaper」）。
4. 待验证标记：各语言关键词的自然度基于常识判断，无本地关键词工具验证 —— 如后续 GSC 显示某语言零曝光，优先复查该语言文案自然度，而非堆砌。

## 4. 优先级定义

- **P0**：影响索引/收录的技术问题 —— 本轮无（索引基础已在 2026-11-12 诊断中确认健康）。
- **P1**：高价值低成本、有实测证据 —— 详情页 title 后缀本地化、48 张 alt 补译、Dreamcore/Anime 合集页（ko 查询证据 + 作品数量达标）。
- **P2**：有价值待条件 —— 其余语言长尾文案迭代、AMOLED 等主题建页（作品数量不足）、设备集合页。

## 5. 长尾关键词 → 壁纸映射原则

见 [keyword-mapping.csv](keyword-mapping.csv)（含 20 个种子长尾词到真实 slug 的映射）。原则：

- 每张壁纸 1 主词 + 2–4 辅词，主词写入该壁纸的可见描述与 alt（即本地化后的 `galleryWallpapers.{id}.alt`）。
- 已有稳定 slug 不改；未新增/未修改任何 slug，无 301 需求。
- Title 自然描述作品（本地化标题 + 本地化后缀），不重复堆砌 Free/AI/4K；全站无原生 4K 素材，**不使用任何 4K 关键词**。
- Create similar 只作为功能入口与长文案说明，不虚构"免费无限生成"——Studio 页明确 Credits 计费。

## 6. Google Images 通道

- sitemap 已含全部 94 张公开壁纸的 `image:image` 节点（先前轮次完成，本轮验证 756 loc × 7 语言 + image 节点完好）。
- 本轮新增：详情页主图 `<img width/height>`（真实尺寸），降低 CLS 并给图片爬虫尺寸信号。
- ImageObject / creditText / license / copyrightNotice 维持既有诚实实现，未改动。
- 后续 28 天观察 GSC Image 曝光是否从 b2 三个 slug 扩散到新文案页面。
