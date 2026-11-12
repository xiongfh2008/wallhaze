# WallHaze SEO 第四阶段 — 只读增长审计（2026-11-12，v2 含 GSC 数据）

只读审计。未修改任何源代码、版权字段、SEEDS、Cloudflare 配置；未 commit/push/部署。**本轮目标是寻找新增自然搜索点击与 Google Images 流量机会，不是修复 noindex（前三阶段已确认 B 类技术故障为 0）。**

v2 更新：整合用户提供的 GSC Search Performance 真实导出（Web + Image，28 天）；按提示词对 3 个指定 slug（`b2-dreamcore-doorfield`、`b2-magic-forest-clearing`、`b2-samurai-standoff`）× 7 语言完成图片 SEO 逐项实测；新增发现路径、CTA/埋点取证。

## 摘要

- 作品台账：**105 件种子作品 = 66 件公开（可索引）+ 39 件 review-pending（设计性 noindex）**；公开作品中 50 self-authored + 16 verified，48 AI 生成 + 18 人工创作，21 竖版（手机）+ 45 横版（桌面），66 件全部可下载。
- 技术面：Google Images 基础健康——真实 `<img src>` 可发现、图片资源 200 `image/jpeg`（CF HIT）、CC0/来源作品已带完整 Licensable 结构化数据、待审页不泄漏 ImageObject。**GSC Image 数据佐证：11-09 起图片搜索已产生 8 次展示，HTML 发现通道已被 Google 使用。**
- **最大缺口：sitemap 无任何 `<image:image>` 元素（546 loc、image 标签 0 个）**——现在是"加速"而非"修复"（Images 已在收录，见 §四）；仍为唯一 P1 技术机会。
- 试点集合页：现有库（每风格最多 8 件）不足以支撑耐久的独立集合页；GSC 查询样本极小（1-2 展示），**所有新路由建议维持"假设"级，待验证后仅推 1–2 个试点**。
- GSC 数据（任务 D 已完成）：Web 2 点击/26 展示；Image 0 点击/8 展示。韩国是唯一有点击国家；「드림코어 들판」同时出现在 Web（pos 6）与 Image（pos 21）。**明细不代表全部搜索词，禁止把页面维度 34 次展示当成全站展示。**

## 一、任务 A：现有入口与内容盘点

### 1.1 路由与入口实况

| 入口 | 实现 | 性质 |
|---|---|---|
| `/wallpapers` | 静态壳 + 客户端 `WallpaperBrowser`（[GalleryExperience.tsx#L24](../../apps/web/components/gallery/GalleryExperience.tsx) `useState` 筛选） | 可索引列表页；筛选（风格/设备/分辨率/搜索/排序）**纯客户端、无 URL 参数 → 不可链接、不可索引** |
| `/wallpapers/<slug>` | 105 条路由，66 可索引 | 详情页（SEO 主力） |
| 首页 PopularStyles | [PopularStyles.tsx#L37](../../apps/web/components/PopularStyles.tsx) → `/studio?style=<id>` | **创作入口，非 SEO 集合页**（提示词所訴属实，已核实） |
| 详情页 CTA | [page.tsx#L468](../../apps/web/app/[locale]/wallpapers/[slug]/page.tsx) `Create Similar` → `/studio?style=` | 同上 |
| LiveDemoGallery | → `/studio?media=video&demo=<id>` | 视频创作入口 |

**结论**：用户可以交互式按风格/设备/分辨率发现作品，但这些状态都不产生独立搜索落地页；唯一的静态集合入口是 `/wallpapers` 一个列表页。首页无"壁纸集合页"链接——风格卡片全部导向 Studio。

### 1.2 台账（docs/seo-growth/phase4-inventory.csv，105 行）

关键统计（公开 66 件）：

| 维度 | 分布 |
|---|---|
| License | self-authored 50 · verified 16（**公开=版权已审**；39 pending 严格分离且全部 noindex+排除 sitemap） |
| AI 生成 | true 48 · false 18（来源 registry media-rights.json；无"unknown"公开件） |
| 类别 | digital 13 · anime 12 · nature 9 · photography 8 · horror 5 · abstract 1 · 未归 family 18（sci-fi/dark/3d-art/dreamcore 等风格无 family 字段，台账保留 styleId 原值） |
| 风格（top） | dreamcore 8 · sci-fi 7 · cyberpunk 5 · cinematic 5 · cozy-anime 4 · vaporwave 4 · ukiyo-e-anime 4 · mecha 3 |
| 设备 | desktop(landscape) 45 · phone(portrait) 21 |
| 可下载 | 66/66 |
| Sitemap | 66/66 命中（待审 0/39，设计正确） |

**诚实性核查**：未假设任何作品"AI 原创即 CC0"——来源字段按 registry 逐件记录（CC0 16 件带 Wikimedia 源 URL；self-authored 50 件带 terms 授权，无更广泛商用声明）。

## 二、任务 B：Google Images 技术与内容审计（15 URL 实测 + 4 图片资源）

证据：[phase4-probes.json](phase4-probes.json)（15 详情 × 双 UA + 4 资源）。

### 2.1 实测结果

| 检查项 | 12 个已审详情 | 3 个待审对照 |
|---|---|---|
| HTTP | 200 | 200 |
| robots meta | 无（可索引） | noindex, nofollow |
| 真实 `<img src>` | 12 个（含作品图 + logo/预览） | 10 个 |
| 作品图 alt | 真实描述（如 "Pink cherry blossoms against a soft blue sky"） | 同 |
| loading | eager（首屏，利于发现） | eager |
| ImageObject JSON-LD | **1 个/页**：contentUrl/license/creditText/creator/acquireLicensePage/copyrightNotice/width/height | **0 个**（不泄漏 contentUrl，设计正确） |
| browser vs Googlebot UA | 原始 head 一致，无缓存错配 | 一致 |

样本（sakura-dream）：`contentUrl: /images/wallpapers/sakura-dream.jpg`、`license: creativecommons.org/publicdomain/zero/1.0/`、`creditText/creator: indah nur indaheart`、`copyrightNotice: CC0 dedication`、`acquireLicensePage: /terms#downloads` —— **符合 Google [图片许可元数据指南](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata)，无可捏造字段**。

### 2.2 图片资源（Googlebot-Image UA 复核）

4 个 `/images/wallpapers/*.jpg`：200、`image/jpeg`、`Cache-Control: public, max-age=86400, stale-while-revalidate=2592000`、`cf-cache-status: HIT`。Googlebot-Image UA 同样 200。

### 2.3 缺口与建议（不直接修改，待授权）

| # | 发现 | 评估 | 优先级 |
|---|---|---|---|
| 1 | **sitemap 546 loc 无一个 `<image:image>`**（`xmlns:image` 缺失） | 值得增加：image sitemap 是 Google Images 发现的直接信号，成本 = `app/sitemap.ts` 给 66 个详情 loc 加 image 节点（image:title/image:license 一并喂给 Images 索引），零新页面、零风险 | **P1** |
| 2 | Licensable 结构化数据 | 已有且诚实，无需改 | — |
| 3 | `<img>` 无 `width/height` 属性、无 srcset（原图直出） | 不影响 Images 收录；影响 CLS/带宽，属常规性能优化 | P3 |
| 4 | IPTC | Web 交付不适用，JSON-LD 已覆盖授权字段 | — |

## 三、任务 C：搜索意图与试点集合页评估

### 3.1 候选 query → 现有页面 → 已审作品数映射

| 候选意图 | 现有可索引入口 | 已审作品支撑 | 缺口 |
|---|---|---|---|
| cyberpunk/neon 壁纸 | 仅 `/wallpapers`（客户端筛选不可链接） | cyberpunk 风格 5 件 | 无独立集合页 |
| anime 壁纸（原创向） | 仅 `/wallpapers` | category anime 12 件 | 无集合页；首页风格卡导向 Studio |
| sci-fi/galaxy | 仅 `/wallpapers` | sci-fi 7 + starry-galaxy 2 | 无集合页 |
| minimalist | `/wallpapers` | architecture-minimal 2 + soft-gradient 1（**太薄**） | 支撑不足 |
| nature | `/wallpapers` | category nature 9 | 无集合页 |
| 手机壁纸 / desktop 壁纸 | `/wallpapers`（设备筛选客户端态） | phone 21 / desktop 45 | 无按设备落地页 |
| live wallpaper（动态） | 无静态视频库；`/studio?media=video` 是创作入口 | 视频为生成功能非图库 | **不应做静态集合页**（诚实性：无真实视频壁纸库） |

### 3.2 试点结论（全部标注为"假设"，无 GSC 数据支持）

1. **当前不建议直接建任何 7 语言 × 风格/设备集合页**：最大风格集合仅 8 件（dreamcore），多数 2-5 件——薄集合页重复 `/wallpapers` 内容，稀释而非增加索引价值。
2. **待 GSC 验证后**的最小试点（二选一，满足：≥6 件已审作品 + GSC 真实查询证据 + 独特价值）：
   - 候选 1：`/wallpapers/phone`（或 `/wallpapers/devices/phone`）——21 件竖版、设备意图明确、复用现有 hreflang/canonical 模式；
   - 候选 2：`/wallpapers/cyberpunk` 类风格集合——需先补库到 ≥8 件。
   - 方案要素：真实图库卡片（复用 WallpaperLinkCard）、站内导航（列表页顶部 + 详情页 related）、canonical 指自身 + 全量 hreflang、**仅收 verified/self-authored 作品**（license 保护内建）、下线即 410/回退列表页。
3. **Studio CTA fail-closed 核查**：`/studio` 与生成功能当前为**已开放**状态（0b201ab 正式上线文案），CTA 不落在功能关闭兜底页；免费浏览/下载路径（`WallpaperDownloadButton`）与 CTA 并列、互不影响。若未来关闭生成，`/studio` 的现有诚实空态可承接，无需改 CTA。

## 四、任务 D：GSC 成效整合（v2 已完成）

输入：用户提供的两份真实导出（28 天，2026-10-25 ~ 11-10）。

| 维度 | Web（2 点击 / 26 展示） | Image（0 点击 / 8 展示） |
|---|---|---|
| 时间曲线 | 展示分散在 10-29 起的 8 天；11-01 产生 2 点击 | **11-09 首现 1 展示、11-10 达 7 展示**，其余为 0 |
| 点击来源 | /about（印度，pos 1）、/（pos 1）、/fr/about（pos 9）——页面表合计 3 点击（口径差异，见 §六） | 无 |
| 查询 | 드림코어 들판（韩语"梦核田野"，pos 6）· ki hintergrundbilder（德语 AI 壁纸，pos 10）· ai 壁紙 アニメ（日语，pos 51）· nebelhaft（63）· wallpaper ki（71） | 드림코어 들판（1 展示，pos 21） |
| 国家 | 韩国 1 点击/8 展示 pos 5.12（唯一有点击）；印度 1/2 pos 1；日本 0/4；德国 0/3 | 日本 0/2；西班牙 0/2；韩国/斯洛伐克/美国/德国各 1 |
| 设备 | 移动 1/12 pos 6.08 · 平板 1/1 · 桌面 0/13 | 桌面 0/6 · 移动 0/2 |

**Web 侧与壁纸相关的展示页**（多为 ko/ja/zh/fr/de/es 变体）：`ko/abandoned-manor-dread`、`ko/dreamcore-floating-room`、`ko/black-hole-voyage`、`ko/b2-magic-forest-well`、`ko/b2-dreamcore-doorfield`、`ja/black-hole-voyage`、`ja/dreamcore-floating-room`、`ja/sakura-tram-station`、`fr/b2-samurai-standoff`、`zh/light-ribbons-wide`、`zh/anime-bedroom-cityscape`、`es/nebula-drift`、`de/wallpapers`。

**Image 侧全部 6 条曝光页恰好集中在 3 个指定 slug**：`ja/b2-dreamcore-doorfield`(2, pos 24.5)、`/wallpapers/b2-dreamcore-doorfield`(2, pos 39.5)、`/wallpapers/b2-magic-forest-clearing`(1, pos 19)、`ko/b2-dreamcore-doorfield`(1, pos 21)、`http://wallhaze.com/de/wallpapers/b2-samurai-standoff`(1, pos 82)、`es/b2-magic-forest-clearing`(1, pos 162)。

**七语言优先级结论**（证据强度标注）：
1. **韩语**：Web + Image 双通道出现查询与展示，且是唯一有点击的国家——但绝对量 1-8 次，**方向性假设，非规模需求**。运营上可优先保证 ko 内容质量。
2. **德语/日语**：各 1 条查询、3-4 次展示——**样本假设**。
3. **其余语言**：无独立查询证据，维持现有 hreflang 结构即可，不做额外投入。

## 五、指定 slug 图片 SEO 逐项实测（v2 任务 1-2-6）

证据：[phase4-v2-probes.json](phase4-v2-probes.json)（21 页 + 3 图片资源 + 3 组 HTTP 301）；明细见 [phase4-image-samples.csv](phase4-image-samples.csv)。

### 5.1 页面信号（3 slug × 7 语言 = 21 页，全部一致）

| 检查项 | 结果 |
|---|---|
| HTTP 状态 | 21/21 = 200 |
| robots meta / X-Robots-Tag | 无 noindex（公开件，正确） |
| canonical | 全部自指（含语言前缀），无跨语言归并 |
| hreflang | 21/21 = 8 条（7 语言 + x-default），互指完整 |
| 主图 `<img>` | 唯一作品图 `/images/wallpapers/<slug>.jpg`，**服务端渲染直出 HTML**，loading=eager，无 srcset、无 width/height |
| alt | 真实语义描述；格式为"本地化标题 — 英文描述"（半本地化，21/21 一致） |
| og:image | 与主图 URL 完全一致（绝对地址），21/21 |
| ImageObject JSON-LD | 21/21 各 1 个：contentUrl=主图、name=本地化标题、license=`/terms#downloads`、creditText/creator=WallHaze、acquireLicensePage —— AI 原创件的诚实授权标注（与 verified 件的 CC0 标注是两套正确设计，非矛盾） |
| 邻近内容 | 主图旁有本地化的风格/分类/尺寸/描述文本（如 ko：스타일 드림코어 · 크기 1536 × 1152 · 4:3）；非英文页描述段仍为英文原文 |
| 设备尺寸 | 已展示（1536×1152 · 4:3 desktop / 1536×864 · 16:9 desktop） |

### 5.2 图片资源（Googlebot-Image 复核）

3 个主图资源：200、`image/jpeg`、`Cache-Control: public, max-age=86400, stale-while-revalidate=2592000`、`cf-cache-status: HIT`；Googlebot-Image UA 同样 200 `image/jpeg`。

### 5.3 HTTP→HTTPS（任务 6）

3 个 slug 的 `http://wallhaze.com/wallpapers/<slug>?utm=test=1` → **301** → `https://` 同路径同查询串（queryPreserved=true）。与 GSC 中 http URL 仍有展示记录相互印证：重定向生效，Google 尚未把展示归并到 https 源，属正常现象。

**结论：21 页无需任何生产代码修复；Image 曝光始于 11-09 属正常爬取节奏，非技术故障。**

## 六、发现路径、CTA 与埋点（v2 任务 3-5）

证据：[phase4-v2-links.json](phase4-v2-links.json) + 详情页 HTML 取证。

### 6.1 Google 的发现路径——已充分

- `/wallpapers`、`/de|ko/wallpapers` 静态 HTML 含**全部 66 个详情 `<a href>` 内链**（3 个目标 slug 均在），主页另有 9 条详情链 + 关联推荐（详情页互相内链，如 Mushroom Circle → 同风格 6 件）。**主图不依赖客户端状态即可出现**——`<img>` 在原始 HTML 中。
- 现有 XML Sitemap 已含全部详情 URL。**是否需要 image sitemap**：现有结构"足够但非最优"——Google 已通过 HTML 发现并展示图片（8 次 Image 展示），image sitemap 的边际收益是加速收录/刷新并补充 image:title/license 信号，建议做（P1）而非"必须"。

### 6.2 分类入口现状（任务 4）

- 唯一静态集合入口是 `/wallpapers`；风格/设备筛选纯客户端，无独立可索引集合页；首页风格卡与详情 CTA 全部指向 `/studio?style=`（创作入口）。
- 集合页可行性（**立即做 / 需素材后做 / 不建议做**）：
  - **不建议**：live wallpaper / minimalist 等——前者无真实视频壁纸库（诚实性），后者 verified+self-authored 支撑 <3 件；
  - **需素材后做**：cyberpunk(5)/sci-fi(7)/anime category(12)——需补库到 ≥8 件且查询有 GSC 证据；
  - **可试点（假设级）**：dreamcore（8 件，唯一达门槛）与 `/wallpapers/phone`（21 件竖版、设备意图明确）二选一。

### 6.3 Studio 转化（任务 5）

- 详情页 CTA：免费 **Download** 按钮（Phone/Tablet/Desktop 三档）与 **Create similar → `/studio?style=<id>`** 并列，语义区分清晰；另有 "Preview the Studio" ×2 → `/studio`。**免费浏览/下载与 AI 创作已区分，无需改 CTA。**
- 埋点现状：**全站零埋点**（无 gtag/GTM/umami/plausible/CF beacon，无 data-event 属性，无 sendBeacon）。最小事件设计（不接第三方）：`wallpaper_download_click {slug, device}`、`create_similar_click {slug, style}`、`studio_preview_click {slug, source}` → 漏斗：详情曝光 → download_click → 下载完成；详情曝光 → create_similar_click → studio 生成提交。先出事件字典，授权后再实施。

## 七、与既有 SEO 检测相矛盾/需澄清之处（任务：额外要求）

| # | 表面矛盾 | 实际结论 |
|---|---|---|
| 1 | GSC 页面表合计（Web 34 展示/3 点击）> 图表汇总（26 展示/2 点击） | GSC 图表与页面表口径不同（提示词已预警），非数据错误；本报告仅以图表汇总为全站口径 |
| 2 | `http://wallhaze.com/`（Web 5 展示）与 `http://.../de/wallpapers/b2-samurai-standoff`（Image 1 展示）出现在 GSC | 与第三阶段 B1 结论一致：HTTP→HTTPS 301 已生效，GSC 按抓取源 URL 计展示，属正常，非故障、不需修改规则 |
| 3 | 第四阶段 v1 判定"sitemap 无 image 元素是 Images 发现主缺口"，但 GSC 显示 Images 已有展示 | 不矛盾：证明 HTML 通道有效，image sitemap 定性从"修复"降级为"加速" |
| 4 | 3 个 slug 的 ImageObject license 指向 `/terms#downloads`，而 v1 抽样的 licensed 件指向 CC0 | 两套授权设计均正确（AI 原创 vs 第三方 CC0），非矛盾 |
| 5 | 前三阶段确认 29 个 b2 前缀页 noindex，本轮 3 个 b2 slug 可索引 | 分类正确：那 29 件是 review-pending，这 3 件是已审公开件 |
| 6 | 「ai 壁紙 アニメ」pos 51 但 ja 详情页内容正常 | **不是技术错误，是 Google 尚未收录/排名的正常状态**；排名低与站龄/外链/竞争相关，不归因页面故障 |

## 八、机会清单与优先级

详见 [phase4-priority.md](phase4-priority.md)（P0 为空；P1×3 / P2×7，每条含证据强度与是否需改代码标注）。与 v1 相比的关键变化：

- image sitemap：从"唯一 P1 技术机会"调整为 P1 加速项（GSC 证明 HTML 通道已在工作）。
- 新增 P1 运营项：Images 通道观察、韩语内容优先（假设级）。
- P0 无：指定 21 页全部健康，**无需修复生产代码**。

## 九、交付物

| 文件 | 内容 |
|---|---|
| [phase4-audit.md](phase4-audit.md) | 本报告 |
| [phase4-priority.md](phase4-priority.md) | P0/P1/P2 ≤10 条优先行动（含无需改代码的运营动作标注） |
| [phase4-image-samples.csv](phase4-image-samples.csv) | 21 行：3 slug × 7 语言的 URL/License/主图/HTTP/robots/alt/OG 一致性/GSC 证据/建议 |
| [phase4-inventory.csv](phase4-inventory.csv) | 105 行作品台账 |
| [phase4-opportunities.csv](phase4-opportunities.csv) | v1 机会明细（被 priority.md 覆盖，保留溯源） |
| [phase4-probes.json](phase4-probes.json) | v1 取证：15 详情 × 双 UA + 4 资源 + sitemap image 检查 |
| [phase4-v2-probes.json](phase4-v2-probes.json) | v2 取证：21 页 + 3 资源 + 3 组 HTTP 301 |
| [phase4-v2-links.json](phase4-v2-links.json) | v2 取证：发现路径内链结构 |
