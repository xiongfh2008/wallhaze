# WallHaze V2.0 开发前后 UI 对比

日期：2026-10-21
范围：`apps/web`（新前端，dev 端口 3100）
基线：master `b8b7e02` 工作区（含 FE04–FE09 与 R00–R01 未提交成果，全部保留）

---

## 0. 截图核实结论（要求 1）

本轮未收到实际附带的首页截图文件。为满足"核实截图对应项目"的要求，改用只读运行时核实：

| 端口 | 归属 | 核实证据 |
|---|---|---|
| localhost:3000 | **原版 Next.js 项目（旧架构）**，独立运行中 | HTTP 200，`<title>WallHaze — AI Wallpapers for Every Screen</title>`，lang=en；未做任何修改或重启 |
| localhost:3100 | **apps/web（V2.0 新前端）** | HTTP 200，同品牌标题（视觉基线延续）；本轮所有检查与修改均只针对此端口 |

结论：两站同属 WallHaze 品牌体系，视觉基线（黑色深色主题、紫色霓虹渐变、科幻风格、Hero 大图、卡片质感）在 apps/web 中完整延续。开发前已按页面建立截图与结构基线，未用旧代码覆盖新代码，未访问受保护的 `wallhaze/` 子目录。

## 1. 保留的原设计（零回归）

以下视觉与信息架构在修改前后逐项比对，全部保留：

- 品牌名 WallHaze 与站点标题、深色黑底主题、violet/fuchsia 紫色霓虹渐变体系
- Hero 大图（缩放动画 + 左侧暗化文字区）与 "Your Screen. Your World." 主张
- 壁纸卡片视觉：aspect 比例框、渐变加载垫底、hover 缩放、圆角白 10% 描边
- Featured Wallpapers（8–12 张精选）、Popular Styles 六风格直通 Studio（`?style=` 预选）
- TrendingMarquee 视觉横幅、三步 How It Works、最终 CTA 渐变光晕卡片、三列 Footer
- 既有 SEO：canonical/hreflang 七语言、sitemap、noindex 边界（本轮只做减法修正，未删除任何页面收录）
- 全部七语言（en/zh/ja/ko/es/fr/de）与各语言自称的语言切换器

## 2. 优化与修复的页面

均为 R00-WEB 审计确认的问题，本轮全部关闭：

1. **My Creations（下载反馈诚实化，P1）** — 下载结果区分三态：downloaded → "Creation saved"；opened → 明确提示"浏览器拦截了直接下载，已在新标签打开"（amber）；failed → 明确失败提示（red）。修复前 opened 被误报为已保存、failed 无任何反馈。新增下载中 busy 锁定（按钮禁用 + "Downloading…"）防重复点击。
2. **My Creations（再次创作带参，P2）** — "再次创作" 链接现在携带 prompt/styleId/device/ratio/sizePresetId 跳转 Studio，全部参数经 `parseStudioRestore` 受校验、一次性恢复，非法值降级为 null，不携带参考图（历史本就不存参考图）。修复前固定跳 `/studio`，用户需手抄参数。
3. **壁纸详情页（SEO 诚实化，P2）** — 删除 JSON-LD 中无证据的 `creditText: WallHaze` 与 `creator: Organization WallHaze`（种子数据无逐图版权凭据）。
4. **FAQ / Terms 措辞（P2）** — q2A 不再宣称"文件直接保存到设备"；q6A 与 terms.ipBody 不再宣称"可供个人使用"，改为"逐图授权审查中、商业使用未确认"，七语言同步修订。

## 3. 新增功能

- **首页 AI Studio 介绍区块**（`StudioIntro`）：标题 "Design it. Generate it. Set it."，三个能力点（招牌风格 / 精确适配屏幕 / 参考图改编）+ "Open the Studio" 入口按钮 + 手机框视觉预览（复用 DEMO_SAMPLE_IMAGE 与现有渐变语言）。服务端渲染，零客户端 JS。
- **首页 Why WallHaze 区块**（`WhyWallHaze`）：四张事实性卡片（每种屏幕每种比例 / 精选合集 / 诚实标注 / 七种语言），沿用卡片描边 + violet 图标章的设计语言。
- 首页最终结构（对齐推荐结构）：Header → Hero → TrendingMarquee → Featured Wallpapers → Popular Styles（Explore）→ **AI Studio 介绍** → How It Works → **Why WallHaze** → 最终 CTA → Footer。完整壁纸列表在 /wallpapers（Gallery 页，筛选/搜索/排序/分页），完整生成表单在 /studio。
- 新增 DOM 测试 2 项：下载三态文案、下载中 busy 禁用与恢复。

## 4. 功能真实性分级

**已真实可用：**
- 首页/Gallery/详情页浏览、筛选、搜索、排序、分页；图片展示与失效回退
- 本地收藏（localStorage，上限 100，跨组件同步）
- 本地生成历史 + My Creations 查看/删除/下载/坏图状态/带参再次创作
- 下载（同源直接下载；远程图经 API 代理；代理未配置时回退新标签打开并如实提示）
- 七语言切换、Studio 表单编辑（风格/设备/比例/分辨率/提示词/参考图 UI、屏幕尺寸推荐）
- SEO 元数据、sitemap、robots、详情页 JSON-LD（已去无证据字段）

**Mock / 待后端接入（界面诚实标注，未伪装可用）：**
- 真实 AI 生成提交：被 `CREDITS_SERVICES` 三重门（auth/pricing/wallet=false）结构性阻断，Studio 内显示服务不可用说明，不产生任何费用
- 登录/注册：AuthPanel 为禁用入口，AuthAdapter 全部返回 unavailable，无会话
- Credits/钱包/套餐/订单：诚实空态，Checkout 禁用；CreditsAdapter 为拟议前端接口
- 云端 My Creations、账户删除/登出：适配器 unavailable
- apps/api 侧已有健康检查、同步生成与图片代理端点；auth/payment/worker/数据库模块代码已存在但属 R02–R06 范畴，前端六门未开

## 5. 视觉与功能回归检查

修改后 3100 实测（浏览器 7 项回归全部通过）：

- 首页区块顺序正确、新区块正常渲染（en/zh 双语验证），无控制台错误
- "Open the Studio" 按钮正确跳转 /studio
- Gallery 筛选/排序/卡片与详情页图片渲染正常（sakura-nights 实测）
- Studio 表单/风格选择器/My Library 布局完好
- My Creations 空态正常
- 无横向溢出（scrollWidth 1131 ≤ innerWidth 1146）
- 图片比例框、文字可读性、品牌色均无变化；未删除任何视觉资源

质量门槛：`tsc --noEmit` 0 错误；`eslint .` 0 错误；`vitest` **127/127 通过**（13 文件）。

## 6. 过程事件（透明记录）

- 检测到并行 Codex 会话与我同时修改 apps/web（GeneratorSection、详情页、MyCreationsClient 在数分钟内被另一写入方修改，其遗留的 `lib/studio/restore.ts` 存在花括号不闭合的语法错误）。经用户确认后停止该会话运行时，由本会话接管：修复语法错误、收尾 My Creations 接线与三态反馈、补测试，并对旧会话已完成的 JSON-LD/FAQ 修复逐项验证。
- 所有未提交工作（含 apps/api 的 R02–R06 模块、七语言 +330 行等）按 PLAN 约束原样保留，未执行任何 Git 写操作，未触碰 3000 端口与受保护目录。

## 7. 原则声明

本轮未重设计品牌、未更换配色/Logo/设计体系；在保留 WallHaze 现有视觉优势的前提下，补齐了首页推荐结构中缺失的两个区块，并将商业化相关界面的诚实性缺口（下载反馈、再次创作、授权措辞、创作者归属）全部关闭。真实付费能力仍处于明确的待接入状态，未伪装可用。
