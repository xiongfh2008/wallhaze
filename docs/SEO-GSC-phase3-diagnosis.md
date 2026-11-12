# WallHaze GSC 第三阶段诊断 — 「已发现/已抓取 - 尚未编入索引」26 条（2026-11-12）

只读诊断。未修改任何代码、License、索引规则、Cloudflare 配置；未 commit/push；未部署。

## 一、覆盖率与校验

- **26/26 已实测**（两份 ZIP `表格.csv` 逐条与提示词比对：15+11 条 URL、分组、抓取日期**完全一致，无重复无丢失**）。
- 17 个 slug License 全部核对（见下表）。
- 当前 sitemap **546 URL** 全量比对：24/26 命中（4 条 Studio 参数页不命中——设计正确，sitemap 只列语言版裸 `/studio`；2 条 http:// 不命中——GSC 历史旧址）。
- `图表.csv` 交叉确认：已发现 334→15（11-06→11-07）、已抓取 37→11（11-06→11-07）。图表止于 11-09，逐 URL 抓取日期到 11-11——不能把记录视作部署前历史。
- 15 条「已发现」的 `1970-01-01` 全部按**未记录抓取占位**处理，未当作实际日期。

## 二、分类结果（B=0，无技术故障）

| 类别 | 定义 | 数量 | 构成 |
|---|---|---|---|
| **C 索引目标但 Google 尚未选择收录** | 200 + 无 robots 阻断 + canonical 自指 + 在 sitemap + 内链可抓取 | **21** | 已发现 15（13 详情 + `/ja/wallpapers` + `/ko/about`）+ 已抓取壁纸 6 |
| **A 正常非索引目标** | Studio 参数页 canonical 归并设计 | **4** | `/de/studio?style=low-poly`、`/ko/studio?style=cozy-anime`(http)、`/studio?media=video&demo=mecha-awakening`、`/studio?style=dark`(http) |
| **D License 待审不应索引** | review-pending 设计性 noindex | **1** | `/ja/wallpapers/last-train` |
| **B 技术错误** | — | **0** | — |
| **E 缺证据** | — | **0** | — |

**无需任何代码修复。未把 C 归类成 B。**

## 三、17 个 slug License 核对

| slug | License | 索引预期 | 涉及 GSC 条目 |
|---|---|---|---|
| galaxy-tide | verified | 应索引 | C |
| sunset-platform | verified | 应索引 | C（es+en 两条） |
| quiet-bridge | verified | 应索引 | C |
| aurora-veil-wide | verified | 应索引 | C |
| quiet-geometry | verified | 应索引 | C |
| sakura-dream | verified | 应索引 | C |
| b2-mech-pilot-gaze | self-authored | 应索引 | C（es+en 两条） |
| synthwave-car-sunset | self-authored | 应索引 | C |
| b2-vaporwave-mall | self-authored | 应索引 | C（fr+en 两条） |
| dragon-sky-citadel | self-authored | 应索引 | C |
| b2-race-future-circuit | self-authored | 应索引 | C |
| retro-motel-alien-sky | self-authored | 应索引 | C |
| b2-lofi-rain-window | self-authored | 应索引 | C |
| b2-vaporwave-bust | self-authored | 应索引 | C |
| b2-interstellar-gate | self-authored | 应索引 | C |
| soft-horizon | self-authored | 应索引 | C |
| **last-train** | **review-pending（无 license 字段）** | **不应索引（noindex）** | D |

## 四、逐项证据

### 4.1 C 类 21 条（索引目标，Google 尚未选择收录）

全部实测：**HTTP 200、无重定向、无 robots meta、无 X-Robots-Tag、canonical 语言自指、在当前 546 sitemap 中**（`probe: phase3-26-url-evidence.json`）。关键项双 UA（browser/Googlebot）一致，S:0 未复现。

- **13 条已发现详情页**（es/fr/ko/en 各语言）：GSC 未记录抓取（1970-01-01 占位）——属"已发现待抓"，**不是服务器故障**。内链充分（详情页实测 36-37 个 `<a href>`，来自 related 卡片/首页精选/Footer）。
- **`/ja/wallpapers`**：200、canonical 自指、在 sitemap、**159 个锚点**（语言页脚 + 筛选器 + 全部卡片）、SSR title/description 完整（「壁紙ギャラリー — 無料壁紙」）。
- **`/ko/about`**：200、canonical 自指、在 sitemap、26 个锚点、SSR title「사이트 소개」完整。
- **6 条已抓取详情页**（含 `sakura-dream`）：已抓取但未选择收录。`sakura-dream`（verified 对照样本）实测内链 37 锚点、在 sitemap、无任何技术阻断——**GSC 时间差内的正常竞争/评估滞后，非缺 License**。
- **跨轮对照（last-train 与 sakura-dream）**：`/es/wallpapers/last-train`（前轮 noindex 排除）与 `/ja/wallpapers/last-train`（本轮已抓取未收录）为**同一 slug 不同语言，状态一致不矛盾**——last-train 无 license 字段，两个语言版本当前都输出 noindex，本轮已抓取记录为占位日期前的历史行为。`sakura-dream` 在前轮是**对照样本**（verified、可索引），本轮"已发现未抓取"只是 Google 抓取排队，无矛盾。

### 4.2 A 类 4 条 Studio 参数页（canonical 归并设计正确）

| URL | 实测 canonical | 判定 |
|---|---|---|
| `/de/studio?style=low-poly` | `https://wallhaze.com/de/studio`（参数剥离）✓ | 归并正确 |
| `/studio?media=video&demo=mecha-awakening` | `https://wallhaze.com/studio` ✓ | 归并正确 |
| `http://wallhaze.com/ko/studio?style=cozy-anime` | 301 → `https://wallhaze.com/ko/studio?style=cozy-anime` → canonical `/ko/studio` | 双重归并正确 |
| `http://wallhaze.com/studio?style=dark` | 301 → `https://wallhaze.com/studio?style=dark` → canonical `/studio` | 双重归并正确 |

**不需要也不应该**为消除 GSC 数字把参数页强制独立索引——canonical 归并是标准做法。参数页的 `?style=` 预选功能保持不变（无任何改动）。

### 4.3 http:// Studio 旧网址复核（B1 修复后状态确认）

两条 http 旧址实测 **Cloudflare 301 单跳 → 正确 HTTPS URL，查询参数完整保留**（`?style=cozy-anime`、`?style=dark` 均未丢失）。GSC 中的这两条是 B1 修复前的历史记录，当前已规范化，无需操作。

### 4.4 内链可抓取性（要求第 8 项）

- 壁纸卡片：next-intl `Link` → 纯 `<a href>`（[FeaturedWallpapers.tsx#L40-L43](../../apps/web/components/FeaturedWallpapers.tsx)、[L148-L151](../../apps/web/components/FeaturedWallpapers.tsx)）。
- 列表页与详情页 related 区均用同一卡片组件；Footer 提供 `/wallpapers`、`/about` 语言感知链接（[Footer.tsx#L56](../../apps/web/components/Footer.tsx)、[L69](../../apps/web/components/Footer.tsx)）。
- 实测锚点数：详情页 36-37、`/ja/wallpapers` 159、`/ko/about` 26。
- **结论：无内链缺陷，无需修复。**未发现"薄内容"的可观察证据（各页均有真实 title/description/H1/正文与 JSON-LD）。

## 五、可选改进（非缺陷、不阻塞）

1. **GSC 操作**：对 21 条 C 类可在「网址检查」中对高价值页（如 `/wallpapers/sakura-dream`、`/ja/wallpapers`）请求编入索引加速抓取；不保证收录，不需为低优先页逐条操作。
2. **内容**：无基于证据的内容质量缺陷；不建议为提升收录而批量改文案。
3. **last-train**：与前轮一致——推进该 slug 的 License 审查，通过后自动恢复索引。

## 六、按优先级的最小修复范围

| 优先级 | 事项 | 类型 | 是否执行 |
|---|---|---|---|
| 1 | 无 | — | **本轮无需任何代码/配置修复** |
| 2 | GSC 高价值页请求编入索引（21 条 C 类中挑选） | 运营操作 | 可选 |
| 3 | last-train License 审查（2 个语言 URL 受影响） | 产品流程 | 可选 |

## 七、交付物

| 文件 | 内容 |
|---|---|
| [docs/seo-gsc-evidence/phase3-26-url-audit.csv](seo-gsc-evidence/phase3-26-url-audit.csv) | 26 行逐条：GSC 原因/日期、语言、类别、slug、License、sitemap 命中、HTTP/robots/X-Robots-Tag/canonical、索引目标、结论类别、证据路径、修复必要性 |
| [docs/seo-gsc-evidence/phase3-26-url-evidence.json](seo-gsc-evidence/phase3-26-url-evidence.json) | 原始取证：逐条 GET 响应链/头/原始 head、双 UA、17 slug License、sitemap 交集、GSC 图表、内链审计；不可验证项显式标注 |
| 本报告 | 分类结论 + 修复范围 |
