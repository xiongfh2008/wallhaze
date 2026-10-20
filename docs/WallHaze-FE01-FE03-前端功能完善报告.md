# WallHaze FE01–FE03 前端功能完善报告

- 日期：2026-10-21
- 范围：`apps/web`（FE01 全局 UI 与基础布局、FE02 Gallery、FE03 Gallery SEO），仅触及前端及前端 API 契约引用层
- 前置：T04-S2 前后端 API 迁移已完成并验收
- 结论：**通过（FE01–FE03 全部实施并验证；下载能力对远程图存在一项 T04 架构层面的既有限制，详见第七、十二节）**
- 本轮之后停止，等待下一阶段授权。未实施 FE04–FE09，未 Git Commit/Push，未部署。

> 说明：仓库当前尚无基线 commit（`git status` 下 `apps/`、`packages/` 等均为 untracked），以下"新增/调整"划分以本次会话实施记录为准。

---

## 一、实际修改文件

### 新增

| 文件 | 职责 |
| --- | --- |
| `components/ui/Button.tsx` | 按钮（variant/loading/aria） |
| `components/ui/Input.tsx` | 输入框（label/错误态/无障碍） |
| `components/ui/Select.tsx` | 下拉选择（原生 select 封装） |
| `components/ui/Modal.tsx` | 模态层（焦点管理、Esc 关闭、遮罩、滚动锁定） |
| `components/ui/Dialog.tsx` | 确认对话框（基于 Modal + Button） |
| `components/ui/Tabs.tsx` | 标签页（role=tablist、方向键切换） |
| `components/ui/Dropdown.tsx` | 下拉菜单（键盘导航、外部点击关闭） |
| `components/ui/Toast.tsx` | 轻提示堆栈（success/warning/error、手动关闭） |
| `components/ui/Skeleton.tsx` | 骨架屏 |
| `components/ui/EmptyState.tsx` | 空状态（图标+文案+可选动作） |
| `components/ui/ErrorState.tsx` | 错误状态（重试动作） |
| `components/ui/Spinner.tsx` | 加载指示器 |
| `components/ui/ImageCard.tsx` | 壁纸卡片（Link 主链接 + 下载/收藏按钮，aria 含标题） |
| `components/ui/ImagePreview.tsx` | 大图预览 |
| `components/ui/Pagination.tsx` | Load More / 计数展示 |
| `components/FeaturedWallpapers.tsx` | 首页精选壁纸（服务端组件 + 磁贴） |
| `components/HowItWorks.tsx` | 首页 How It Works 三步说明 |
| `components/WallpaperDownloadButton.tsx` | 详情页下载控件（三态 toast） |
| `components/StudioStylePreselect.tsx` | `/studio?style=<id>` 跨页风格预选（客户端事件） |
| `lib/seo.ts` | SEO 中心化：`SITE_URL`、locale URL 构造、hreflang alternates、OG locale 映射 |

### 调整 / 重构

| 文件 | 变更 |
| --- | --- |
| `components/Header.tsx` | 新导航：Explore / AI Studio / My Creations / Credits / 登录入口 / 语言切换 / 移动端菜单；未实现项用 `ComingSoonEntry` 明确受限入口 |
| `components/Footer.tsx` | 三列（Product / Company / Legal）：Explore、AI Studio、How It Works、FAQ、About、Contact、Privacy、Terms、Copyright |
| `components/Hero.tsx` | 双 CTA：主 "Explore Wallpapers" → `/wallpapers`；次 "Create with AI" → `/studio`；footnote 改为中性能力描述（无免费 AI 生成承诺） |
| `components/PopularStyles.tsx` | 服务端组件化；入口改为 "try it in the AI Studio"（`/studio?style=`） |
| `components/GeneratorSection.tsx` | 占位交互替换为 Dialog / Tabs / EmptyState |
| `components/Lightbox.tsx` | 基于 Modal + ImagePreview 重构，含 retry |
| `components/TrendingMarquee.tsx` | 保留，文案适配 |
| `app/[locale]/page.tsx` | 首页结构重排：Hero → Featured → Popular Styles → How It Works → Gallery 预览 → CTA/Footer |
| `app/[locale]/wallpapers/page.tsx` | 列表页（搜索/筛选/排序/Load More/空态） |
| `app/[locale]/wallpapers/[slug]/page.tsx` | 详情页（大图/元信息/授权框/相似推荐/SEO/JSON-LD） |
| `app/[locale]/studio/page.tsx` | 支持 `?style=` 预选（Suspense 包裹读取 searchParams） |
| `app/sitemap.ts` | 接入 `lib/seo.ts`，42 URL × 8 hreflang alternates |
| `app/robots.ts` | 核对保留：全允许 + Sitemap 指向 |
| `lib/wallpapers.ts` | 静态授权字段 `licenseStatus`（见第六节）；补 `StyleCategory` 类型导入（修复构建错误） |
| `lib/download.ts` | `downloadImage()` 三态结果（downloaded/opened/failed），文件名不泄漏 URL |
| `messages/en.json` `zh.json` `ja.json` `ko.json` `es.json` `fr.json` `de.json` | 七语言同步更新：新增 `featured`/`howItWorks`/`detail`/`ui`/`pagination` 等命名空间，改值（nav.studio 等），删除废弃 key（`why` 整节等）；各 403 keys 结构一致（脚本校验通过） |

### 删除

- `components/WallpaperGallery.tsx`（被 WallpaperBrowser 取代）
- `components/WhySection.tsx`（内容并入 How It Works）

---

## 二、新增页面与路由

| 路由 | 说明 | 预渲染 |
| --- | --- | --- |
| `/[locale]` | 新首页结构 | ○ Static ×7 locale |
| `/[locale]/wallpapers` | 壁纸列表页 | ○ Static ×7 |
| `/[locale]/wallpapers/[slug]` | 壁纸详情页，39 slug × 7 locale | ◐ PPR（含 RSC 数据段） |
| `/[locale]/studio` | Studio（本轮增强 `?style=` 预选，未实施 FE04 功能） | ○ Static ×7 |
| `/robots.txt`、`/sitemap.xml` | Metadata Routes | ○ Static |

构建共生成 **310 个静态页面**；`cacheComponents: true` 与 `partialPrefetching` 保持开启（未为 SEO 关闭）。所有 Header/Footer 导航链接均指向真实可达路由；My Creations、Credits、登录入口为明确的受限入口（ComingSoonEntry，不假装功能可用）。

## 三、新增组件

见第一节清单。15 个 `ui/` 组件全部可复用、类型完整、按暗色基调设计；组件间组合使用（Dialog 基于 Modal，Toast 供下载/收藏反馈，ImageCard 供列表与精选，Lightbox 由 Modal + ImagePreview 组成）。 FE01 要求的 15 个组件全部落地。

## 四、Gallery 功能完成情况

- **数据源**：保留 39 条静态 `PRESET_WALLPAPERS`，未连接 PostgreSQL。
- **首页**：Hero Banner、主 CTA（Explore Wallpapers）、次 CTA（Create with AI）、Featured Wallpapers、Popular Styles 分类入口、How It Works、响应式瀑布流、Footer——全部完成。**未提供免费 AI 生成承诺**（文案明确"免费画廊下载 · AI 生成在 Studio"）。
- **列表页**：壁纸网格、风格分类（family/category 芯片）、关键词搜索、排序（default/name）、Load More（每页 12，Showing 12 of 39 → 24 of 39 …）、空结果提示（含清除筛选）、卡片图片加载失败状态、收藏（localStorage）。
- **详情页**：见第六节。
- **移动端**：浏览器实测中文/英文首页、列表、详情布局正常。

## 五、搜索及筛选功能

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 关键词搜索 | ✅ | 实时过滤标题/描述/风格 |
| 风格分类 | ✅ | Style family + category（sketch/painting/digital/photography/nature/abstract/horror）芯片过滤 |
| 排序 | ✅（受限） | 仅 default / name——数据无下载量、创建时间字段，**未虚构热度排序** |
| 设备尺寸筛选 | ⛔ 隐藏 | 静态数据无 width/height 元数据，按要求说明并隐藏，不虚构尺寸 |
| 空结果 | ✅ | EmptyState + 清除筛选动作 |
| 图片加载失败 | ✅ | 卡片级失败态 |

浏览器实测：搜索过滤、分类芯片、排序切换、Load More 计数、空态+清除均正常。

## 六、壁纸详情页

- 路由 `/wallpapers/[slug]`（locale 前缀按 next-intl 规则），slug 即稳定 id，39 张全部唯一稳定。
- 内容：大图（ImagePreview）、标题、风格（链接到列表页对应过滤）、Category、Alt 文本、下载按钮、琥珀色授权框、"Create similar" → `/studio?style=`、相似风格推荐 8 张、返回 Gallery 链接；移动端单列布局实测正常。
- **授权机制（任务书特别要求）**：`lib/wallpapers.ts` 增加静态字段 `licenseStatus: "review-pending" | "verified"`，**39 张全部默认 `review-pending`**。详情页显示"License review pending"徽标与说明文案（明确商用授权未确认，不得视为可商用）；仅 `verified` 才会显示已审核状态。未虚构任何"已审核/可商用"标记。
- 仅展示真实已知信息（标题/风格/类别）；无分辨率、上传时间、下载量等字段，未虚构。

## 七、下载功能

- 免费、无需登录、不调用付费 AI（下载走纯前端 Blob 流程，与 Studio 生成 API 无关）。
- `lib/download.ts` 策略：fetch 为 Blob → 对象 URL 触发下载 → 文件名 `wallhaze-{id}-{时间戳}.{ext}`（扩展名来自 MIME 白名单），**服务器路径与远程 URL 均不泄漏**；不提供任意远程 URL 代理参数（代理仅对内置白名单 host 由 `lib/api/images.ts` 构造）。
- 三态诚实上报（Toast，5 秒自动消失）：
  1. `downloaded` — 真实下载成功；
  2. `opened` — fetch 失败（CORS/网络）时回退新标签页打开**原图**，明确提示"已打开"而非"已下载"；
  3. `failed` — 弹窗被拦截等，明确失败提示。
- **能力分级（如实说明）**：本地图片（31 个风格图 `/images/styles/*.jpg`，覆盖大多数画廊壁纸）同源，**永远真实下载**；远程图（6 个流行风格图 + HERO/DEMO 覆盖图，来自 `trae-api-cn.mchost.guru`）在 `NEXT_PUBLIC_API_BASE_URL` 未配置（无 API 图片代理）时走 `opened` 回退。此为 **T04-S1/S2 已验收的架构决定**（前端不再持有 `/api/image` 代理），非本轮回归；配置后端后远程图亦真实下载。
- 浏览器实测：三态 toast 均出现且文案正确。

## 八、SEO 与 Sitemap

`lib/seo.ts` 集中管理（`SITE_URL=https://wallhaze.com`）。

**每张详情页**（抽样验证 `en/wallpapers/sakura-nights` 产物 HTML）：

| 项目 | 结果 |
| --- | --- |
| 唯一 URL / Canonical | ✅ `https://wallhaze.com/wallpapers/sakura-nights` |
| 动态 Title / Meta Description | ✅ `t.has()` 英文回退（见第九节），未虚构翻译 |
| Open Graph / Twitter Card | ✅ og:title / og:description / og:image / og:url / og:locale、twitter:card=summary_large_image |
| 图片 Alt | ✅ 使用壁纸 alt（英文回退策略） |
| 结构化数据 | ✅ JSON-LD `ImageObject`（name/description/contentUrl 等）；**不含** license 与尺寸声明（避免对未核实授权与未知尺寸作虚假结构化断言） |
| Sitemap Entry | ✅ 39 张全部收录 |

**Sitemap**：42 URL（首页 + /wallpapers + /studio + 39 详情）× 8 alternates（7 语言 + x-default）= **336 个 xhtml:link**。未提供 lastmod（Cache Components 禁止预渲染期动态值，硬编码日期会失真——已在代码注释说明）。

**robots.txt**：全站允许 + Sitemap 指向。

**hreflang 核对**（首页 / Studio / 详情页均验证）：7 语言 + x-default（→ en）完整，URL 与 `localePrefix: "as-needed"` 规则一致（en 无前缀，其余 `/xx`）。

## 九、多语言情况

- en / zh / ja / ko / es / fr / de 七语言按**现有 next-intl 配置**生成路由，未改动语言框架。
- 七个 messages 文件各 **403 keys，结构完全一致**（node 脚本校验），本轮新增/改值/删除全部七语言同步。
- **英文回退策略**：壁纸标题/描述等未翻译内容通过 `t.has()` 判断——非英文 locale 回退英文值，不虚构当地语言内容；详情页 `generateMetadata` 同样回退，避免将重复内容作为独立本地化页面推广（配合 hreflang 正确标注）。
- 实测：`/` 因 next-intl 浏览器语言检测自动重定向至 `/zh`（`localePrefix: "as-needed"` 既定配置行为，非缺陷）；`/en` 直达正常。中文首页/详情页渲染正确（`html lang="zh-CN"`、导航"探索 / AI 工作室"、授权"审核中"等）。
- OG locale 已按语言映射（og:locale / og:locale:alternate）。

## 十、移动端和无障碍情况

- **响应式**：桌面/平板/手机断点适配；Header 移动端菜单、列表网格列数自适应、详情页移动端单列；浏览器实测通过。
- **无障碍**：交互组件带 aria-label（下载按钮含进行中状态文案、卡片 aria 含壁纸标题、Toast 可关闭）；Modal 焦点管理 + Esc 关闭；Tabs 方向键；Dropdown 键盘导航；图标按钮均有可访问名称；语言切换为真实链接导航。
- **视觉**：暗色为默认基调，全套组件风格统一；不使用无意义占位按钮（受限入口均明确标注 coming-soon 性质）。
- **性能**：图片懒加载 + 首屏优先级、固定宽高比防布局抖动、列表分页（Load More）控制单次 DOM、页面静态预渲染优先（310 页中仅详情页含 RSC 数据段）、UI 组件按需 "use client"（Featured/Popular Styles/How It Works 均为服务端组件，减少客户端 JS）。

## 十一、TypeScript 与测试结果

| 检查 | 结果 |
| --- | --- |
| `npm run build`（apps/web） | ✅ 通过：TS 检查通过、310 静态页生成（修复了一处 TS2304：`lib/wallpapers.ts` 补 `StyleCategory` 类型导入） |
| `npm run lint`（apps/web） | ✅ 0 errors / 0 warnings（清理了 `app/sitemap.ts` 未使用的 `routing` 导入后复验通过） |
| `npm test`（apps/web，vitest） | ✅ 无测试文件，`--passWithNoTests` exit 0 |
| `npm test`（apps/api，T03 原始测试） | ✅ **9 个测试文件全部通过：100 passed \| 1 skipped**（本轮未触碰 apps/api，测试完好） |
| 构建产物抽样 | ✅ canonical/hreflang×8/OG/Twitter/JSON-LD/License 徽标文案均存在 |
| 浏览器验证 | ✅ 两轮共 19 项检查通过（首页/列表/详情/中文页/Studio 预选/下载三态 toast），无阻塞性 console 错误 |

检查失败处理记录：唯一一次构建失败即上述 TS2304，通过修复类型导入解决，未删除或修改任何测试。

## 十二、未完成或受数据限制的功能

1. **设备尺寸筛选/排序维度**：静态数据无 width/height、下载量、创建时间字段 → 尺寸筛选隐藏，排序仅 default/name。后续若数据补充真实元数据即可开启。
2. **远程壁纸图的"真下载"依赖后端代理**：`NEXT_PUBLIC_API_BASE_URL` 未配置时远程图下载回退为"新标签页打开"（诚实提示）。属 T04 已验收架构，部署时配置 API 地址即自动升级为真下载。
3. **壁纸商用授权**：39 张全部保持 `review-pending`，需逐张人工核实后由数据审核流程改为 `verified`（上线审核机制已预留字段与三态 UI）。**本轮未将任何壁纸标记为可商用/已审核。**
4. **My Creations / Credits / 登录**：Header 为明确受限入口（coming soon 样式），不假装功能可用——按任务书要求留待 FE05–FE08。
5. **`/` 根路径重定向**：next-intl 浏览器语言检测行为（如需改为固定英文落地，属产品决策，待授权后调整）。
6. **apps/web 无自动化测试**：本轮按"运行已存在且适用的安全测试"执行（T03 全通过）；前端单测建议随 FE04 一并规划（见第十四节）。

## 十三、是否影响原项目或后端

- **未影响**。本轮修改全部位于 `apps/web`（组件/页面/lib/messages）；未访问受保护 `wallhaze/` 子目录；未修改原 Next.js 项目；localhost:3000 未受影响（开发/验证均使用 3100 端口，已停止）。
- 未访问真实 fal.ai、未创建支付、未连接生产数据库、未使用真实密钥（下载为纯前端行为，生成 API 仅在已有 T04 客户端封装内）。
- 未修改 apps/api 任何文件；T03 测试 9/9 文件通过复验确认后端完好。
- `cacheComponents: true` 未关闭。

## 十四、FE04 AI Studio 的后续实施建议（仅设计，未实施）

1. **表单结构**：提示词编辑复用 `ui/Input`（长文本可加 Textarea 变体）；风格选择复用 `WALLPAPER_STYLES` 数据 + Tabs/卡片网格；设备与比例复用 `lib/sizes.ts` + `ui/Select`；参考图上传受后端契约约束（data URI、10 MiB、JSON body）——前端仅做体积/类型预检，真实校验以后端为准。
2. **Credits 价格提示**：定价属后端职责。建议 `packages/contracts` 扩展（如 generations 响应携带 cost 或独立 pricing 端点），前端只展示后端返回的价格，**前端不自行计算或扣减**。
3. **生成流程**：T04 的 `generateWallpaper()` 已具备取消（AbortSignal）、150s 预算、typed 失败（ApiFailure + Retry-After）——FE04 可直接构建：进度 UI（Spinner + 阶段文案）、失败/重试（透出 retryAfterSeconds）、结果预览（ImagePreview）与下载（复用 `downloadImage`，Studio 生成图走后端代理即真下载）。
4. **生成确认**：提交前用 `ui/Dialog` 展示风格/尺寸/预计消耗，明确"将消耗 Credits"；在 FE06 之前提交动作保持受限态，不得伪造扣费或生成成功。
5. **历史与作品**：生成历史暂用现有 `lib/history.ts`（localStorage），FE07 时设计向云端迁移提示；UI 文案不得声称"已保存到云端"。
6. **测试**：建议本轮后为 `ui/` 组件与 Studio 表单补充 vitest 单测（Mock Adapter 注入点已预留），FE04 实施时一并交付。
7. **依赖顺序**：FE04 完整体验依赖 FE05（登录）与 FE06（Credits 余额）；若先做 FE04，保持"配置完整、提交受限"与现有 ComingSoonEntry 策略一致。

---

**FE01–FE03 到此完成并停止。** 未实施 FE04–FE09，未 Git Commit/Push，未部署，等待下一阶段授权。
