# WallHaze — SEO 实施报告：关键词布局与长尾本地化轮（2026-11-23）

范围：`apps/web`。未触碰图片授权规则、Credits、生成流程、支付与任何未审核素材权限。未 push、未部署。

> **第二轮重审计增量（同日晚间，用户要求重跑整轮审计+实施）见文末「第二轮」章节。**
> 第二轮修正了本报告 E.3 中的一处数据错误（cyberpunk 作品数），以第二轮实测为准。

## A. 审计结果（本轮起点）

代码/索引基础已在 2026-11-12 诊断（[SEO-GSC-diagnosis.md](../../../docs/SEO-GSC-diagnosis.md)）确认健康：robots/sitemap/canonical/hreflang/head metadata/双 UA 一致性全部正常，无公开页误 noindex。本轮审计新增发现：

| # | 问题 | 等级 | 影响范围 | 状态 |
|---|---|---|---|---|
| 1 | 详情页 `<title>` 后缀硬编码英文 "Free Wallpaper"，6 个非英语语言产生混语言 title | P1 | 全部 94 张详情页 × 6 语言 = 564 页 | ✅ 已修复（`meta.detailTitleSuffix` 七语新键） |
| 2 | 48 张 b2/后续批次壁纸的 alt 在 zh/ja/ko/es/fr/de 为「本地化标题 — 英文描述」混拼，同时污染 alt、meta description、og:description、ImageObject 描述与页面可见段落 | P1 | 48 张 × 6 语言 = 288 页 | ✅ 已修复（全部重写为纯本地化画面描述） |
| 3 | 详情页主图 `<img>` 缺 width/height 属性（phase4 P2 #4 遗留） | P2 | 全部详情页 | ✅ 已修复（真实像素尺寸） |
| 4 | 首页/图库/Studio 的 meta 文案关键词覆盖弱（如图库未覆盖 device 意图、Studio 未覆盖 generator 意图） | P2 | 3 页 × 7 语言 | ✅ 已重写（21 组文案，全部通过 seo:audit 长度校验） |
| 5 | Dreamcore / Anime 主题无聚合落地页，长尾需求只能靠图库筛选消化 | P2 | 主题级 | ✅ 新增 2 个数据驱动合集页 |
| 6 | noindex 142 归因、http 未升级（B1）、/en 307（B2）、详情页 no-store（B3） | 见诊断报告 | — | 维持原状（B1 为 Cloudflare Zone 配置，B2/B3 为 vinext 框架行为，均不在本轮代码授权范围） |

## B. 关键词规划摘要

详见 [keyword-strategy.md](keyword-strategy.md) 与 [keyword-mapping.csv](keyword-mapping.csv)：

- 核心关键词：34 行（7 语言 × 首页/图库/Studio/合集）
- 长尾关键词：21 行（逐张映射到真实 slug，1 主词 + 辅词策略）
- 潜在关键词：7 行（AMOLED/liminal/dark academia/soft pastel/kawaii/retro anime/设备集合页 —— 均因作品数量或证据不足**未建页**，标记待验证）
- GSC 数据缺失声明：无当前查询导出；仅使用 2026-11-12 的 28 天样本（Web 2 点击/26 展示、Image 8 展示、ko 市场 1 点击）。未虚构任何搜索量/难度/排名。

## C. 实施清单

### 修改文件

| 文件 | 变更 |
|---|---|
| `apps/web/messages/{en,zh,ja,ko,es,fr,de}.json` | meta 六项文案重写；新增 `meta.detailTitleSuffix`；新增 `collections` 命名空间；48 张壁纸 alt 六语补译 |
| `apps/web/lib/collections.ts` | 新增：合集注册表（dreamcore = dreamcore 风格 9 张；anime = anime 风格族 19 张），只输出 PUBLIC_WALLPAPERS 成员 |
| `apps/web/app/[locale]/wallpapers/collections/[collection]/page.tsx` | 新增：合集页（静态段路由，与 `/wallpapers/[slug]` 无冲突；未知 slug 404；BreadcrumbList JSON-LD；canonical/hreflang/OG 齐全） |
| `apps/web/app/[locale]/wallpapers/[slug]/page.tsx` | title 后缀本地化；主图传真实 width/height |
| `apps/web/components/WallpaperImage.tsx` | 新增可选 width/height props（undefined 时 React 不输出属性，其余调用点不受影响） |
| `apps/web/app/[locale]/wallpapers/page.tsx` | 图库页新增「精选合集」入口行（2 个内链，锚文本 = 合集标题） |
| `apps/web/app/sitemap.ts` | 新增 2 个合集 URL × 7 语言（14 loc，无 image 节点，符合"非详情页不带图"测试约束） |
| `apps/web/tests/i18n-parity.test.ts` | sitemap 断言区分详情页（94）与合集页（= collections 注册表长度） |
| `apps/web/docs/seo-audit/keyword-{strategy,mapping}.csv` + 本报告 | 新增 SEO 文档 |

### 关键页面 Meta 修改前后对比（en；其余 6 语言同步重写）

| 页面 | 修改前 Title | 修改后 Title |
|---|---|---|
| `/` | WallHaze — AI Wallpapers for Every Screen | Free Aesthetic Wallpapers & AI Wallpaper Studio — WallHaze |
| `/wallpapers` | Wallpaper Gallery — Free Wallpapers | Free Aesthetic Wallpapers for Phone, Tablet & Desktop |
| `/studio` | Studio — Create AI Wallpapers | AI Wallpaper Generator — Create Custom Wallpapers |
| 详情示例 | Sakura Nights — Free Wallpaper（6 语言混英文） | 众门之野 — 免费壁纸 / 夜桜 — 無料壁紙 / …（本地化后缀） |

| 页面 | 修改前 Description | 修改后 Description（en） |
|---|---|---|
| `/` | Explore free AI wallpapers for phone, tablet and desktop — anime, cyberpunk, fantasy and more. Create your own in the AI Studio. | Browse free aesthetic wallpapers for phone, tablet and desktop — anime, cyberpunk, dreamcore and more. Or create your own custom AI wallpapers in the Studio. |
| `/wallpapers` | Browse free wallpapers for phone, tablet and desktop. Artwork with cleared licensing is downloadable; items under review are view-only. | Browse free HD wallpapers for phone, tablet and desktop — anime, cyberpunk, dreamcore, nature and more. Download cleared artwork or create similar ones with AI. |
| `/studio` | Create AI wallpapers with WallHaze: describe what you want to see, pick a style, and generate static and live wallpapers for your devices. | Generate custom AI wallpapers from a text prompt: pick a style, set your device ratio, or create similar wallpapers from a reference image. Billed with Credits.（明确 Credits 计费，不误导免费） |

### 图片 SEO 变化

- 288 页 alt 从混拼改为纯本地化画面描述（alt = meta description = og:alt = ImageObject.description 同步受益）。
- 详情页主图新增真实 `width`/`height` 属性（CLS 防御 + 图片爬虫尺寸信号）。
- 未改动：ImageObject/license/creditText/copyrightNotice 的诚实实现、WebP srcset、渐变占位退出逻辑（现有实现符合要求，不重构）。

### 内链变化

- 图库页 → 2 个合集页（新增，锚文本为合集标题）。
- 合集页 → 全部成员详情页 + 返回图库。
- sitemap 收录合集页 × 7 语言（hreflang alternates 完整）。
- 未新增任何关键词完全匹配的重复链接，无死链（audit brokenKnown=0）。

## D. 测试结果（全部通过）

| 检查 | 结果 |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 0 errors |
| `npm run lint` (eslint) | ✅ 0 errors（28 warnings 全部为既有） |
| `npm test` (vitest) | ✅ 44 files / 339 tests passed |
| `npm run rights:check` | ✅ pending 27 / restricted 8 / localPrivateIntegrity=checked（未触碰素材权限） |
| `npm run build:vinext` | ✅ Build complete（新路由 `/wallpapers/collections/:collection` 注册成功） |
| `npm run seo:audit`（keyword-round，756 URL universe） | ✅ **P1=0 P2=0 P3=0 orphans=0 broken=0**（首轮 1 P1 + 17 P2 + 17 P3 已全部修复：fr 品牌重复、18 条 description 超长、17 条 title 超长——审计计数含 HTML 实体膨胀） |
| 原始 HTML 验证 | ✅ zh/ja/ko 详情 title 本地化、本地化 alt 在 head/正文/img 三处生效、img width/height=1536x1152 等真实值 |
| 浏览器验证（browser agent） | ✅ 图库合集入口行、Dreamcore 9 卡、Anime 19 卡、详情页下载/相关推荐、零 console 错误、布局无破损 |

## E. 后续 30 天增长建议（基于真实数据，不含预测）

1. **部署后 7 天在 GSC 请求重新抓取**：2 个合集页 + 756 sitemap 全量（本轮新增 14 个合集 loc）。
2. **28 天后导出 GSC 查询报告**：核对 ko（드림코어）与 de/ja 信号是否扩散到新合集页与补译后的详情页；将 keyword-mapping.csv 的 Evidence 列从"内容匹配/假设"升级为真实曝光数据。
3. **优先补充的主题方向**（现有风格族下自然扩展，非新页）：anime family（19 张，最接近下一门槛的是 cozy-anime 子主题）、dreamcore（9 张）、cyberpunk（~~12 张，可作为第 3 个合集候选~~ **第二轮实测仅 6 张，不建页，见下方修正**）。
4. **AMOLED 合集页暂缓**：需 ≥8 张真 AMOLED 作品（当前 dark 族仅 2–3 张）；新增作品过审后重评。
5. **Google Images 重点**：观察补译后的 288 页是否提升非英语 Image 曝光（此前 8 次曝光集中在 3 个 b2 slug）；主图 width/height 生效后复查 CLS。
6. **转化**：详情页 Create similar 入口已存在（5 张 paper-sunshine 批次带 3 变体）；建议下一轮为 dreamcore/anime 合集成员补充 CREATE_SIMILAR_VARIANTS，并在部署后设计 download_click / create_similar_click 埋点（phase4 #6，需授权）。
7. **运维项（非代码）**：Cloudflare Zone 开启 Always Use HTTPS（B1）；GSC 导出 noindex 142 的 URL 明细以关闭 D 类归因。

---

## 第二轮：重审计 + 增量实施（2026-11-23 晚间，commit 0a074a7 之后）

### F. 重审计结论

| 检查 | 方式 | 结果 |
|---|---|---|
| 生产 HTML 七语言抽样（详情/合集/sitemap/robots/首页/Studio/图片资源/品牌重复） | 后台代理 curl 实测 7 组 | **全部 PASS**；唯一 NOTE = 首页原始 HTML 无 `/wallpapers/collections/*` 内链 |
| 素材台账逐风格实测 | tsx 脚本读 `PUBLIC_WALLPAPERS`（94 张公开） | cyberpunk **6 张**（修正 E.3 的"12 张"误计）、sci-fi **10 张**、dreamcore 9、anime family 19、vaporwave 4、dark 3、horror family 5 |
| 集合页门槛复核 | 对照 lib/collections.ts ≥8 张规则 | **cyberpunk 不建页**（6 张）；**sci-fi 达标建页**（10 张，phase4 §3.1 曾列为"无集合页"缺口） |
| dev server 500 问题 | 本轮复现 | `next dev` 全站 500（generateStaticParams JSON 解析错），**为既有 dev 环境问题，与本轮改动无关**（未改动页面同样 500）；本轮审计改用 `vite preview`（4173，workerd）对 build 产物审计，与上一轮口径一致 |

### G. 第二轮实施清单

| # | 变更 | 文件 | 理由 |
|---|---|---|---|
| 1 | 新增第 3 个合集 `sci-fi`（10 张公开作品，styleId 直配） | `lib/collections.ts` | 达 ≥8 张门槛 + phase4 缺口证据；sitemap/合集入口行/hreflang 随注册表自动生效（+7 loc） |
| 2 | sci-fi 合集七语言文案（title/intro/metaTitle/metaDescription，自然搜索表达非直译） | `messages/{en,zh,ja,ko,es,fr,de}.json` | 合集页 H1/meta/可见文案；文案长度经 seo:audit 校验（首轮 3 P2 + 1 P3 超长已即时收敛） |
| 3 | 首页 Featured Wallpapers 区块新增「精选合集」入口行（3 条内链，锚文本 = 合集标题，prefetch=false） | `components/FeaturedWallpapers.tsx` | 修复生产审计唯一 NOTE：首页 → 合集内链权重传递；复用 collections 命名空间，零新增 i18n 键 |
| 4 | keyword-mapping.csv 新增 sci-fi ×7 行 + cyberpunk「不建页」行；keyword-strategy.md 新增第二轮章节 | `docs/seo-audit/*` | 数据修正留痕（cyberpunk 12→6） |

**未做（维持约束）**：cyberpunk/AMOLED/liminal 等不达标主题不建页；合集成员 CREATE_SIMILAR_VARIANTS 补充（需逐图撰写 3 套 Prompt 变体，涉及素材内容创作，需单独授权）；未改 slug（无 301 需求）；未触碰 media-rights / Credits / 生成流程。

### H. 第二轮测试结果（全部通过）

| 检查 | 结果 |
|---|---|
| typecheck | ✅ 0 errors |
| eslint | ✅ 0 errors（28 warnings 全部既有） |
| vitest | ✅ 44 files / 339 tests（i18n 七语言键位 parity 含 sci-fi 新块） |
| rights:check | ✅ pending 27 / restricted 8 / integrity=checked（素材权限未动） |
| build:vinext | ✅ Build complete |
| seo:audit（base=http://localhost:4173，label=sci-fi-round） | ✅ 763 loc（+7 = sci-fi ×7 语言）；**P1=0 P2=0 P3=0 orphans=0 brokenKnown=0** |
| 生产审计（7 组 curl 实测） | ✅ 全 PASS，唯一 NOTE（首页合集内链缺失）已在本轮修复 |
