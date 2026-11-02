# WallHaze — SEO 上线前最终独立复核报告

- 日期：2026-11-02
- 复核方式：独立实现检查逻辑（`scripts/seo-final-review.mjs` 等 4 个新脚本），不复用 `seo-audit.mjs` 的解析/BFS/统计代码路径
- 数据来源：本地生产级 dev server（127.0.0.1:3100）真实渲染 HTML + sitemap.xml + 图片二进制文件头实测
- 结论：**SEO 独立复核完成，未提交，未部署。**

---

## 1. 本地 HEAD 与 Git 状态

| 项 | 值 |
|---|---|
| HEAD | `4ab8d10cf92ef13d1b04f46ebc3c91cfd1213266`（复核全程未变） |
| 分支 | `master` |
| `git diff --check` | 通过（无空白错误） |
| Git 写操作 | 无（未 add/commit/push/pull/reset/clean） |
| works.json | 已确认未变（VideoObject 探测后字节级还原并经 `Buffer.compare` 验证） |

## 2. 14 个修改文件实际清单（`git status --short` 实时输出）

1. `apps/web/app/[locale]/community/[slug]/page.tsx`
2. `apps/web/app/[locale]/page.tsx`
3. `apps/web/app/[locale]/wallpapers/[slug]/page.tsx`
4. `apps/web/app/[locale]/wallpapers/page.tsx`
5. `apps/web/app/sitemap.ts`
6. `apps/web/components/Footer.tsx`
7. `apps/web/messages/de.json`
8. `apps/web/messages/en.json`
9. `apps/web/messages/es.json`
10. `apps/web/messages/fr.json`
11. `apps/web/messages/ja.json`
12. `apps/web/messages/ko.json`
13. `apps/web/messages/zh.json`
14. `apps/web/package.json` ✅ 确认为第 14 个修改文件

新增未跟踪：`scripts/seo-audit.mjs`（上轮）+ 本轮复核工具 4 个（`seo-final-review.mjs`、`waffo-raw-check.mjs`、`seo-metadata-stats.mjs`、`videoobject-probe.mjs`）+ `docs/seo-audit/` 审计产物。

## 3. 546 URL 独立检查结果

URL 集合由独立解析 sitemap 逐 `<url>` 块动态推导（未硬编码）：
12 静态路径（`/`、`/wallpapers`、`/studio`、`/community`、`/about`、`/faq`、`/help`、`/contact`、`/pricing`、`/privacy`、`/terms`、`/acceptable-use`）+ 66 个公开壁纸 slug + 0 个社区详情，× 7 语言 = **546**，与 sitemap 546 条 loc 完全一致，无重复 loc。

| 检查项 | 结果 |
|---|---|
| HTTP 状态 | 546/546 全部 200，0 非成功响应 |
| 最终 URL / 重定向 | 无异常重定向 |
| Title | 546/546 存在，0 缺失，全站重复 1 处（见第 13 节 F-1，已修复） |
| Meta Description | 546/546 存在，0 缺失，0 重复，0 条 >165 字符 |
| Canonical | 546/546 与自身 locale URL 精确一致（en 无前缀、其余 `/xx` 前缀），0 跨域 |
| Robots/noindex | 546 页均无可索引页误标 noindex（`indexable-but-noindex`=0） |
| H1 | 546/546 恰好 1 个 |
| SSR 实际正文 | 全部页面均有 SSR 正文；`/wallpapers` 页含 126 个详情 SSR `<a href>`（66 公开 + 待审核卡片，独立抓取实证） |
| 软 404 | 0（对照探测：不存在路径实测返回 404 状态；546 页 title/H1 均未命中 9 种语言的 404 文案标记；重复正文哈希组=0） |
| 重复页面正文 | 0 组（SHA-1 可见文本哈希全站比对） |
| Hreflang | 每页 7 语言 + x-default；4368 对 alternate 双向一致校验 broken=0；x-default 全部指向英文 |
| Sitemap 收录 | URL 全集即 sitemap loc 集合；每块 8 个 alternate 数量异常=0 |
| 待审核作品页（站外链接目标） | 全部输出 `noindex, nofollow`（实证 sakura-nights 等） |
| `?style=` 等查询参数变体（245 个被链接的非 sitemap URL） | 均 200，canonical 剥离查询参数指向基础路径，无重复索引风险 |

## 4. 每种语言的孤岛页数量

7 个语言首页（`/`、`/zh`、`/ja`、`/ko`、`/es`、`/fr`、`/de`）分别建立独立 HTML `<a href>` BFS 链接图（仅统计真实 `<a href>`，不使用 sitemap、hreflang alternate、onClick 或 `window.location.assign`）：

| locale | totalIndexable | reachableFromHome | orphanCount | maxDepth | brokenLinks |
|---|---|---|---|---|---|
| en | 546 | 78 | 468 | 2 | 0 |
| zh | 546 | 78 | 468 | 2 | 0 |
| ja | 546 | 78 | 468 | 2 | 0 |
| ko | 546 | 78 | 468 | 2 | 0 |
| es | 546 | 78 | 468 | 2 | 0 |
| fr | 546 | 78 | 468 | 2 | 0 |
| de | 546 | 78 | 468 | 2 | 0 |

**78 与 546 两种统计口径的关系（必须说明）**：

- **78** = 单语言首页 HTML 链接图可达的**本语言逻辑路径集**（12 静态 + 66 作品）。语言切换器是 JS 按钮（`window.location.assign`），不输出跨语言 `<a href>`，因此每种语言的纯 HTML 链接图是语言内闭合的——每个 locale 图内 78 页全部可达、无语言内孤岛。
- **546** = 全站可索引 URL 总集。per-locale 视角的 468 "orphan" 是**其他 6 种语言的页面**，并非真实孤岛。
- **全局入链视角（跨语言合并全部页面的 `<a href>`）**：全局孤岛 = **0**（每个 546 URL 都有 ≥1 个站内 HTML 入链）。
- 三种发现通道严格区分：① 站内 HTML 入链——每语言 78 页全连通（全局入链 546/546）；② Sitemap 发现——546 条独立 loc 全部可被发现；③ Hreflang 语言关联——546×8 alternate 全部有效且双向一致。
- 上轮报告的 "orphan=0" 指全局入链口径（78 个逻辑路径无孤岛）；本轮以三种口径分别验证，结论一致：**无真实孤岛，无需修复。**

## 5. 每种语言的点击深度分布

| locale | depth 0 | depth 1 | depth 2 | depth ≥3 |
|---|---|---|---|---|
| en | 1（首页） | 20 | 57 | 0 |
| zh | 1 | 20 | 57 | 0 |
| ja | 1 | 20 | 57 | 0 |
| ko | 1 | 20 | 57 | 0 |
| es | 1 | 20 | 57 | 0 |
| fr | 1 | 20 | 57 | 0 |
| de | 1 | 20 | 57 | 0 |

结构：首页(0) → 11 个静态页 + 画廊(1) → 66 作品详情(2)。7 语言完全一致，maxDepth=2。

## 6. Schema 各类型覆盖数量（逐 URL 解析 546 页实际 JSON-LD）

| 类型 | 数量 | 备注 |
|---|---|---|
| Organization | 7 | 全部 7 个语言首页 |
| WebSite | 7 | 与 Organization 同 @graph |
| BreadcrumbList | 462 | 全部壁纸详情页 |
| ImageObject | 462 | 全部壁纸详情页 |
| CreativeWork \| VideoObject | 0 实例 | 代码就绪（见第 8 节端到端验证）；当前 0 个已发布社区作品 |
| Product / Offer | 0 | Credits 未开放，不伪造（符合要求） |
| FAQPage | 0 | 不作为富结果目标（符合要求） |
| JSON-LD 解析错误 | 0 | 全部块 `JSON.parse` 通过 |
| 注入安全 | 通过 | 所有 JSON-LD 块中无裸 `<script`；`<` `>` `&` 均正确转义（含用户投稿类字段渲染路径） |
| BreadcrumbList 校验 | 0 缺陷 | 462 页 position 严格 1..n 递增；item URL 全部为站内真实存在 URL（Home → /wallpapers → 当前页，均 200）；与页面导航一致 |

## 7. 组织 @id 一致性检查

7 个语言首页 Organization 节点：

- **@id 全部唯一且相同：`https://wallhaze.com/#organization`**（distinct @id = 1，未创建 7 个互不关联实体）✅
- name：全部 `WallHaze` ✅
- url：全部 `https://wallhaze.com` ✅
- logo：全部 `https://wallhaze.com/wallhaze-icon.svg` ✅
- email：全部 `hello@wallhaze.com` ✅

## 8. 视频结构化数据验证

当前 `works.json` 无已发布社区视频（0 条）。按要求对未来发布路径做**端到端临时探测**（`scripts/videoobject-probe.mjs`）：

1. 向 `works.json` 注入一条合法 published 视频作品（复用已过审真实素材 `/videos/live-demos/aurora-veil.mp4` + `/images/wallpapers/aurora-veil.jpg`，未生成任何新媒体）；
2. 实测 `/community/demo-909` 渲染结果：JSON-LD 输出 **`@type: ["CreativeWork","VideoObject"]`**，`duration: "PT5S"`（来自真实 durationSeconds）、`uploadDate: "2026-11-02T00:00:00.000Z"`（来自真实 publishedAt 字段）、`thumbnailUrl`（poster，实测 200）、`contentUrl`（mp4，实测 200 / video/mp4）全部正确生成；
3. sitemap 同步包含该社区详情 URL；
4. **测试后 works.json 已字节级还原**（`Buffer.compare` 验证 true），未发布任何内容。

代码层同时确认：`normalizeCommunityWork` 强制视频作品必须有 `durationSeconds > 0` 与公开 poster；`uploadDate` 仅在真实存在时输出，不会编造日期。

## 9. 66 个作品的内容独特性结果

超出任务要求：对全部 **462 个作品页（66 作品 × 7 语言）** 完成全量比对（非仅 en + 抽查）：

| 检查项 | 结果 |
|---|---|
| Title 重复 | 462 页中 0 组重复（1 处跨语言同形见第 13 节 F-1，已修复） |
| H1 重复 | 0 组 |
| Meta Description 重复 | 0 组 |
| 首段重复 | 6 组——均为同一来源/同一作者的两幅作品共享"来源：X · 作者 · 授权"标注行（真实来源数据，两作品描述正文不同），**非模板空洞描述，判定非缺陷** |
| 归一化首段近似重复 | 6 对（同上，同为来源行） |
| 真实宽高 | 462 页全部实测：下载 ImageObject contentUrl 的图片二进制（JPEG/PNG 头解析），实测宽高与 Schema 标注 **462/462 完全一致，0 偏差** |
| 下载状态符合授权 | 授权审核中作品（如 sakura-nights）：noindex + "Download unavailable"、无下载入口 ✅；可下载作品（CC0/自研）：显示 License verified / Original WallHaze artwork + 下载 ✅；0 处把预览标为下载 |
| 图片 Alt | 0 处关键词堆砌（超长/重复词检测） |
| 模板化描述 | 0 处——描述含真实规格（尺寸/授权/来源），非仅 "width × height + download available" 拼接 |

## 10. Waffo 合规回归结果

检查 11 个路径 × 7 语言（`/`、`/contact`、`/terms`、`/privacy`、`/faq`、`/help`、`/about`、`/studio`、`/pricing`、`/acceptable-use`、`/community`），覆盖四个层：可见正文、Title/Meta、OG/Twitter、JSON-LD、原始 HTML/RSC 序列化载荷（`scripts/waffo-raw-check.mjs` 逐页扫描原始字节）：

| 检查项 | 结果 |
|---|---|
| 1. hello@wallhaze.com 为官方客服邮箱 | ✅ 全部 7 语言 /contact 可见正文 + RSC 层均含 |
| 2. Contact 不再声明无官方客服渠道 | ✅ "no official (customer) support/service channel" 类声明 0 命中（可见 + RSC 层） |
| 3. AI Studio 为 Coming Soon | ✅ en "Coming Soon"；zh「即将上线/即将推出/敬请期待」、ja「近日公開」、ko「출시 예정/곧」、es「Próximamente」、fr「Bientôt」、de「Bald」逐语言实证 |
| 4. Credits 购买仍未开放 | ✅ "buy credits now" / "credits available" 类声明 0 命中 |
| 5. 不提供不存在的实时 AI 生成 | ✅ en 首页 CTA 为 "Start Creating **(soon)**"（明确披露未开放），/studio 均为 Coming Soon，无 "generate your wallpaper now" 类表述 |
| 6. 退款条款没有回退 | ✅ /terms 全部 7 语言含退款条款 |
| 7. 120 天退款期限起算基准 | ✅ en 实测原文 "…within **120 days from the date of product delivery**"，起算基准（交付日）未被 SEO 改写破坏 |
| 8. 无无依据的商业化/版权声明 | ✅ 未检出 |

> 说明：首页页脚含 "Coming Soon"（Studio 链接旁的诚实披露）与首页 hero 脚注 "AI creation coming soon" 属于对未开放状态的如实标注，符合第 3 项要求，不计为违规。

## 11. GSC 状态

**Not Verified** —— 无 Google Search Console 权限。本轮未提交 sitemap、未更改任何 GSC 配置。

## 12. 测试结果（以真实 package.json 命令为准）

| 命令 | 结果 |
|---|---|
| `npm run seo:audit`（既有脚本） | P1=0 P2=0 P3=0，orphans=0，brokenKnown=0，brokenUnknown=0，universe=546 |
| 独立脚本 `scripts/seo-final-review.mjs`（run#2） | 546/546 200、软 404=0、重复正文=0、hreflang broken=0、坏链=0、全局入链孤岛=0、图片尺寸 462/462 一致 |
| **两套脚本统计对比** | **零统计分歧**（universe、状态码、孤岛、坏链、schema 覆盖完全一致） |
| `npm run test`（Vitest） | 39 文件 / **297/297 通过** |
| `npm run typecheck`（tsc --noEmit） | 构建前报 3 个 `.next/types/validator.ts` 错误（dev 产物与 tsc 不兼容，见第 13 节 F-4）；`next build` 后复测 **exit 0 通过** |
| `npm run lint`（eslint） | **0 errors**，13 条警告（全部为预先存在的脚本警告；本轮新增脚本产生的 5 条已清理） |
| `npm run build`（next build） | 成功（748 条路径预渲染） |
| `npm run build:vinext`（vite build） | Build complete |
| dev 编译超时误报 | 未出现（上一轮曾有的 status=0 误报类别本轮为 0） |

## 13. 新发现的问题和修复详情

状态分类：Confirmed / Fixed / Not Reproducible / Manual Verification Required。

### F-1 【Confirmed → Fixed】/fr/contact 与 /contact Title 完全相同

- **URL**：`https://wallhaze.com/fr/contact`、`https://wallhaze.com/contact`
- **文件路径**：`apps/web/messages/fr.json`
- **问题原文**：两页 `<title>` 均为 `Contact | WallHaze`（546 页中唯一重复 title，独立统计实证）
- **实际原因**：法语 "Contact" 与英文同形，meta 键 `meta.contactTitle` 均为 "Contact"，模板统一追加 `| WallHaze` 后完全同形
- **修改方案**：fr.json `meta.contactTitle: "Contact" → "Nous contacter"`（自然法语，仅影响 meta title，H1/导航不受影响）
- **是否已修复**：✅ 已修复
- **如何验证**：复测 `/fr/contact` title 为 `Nous contacter | WallHaze`，`/contact` 为 `Contact | WallHaze`，不再重复

### F-2 【Confirmed → Fixed】自研作品 ImageObject 缺 license/creator（350 页）

- **URL**：全部 50 个自研（self-authored）作品 × 7 语言，如 `https://wallhaze.com/wallpapers/b2-cyber-alley-cat`
- **文件路径**：`apps/web/app/[locale]/wallpapers/[slug]/page.tsx`
- **问题原文**：ImageObject 仅有 contentUrl/name/description/url/width/height，`license` 与 `creator` 字段缺失（独立解析实证 350 页；有来源的 16 个作品 × 7 = 112 页的 CC0 license/creditText 正常）
- **实际原因**：JSON-LD 构造仅在 `wallpaper.source` 存在时输出 license/creditText，自研作品无 source 字段即整块省略
- **修改方案**：为 `license === "self-authored"` 补充 `creator: { "@type": "Organization", name: "WallHaze" }` 与 `license: https://wallhaze.com/terms`（站点条款 "Downloads and Licenses" 节即真实许可文件，不伪造外部许可 URL）
- **是否已修复**：✅ 已修复
- **如何验证**：复测 b2-cyber-alley-cat 等 4 个样本页 ImageObject 均含 creator=WallHaze + license=/terms；CC0 页（sakura-dream、galaxy-tide）保持原 license URL + creditText 不变；`npm run build` 通过

### F-3 【Not Reproducible】上轮审计结论复核

- 546/546 全 200、软 404=0、重复正文=0、hreflang 双向一致、坏链=0、孤岛=0（全局口径）、canonical 全自指、sitemap 546 loc 无重复、每块 8 alternate —— 全部用独立实现复现成立，**未发现统计口径错误或审计脚本漏检导致的虚报**。
- 上轮遗留观察项（语言切换器无 SSR 跨语言 `<a>`）保持原状：三通道（HTML 入链 / sitemap / hreflang）均可达，非缺陷，属可选增强。

### F-4 【Not Reproducible → 已用构建消除】typecheck 首测 3 个错误

- **文件路径**：`.next/types/validator.ts`（生成物，非源码）
- **问题原文**：`TS2305: Module '"./routes.js"' has no exported member 'AppRoutes'/'LayoutRoutes'/'ParamMap'`
- **实际原因**：长期运行的 `next dev` 写入的 `.next/types` 与 tsc 期望的构建产物不兼容，属环境伪影，非代码缺陷
- **是否已修复**：✅ `npm run build` 重新生成后 `tsc --noEmit` exit 0
- **如何验证**：构建后重跑 `npm run typecheck` 通过

### 复核工具自身误报（已修正判定，非站点缺陷）

- 我的初版 `toProd()` 将绝对 PROD URL 误判为外链 → hreflang 4368 假阳性；修正后 run#2 broken=0。
- 初版 BFS en 种子含尾斜杠（正是任务书点名的坑，出现在复核脚本自身）→ 修正后 en reachable=78。
- Waffo 正则将 "Start Creating (soon)"、页脚 "Coming Soon" 诚实披露、"120 days" 的非英语等价表述误判为违规 → 逐项人工核实后判定合规。

## 14. 尚待人工验证的问题

| # | 事项 | 原因 |
|---|---|---|
| 1 | GSC 验证、sitemap 提交、抓取统计 | 无 GSC 权限（Not Verified）；按任务边界禁止提交 |
| 2 | 生产域名（wallhaze.com）线上行为 | 本轮全部验证基于本地生产级渲染；CDN/Cloudflare 缓存、生产中间件行为未测（禁止部署） |
| 3 | `https://wallhaze.com/terms` 作为自研作品 ImageObject license 目标的语义认可度 | URL 真实且含许可条款，但 Google 对 license 字段的具体取值偏好需上线后通过 Rich Results / Search Console 观测 |
| 4 | VideoObject 真实发布流程 | 已做端到端临时探测并通过；真实社区视频发布后的富结果表现需 GSC 验证后观测 |
| 5 | 图片 sitemap（Google Images 专用扩展） | 当前 ImageObject + 常规 sitemap 已覆盖；是否增设图片 sitemap 属增强决策，需产品确认 |

---

**SEO 独立复核完成，未提交，未部署。**

本轮共确认 2 个真实缺陷（F-1 标题重复、F-2 Schema 许可字段缺失），均已修复并回归验证；其余检查项独立复现上轮结论，未发现审计脚本漏检、统计口径错误、Schema 虚假数据、页面重复内容或 Waffo 合规回退。
