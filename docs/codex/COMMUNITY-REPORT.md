# WallHaze Community 第一期开发展示与邮箱投稿验收报告

- 日期：2026-10-24
- 范围：`apps/web` Community 页面、详情页、邮件投稿入口、人工导入/下架 CLI、导航与七语言；复用现有 Gallery、媒体组件、Style Registry 和媒体授权 registry
- 结论：**Community 第一期已可展示验收。** 当前公开的是 **8 件 Platform Showcase 平台示例**；**真实创作者投稿为 0 件**，Community Submissions 显示真实空态，没有虚构作者、点赞、下载量或投稿记录。唯一投稿渠道是 `mailto:` 邮件，没有在线表单/上传/API，也没有自动发布。

## 1. 新增页面和路由

| 路由 | 作用 |
|---|---|
| `/[locale]/community` | Community 首页、平台示例、投稿空态、筛选、邮件投稿说明、举报入口 |
| `/[locale]/community/[slug]` | 作品详情；当前为 8 个平台示例生成 8 个静态详情页 |

已接入 Header 主导航 `Community / 社区`、Footer `Community` 与 `Submit a Wallpaper`，并加入 sitemap。未知或未发布 slug 返回 404。

## 2. Community 设计与信息架构

页面保持 WallHaze 深色/紫色霓虹风格：

1. **Hero**：Community Gallery / 创作者社区；副标题；`Explore Creations`、`Submit by Email`、`How submission works`。
2. **筛选工具栏**：媒体（All/Static/Live）、设备（All/Phone/Tablet/Desktop）、风格（复用现有 53 个 Style Registry，不新建风格体系）、结果数量、重置。
3. **Platform Showcase**：8 件平台示例，明确标注“平台示例 · 非社区投稿”。
4. **Community Submissions**：真实空态“还没有公开的创作者投稿”；未来人工上架后才出现 Editor's Picks / Latest。
5. **邮件投稿区**：邮箱、复制、打开邮件客户端、主题、完整模板、六条投稿须知。
6. **举报区**：邮件举报，包含作品名称/链接/问题/权利证明字段。

## 3. 邮箱投稿入口

- 唯一正式邮箱：**xiongfh2000@gmail.com**
- Hero 的 `Submit by Email` 和空态 CTA 都使用 `mailto:`，会打开用户本机邮件客户端。
- 页面同时显示可选中邮箱地址和“复制邮箱”按钮；Clipboard 不可用时回退到旧式复制；失败时明确提示手动选择，不伪造成功。
- 没有表单、文件输入、上传按钮、提交 API 或 SMTP 发送。
- `mailto:` 只负责打开客户端；页面明确说明“WallHaze 不会发送邮件，也不会确认投稿已发送”。

## 4. 投稿邮件模板

主题固定为：

```text
WallHaze Wallpaper Submission
```

正文为稳定的中文审核格式（显示在页面并编码进 mailto）：

```text
作品名称：
作者昵称：
作品类型：静态 / 动态
适配设备：手机 / 平板 / 电脑
作品说明：
创作方式：原创 / AI 辅助 / AI 生成
作品来源及素材授权：
是否允许公开下载：是 / 否
拟授权的展示、下载及使用范围：
作者署名方式：
联系邮箱：

请将壁纸文件作为邮件附件，或提供安全的文件下载链接。
```

页面提示：不自动发布、必须人工审核、投稿人需拥有权利、邮件不代表通过、不要提交未授权人像/动漫角色/商标/第三方作品、站长可能要求补充版权资料。

## 5. 线下人工审核流程

1. 站长收到邮件与附件。
2. 检查文件完整性、MIME、实际尺寸/比例、视频实际编码与时长。
3. 检查作者权利、素材来源、授权证据、是否涉及第三方人物/角色/商标。
4. 判断是否适合展示、是否允许下载、下载许可范围。
5. 通过后运行本地导入 CLI；不通过则保留邮件记录，不进入公开数据。
6. 发布后如需修改/下架，运行下架 CLI。

没有审核后台、没有自动审核、没有投稿用户账户。

## 6. 手动上架操作步骤

使用 `apps/web/scripts/community/import-submission.mjs`：

```bash
cd apps/web
node scripts/community/import-submission.mjs \
  --inbox ../../community-inbox/my-work \
  --dry-run

node scripts/community/import-submission.mjs \
  --inbox ../../community-inbox/my-work \
  --reviewer <name> \
  --publish
```

- inbox 需要 `submission.json` + 媒体文件；示例见 `scripts/community/submission.example.json`。
- `--dry-run` 只校验，不写文件。
- 只有显式 `--publish` 且 `allowPublicDisplay=true`、必要字段/授权证据齐全时才写入公开 `works.json`。
- 会自动校验：JPEG/PNG/WebP/MP4 真实魔数、实际宽高、设备类别、MP4 `moov`/`tkhd`/`mvhd` 时长、风格 ID、重复 slug、公开资产冲突。
- 静态预览用 `sharp` 压到最大 1280px；视频必须提供真实 MP4 和 Poster；仅欣赏视频必须有独立更小的 preview。
- 下载许可为真时原文件进入 `public/community/downloads/`；仅欣赏时原文件进入 `private-media/community/originals/`。
- 联系邮箱、授权证据引用只写入 `private-media/community/reviews/<slug>.json`，不进入公开 JSON。
- 发布后需重新构建并重启；未审核记录不会因为放进目录就自动发布。

## 7. 作品数据结构

公开记录 `apps/web/data/community/works.json` 字段：

`id`、`slug`、`origin`（platform/submission）、`status`（draft/reviewed/published/withdrawn/rejected）、`title`、`description`、`titleKey/descriptionKey`（复用现有 Gallery 文案时）、`authorId`、`mediaType`、`styleId`、`deviceType`、`width`、`height`、`durationSeconds`、`sourceType`、`sourceDescription`、`licenseType`、`licenseUrl`、`allowPublicDisplay`、`allowDownload`、`downloadLicense`、`downloadScope`、`downloadScopeNote`、`reviewedAt`、`publishedAt`、`featured`、`previewAsset`、`posterAsset`、`downloadAsset`。

作者公开记录 `authors.json`：`authorId`、`name`、`bio`、`avatarAsset`、`socialUrl`、`isPlatform`；不含邮箱。

只有 `status === "published" && allowPublicDisplay === true` 的记录进入页面、详情、sitemap 和筛选；未发布/下架作品返回 404。

## 8. 下载和仅预览权限

- 可下载：必须有 `allowDownload=true`、公开 `downloadAsset`、具体 `downloadLicense`（CC0/CC BY/CC BY-SA/自绘/个人使用）和 `downloadScope`。
- 仅欣赏：`allowDownload=false`、`downloadAsset=null`；原文件只在私有目录，公开页面只有必要预览。服务端不会提供原图路径，但无法承诺百分之百防止截图。
- 详情页分别显示“允许下载/仅供欣赏”、下载许可范围，以及“仅授予此处明确写出的权限”的说明。
- CC0/自绘平台示例按许可开放下载，没有给 CC0 附加冲突限制。

## 9. 实际可公开展示的作品数量

- **Platform Showcase：8 件**
- **Community Submissions：0 件**
- 合计公开作品：**8 件**（全部 `origin=platform`）

## 10. 平台示例数量与来源

8 件平台示例全部使用现有、已登记在媒体 rights registry 的 CC0/自绘素材：

| 示例 | 类型 | 设备 | 风格 | 来源 |
|---|---|---|---|---|
| Star Drift | 动态 | 桌面 | Starry Galaxy | CC0 星云照片 + 本地动态合成 |
| Sakura Dream | 动态 | 手机 | Cinematic | CC0 樱花照片 + 本地动态合成 |
| Poppy Field | 静态 | 平板 | Photography | CC0 罂粟花照片 |
| Stillwater Night | 静态 | 桌面 | Mountain Lake | CC0 山湖照片 |
| Neon District | 静态 | 桌面 | Cyberpunk | CC0 香港街景 |
| Quiet Bridge | 静态 | 桌面 | Architecture Minimal | CC0 桥梁照片 |
| Dewline | 静态 | 平板 | Macro Nature | CC0 露珠叶片 |
| Light Ribbons | 静态 | 桌面 | Abstract Light | WallHaze 自绘 |

**没有真实 fal.ai 生成结果，因此没有把任何示例标成 AI 生成。** 动态示例是真实可播放 MP4，但不是 AI 视频。

## 11. 真实用户投稿数量

**0 件。** 没有虚构作者、昵称、头像、点赞、下载量、评分或投稿记录。Community Submissions 的真实空态为“还没有公开的创作者投稿，欢迎成为第一位投稿者。”

## 12. 作者署名与版权信息

- 平台示例作者显示为 `WallHaze Studio`，并标注“由 WallHaze 团队策划。平台示例不属于社区投稿。”
- 每件平台示例展示真实来源说明与 license；详情页显示 CC0 1.0 或自绘、下载范围。
- 投稿作者未来通过公开 `authorId` 关联；作者私人联系邮箱只进私有审核记录，公共页不显示。
- 作者头像可选；无头像时使用默认首字母头像。

## 13. 30 天用户作品与社区媒体的隔离

- Studio 30 天清理只扫描 API `image_assets` 中 `retention_policy='temporary_30d'` 的行。
- Community 作品使用静态 `data/community` + `public/community` / `private-media/community`，不是 `image_assets` 行，不会被 30 天清理误删。
- Community 发布不自动复用 Studio 任务资产；未来从 Studio 发布必须建立独立长期社区副本/关联。
- 本轮没有删除任何现有用户作品，30 天清理仍保持关闭。

## 14. 下架处理方式

```bash
node scripts/community/unpublish.mjs \
  --slug <slug> --reviewer <name> --reason "complaint #123"
```

- 仅允许下架 `origin=submission` 的已发布作品；平台示例由代码/授权 registry 控制，不走投稿下架。
- 从公开 `works.json` 移除记录，页面/卡片/sitemap 在重建后消失。
- 将公开 `previewAsset`、`posterAsset`、`downloadAsset` 从 `public/community/` 移到 `private-media/community/withdrawn/<slug>/`，旧 URL 在重建后 404；不删除文件。
- 保留私有 review 记录、原文件、下架原因和 `audit-log.jsonl`。
- 生产 CDN/反向代理必须单独清理旧缓存；仅隐藏页面卡片不算完成。

## 15. 七语言

`messages/{en,zh,ja,ko,es,fr,de}.json` 新增 Community 命名空间、Header/Footer 标签和 meta；`i18n-parity` 检查七语言 key 完全一致。详情页标题/描述复用现有 Gallery 文案（8 个平台示例的 key 在七语言均存在）；提交邮件模板保持固定中文审核格式。

## 16. 修改文件

**新增**
- `apps/web/app/[locale]/community/page.tsx`
- `apps/web/app/[locale]/community/[slug]/page.tsx`
- `apps/web/components/community/{CommunityExperience,CommunityCard,SubmissionPanel}.tsx`
- `apps/web/lib/community.ts`
- `apps/web/data/community/{works,authors}.json`
- `apps/web/scripts/community/{import-submission,unpublish,mp4}.mjs`
- `apps/web/scripts/community/submission.example.json`
- `apps/web/tests/community.test.ts`
- `docs/codex/{COMMUNITY-ADMIN.md,MEDIA-ASSET-INVENTORY.md,MEDIA-RIGHTS-PROCESS.md,COPYRIGHT-COMPLIANCE-REPORT.md}`（后三者为上一阶段媒体整改文档）
- `docs/codex/screenshots/community/*.png`

**修改**
- `components/Header.tsx`（Community 导航）
- `components/Footer.tsx`（Community / Submit a Wallpaper）
- `app/sitemap.ts`（Community + 8 个平台作品）
- `messages/{en,zh,ja,ko,es,fr,de}.json`
- `package.json`（`community:import` / `community:unpublish`）
- `tests/i18n-parity.test.ts`、`tests/header-nav.dom.test.ts`

未修改 API 支付、Google OAuth、Credits、Studio 30 天清理逻辑。

## 17. 测试与构建结果

| 项目 | 结果 |
|---|---|
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **244 passed / 34 files** |
| Web build | 通过 |
| API Vitest | **228 passed / 1 skipped / 34 files** |
| Contracts typecheck | 通过 |
| Community 数据测试 | 13 tests（发布门禁、平台/投稿分离、真实资产、设备/比例、授权、私密字段、mailto、无 API/form、下架/仅预览模型） |
| 浏览器验收 | 1440/820/390；0 破损图片；筛选动态=2、手机=1、重置=8；移动菜单含 Community；视频 `duration=4.998`、`loop=true`、`muted=true`、`videos=1` |
| 线上提交入口检查 | 0 form、0 file input、0 社区 API；页面无“投稿成功”假状态 |

## 18. 桌面与移动端截图

- [1440 首页](screenshots/community/community-1440-top.png)
- [1440 平台示例](screenshots/community/community-1440-platform.png)
- [1440 投稿区](screenshots/community/community-1440-submit.png)
- [1440 真实投稿空态](screenshots/community/community-1440-empty.png)
- [1440 动态详情](screenshots/community/community-detail-1440.png)
- [1440 静态详情](screenshots/community/community-detail-static-1440.png)
- [820 首页](screenshots/community/community-820-top.png)
- [820 平台示例](screenshots/community/community-820-platform.png)
- [390 首页](screenshots/community/community-390-top.png)
- [390 平台示例](screenshots/community/community-390-platform.png)
- [390 投稿区](screenshots/community/community-390-submit.png)
- [390 移动菜单](screenshots/community/community-390-menu.png)
- [390 动态详情](screenshots/community/community-detail-390.png)

## 19. Monthly Theme 每月壁纸征集

### 19.1 新增主题组件

- `components/community/MonthlyThemeSection.tsx`：客户端主题区块，位于 Community Hero 之后、筛选/平台示例之前。
- 当前配置一个有效主题 `Dreamy Nightscapes / 梦幻夜色`，展示封面、介绍、适合风格、媒体类型、设备、征集时间、截止时间、时区、主题邮件投稿按钮和 AI Studio 联动。
- 主题精选区使用真实 `publishedWorkIds` 关联；当前为空，显示诚实空态。
- 往期主题只在“已结束且确有已发布精选作品”时显示；当前无往期主题，区块隐藏。
- 为防止静态缓存把过期主题继续显示为“正在征集”，主题状态在客户端挂载后按 ISO 时间计算，并每 60 秒刷新；服务端初始 HTML 不输出主题 CTA。

### 19.2 主题配置数据结构

配置文件：`apps/web/data/community/themes.json`；类型/状态函数：`apps/web/lib/community/themes.ts`。

字段：`id`、`slug`、七语言 `titleKey/descriptionKey/inspirationKey/coverAltKey`、`coverImage`、`recommendedStyleIds`、`supportedMediaTypes`、`supportedDevices`、`startsAt`、`endsAt`、`timezone`、`status`、`submissionEmail`、`publishedWorkIds`。

- 日期使用带时区偏移的 ISO 字符串；当前主题为 `2026-10-01T00:00:00+08:00` 至 `2026-11-30T23:59:59+08:00`，`Asia/Shanghai`。
- 封面使用已登记公开的 CC0 资产 `/videos/live-demos/star-drift.jpg`。
- 推荐风格经过 `Style Registry` 校验；非法 ID 会被过滤，不生成坏 Studio 链接。
- 同一时间配置最多一个 active 主题；未来主题可配置为 `scheduled`，开始前不显示为征集。

### 19.3 主题显示状态规则

`resolveThemeStatus(theme, now)` 的结果：

| 配置/时间 | 展示 |
|---|---|
| `draft` / `disabled` | 隐藏 |
| 当前时间 < `startsAt` | `scheduled`，不显示“正在征集” |
| `startsAt` ≤ 当前时间 ≤ `endsAt` | `active` |
| 当前时间 > `endsAt` | `ended`，不再显示投稿 CTA |
| 日期非法/结束早于开始 | 隐藏 |

受控时钟测试覆盖：开始前、进行中、截止后、草稿、禁用、非法日期；当前配置在 2026-10-24 为 active。

### 19.4 邮箱投稿入口

- 地址：`xiongfh2000@gmail.com`。
- 主题邮件主题：`[WallHaze Monthly Theme] 梦幻夜色`（按当前主题本地化标题生成）。
- 正文包含：主题名称、作品名称、作者昵称、作品类型、适配设备、作品介绍、创作方式、素材及授权来源、是否允许公开下载、授予 WallHaze 的展示及下载范围、作者署名方式，并提示附文件或安全链接。
- 使用 `themeSubmissionMailto()` 做 URL 编码；页面提供邮箱显示和复制按钮。
- 仅打开本机邮件客户端；没有附件自动添加、没有 SMTP/Gmail API、没有在线提交成功状态。
- 截止后主题 CTA 随 `ended` 状态消失。

### 19.5 AI Studio 联动

- `Create for This Theme / 使用 AI 创作主题壁纸` 链接到现有 `/studio`，使用 `buildStudioRestoreHref` 预填：
  - 推荐风格（当前主题首个有效风格，默认 `cinematic`）；
  - 主题灵感 prompt（七语言 `inspirationKey`）；
  - 当前设备（客户端检测到 phone/tablet/desktop 时传入）。
- 所有推荐风格 chip 也可单独打开 Studio；非法风格被过滤。
- 用户可以修改 prompt/style/device；手工绘制、摄影或其他原创形式同样可以邮件投稿；AI Studio 输出不会自动成为 Community 投稿。

### 19.6 主题作品关联

- Community 作品新增可选 `themeId`；不填则不属于主题。
- 导入 CLI 校验 `themeId` 必须存在；审核发布时可指定。
- 主题精选还需要人工把已发布作品 `id` 加入主题的 `publishedWorkIds`；只有 `origin=submission`、`status=published`、`themeId` 匹配且 ID 在列表中的作品才会展示。
- 平台示例不会被算成主题投稿。
- 当前 `publishedWorkIds` 为空，主题精选显示：“该主题还没有通过审核的投稿，欢迎成为第一位投稿者。”

### 19.7 往期主题

- `getEndedThemes` 只返回已结束且仍有已发布精选作品的配置；没有真实历史时整个 Past Themes 区块隐藏。
- 当前没有往期主题，因此页面不显示 Archive/Past Themes，也不编造历史。
- 未来主题结束后可保留已审核精选作品；无需删除主题配置。

### 19.8 七语言

- `community.monthly` 与 `community.themeContent.dreamyNightscapes` 在 en/zh/ja/ko/es/fr/de 全部存在：主题名称、介绍、灵感、封面 alt、日期/时区、媒体/设备、推荐风格、CTA、空态、往期标题。
- `i18n-parity` 保持七语言 key 完全一致；主题邮件模板保持固定中文审核格式。

### 19.9 响应式

- 1440：封面左、主题信息右；封面和信息同一主题卡片。
- 820：上下堆叠，标题、日期、按钮在首屏可读。
- 390：上下布局，推荐风格可换行，按钮全宽/可点，邮箱与复制按钮不溢出。
- 截图见 19.12；所有页面 0 broken images。

### 19.10 修改文件

- 新增：`apps/web/components/community/MonthlyThemeSection.tsx`、`apps/web/components/community/CopyEmailButton.tsx`、`apps/web/lib/community/themes.ts`、`apps/web/data/community/themes.json`、`apps/web/tests/community-theme.test.ts`
- 修改：`apps/web/app/[locale]/community/page.tsx`（插入主题区块）、`apps/web/lib/community.ts`（themeId/主题精选）、`apps/web/data/community/works.json`（平台作品 themeId=null）、`apps/web/scripts/community/import-submission.mjs`（themeId 校验）、`apps/web/scripts/community/submission.example.json`、7 个 `messages/*.json`、`docs/codex/COMMUNITY-ADMIN.md`
- 未改：API、支付、Google OAuth、Credits、30 天清理。

### 19.11 测试结果

| 项目 | 结果 |
|---|---|
| Web TypeScript / ESLint / Build | 通过 |
| Web Vitest | **244 passed / 34 files** |
| Monthly Theme tests | **8 passed**（受控时钟、草稿/禁用/未开始/到期、单 active、邮件编码、Studio 链接、非法 style、七语言） |
| Community tests | **13 passed**（含 themeId 校验） |
| API Vitest | **228 passed / 1 skipped / 34 files** |
| Contracts typecheck | 通过 |
| 浏览器 | 1440/820/390；主题 active 文案、邮件链接、Studio 链接、复制邮箱、空态；0 broken images |
| 检查 | 无 form/file input/上传；无“参赛人数/投票/获奖”虚构文案；无往期伪造 |

### 19.12 页面截图

- [1440 Community 顶部（含主题入口）](screenshots/community/community-theme-1440-top.png)
- [1440 主题详情](screenshots/community/community-theme-1440.png)
- [820 主题](screenshots/community/community-theme-820.png)
- [390 主题](screenshots/community/community-theme-390.png)

### 19.13 未完成事项

1. 当前主题精选为 0，因没有真实主题投稿；空态是真实的。
2. 当前没有往期主题，Archive 区块按规则隐藏。
3. 主题配置修改后需要重新构建；生产 CDN 仍需按部署流程刷新。
4. 主题状态在客户端计算以避免静态缓存过期 CTA；无 JS 的静态 HTML 不展示主题区块。
5. 没有在线活动管理后台、自动收件、自动审核或奖励系统；这些按本期范围不开发。

## 20. 未完成事项

1. 没有真实创作者投稿；Community Submissions 保持空态，未虚构内容。
2. 没有在线投稿表单/上传/API/审核后台/投稿进度查询——按本期范围明确不开发。
3. 没有真实 fal.ai 生成示例；平台示例使用已授权 CC0/自绘素材，未冒充 AI 输出。
4. 仅供欣赏的公开详情分支已实现并通过数据模型/CLI 校验，但当前无真实投稿可公开展示；无法承诺百分之百防截图。
5. 手动发布/下架后需要重新构建；本期没有管理后台，审核记录是本地私有 JSON + audit log。
6. 生产 CDN/反向代理若缓存过旧 `/community/` 资源，下架后仍需单独 purge。
7. 推荐风格中的二次元/奇幻等没有新增平台示例，因为当前没有已清除授权的对应素材；没有用无关素材冒充这些风格。

## 21. 后续升级到在线投稿的改造范围

如果未来投稿量增长，需要新增（本期不建）：

- 投稿用户账户/邮箱验证与投稿状态查询；
- 受保护上传存储（R2/S3、MIME/尺寸/病毒/内容审核、限流）；
- 在线投稿与审核数据库/工单；
- 审核后台、角色权限、审计日志；
- 授权证据上传与保留策略；
- 通知/邮件服务（SMTP/模板）、投诉工单；
- 自动发布门禁、撤回/缓存失效、滥用与版权投诉 SLA；
- 社区资产独立长期存储，与 Studio 30 天生命周期隔离。

**最终验收：** Community 展示页、详情页、平台示例、真实空态、邮件模板/入口、人工导入/下架流程、七语言与响应式均已完成；没有把邮件说成在线投稿系统，没有把平台示例算成真实用户投稿，没有调用付费 AI，未 Git commit/push，未部署。
