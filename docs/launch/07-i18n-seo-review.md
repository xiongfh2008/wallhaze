# 07 — 国际化与 SEO 审查（i18n & SEO Review）

范围：七语言商业化文案状态化、SEO 基线保持、本地验收。

## 1. 七语言状态化文案（本轮改造，前端代理实施）

- `messages/{en,zh,ja,ko,es,fr,de}.json` 增补/复用三个状态 key：
  - 「AI 创作暂未开放」（studio 关闭态，替代原硬编码 Coming Soon 文案）；
  - 「即将开放」（purchasesPublic=false 的购买按钮）；
  - 「暂时停售」（purchasesPaused=true 的购买按钮）。
- 原硬编码 "coming soon / not currently available"（en.json L70-93 等）在状态开启后不再展示；关闭态展示与原一致。
- **fail-closed**：API 未配置（NEXT_PUBLIC_API_BASE_URL 空）或 pricing 不可达 → 一律按关闭态渲染。

## 2. SEO 基线（必须保持，回归验证）

| 项 | 基线 | 本轮 |
|----|------|------|
| 可索引 URL（sitemap） | 546 | 回归后仍须 546（apps/web 不影响 sitemap 路径） |
| 7 语言 canonical + hreflang | 已建立 | 不动 |
| review-pending 壁纸详情 | noindex | 不动（PUBLIC_WALLPAPERS 过滤保持） |
| 正式站 wallhaze.com 探测 | 本机返回 500（环境问题） | 不在本轮范围，记 runbook |

## 3. 本轮前端改造的 SEO 注意点

- /studio、/pricing 的关闭态仍是**服务端渲染的真实内容**（非 JS-only 空壳），搜索引擎可正常索引页面文案；
- 开关开启后同一 URL 内容变化——无需改 canonical/hreflang/sitemap（页面路径不变）；
- 不新增路由 → sitemap 数量不变。

## 4. 验证方式

- `npm run seo:audit`（web）：P1 项全部应为既知环境问题（wallhaze.com 500），无新增；
- `npm run rights:check`：通过；
- 浏览器验收（5 视口 × 7 语言，截图 docs/launch/screenshots/）：检查关闭态/开启态文案与布局。

## 5. 遗留

- 若未来要把 AI 作品加入公开图库，需先扩 media-rights 流程再动 sitemap——当前架构不允许直接入站。
