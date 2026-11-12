# WallHaze — GSC 索引诊断报告（第一阶段：证据采集，未改代码）

日期：2026-11-12 ｜ 执行者：Trae（GLM）
仓库：`D:\Project\wallhaze`，分支 `master`，HEAD `3fcf97e`（= `0b201ab` + 审计报告产物，索引相关代码自 `0b201ab` 无变化）
工作区状态：审计开始时干净（仅未跟踪 `.vscode/`）；本次审计**未修改任何代码**。
授权范围：仅审计与本地测试，未 push、未部署、未触碰生产数据/支付/生成服务。

---

## 1. GSC 数字与本次独立证据的对照（结论先行）

| GSC 数据（2026-11-12 导出，统计截至 11-09） | 本次独立验证 | 结论 |
|---|---|---|
| 已知 URL 803 / 已收录 562 | sitemap 实测 **546** 个 URL，与历史基线一致 | 562 > 546 **不能定义为异常**：GSC 报告范围为"所有已知网页"（含 sitemap 外发现的 URL）。需 URL 明细才能归因 |
| noindex 142 | 仓库设计性 noindex = **7 条私密路由 × 7 语言 = 49 个变体**（login/signup/account/account-settings/account-orders/credits/my-creations），生产样本确认无公开页误加 noindex | 142 与 49 差距大，**缺少 GSC URL 明细，不得归因**（可能是 query 变体、历史 URL、或抓取期渲染态）→ D 类待查 |
| 备用网页（有适当规范标记）58 | 生产样本确认：`/en/*` 前缀 URL 会 307 到无前缀 URL 且 canonical 自指无前缀地址；sitemap 全部为无前缀 canonical | 58 与 `/en/*` 变体数量级一致，是**合理假设但未证实** → 需 URL 明细 |
| 重定向 8 / 重复 5 / 404 2 / 已发现未收录 15 / 已抓取未收录 11 | 未获取 URL 明细 | 全部 → D 类，不虚构归因 |
| robots 屏蔽但已收录 0 | robots.txt 实测 `Allow: /`，仅声明 sitemap | 正常 |

**重要**：GSC 统计最后日期 11-09，早于 11-11 部署（`65b6f7fa`），不能用于评估该部署效果。

## 2. 线上 HTTP 实测证据（原始响应，非浏览器渲染）

### 2.1 robots.txt 与 sitemap ✅

- `https://wallhaze.com/robots.txt` → 200，`User-Agent: * / Allow: /`，`Sitemap: https://wallhaze.com/sitemap.xml`
- `sitemap.xml` → 200（application/xml），**单文件 urlset，546 个 `<loc>`**，每条带完整 xhtml hreflang（en/zh/ja/ko/es/fr/de + x-default，双向闭合），URL 全部为 https、非 www、无前缀 canonical 形态
- 实测 URL 数与 seo:audit 的 546 基线一致（见 §4）

### 2.2 样本页双 UA 对比（browser / Googlebot 样式 / bingbot 样式 UA）

样本（全部来自真实 sitemap，无猜测 URL）：
`/zh /ja /ko /es /fr /de /pricing /about /wallpapers/sakura-dream`

**所有样本 × 3 UA：状态 200、最终 URL 无重定向、HTML 字节级一致（无 UA 差异缓存）**，且：

| 字段 | 结果 |
|---|---|
| `<title>` / description 在原始 `<head>` 内 | 全部 ✅（head 长度 ~10.5KB，title 位于 ~3050 字节处） |
| robots meta / X-Robots-Tag | 无任何 noindex（公开页 ✅） |
| canonical | 恰好 1 条，语言自指（如 `/zh`→`https://wallhaze.com/zh`） |
| hreflang | 8 条（7 语言 + x-default，指向 https 非 www 无前缀） |
| 结构化数据 | 首页/详情页 2 个 ld+json；pricing/about 0 个（见 P3 观察项） |
| `S:0` RSC 标记 | 常规 URL 均不存在 |

### 2.3 S:0 / RSC 流式块与缓存变体 ✅（历史故障未复现）

- 带无害 cache-bust 参数的 `/` 变体：**HTML 中出现 `S:0` 流式标记，但 `<title>` 与 description 仍完整在原始 `<head>` 内**（title:Y / desc:Y / canonical:1 / hreflang:8）
- `/en/pricing?bust`：无 `S:0`，head 完整
- **结论：即使流式渲染产生 S:0 块，metadata 也在 head 中先行输出；未发现"metadata 只存在于 S:0 恢复块"的回归。** 历史故障（Next 16 流式 generateMetadata + 缓存 UA 不分）在当前生产版本未复现。

### 2.4 已确认的异常（B 类，有响应证据）

| # | 问题 | 证据 | 优先级 |
|---|---|---|---|
| B1 | **http:// 未升级 https**：`http://wallhaze.com/`、`http://wallhaze.com/pricing` 直接 200（无 301 到 https）；而 `http://www.wallhaze.com/` 正确 301 → `https://wallhaze.com/` | 实测 `redirect:'manual'`：status 200、`location: null`（2026-11-12 两次复验） | **P1**（配置级：Cloudflare Zone 开启 Always Use HTTPS 或 Worker 入口加 scheme 检查；canonical 全部指向 https，重复风险被缓解，但不该让 http 内容可达） |
| B2 | **默认语言前缀归一化使用 307（临时重定向）**：`www.wallhaze.com/en/pricing` → 301 → `wallhaze.com/en/pricing` → **307** → `/pricing` | 实测重定向链 | **P2**（`/en/*` 不在 sitemap，影响小；307 不传递合并信号，如代码可控可改 308/301） |
| B3 | **壁纸详情页 Cache-Control `private, no-cache, no-store, max-age=0`**（公开可索引页面） | `/wallpapers/sakura-dream`、`/wallpapers/aurora-veil` 实测；仓库源码未显式设置，疑似 vinext 对动态路由的默认值 | **P2**（不影响索引——head 完整、无 noindex；影响 CDN 缓存效率与抓取资源消耗，Googlebot 每次都回源） |
| B4 | **`/es` 出现过一次 `no-store, must-revalidate` 变体**（browser UA），间隔复测 4 次（含 Googlebot UA）均恢复 `s-maxage=31536000` | 实测时间线 | **P3 仅监控**（疑似 SWR 刷新窗口瞬态；若 GSC 明细显示 noindex 类含 /es 需复查） |

### 2.5 正常排除（A 类，设计如此）

- 49 个 noindex 变体（7 条私密路由 × 7 语言）：`/login /signup /account /account/settings /account/orders /credits /my-creations`——均有 `noindex: true`（`lib/seo.ts` 统一应用），并有 `i18n-parity.test.ts:88` 回归测试保护"私密页必须 noindex、公开页不得 noindex"。
- robots.txt 全开放 + sitemap 排除私密页（`app/sitemap.ts` 注释与实现一致）。

## 3. 本地配置审计要点

- `app/robots.ts`：全站 `Allow: /`，声明 sitemap ✅（无私密路径 disallow——设计选择，靠 noindex 而非 robots 屏蔽，符合"不用 robots 当 canonical 替代"原则）
- `lib/seo.ts:pageMetadata`：统一生成 canonical/hreflang/OG，noindex 参数集中管控 ✅
- `app/sitemap.ts`：仅包含可索引 canonical URL（546），excludes 私密页与未通过审核素材 ✅
- `tests/i18n-parity.test.ts`： protects noindex 对称性与 sitemap 组成 ✅
- 缓存实现：`cloudflare.config.ts` / `wrangler.toml` 无显式 HTML Cache-Control 设置；生产响应头 `Cache-Control: s-maxage=31536000, stale-while-revalidate` 来自 vinext 静态优化路由默认；详情页 no-store 为动态路由默认（B3）

## 4. 测试与审计结果（本次执行）

| 命令 | 结果 |
|---|---|
| `git status` | 干净（仅未跟踪 .vscode/），未提交工作受保护 |
| `npm run seo:audit -- --base-url=http://localhost:4173 --label=gsc-diag`（vinext preview，2026-11-12） | **sitemap locs=546, alternates=4368, universe=546；P1=0 P2=0 P3=0 orphans=0 broken=0**。与 546 历史基线一致，无增减异常 |
| 线上 probe（9 样本 × 3 UA + 缓存变体 + origin 变体） | 见 §2，证据文件 `docs/seo-gsc-evidence/probe-results.json` |

（typecheck/vitest/build:vinext 未重复执行：索引相关代码自 `0b201ab` 零变化，该 commit 已通过全部 318 测试。）

## 5. 诊断分类汇总

- **A 正常排除**：49 个设计性 noindex 变体；sitemap 排除逻辑
- **B 已确认异常（可修复）**：B1 http 不升级 https（P1）；B2 默认语言 307（P2）；B3 详情页 no-store（P2）
- **C 需 GSC URL 明细后再评估**：已发现未收录 15、已抓取未收录 11（排除技术错误后才能谈薄内容/内链）
- **D 尚不能判断**：noindex 142 的构成、备用网页 58 的构成、重定向 8 / 重复 5 / 404 2、562 与 546 的差集

## 6. 待办（需人工操作，按优先级）

1. **P0（人工，非代码）**：在 GSC「网页索引编制」按问题类型导出 URL 明细（noindex / 备用网页 / 重定向 / 重复 / 已发现未收录 / 已抓取未收录 / 404），与本报告的 sitemap 546 清单做集合对比 → 将 D 类升级为 A/B/C
2. **P1**：Cloudflare Zone 开启 **Always Use HTTPS**（或 Bulk Redirect http://wallhaze.com/* → https://）——配置项，不需要代码变更；改动后用 `http://wallhaze.com/pricing` 复测应 301 → https
3. **P2（可选代码修复，需再次授权）**：vinext 默认语言前缀重定向改 308/301；壁纸详情页缓存策略评估（若确认为 vinext 行为，改动需回归测试）
4. **不建议**：为提高收录批量移除 noindex、把 7 语言 canonical 归并到英文、给已删除页做全站跳首页、重复提交 sitemap

## 7. 是否适合生产发布

**本报告未修改任何代码，不存在发布需求。** B1 是 Cloudflare Zone 配置（非仓库代码），B2/B3 是否修码待授权确认。当前生产版本（`65b6f7fa`）的索引基础（robots/sitemap/canonical/hreflang/head metadata/双 UA 一致性/无公开页误 noindex）经实测**全部健康**；GSC 中 241 个未索引 URL 的归因必须等 URL 明细，**不保证、也不应预期修复后收录数量**。

---
证据文件：`probe-results.json`（原始 JSON，含响应头与 head 解析）、`SEO-GSC-url-diagnostics.csv`（URL 级诊断表）
