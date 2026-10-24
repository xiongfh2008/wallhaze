# WallHaze V2.0 首页 UI/UX、转化与全站 Header 优化报告

- 日期：2026-10-24（首页部分 2026-10-23；全站 Header 部分 2026-10-24）
- 范围：`apps/web` 首页、全站 Header 及其菜单；未修改认证、Google OAuth、Credits 账务、支付、Worker 或真实 AI 配置
- 结果：首页从“多个重复图片区 + 长段卡片”整理为“两条路径 + 去重展示 + 紧凑导航 + 明确 CTA”；全站 Header 改为登录/未登录两套导航，接入真实钱包余额与可键盘操作的头像菜单。5 个视口、7 语言及登录/未登录/退出状态检查通过

## 1. 参考的 UI/UX Skill

项目内没有 UI Skill 目录，本轮**没有安装全局 CLI 或第三方包**，直接阅读并应用：

- **UI UX Pro Max**：先审计硬编码值 → 语义角色；避免行业 anti-pattern；不要用颜色单独表达状态；chips 换行；可见 focus；在 375/768/1024/1440 检查。
- **Anthropic frontend-design**：有意字阶、避免 SaaS 卡片套件、结构承载意义、单一记忆点、移动端和减少动效。
- **Vercel web-interface-guidelines**：语义 HTML、focus-visible、图片 alt、长文本 `min-w-0`/`line-clamp`、`Intl` 数字日期、空态、`prefers-reduced-motion`。

首页阶段 IAB 截图曾返回 `browser screenshot activity capture failed for guest`，因此首页截图使用**本机 Headless Edge + CDP**（真实 Chromium，加载已登录 Session，未安装新依赖）。Header 阶段 IAB 已恢复：已登录状态在 IAB 内截图；未登录与退出状态使用另一条 Headless Edge 会话截图，避免注销 IAB 中已有的登录会话。

## 2. 原页面问题

- Hero 使用 `100svh`，首屏只有 Hero；下一段内容完全不可见，页面节奏从“整屏图片”直接开始。
- 副标题只讲 AI，没有告诉用户“免费壁纸”和“AI 定制”是两条路径。
- `TrendingMarquee` 使用 6 个 PopularStyles 图片 + Hero 图 + Demo 图；`FeaturedWallpapers` 12 张中前 4 张再次使用同一批风格图；`PopularStyles` 又用同样 6 张图做第三组大卡片。**三个相邻区块重复图片**。
- “Trending this week”是无数据支撑的流行度声明。
- PopularStyles 实际是第三个 Gallery，且 CTA 只在 hover 时出现。
- Studio 介绍中“Reference-image remixing”承诺“keeps your subject”，但真实模型效果尚未验收。
- Why WallHaze 四张卡片与 Studio/How It Works 的“设备适配、精选画廊”价值重复。
- 各模块 `py-24/32`、H2 `text-5xl`，页面很长；移动端风格区块尤其高。
- 登录后 Header 同时出现“账户”和“开始使用”，入口含义接近。
- 39 张 Gallery 作品全部为 `license: review-pending`；详情页已有 license 提示，首页没有说明。

## 3. 调整后的首页结构

1. **Hero**：两条路径 + 两个 CTA（Explore Wallpapers / Create with AI），高度 `min(88svh, 48rem)`，下一段风格带在首屏可见。
2. **Visual style band**：10 个不重复风格，仅承担视觉展示；不再声称“Trending”。
3. **Featured Wallpapers**：8 张非签名风格作品；手机横向滑动，桌面 3/4 列网格；下方 license 说明。
4. **Browse by style**：6 个紧凑横向 tile（缩略图 + 名称 + 描述 + “Open in Studio”），点击进入 `?style=<id>`。
5. **AI Studio**：3 个核心能力；参考图文案改为“引导构图与场景，结果先在 Studio 预览”。
6. **How It Works**：紧凑三步。
7. **Why WallHaze**：3 个文本带优势（屏幕适配、精选画廊、七语言），第三点并入“标签清晰、免费个人下载”。
8. **Final CTA**：同时提供 Studio 与 Gallery 两个入口。
9. **Footer**：保持原有结构，与紧凑 CTA 区自然衔接。

## 4. 删除 / 合并的重复内容

- 移除 Marquee 中的 PopularStyles、Hero、Demo 图片；改为 10 个“未被其他首页区块使用”的风格。
- Featured 从 12 张减为 8 张，且只使用非签名风格（the-unseen、bloom-wash、chrome-orbit、last-train、dawn-lake、cursed-grove、hangar-rain、sunset-cafe）。
- PopularStyles 从“第三组大图 Gallery”改为 6 个紧凑风格导航 tile，不再承担 Gallery 职责。
- Why 从 4 张卡片减为 3 条；原“Honest by design”并入“精选画廊”文案，不丢失信息。
- 视觉节奏：Featured/Styles/Studio `py-16/20`，How/Why `py-12/14`，区块 H2 统一 `text-3xl md:text-4xl`。
- 保留全部 Gallery 详情路由、SEO 路由、Style Registry 和 Prompt Template。

**图片去重结果（自动校验）**：hero/demo、marquee、featured、styles 四个集合两两交集为 **0**；featured 8 张各不相同；marquee 10 个风格均不在 PopularStyles/Featured 中。

## 5. Hero 改造

- 保留“你的屏幕。你的世界。”品牌标题。
- 副标题改为：“探索适配各种屏幕的免费壁纸，或在 Studio 中用 AI 定制专属壁纸。”
- CTA 链接实测：Explore → `/zh/wallpapers`；Create with AI → `/zh/studio`。
- 高度从 `100svh` 收至 `min(88svh, 48rem)`；在 1440/820 视口下一段风格带已进入首屏，390 视口也能看到下一段。
- 加深左侧与底部遮罩，移动端文字对比更稳定；标题在 820 使用 6xl、1440 使用 7xl，避免平板过大。
- 未宣传“免费 AI 生成”或“无限生成”。

## 6. Featured 改造

- 8 张精选作品，全部为与风格导航不重复的视觉；桌面 4 列 × 2 行，平板 3 列，手机横向 snap 滚动（不造成页面横向溢出）。
- 图片懒加载（首页仅 Hero 1 张 eager）。
- 标题下说明改为“打开任意作品查看详情与下载选项”，不暗示商业授权。
- 网格下新增：**“作品授权仍在审核中；画廊下载仅供个人使用，按现状提供。”**
- “查看全部壁纸”链接保留到 `/wallpapers`。

## 7. 风格导航改造

- 6 个标志性风格：动漫、赛博朋克、奇幻、自然、极简、超现实。
- 每个 tile：缩略图 + 名称 + 一句描述（复用 `styleDescriptions`）+ 常驻“在 Studio 中打开”+ 箭头。
- 点击链接为 `/zh/studio?style=<id>`；浏览器验证 `?style=anime` 进入 Studio 后，动漫卡片显示选中状态（✓）。
- 没有建立第二套风格数据；全部来自 `POPULAR_STYLES` / Style Registry。

## 8. Studio 介绍模块

- 保留手机预览与同一视觉语言；缩小手机框（桌面最大 300px），让文字与图片高度更平衡。
- 三个能力：签名风格、精确适配屏幕、参考图。
- 参考图文案改为：“上传主体照片来引导构图与场景；生成结果会先在 Studio 中预览，再由你决定是否保存。” 不承诺主体保留成功。
- 区块从 `py-24/32` 收紧到 `py-16/20`，标题改为 `md:text-4xl`。

## 9. 下半部分

- How It Works 保持三步，压缩间距；未删内容。
- Why WallHaze 改为三列文本带（顶部细线 + 图标），不再与上半部分使用同样的卡片网格；第三点“七语言”保留，精选画廊文案合并了清晰标签与免费个人下载。
- Final CTA 同时提供“开始创作”（Studio）和“探索壁纸”（Gallery）；文案明确两条路径。
- Footer 保留原有列与边框，与 CTA 区衔接自然。

## 10. 桌面 / 手机截图

改造前（5 视口）：

- `docs/codex/screenshots/baseline-home-1440.png`
- `baseline-home-1280.png`
- `baseline-home-820.png`
- `baseline-home-390.png`
- `baseline-home-360.png`

改造后（5 视口）：

- `final-home-1440.png`
- `final-home-1280.png`
- `final-home-820.png`
- `final-home-390.png`
- `final-home-360.png`

分区截图：

- `final-home-featured-1440.png` / `final-home-featured-390.png`
- `final-home-styles-1440.png` / `final-home-styles-390.png`
- `final-home-studio-1440.png` / `final-home-studio-390.png`
- `final-home-howwhy-1440.png` / `final-home-howwhy-390.png`
- `final-home-cta-1440.png`

## 11. 修改文件

- `apps/web/lib/wallpapers.ts`：精选墙纸改为 8 张非签名风格。
- `apps/web/components/Hero.tsx`：两条路径副标题、88svh 高度、遮罩与字号。
- `apps/web/components/TrendingMarquee.tsx`：改为不重复的 10 个风格视觉带，移除 Trending 声明与 hero/demo 图。
- `apps/web/components/FeaturedWallpapers.tsx`：8 张、手机横滑、懒加载、license 说明。
- `apps/web/components/PopularStyles.tsx`：紧凑风格导航 tile + 描述 + 常驻 CTA。
- `apps/web/components/StudioIntro.tsx`：参考图诚实文案、手机框尺寸、间距。
- `apps/web/components/HowItWorks.tsx` / `WhyWallHaze.tsx`：紧凑布局、Why 3 条、去除卡片套件。
- `apps/web/components/CtaSection.tsx`：双 CTA、紧凑间距。
- `apps/web/components/Header.tsx`：全站 Header 重构为登录/未登录两套导航，接入真实钱包余额、当前页高亮与移动菜单。
- `apps/web/components/account/AccountMenu.tsx` / `UserAvatar.tsx`：新增头像账户菜单、键盘导航、退出登录与失败状态。
- `apps/web/components/LanguageSwitcher.tsx`：移动端 44px 触发区；切换语言后关闭移动菜单。
- `apps/web/tests/home-content.test.ts`：新增首页图片去重、featured 数量、license 状态回归测试。
- `apps/web/tests/header-nav.dom.test.ts`：新增 10 个 Header 登录态、真实余额、当前页、菜单键盘与退出回归测试。
- 七语言 `messages/*.json`：hero/trending/featured/popular/studioIntro/why/cta 文案；Header 导航、账户菜单、余额状态与退出文案。
- 截图：`docs/codex/screenshots/`。

## 12. 测试与 Build

| 检查 | 结果 |
|---|---|
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **185 passed**（24 文件，新增 10 个 Header 测试 + 4 个首页不变量测试） |
| Web Build | 通过（414 个静态/部分预渲染页面） |
| API | 本轮未修改；上次全量 **206 passed，1 skipped** |

浏览器 / 内容检查：

- 5 视口页面 `scrollWidth <= innerWidth`，无页面级横向溢出。
- 7 locales × 3 viewports = **21 次**首页检查：0 原始 key、0 溢出、0 NaN/undefined；message key 集合一致。
- 图片：36 个 `<img>`，1 个 eager（Hero），35 个 lazy。
- H1 只有一个；H2 六个；层级正确。
- CTA 链接验证：Hero 两个、6 个风格链接、8 个 Featured 卡片、底部两个 CTA。
- 登录态 Header：桌面为 Explore Wallpapers / AI Studio / My Creations + 语言 + 真实 Credits + 头像菜单；未登录为 Explore Wallpapers / AI Studio + 语言 + Log in + Create Wallpaper；移动端保留单一 Create 入口，菜单承载用户信息和余额。
- Header 当前页：`aria-current="page"` + 药丸/圆点；Studio、Explore、My Creations、Credits 均已验证。
- Header 链接：`/wallpapers`、`/studio`、`/my-creations`、`/credits`、`/account`、`/account/settings`、`/login?next=…` 全部返回 200；Studio 内 Create CTA 在登录/未登录两种状态下都不显示。
- 真实退出：浏览器内点击 Log out 后 **153ms** 内头像/余额/My Creations 消失，服务端 session 返回 `null`；未登录头部恢复 Log in + Create Wallpaper。
- 风格链接 `?style=anime` 在 Studio 中实际选中动漫卡片。
- 未出现文字截断或移动端横向滚动。

## 13. 授权审计（上线阻塞）

- `lib/wallpapers.ts` 的 **39 张**作品全部是 `license: review-pending`；没有一张被标记为 `verified`。
- 现有详情页显示 “License review pending” 和“个人免费下载按现状提供，商业使用未确认”；首页 Featured 下也新增了同样说明。
- 当前下载策略是**个人使用、按现状**；没有声称公开分发或商业许可。**这不等于已获授权**。
- **上线阻塞**：在逐张完成版权/商业许可审核前，不能把 Gallery 作品用于商业宣传或对外承诺公开分发；需要法务/授权证据并逐项翻转 `license` 状态。本轮没有改变下载或授权逻辑。

## 14. 业务功能回归

- 未改认证、Google OAuth、Credits 账务、支付 Webhook、Worker、AI Provider 或 FAL 配置。
- Gallery 详情页、`/wallpapers/[slug]`、`/studio?style=`、`/wallpapers` 路由均保留；Featured 只调整了首页选择，不删除任何作品。
- 用户收藏/历史未改动；Header 只读取现有 `/v1/auth/session` 与只读 `/v1/credits/wallet`，Log out 调用现有 `/v1/auth/logout`；没有修改 Session 判定、OAuth、钱包记账、预留/结算或支付逻辑。
- 没有虚构用户数、生成量、评分或评价；移除了无依据的 “Trending this week”。

## 15. 仍存在的问题

1. **授权阻塞**：39 张 Gallery 作品仍为 review-pending，公开/商业使用不可上线。
2. 移动端 Featured 使用横向 snap 滑动（设计选择，非页面溢出）；Styles 在 390 为单列，内容较长。
3. Hero 仍以整屏视觉为主；这是品牌展示取舍，不是信息缺失。
4. 真实 AI/支付未启用；首页 CTA 进入的是 Studio/Gallery 实际页面，不承诺真实生成能力。
5. Header 余额在首屏、路由变化和窗口重新聚焦时从后端刷新；生成完成但停留在当前页时不会主动推送新余额（本轮未新增钱包事件）。Header 的静态 HTML 仍是未登录骨架，客户端 Session 探测后切换为登录态；这是当前 HttpOnly Cookie 架构下的短暂闪烁，不是伪造登录态。
6. 截图来源：已登录状态为 IAB；未登录/退出状态为 Headless Edge CDP。真实 Chrome 的字体渲染可能略有差异。Credits 的 loading/error 与 401 过期状态由 DOM 测试覆盖，未为这些瞬时状态单独截图。

## 16. 全站 Header 导航与菜单优化（2026-10-24）

### 16.1 两套导航

- **未登录**：Logo / Explore Wallpapers / AI Studio / 语言 / Log in / Create Wallpaper（→ `/studio`，由 Studio 在需要时引导登录）。
- **已登录**：Logo / Explore Wallpapers / AI Studio / My Creations / 语言 / 真实 Credits 余额 / 头像菜单。
- 头像菜单：My account（`/account`）、Account settings（`/account/settings`）、Credits & billing（`/credits`，含订单页入口）、Log out。
- 删除了旧的独立 Account 链接和重复 Get Started；已登录桌面不再显示 Create Wallpaper。
- 移动端仍保留**一个**主 Create 入口；在 `/studio` 内登录/未登录都不显示 Create CTA，避免与本页操作重复。
- FAQ/About/Contact/Privacy/Terms 仍只在 Footer，未加入 Header。

### 16.2 Credits 余额

- 登录后读取真实 `GET /v1/credits/wallet`；显示 **可用余额 = credits − reserved**，与 Studio 的付费闸门一致，不写死数字。
- 当前本地账号后端返回 200；测试用 120 total / 20 reserved 验证 Header 显示 **100**，不会显示 total 120。
- 状态：

| 状态 | Header 表现 |
|---|---|
| 加载 | `Credits …` + `aria-busy`；登录后先显示加载占位，不显示假数字 |
| 就绪 | `Credits 200`（实际后端值）；点击进入 `/credits` |
| 失败 | `Credits —` + `aria-label="Credits unavailable"`；头像菜单保留 |
| 钱包 401 / Session 失效 | 隐藏余额与头像菜单，恢复未登录导航 |

- Header 在首屏、路由变化、窗口重新聚焦/可见时重新校验 Session 与钱包；退出后立即清空本地余额状态并 `router.refresh()`。

### 16.3 头像菜单与键盘

- 桌面头像为真实用户首字母（当前账号 `XI`），不使用假头像；菜单顶部显示邮箱/显示名。
- `aria-haspopup="menu"`、`aria-expanded`、`role="menu"`、`role="menuitem"`；当前账户/设置/积分页有 `aria-current="page"`。
- 键盘打开时聚焦第一项；支持 ↑/↓ 循环、Home/End；Esc 关闭并把焦点还给头像按钮；点击外部关闭；焦点移出菜单时关闭。
- 移动菜单内语言下拉打开时，第一次 Esc 只关闭语言下拉，第二次 Esc 才关闭整个移动菜单（浏览器实测）。
- 鼠标打开不强行高亮第一项，避免把“焦点”误看成“已选中”。
- 退出失败显示 `role="alert"` 的错误，不假装已退出；成功后才清空状态。

### 16.4 响应式与触控

- **≥1280px**：完整桌面导航，中间导航绝对居中；右侧语言 + Credits + 头像。
- **640–1279px**：隐藏桌面导航；未登录显示 Create + 汉堡，已登录显示 Credits + Create + 汉堡；用户信息、语言、账户入口在展开菜单内。
- **<640px**：Logo + Create Wallpaper + 汉堡（`/studio` 内隐藏 Create）；展开菜单显示导航、用户信息、Credits & billing、我的账户、账户设置、语言、退出登录。
- 移动端触控目标：汉堡 44px、Create 44px、语言 44px、菜单行 44–48px；语言下拉项 44px。
- 语言切换在移动菜单内完成后自动关闭面板；面板最大高度按 64/80px Header 分别扣除，内部可滚动。

### 16.5 当前页、对比度与 CTA 去重

- 桌面导航当前页为白色药丸 + 紫色圆点；移动导航为浅色背景 + 圆点；均带 `aria-current="page"`。
- Credits 入口在 `/credits` 也标记 `aria-current`；账户菜单中对应项同样标记。
- Logo 扩大了点击热区并保留 focus ring；导航文字使用 `zinc-300`，hover/active 提升到白色。
- Header 顶部叠加深色渐变，保证在 Hero 图片上可读；滚动 >12px 或菜单打开时切为实色背景 + backdrop blur。
- CTA 去重：已登录桌面无 Create；移动端仅一个；Studio 内两种状态均无 Create。

### 16.6 认证、路由与 i18n

- 登录态完全来自现有 `authAdapter.getSession()`；未登录不会伪造头像或余额。
- 登录链接继续使用 `loginHref(pathname)`，保留登录后返回当前页；实测 `/studio` → `/login?next=%2Fstudio`。
- 退出使用现有 `POST /v1/auth/logout`，没有修改 Google OAuth、Session 校验、钱包预留/结算或支付回调。
- 语言切换沿用现有 locale 路由；切换后 URL 与导航文案同步更新。

### 16.7 七语言验证

| locale | Explore | Create |
|---|---|---|
| en | Explore Wallpapers | Create Wallpaper |
| zh | 探索壁纸 | 开始创作 |
| ja | 壁紙を探す | 壁紙を作成 |
| ko | 배경화면 둘러보기 | 배경화면 만들기 |
| es | Explorar fondos | Crear fondo |
| fr | Explorer les fonds | Créer un fond |
| de | Wallpaper entdecken | Wallpaper erstellen |

七语言路由全部返回 200；账单元数据 message key 集合一致；德语 360px 视口无水平溢出（CTA 右边界 283px，视口 360px）。

### 16.8 验证

- Header DOM 测试 **10 项**：未登录导航、Studio 高亮/CTA 隐藏、移动展开、真实 spendable 余额、头像菜单、键盘、退出即时更新、加载/失败、401 过期、Credits 当前页。
- 全量 Web：**185 passed / 24 files**；TypeScript、ESLint、`next build` 通过。
- 浏览器：已登录真实 Session 显示 200 Credits；账户菜单、Studio 当前页、Explore/My Creations 当前页、移动菜单、语言切换均验证；本地退出后 Session 返回 `null`，Header 153ms 内更新。
- 未新增真实 AI 调用、支付调用、Git 提交或部署。

### 16.9 Header 截图

已登录：

- `docs/codex/screenshots/header-signed-in-home-1440.png`
- `header-signed-in-home-1280.png`
- `header-signed-in-home-820.png`
- `header-signed-in-home-390.png`
- `header-signed-in-home-360.png`
- `header-signed-in-account-menu-1440.png`
- `header-signed-in-studio-1280.png`
- `header-signed-in-mobile-menu-390.png`

未登录：

- `header-signed-out-home-1440.png`
- `header-signed-out-home-1280.png`
- `header-signed-out-home-820.png`
- `header-signed-out-home-390.png`
- `header-signed-out-home-360.png`
- `header-signed-out-mobile-menu-390.png`
- `header-signed-out-studio-1440.png`
- `header-signed-out-home-360-de.png`
