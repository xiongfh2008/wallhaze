# WallHaze 本地 SEO + AI Overviews 整改报告

- 项目：WallHaze（wallhaze.com）
- 本地代码基线：`master` HEAD `4ab8d10`（领先 GitHub master `7fe4f290`；全程未 pull、未覆盖旧代码）
- 审计方式：本地生产级构建 + dev server（127.0.0.1:3100）真实 HTML 抓取，共 546 个可索引 URL × 7 语言
- 报告日期：2026-11-02
- 结论：**本地 SEO 优化完成，未提交，未部署。**

---

## 1. 版本核查

| 项 | 值 |
|---|---|
| 本地分支 / HEAD | `master` / `4ab8d10` |
| GitHub master | `7fe4f290`（2026-10-28） |
| 关系 | 本地领先，含全部历史修复（AI Studio Coming Soon、退款政策、hello@wallhaze.com、7 语言法律文案、Waffo 披露、Client messages 序列化优化） |
| 本次原则 | 仅在本地新增修改；未覆盖任何历史修复；未执行任何 git 写操作与部署 |

## 2. 扫描范围

- Sitemap loc 条目：546（每条含 8 个 hreflang alternate：7 语言 + x-default，共 4368 个）
- URL 全集：546 = (12 个静态路径 + 66 个公开展示壁纸详情) × 7 语言
- 社区作品：`works.json` 当前 0 个 `published + allowPublicDisplay` 作品，故 sitemap 无社区详情 URL（正确状态，非遗漏）
- 账户私有页（/login /signup /account /credits /my-creations）与待审核素材：noindex，未纳入 sitemap

## 3. 关键指标对比（整改前 → 整改后）

| 指标 | Before | After |
|---|---|---|
| Title 双品牌（WallHaze \| WallHaze） | 39 处 | **0** |
| Meta Description 超长（>165 字符） | 16 处 | **0** |
| 作品详情描述过短（en <70） | 57 处 | **0**（已追加真实规格：宽×高 px + 下载状态） |
| Sitemap loc 条目 | 78（仅默认英语 loc） | **546**（每语言独立 loc） |
| 孤岛可索引页 | 239 | **0** |
| 坏链（sitemap 内） | 8（dev 编译超时误报，复测均 200） | **0** |
| 审计问题总数 | P1=52 / P2=16 / P3=57 | **P1=0 / P2=0 / P3=0** |
| 抓取成功 | 538/546 | **546/546（全 200）** |

## 4. 代表性问题清单（完整明细见 metadata-before/after.csv 等 8 份 CSV）

| 编号 | 优先级 | 页面 | 语言 | 源码文件 | 当前值（修改前） | 问题原因 | 修改后 | 测试结果 |
|---|---|---|---|---|---|---|---|---|
| SEO-001 | P1 | /about 等全站 | 7 语言 | messages/*.json + [locale]/layout.tsx | `About — WallHaze \| WallHaze` | meta title 自带品牌 + `title.template="%s \| WallHaze"` 二次追加 | 各页 title 去除品牌后缀，仅由 template 追加一次（12 处键位修正） | 渲染 HTML `<title>` 复测 0 双品牌 |
| SEO-005 | P2 | /（en） | en | messages/en.json | homeDescription 176 字符 | 描述冗长、堆砌 | 精简至 122 字符，含"AI creation is coming soon"诚实披露 | HTML meta 复测通过 |
| SEO-029 等 8 项 | P1（误报） | /faq、/fr×5、/es/wallpapers/ukiyo-anime-fusion | 多 | — | status=0 | dev server 并发编译超时 | 无需修复；after 复测 546/546 全 200 | PASS |
| SEO-062~118 | P3 | /wallpapers/*（en） | en | wallpapers/[slug]/page.tsx | 描述 44–69 字符，无规格 | 详情描述过短、缺可验证事实 | 追加 ` · {width}×{height}px · 免费下载/授权审核中`（tMeta 命名空间） | 抽查 en/zh 详情页描述含真实尺寸 |
| — | P1 | /sitemap.xml | 全部 | app/sitemap.ts | `absoluteLocaleUrl("en", path)` 仅输出英语 loc（78 条） | 其他语言只出现在 alternates | `routing.locales.map()` 每 locale 独立 loc（546 条），每条 canonical + 7 hreflang + x-default | sitemap-audit-after.csv：546 条 loc 全 200、canonical 全匹配、每条 8 alternate |
| — | P1 | 全部壁纸详情 | 7 语言 | wallpapers/[slug]/page.tsx | 无 BreadcrumbList；孤岛 | 画廊为 client 渐进渲染，无 SSR `<a href>` | /wallpapers 服务端新增"全部壁纸"索引区（66 个 SSR `<Link>`）+ 详情页 BreadcrumbList | 孤岛 239→0；462 页 schema=ImageObject\|BreadcrumbList |
| — | P1 | /（7 语言） | 7 语言 | [locale]/page.tsx | 无 Organization / WebSite | 缺站点级实体 | 新增 @graph：Organization（真实 logo /wallhaze-icon.svg、hello@wallhaze.com、https://wallhaze.com）+ WebSite | schema-coverage-after.csv：7 页 Organization\|WebSite |
| — | P2 | /help | 7 语言 | components/Footer.tsx | Footer 无 help 入口 | 帮助中心无全站入链 | company 列新增 Help 链接 | /help 各语言 inlinks≥1 |
| — | P2 | /community 详情 | — | community/[slug]/page.tsx | VideoObject 类型与时长/发布日不完整 | video 作品仅 CreativeWork | 改为 `["CreativeWork","VideoObject"]` + duration(PT#S) + uploadDate（仅真实存在时输出） | 当前 works.json 为空集；代码就绪待作品发布 |

### 内容文案整改（content-before.csv → content-after.csv 为空表 = 0 遗留）

- 首页 hero / meta 全部改为真实业务状态：免费浏览 + 授权下载开放、AI 生成 Coming Soon、Credits 未开放购买；删除 "Create stunning AI wallpapers" 类误导表述
- FAQ 标题统一为本地化自然问句形式（en "Frequently Asked Questions"、fr "Foire aux questions (FAQ)"、de "Häufige Fragen (FAQ)" 等）；FAQPage Schema 按要求未作为富结果目标添加
- Pricing 文案与真实配置一致（100/$5、500/$20、2000/$69 一次性），checkout 明示未开放
- ja/ko 修正如「创作」→「制作/창작」、aboutTitle/helpTitle/contactTitle 本地化自然化
- Vitest `waffo-review.test.ts` 等 297 项全部通过，验证文案与业务状态一致

## 5. 七语言检查结果（en/zh/ja/ko/es/fr/de）

| 检查项 | 结果 |
|---|---|
| HTTP 状态 | 546/546 全 200（每语言 78 页） |
| Title | 无双品牌、无重复、无缺失；template 统一 `%s \| WallHaze`，每页仅一个 WallHaze |
| Description | 无缺失、无重复、0 项 >165 字符；en 无 <70 字符 |
| Canonical | 546/546 与 locale URL 精确匹配（en 无前缀、其余 /xx 前缀，localePrefix as-needed） |
| Hreflang | 每页 7 语言 + x-default 双向一致，x-default 指向英语；0 个 404 语言链接 |
| og:locale | 全部符合 en_US/zh_CN/ja_JP/ko_KR/es_ES/fr_FR/de_DE |
| H1 | 546/546 恰好 1 个 |
| lang 属性 | zh 页 lang="zh-CN"（简中正确，设计如此）；其余同理 |

## 6. 内链与孤岛页

- 构建真实 HTML `<a href>` 链接图（非 React 源码推断）：首页 → /wallpapers（gallery + 全部壁纸索引区 + Featured/Community 卡片）→ 66×7 壁纸详情 → Footer 全站链接
- clickDepth：首页 0；20 页 depth 1；57 页 depth 2（EN 树全可达）
- 孤岛页（inlinks=0）：**0**
- 观察项（未修复，属增强建议）：语言切换器为 `window.location.assign` 按钮，不输出跨语言 `<a href>`；非英语页面经由 hreflang alternate + sitemap 独立 loc 被发现（两者均已验证存在且正确），对 Google 抓取无障碍。如需纯链接图跨语言爬取，可在未来将切换器改为 SSR `<a>` 链接。

## 7. Schema 覆盖变化

| 类型 | Before | After |
|---|---|---|
| Organization | 0 | 7（每语言首页，真实资料：WallHaze / https://wallhaze.com / hello@wallhaze.com / wallhaze-icon.svg） |
| WebSite | 0 | 7（与 Organization 同 @graph） |
| BreadcrumbList | 0 | 462（全部壁纸详情：Home → Wallpapers → 作品） |
| ImageObject | 461 | 462（读取真实图片字段） |
| CreativeWork / VideoObject | 0 | 代码就绪（类型合并 + duration + uploadDate，仅 video 且有时长才输出）；当前 0 个已发布社区作品故无实例 |
| Product / Offer | 0 | 0（Credits 未开放购买，不伪造 InStock） |
| FAQPage | 0 | 0（按任务要求不作为富结果目标） |
| 有 JSON-LD 的页面 | 461 | 469（其余 77 页为静态内容页，按设计无 Schema） |

## 8. 竞品结构对比（2026-11-02 实测公开页面，未伪造）

| 维度 | WallHaze（整改后） | wallhaven.cc | wallpapers.com | unsplash.com |
|---|---|---|---|---|
| Canonical | 每页精确匹配 | 未检出 | 有 | Unverified（401 反爬） |
| Hreflang | 7 语言 + x-default | 无 | 13 项 | Unverified |
| JSON-LD | Organization\|WebSite + ImageObject\|BreadcrumbList | 无 | 2 块 | Unverified |
| 多语言 sitemap loc | 每语言独立 loc（546 条） | 单语 | — | Unverified |
| Meta Description 规范 | 0 超长、0 重复 | — | 138 字符（合规） | Unverified |

## 9. GSC 状态

**Not Verified** —— 无 Google Search Console 权限，本次仅本地整改；按任务要求未提交 sitemap。

## 10. 本地构建与测试

| 项 | 结果 |
|---|---|
| Vitest | 297/297 通过 |
| TypeScript（tsc --noEmit） | 通过 |
| ESLint | 0 errors（13 条为预先存在的脚本警告） |
| next build | 成功（700+ 壁纸路径预渲染） |
| vite build:vinext | 成功 |

## 11. 修改文件清单

代码（14 个修改 + 1 个新增脚本 + 审计产物）：

- `apps/web/messages/{en,zh,ja,ko,es,fr,de}.json` — title 去品牌、description 重写、FAQ/帮助等键
- `apps/web/app/sitemap.ts` — 每 locale 独立 loc
- `apps/web/app/[locale]/page.tsx` — Organization + WebSite @graph
- `apps/web/app/[locale]/wallpapers/page.tsx` — SSR 全部壁纸索引区（修孤岛）
- `apps/web/app/[locale]/wallpapers/[slug]/page.tsx` — 规格化描述 + BreadcrumbList
- `apps/web/app/[locale]/community/[slug]/page.tsx` — CreativeWork|VideoObject + BreadcrumbList
- `apps/web/components/Footer.tsx` — Help 入链
- `apps/web/package.json` — `npm run seo:audit`
- `apps/web/scripts/seo-audit.mjs` — 新增审计脚本（含修复：BFS 根 URL 尾斜杠种子、sitemap 逐条 alternate 计数）

审计产物（`apps/web/docs/seo-audit/`）：seo-report.md（本文件）、seo-report-before/after.md、metadata-before/after.csv、content-before/after.csv、internal-links-before/after.csv、orphan-pages-before/after.csv、sitemap-audit-before/after.csv、schema-coverage-before/after.csv、page-inventory.csv（546 行）

## 12. 总结（任务要求的 10 项数字）

1. **已确认问题数**：125（P1=52、P2=16、P3=57；其中 8 项 P1 为 dev 编译超时误报）
2. **已修复问题数**：117（全部真实 P1/P2 及全部 P3；8 项误报经复测确认非问题）
3. **尚未修复问题**：0（1 项观察建议：语言切换器无 SSR 跨语言 `<a>`，见第 6 节）
4. **修改文件列表**：见第 11 节（7 个语言文件 + 6 个代码文件 + package.json + 1 个新脚本）
5. **七语言检查结果**：7 语言 546/546 全 200；title/description/canonical/hreflang/og:locale/H1 全部合规
6. **Sitemap 前后 URL 数**：78 → 546（独立 loc），每条 8 alternate 全部正确
7. **Schema 覆盖变化**：461 → 469 页；新增 Organization×7、WebSite×7、BreadcrumbList×462；不伪造 Product/Offer
8. **孤岛页数量**：239 → 0
9. **GSC 是否已验证**：Not Verified（无权限；未提交 sitemap）
10. **本地构建和测试结果**：Vitest 297 通过、tsc 通过、ESLint 0 errors、next build 成功、vite build:vinext 成功

**本地 SEO 优化完成，未提交，未部署。**
