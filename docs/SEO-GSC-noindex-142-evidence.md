# WallHaze GSC noindex 142 URL — 二阶段精确诊断报告（2026-11-12）

只读审计。未修改任何代码、未 commit/push、未变更 Cloudflare 配置或生产数据。

数据源：`wallhaze.com-Coverage-Drilldown-2026-11-12.zip` → `表格.csv`（142 条 URL + 逐条 GSC 上次抓取日期），与 `WallHaze_GSC_noindex_142_URL_分类明细.xlsx` 交叉核对（**两份来源 142 条 URL 完全一致，0 差异**）；线上只读探测 142/142 条（浏览器 UA 逐条 + 29 条壁纸详情双 UA）；当前 sitemap 546 URL 全量比对。

## 一、结论摘要

| 类别 | 数量 | 占比 | 结论 |
|---|---|---|---|
| **A 正常排除**（登录/注册/账户页设计性 noindex） | **113** | 79.6% | 保留，不改 |
| **D 非索引目标**（壁纸详情 license 审查中，设计性 noindex） | **29** | 20.4% | 保留，不改 |
| **B 疑似历史残留** | **0** | — | — |
| **C 当前技术故障** | **0** | — | **无需修复生产代码** |
| **E 证据不足** | **0** | — | 全部 142 条均已实测 |

**核心结论：142 条 noindex 全部是当前生产环境（Version 65b6f7fa，2026-11-11 部署）的有意行为，逐条实测确认，无当前技术故障、无历史残留。不需要任何生产代码修复；不需要 GSC 验证修复；仅 6 条 http:// 涉及 Cloudflare Zone 配置项（B1，站长操作）。**

### 计数校验（与提示词给定构成的差异）

| 类型 | 提示词给定 | ZIP 实际 | 差异说明 |
|---|---|---|---|
| 公开壁纸详情 | 29 | 29（14 slug） | 一致 |
| login?next → 壁纸详情 | 90 | **89** | 1 条 `?next=/wallpapers`（无 slug，指向列表页）计入了下一行 |
| login?next → 其他页 | 14 | **15** | 同上（目标含 /wallpapers /studio /help /about /pricing /terms /community） |
| 纯 /login | 1 | 1 | 实际为 `/ko/login` |
| /my-creations | 5 | 5 | de/zh/ja/es/fr 各 1 |
| /signup | 3 | 3 | 根/de/es 各 1 |
| **合计** | **142** | **142** | ✓ |
| 其中 http:// | 6 | 6 | 全部属 login?next 类（见 B1） |

## 二、29 条公开壁纸详情：逐条结论（全部 D 类）

**29/29 实测：HTTP 200、无重定向、`<meta name="robots" content="noindex, nofollow">`、无 X-Robots-Tag、canonical 语言自指、hreflang 8 条（7 语言 + x-default）、双 UA（浏览器/Googlebot）响应一致、不在当前 546 URL sitemap 中（0/29）、页面内容有效（200 + H1 + 正文 + 2 个 JSON-LD）。**

| URL | 语言 | GSC 抓取 | HTTP | robots | canonical | Sitemap | 结论 |
|---|---|---|---|---|---|---|---|
| /de/wallpapers/ring-station | de | 11-11 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/ring-station | en | 11-11 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ko/wallpapers/ring-station | ko | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ja/wallpapers/ring-station | ja | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /zh/wallpapers/ring-station | zh | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /de/wallpapers/pixel-skyline | de | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /zh/wallpapers/pixel-skyline | zh | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /es/wallpapers/neon-rain | es | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /zh/wallpapers/floating-isles | zh | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/sakura-nights | en | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/cloud-friends | en | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /fr/wallpapers/floating-isles | fr | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/neon-rain | en | 11-01 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /de/wallpapers/neon-rain | de | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /fr/wallpapers/hangar-rain | fr | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /de/wallpapers/haze-room | de | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /es/wallpapers/last-train | es | 11-03 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /es/wallpapers/petal-bloom | es | 11-03 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/petal-bloom | en | 11-02 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /zh/wallpapers/neon-rain | zh | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/ash-highway | en | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /zh/wallpapers/chrome-orbit | zh | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/graphite-valley | en | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /wallpapers/the-unseen | en | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ja/wallpapers/hangar-rain | ja | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ja/wallpapers/neon-rain | ja | 10-29 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ja/wallpapers/chrome-orbit | ja | 10-28 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ja/wallpapers/cloud-friends | ja | 11-08 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |
| /ko/wallpapers/cloud-friends | ko | 11-10 | 200 | noindex, nofollow | 自指 ✓ | 否 | D |

（完整逐条字段见 `SEO-GSC-noindex-142-audit.csv`；原始双 UA 响应见 `probe-noindex-results.json`。）

### 根因（源码 + 时间线，29 条共用同一根因）

1. [apps/web/lib/wallpapers.ts](../apps/web/lib/wallpapers.ts) `SEEDS`：14 个 slug 均无 `license` 字段 → L220 `license ?? "review-pending"` → L239 `canPubliclyDisplay = false`。
2. [app/[locale]/wallpapers/[slug]/page.tsx#L74-L92](../apps/web/app/[locale]/wallpapers/[slug]/page.tsx#L74-L92)：pending 时输出 `robots: { index:false, follow:false }`，title 加 "License Review" 后缀（代码注释："Pending artwork must not be indexed or exposed through social cards while its display rights are unresolved"）。
3. [app/sitemap.ts#L40-L48](../apps/web/app/sitemap.ts#L40-L48)：pending 作品有意排除出 sitemap。
4. 该逻辑由 commit `62b633e`（2026-10-24）引入；GSC 逐条抓取日期（10-28 ~ 11-11）**全部晚于引入时间** —— Google 看到的就是当前设计，非缓存固化、非历史残留。
5. 对照验证：已过审的 `/wallpapers/sakura-dream`（`license: "verified"`）实测无 robots meta、canonical 自指、在 sitemap 中 —— noindex 精确绑定审查状态。

### 是否应被索引？

**当前不应**。14 个作品为风格样例图（AI 生成，版权审查未完成），产品策略为"透明可达但不索引"。它们不是"已恢复正确索引信号"的情况——**索引信号本身就是正确的**（noindex 符合设计）。无需修复生产代码；也**不要**为消除 GSC 排除数提前放开索引。

## 三、113 条登录/注册/账户类：逐条结论（全部 A 类）

**113/113 实测：HTTP 200、无重定向、`noindex, nofollow`、canonical 自指、不在 sitemap。**其中 6 条 http:// 变体同样 200 + noindex（不升级 https，见 B1）。

| 类型 | 数量 | 实测证据 | 根因 |
|---|---|---|---|
| /login?next=/wallpapers/&lt;slug&gt; | 89 | 200 + noindex, nofollow | [login/page.tsx#L17-L32](../apps/web/app/[locale]/login/page.tsx#L17-L32) `pageMetadata({ noindex: true })`；[lib/seo.ts#L80-L89](../apps/web/lib/seo.ts#L80) 统一输出 |
| /login?next=/{studio,help,about,pricing,terms,wallpapers,community} | 15 | 200 + noindex, nofollow | 同上 |
| /ko/login（纯登录页） | 1 | 200 + noindex, nofollow | 同上 |
| /my-creations ×5 语言 | 5 | 200 + noindex, nofollow | 7 私密路由 ×7 语言设计性 noindex（tests/i18n-parity.test.ts 保护） |
| /signup ×3 | 3 | 200 + noindex, nofollow | 同模式 |

关键事实：

- **SSR 输出是静态的**：`next` 参数仅由客户端 `LoginPanel`（Suspense）读取（[AuthPanel.tsx#L96-L104](../apps/web/components/auth/AuthPanel.tsx#L96)），104 个参数化 URL 共享同一份 SSR HTML——无内容重复风险，无需减量。
- **无开放重定向**：`next` 经 [lib/auth/return-to.ts#L12-L20](../apps/web/lib/auth/return-to.ts#L12) `safeNextPath` 校验（仅同站相对路径、拒 `//`/控制字符/>512/login 自指）。
- robots.txt 全开放（Allow: /），Google 可抓到 noindex 规则——未用 Disallow 掩盖，符合官方规则。
- 设计性 noindex **保留**，不为了减少 GSC 排除数量而取消。

## 四、与历史 S:0 缓存故障的关系

本次 142 条逐条实测**均未复现** S:0/流式 metadata 固化问题：原始 head 中 title/description/canonical/robots 全部就位，双 UA 一致。noindex 全部来自显式代码逻辑，与缓存无关。

## 五、B1 / B2 / B3 实现位置与修复方案（不执行）

### B1 — http:// 未升级 https（唯一建议执行的修复，站长 Zone 配置）

- **现状**：6 条 `http://wallhaze.com/login?next=...` 及 `http://wallhaze.com/pricing` 实测 **200 直接服务，无 301/308**。`https://www.wallhaze.com` 的 www→apex 重定向正常。
- **实现位置**：
  - 仓库内无 http→https 逻辑。[apps/web/wrangler.toml#L21-L23](../apps/web/apps/web/wrangler.toml) 仅绑定 apex custom_domain；
  - Zone 层面：[docs/deployment/CLOUDFLARE-DNS-SSL.md#L26](../apps/web/docs/deployment/CLOUDFLARE-DNS-SSL.md) 规定 "Always Use HTTPS：开"，但按线上实测**该项实际未启用**（该文档写于旧 Caddy 架构时期，迁移 Workers 后未落实）；[CLOUDFLARE-FRONTEND-DEPLOY.md §www](../apps/web/docs/deployment/CLOUDFLARE-FRONTEND-DEPLOY.md) 只记录了 www 重定向规则，无 http 升级规则。
- **修复方案（二选一，Cloudflare Dashboard 操作）**：
  1. SSL/TLS → Edge Certificates → 开启 **Always Use HTTPS**（最简单）；
  2. 或 Rules → Redirect Rule：`http://wallhaze.com/*` → `https://wallhaze.com/$1`，301，保留查询串。
- **影响范围**：所有 http:// 入站请求单跳 301；对现有 https 流量、Worker、API、支付零影响；Google 侧仅是 canonicalization 提示，帮助 6 条 http 记录收敛到 https 版本。完成后可用 `curl -I http://wallhaze.com/pricing` 验证 301。HSTS 可随后开启（建议先不带 preload）。

### B2 — /en/* 归一化 307（建议保持现状）

- **实现位置**：[apps/web/proxy.ts#L14](../apps/web/apps/web/proxy.ts)（Next.js 16 proxy 约定）→ `createMiddleware(routing)`；[apps/web/i18n/routing.ts#L22](../apps/web/apps/web/i18n/routing.ts) `localePrefix: "as-needed"` → next-intl 将 `/en/*` 重定向到无前缀 URL，next-intl 默认 307。
- **影响评估**：无 SEO 损害。sitemap 全部用无前缀 URL，站内无指向 `/en/*` 的链接，爬虫发现量趋近于零；307/308 对 Google canonicalization 无差异。
- **方案**：A（推荐）保持不变；B（可选）在 proxy.ts 包装响应，把语言前缀归一化的 307 改为 308——改动约 10 行、仅影响 `/en/*` 请求，但收益极小，不建议为此发版。

### B3 — 动态页 `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`（不改）

- **实现位置**：vinext [dist/server/cache-control.js#L4](../apps/web/apps/web/node_modules/vinext/dist/server/cache-control.js) `NEVER_CACHE_CONTROL`，对动态 App Router 页面默认输出（镜像 Next.js 官方行为）。
- **影响评估**：纯缓存指令，不涉及索引/抓取；Googlebot 照常渲染收录；`private`+`no-store` 使 Cloudflare 不缓存 HTML，**双 UA 响应天然一致**——恰恰是防止 S:0 缓存固化复发的保护，不是问题。
- **方案**：不改。若未来需要 CDN 缓存，应作为 vinext 缓存架构专项决策，且必须先补双 UA 原始 head 回归测试。

## 六、下一步最小范围

1. **生产代码：零修改**（142 条均为设计性 noindex，无 C 类）。
2. **站长操作（唯一建议）**：Cloudflare Zone 开启 Always Use HTTPS（B1），一行配置，验证 `http://wallhaze.com/pricing → 301 https`。
3. **GSC**：不需要请求验证修复（没有已修复项）。113 条 A 类为长期稳态；29 条 D 类在版权审查通过后会自动从 sitemap 进入索引，届时再对具体 URL 请求重新抓取。
4. **产品侧（可选）**：推进 14 个风格样例作品的 license 审查（补 `license` 字段），审查通过即自动恢复索引，无需任何额外代码。

## 七、交付物

| 文件 | 内容 |
|---|---|
| [docs/SEO-GSC-noindex-142-audit.csv](SEO-GSC-noindex-142-audit.csv) | **142 行逐条**：URL、语言、slug、GSC 原因/日期、HTTP、robots（含 29 条双 UA）、X-Robots-Tag、canonical、sitemap 归属、内容有效性、根因证据、A/B/C/D/E 分类、建议、修复状态 |
| 本报告 | 分类统计、29 条逐条结论、B1/B2/B3 方案、最小修复范围 |
| `C:\Users\xiong\AppData\Local\Temp\wallhaze-seo\probe-noindex-results.json` | 29 条壁纸 + 5 对照组双 UA 原始响应 |
| `C:\Users\xiong\AppData\Local\Temp\wallhaze-seo\gsc142-probe.json` | 113 条账户类逐条原始响应 + 142 条 sitemap 归属 |

**明确说明：29 条壁纸详情并非"已恢复正确索引信号"，而是其 noindex 信号当前即正确（设计性 D 类）；113 条账户类同理。因此无需修复生产代码，无需 GSC 复查验证，唯一可执行项是 B1 的 Cloudflare 配置。**
