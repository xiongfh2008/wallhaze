# WallHaze Studio 与 Credits UI/UX 专项改造报告

- 日期：2026-10-23
- 范围：`apps/web`（Studio、Credits）、`apps/api` 的只读钱包字段
- 未启用真实 fal.ai、未修改 FAL_KEY、未产生费用、未改钱包余额、未改支付/OAuth/Worker、未 Git 提交

## 1. 使用的 Skill / 设计指南

本轮**没有安装任何全局 CLI 或第三方 Skill**，也没有执行项目级安装脚本。检查了 `.claude/`、`.zcode/`、`.agents/`，项目内没有 UI Skill 目录；因此直接阅读官方文档并把规则应用到代码：

- **UI UX Pro Max**（GitHub README）：
  - 先审计硬编码值 → 映射到语义角色（背景、表面、前景、主色、边框、聚焦）→ 小批量组件迁移；
  - 避免行业 anti-pattern、避免依赖颜色表达状态、chips 换行、可见 focus、`prefers-reduced-motion`、在 375/768/1024/1440 检查。
- **Anthropic frontend-design `SKILL.md`**：
  - 有意的字阶与排版；避免“SaaS 卡片套件”（所有卡片同一圆角/阴影/渐变）；
  - 结构本身承载信息；单一记忆点；给主要内容留白；
  - 移动端可用、键盘 focus、减少无关动效；CTA 使用主动、明确的动词。
- **Vercel web-interface-guidelines `command.md`**：
  - 语义 HTML 优先；icon-only 按钮 aria-label；图片 alt；可见 `focus-visible`；
  - `min-w-0`、`break-words`/`line-clamp` 处理长文本；`tabular-nums`/`Intl` 处理数字与日期；
  - 不隐藏 zoom、不用 `transition: all`、空态与错误态清晰；避免可点击 div。

说明：IAB 自带截图在本轮返回 `browser screenshot activity capture failed for guest`（连 about:blank 也失败），因此视觉验收改用**本机 Headless Edge + CDP**（真实 Chromium，未安装新依赖，使用本地已登录 Session），在 5 个指定视口渲染并截图。

## 2. 改造前审计

| 页面 | 问题 |
|---|---|
| Studio | 左侧固定 420px；右侧预览 `max-w-sm`（384px），1440 下右侧约 300px 空白；风格卡在 420px 内三列，描述被截断；Prompt/设备在首屏之外；灵感 4 条全部铺开；My Library 与 My Creations 信息重复 |
| Studio 移动端 | 风格 → Prompt → 设备 → 主体 → 预览 → 生成，路径很长；首屏只有风格，预览很远；主 CTA 不在首屏 |
| Credits | 容器 896px，1440 下两侧大量留白；余额、套餐、流水、订单平铺；余额只有一个总数；没有 Reserved / 预计生成次数；流水出现 `+0` 的内部事件（Mock/预留）；套餐无预估次数/单价；订单只有一行摘要；FAQ 是长静态列表 |

视觉基线截图：`docs/codex/screenshots/baseline-{studio,credits}-{1440,1280,820,390,360}.png`。

## 3. 改造后结构

### Studio

- 内容容器 **1320px**，Header 与本页同宽；移动端 `px-6` 单列。
- 桌面双栏：**5fr / 7fr**（约 505 / 700 @1440），`gap-12`；右侧 `lg:sticky lg:top-28`。
- 左栏顺序：**风格 → Prompt → 设备与尺寸 → 主体参考图 → Mock/费用 → 生成**（通过 flex order 重排，DOM 仍保持原逻辑顺序）。
- 风格：默认 6 个缩略卡，3 列；`展开全部 17 个风格` 全宽按钮；搜索/分类/选中/取消选择保留；卡片 16:10，描述 1 行，减少高度。
- Prompt：默认只显示 2 条灵感，`更多灵感（+N）` 展开；随机灵感保留；原有“填入/追加/确认”逻辑未改。
- 设备：摘要行显示设备 + 比例 + 输出尺寸；点击展开手机/平板/电脑/自定义；自动推荐与后端校验保留。
- 预览：桌面最大 720px（原 384px），手机最大 260px、平板 420px；按比例显示、不拉伸；空态说明尚未生成；Mock 结果有明确标注。
- My Library：仅显示最近 8 条收藏/历史（横向滚动），提供“在「我的作品」中查看全部”；完整列表仍由 My Creations 管理；收藏/历史不被清空。
- 生成：Mock 模式提示、价格/余额、真实状态门控（未登录/不足/暂停/提交中/生成中/成功/失败）全部保留。

### Credits

- 容器 **1120px**，Header 同宽。
- 结构：**A 积分概览 → B 购买套餐 → C 积分流水 → D 充值订单 → E FAQ 折叠**。
- 概览：Available Credits 大数字、当前余额/已预留 chips、预计可生成次数、估算依据、购买 CTA。
- 套餐：后端真实套餐；每卡显示 Credits、价格、预计生成次数、每积分单价；仅当**真实单位价格最低且唯一**时显示“单积分最划算”，没有虚构“最受欢迎”。
- 流水：筛选（全部活动/充值/AI 消费/调整/内部记录）、`aria-pressed`、分组说明、加载更多、时间与正负值；默认隐藏内部预留/Mock 事件，内部筛选可查看，绝不删除 Ledger。
- 订单：`<details>` 摘要 + 详情（订单号、套餐、创建时间、状态）、Pending 刷新状态并给出“仍在处理中”反馈；不伪造成功。
- FAQ：原生 `<details>/<summary>` 折叠，键盘可用、focus ring、语义化。

## 4. 修改文件

- `apps/web/app/[locale]/studio/page.tsx`：1320px 容器、紧凑标题区、Header 对齐。
- `apps/web/components/GeneratorSection.tsx`：5/7 双栏、左栏顺序、预览尺寸、灵感折叠、My Library 最近 8 条 + 查看全部、文本字号/提示。
- `apps/web/components/StylePicker.tsx`：16:10 缩略图、1 行描述、全宽“展开全部”按钮。
- `apps/web/components/Header.tsx`：`maxWidthClassName`，Studio/Credits 与页面容器对齐。
- `apps/web/app/[locale]/credits/page.tsx`：1120px 容器、FAQ accordion、Header 对齐。
- `apps/web/components/credits/CreditsClient.tsx`：概览/套餐/流水/订单重构、筛选、分组、详情、刷新状态、aria-live。
- `apps/web/lib/api/credits.ts`：`reserved`、`reservedDelta`、`generationMode`/`paused` 类型。
- `apps/api/src/business/routes.ts`：钱包只读返回 `reserved`；流水返回 `reservedDelta`（无业务逻辑变更）。
- `apps/web/tests/credits-panel.dom.test.ts`：适配新概览断言。
- `apps/web/messages/{en,zh,ja,ko,es,fr,de}.json`：新增概览/筛选/订单/灵感/查看全部等文案。
- 截图：`docs/codex/screenshots/`（before/final）。

## 5. Studio 改造效果

- 1440：左栏 505、预览约 700×520；预览成为视觉主体，右栏不再空置；Header/内容左边缘对齐。
- Prompt 与设备在风格区下方连续出现，生成区与预览同屏（滚动后左栏顺序为 Prompt→设备→主体→生成）。
- 风格默认 6 个、描述可读、提供全宽“展开全部”；灵感默认 2 条 + 展开。
- 预览空态、Mock 提示、价格/余额/生成按钮层级清晰；生成功能在改造后仍实际可用（浏览器验证）。
- My Library 变为紧凑最近作品区，完整列表入口清晰。

## 6. Credits 改造效果

- 1440：概览与套餐在首屏；套餐按钮可见；单价/预计次数可比较；Studio 套餐显示客观“单积分最划算”。
- 流水默认展示用户真正关心的活动（当前账号仅有 `ops.grant +200`）；切到“内部记录”显示 12 条预留/Mock 事件，每条有“内部”“未扣费”“可用余额不变”，不再以 `+0` 冒充消费。
- 订单可展开查看完整订单号/套餐/创建时间；Pending 有明确状态与刷新反馈。
- FAQ 折叠，移动端可逐项展开。
- 移动端 390/360：无横向滚动，套餐/流水/订单/FAQ 单列可读。

## 7. 布局与规范

| 令牌 | 使用 |
|---|---|
| 内容容器 | Studio 1320px；Credits 1120px；页面 `px-6` |
| 桌面网格 | `5fr / 7fr`，`gap-12`；预览 `max-w-[720px]`，sticky `top-28` |
| 间距 | 区块 40–48px；卡片 p-5/p-6/p-8；表单项 16–24px |
| 字号 | h1 30/48、区块标题 20、正文 14–16、辅助 12–14；关键正文不再用 11px |
| 按钮 | 主 CTA 44px+；卡片/筛选 36–44px；全宽移动端按钮 |
| 状态 | 文字 + 颜色 + 徽标；`aria-pressed`/`role=status`/`aria-live`；focus-visible ring |
| 组件 | 原生 details/summary、语义 dl、`break-all` 订单号、`min-w-0`、`line-clamp` |

## 8. Desktop / Tablet / Mobile 截图

改造前：

- `baseline-studio-1440.png` / `baseline-studio-1280.png` / `baseline-studio-820.png` / `baseline-studio-390.png` / `baseline-studio-360.png`
- `baseline-credits-1440.png` / `baseline-credits-1280.png` / `baseline-credits-820.png` / `baseline-credits-390.png` / `baseline-credits-360.png`

改造后：

- `final-studio-1440.png` / `final-studio-1280.png` / `final-studio-820.png` / `final-studio-390.png` / `final-studio-360.png`
- `final-credits-1440.png` / `final-credits-1280.png` / `final-credits-820.png` / `final-credits-390.png` / `final-credits-360.png`
- 局部：`final-studio-prompt-1440.png`、`final-credits-history-1440.png`、`final-credits-history-390.png`、`final-credits-internal-1440.png`、`final-credits-orders-1440.png`、`final-credits-order-detail-1440.png`、`final-credits-faq-1440.png`、`final-credits-faq-390.png`
- 多语言：`final-en-studio-1440.png`、`final-en-credits-1440.png`、`final-en-credits-390.png`、`final-ja-credits-1440.png`

## 9. 七语言验证

- 7 locales × 2 pages × 3 viewports（1440/390/360）= **42 次** DOM/布局检查：0 个原始 i18n key、0 个 `NaN/undefined`、0 个横向溢出。
- 七份 messages 的 key 集合对齐（en 为基线，无缺失/多余）。
- 英文/日文截图确认套餐、概览、订单、筛选无截断；长标签自然换行。

## 10-13. 工程检查

| 检查 | 结果 |
|---|---|
| API TypeScript | 通过 |
| API Vitest | **206 passed，1 skipped**（29 文件） |
| API Build | 通过 |
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **171 passed**（22 文件） |
| Web Build | 通过 |

## 14. 浏览器交互检查

- 改造后在真实页面完成一次 Mock 生成：选择赛博朋克 → 输入 Prompt → 确认 → 预览出现图片 → Mock 提示存在；钱包仍为 200（Mock 释放，不扣费）。
- Credits：默认流水只有可理解的活动；点击“内部记录”展示预留/Mock 事件；展开订单详情看到订单号/套餐/时间/刷新按钮；FAQ 展开显示答案。
- Header 与页面容器对齐；Sticky 预览不遮挡 Footer；390/360 无横向滚动。

## 15. 功能回归

- 未修改登录、Google OAuth、支付、Worker、AI Provider、Credits 结算逻辑。
- 钱包 API 只新增只读 `reserved`，流水新增只读 `reservedDelta`；`available` 在 Studio 门控中使用，后端仍是最终权威。
- Mock 生成不扣费；未执行真实 AI/支付；钱包余额未被改动。
- My Library 收藏/历史读取逻辑未改，只限制展示条数；完整列表仍在 My Creations。

## 16. 尚待完善

1. Studio 首屏仍以 6 个风格卡为主，Prompt/设备需要短滚动才能看到（为满足“默认 6 个风格”的取舍）；如希望首屏同时露出 Prompt，可把默认卡片减为 3 或把风格区做成可折叠。
2. 流水筛选/展开状态尚未写入 URL，刷新后回到默认“全部活动”；可后续加 `?filter=` 深链。
3. IAB 截图服务不可用，本轮视觉截图来自 Headless Edge CDP；真实桌面 Chrome 的字体抗锯齿可能略有差异。
4. 预览空态显示比例取决于设备检测（Headless 1440×900 推荐 4:3；IAB 环境推荐 16:9），推荐逻辑未改。
5. Mock 结果会进入云端作品并在 My Creations 标“模拟”；Studio 本地历史按原设计不写入 Mock。
6. 未做真实 AI/支付/生产环境验证。
