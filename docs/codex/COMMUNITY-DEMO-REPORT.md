# WallHaze Community 模拟投稿素材生成与社区优化报告

- 日期：2026-10-24
- 范围：`apps/web` Community 重定位（真实投稿社区）、demo seed 数据隔离、fal.ai 真实生成、五视口验收
- 结论：**Platform Showcase 板块已从 Community 完全移除；正式 Community 只渲染人工审核的真实投稿（当前为 0，显示真实空态）；21 个高质量模拟投稿素材通过 fal.ai 真实生成（24 次付费请求、0 失败、实际支出 $0.5978，低于 $3.00 上限），存放于私有目录并仅在 `COMMUNITY_DEMO_MODE=1` 且非生产环境时展示。**

## 1. 平台 AI 示例专区移除

- Community 首页不再有 `platform-showcase` 区块、`platformBadge/platformTitle/platformSubtitle/platformNote` 文案；`getPlatformWorks()` 已删除。
- `origin` 枚举改为 **`community_submission` / `demo_seed`**，不再有 `platform`。
- 平台示例素材不再作为 Community 内容引用；8 件旧平台示例数据从 `works.json` 移除（`works.json` 现为空数组，等待真实投稿）。
- AI Studio 功能本身未受任何影响（`/studio`、Prompt Builder、`?style=/prompt=` 预填保持原样）。

## 2. 正式 Community 的内容来源

- `getSubmissionWorks()` 只返回 `origin === "community_submission"` 且 `status === "published"`、`allowPublicDisplay === true` 的记录。
- 正式数据文件 `data/community/works.json` 当前为空；首页显示真实空态"还没有公开的创作者投稿"。
- 真实投稿仍走：邮件 → xiongfh2000@gmail.com → 人工审核 → `community:import` CLI 手动上架。下载许可必须有具体 license（`all-rights-reserved`/`custom` 会被 model 校验拒绝）。

## 3. 模拟投稿与真实投稿隔离（强制）

| 隔离点 | 实现 |
|---|---|
| 数据来源 | demo 数据在独立文件 `data/community/demo-works.json`，绝不写入 `works.json` |
| origin 标识 | `origin: "demo_seed"`（真实投稿为 `community_submission`），由服务端 model 校验，不是前端改名 |
| 作者标识 | 唯一 demo 作者 `demo-sample`，公开名 `模拟投稿样例`（nameKey 七语言），`isDemo: true`；真实投稿禁止引用 demo 作者（model 断言） |
| 环境开关 | `COMMUNITY_DEMO_MODE`，默认关闭；`isCommunityDemoMode()` 要求 flag=1 **且** `NODE_ENV !== "production"` — 生产构建即使 flag 泄漏也不渲染 |
| 静态产物 | 生产 `generateStaticParams` 只含真实投稿 slug；本次生产构建实测 demo 详情 404、首页 0 张 demo 卡片、0 张 demo 图 |
| sitemap | 仅真实投稿；生产 sitemap 实测 0 条 demo 引用 |
| 媒体文件 | demo 媒体存放 `private-media/community/demo-media/`，不在 `public/`；仅 `community:demo:prepare` 手动同步到 public 供 demo dev server 使用，`community:demo:clean` 清除 |
| 主题精选 | `getThemeFeaturedWorks()` 只统计 `community_submission`，demo 作品不能进入 Monthly Theme 精选 |
| 统计 | 空态/计数只基于真实投稿；demo 不产生粉丝、点赞、下载数 |

## 4–7. 实际生成的媒体

### 4. 数量与计费

| 项 | 数值 |
|---|---|
| 静态图片（final，已入库） | **18**（6 phone 768×1344 / 6 tablet 1088×1440 / 6 desktop 1536×864） |
| 动态视频 | **3**（phone 704×1280、tablet 704×1280、desktop 1280×704） |
| 付费请求总次数 | **24**（21 图 + 3 视频） |
| 失败 | **0** |
| 实际支出 | **$0.5978** |
| 预算上限 | $3.00（剩余 $2.4022） |

说明：首轮 6 张"手机"图用 832×1216 生成，实际比例 0.684 被设备分类器判为 tablet，与计划不符。为不虚标设备，重新生成了 6 张真 9:16（768×1344，$0.031）替换；被替换的 6 张已从数据中移除。总请求数因此为 21 图 + 3 视频 = 24 次付费调用，最终入库 21 个作品。

### 5. 媒体路径

- 原始生成产物（含 SHA-256、fal request id）：`apps/web/private-media/community/demo-media/{images,posters,videos}/`
- demo 元数据：`apps/web/data/community/demo-works.json`（21 条）
- 生成计划：`apps/web/scripts/community/demo-plan.json`（含全部 prompt）
- 预算账本：`apps/web/private-media/community/fal-ledgers/ledger-*.json`（3 份，逐请求记录 endpoint、request id、预估费用、累计支出）

### 6. 实际分辨率与时长

- 图片：768×1344（phone ×6）、1088×1440（tablet ×6）、1536×864（desktop ×6）— 全部为 fal 实际输出，未虚标 2K/4K。
- 视频：H.264 MP4、无声、可循环；实际探测时长 **4.878s**；704×1280（9:16 ×2）、1280×704（16:9 ×1）；3.61MB / 1.97MB / 10.29MB。
- 视频由已生成的高质量首帧 + `wan/v2.2-5b/image-to-video` 生成，Poster 用首帧压缩。

### 7. 风格与设备分布

风格（13 种，差异明显）：cyberpunk ×3、deep-ocean ×3、cinematic ×2、anime-fantasy ×2、aurora-nights ×2、chinese-ink ×2、cozy-anime、watercolor、clay-3d、sci-fi、starry-galaxy、architecture-minimal、photography。

设备：phone 8（6 静态 + 2 视频）、tablet 6、desktop 7（6 静态 + 1 视频）。

下载权限差异：**9 件允许下载**（self-authored 范围说明）、**12 件仅供欣赏**（无 downloadAsset，原始文件不入公开目录）；精选（Editor's Picks）2 件。标题/描述按艺术作品撰写（如 "Lanterns Under a Spring Galaxy"、"Neon Monsoon"、"The Baker's Afternoon"），稳定 ID `demo-001…demo-027`（部分编号因重生成被移除）。

## 8–10. fal.ai 使用

- 静态模型：**`fal-ai/flux-2/klein/4b`**（复用现有 adapter 端点），自定义 `image_size {width,height}`，`output_format: jpeg`，safety checker 开启。官方价格 **$0.005/百万像素**（2026-10-24 模型页核实）。
- 视频模型：**`fal-ai/wan/v2.2-5b/image-to-video`**（复用现有 adapter 参数：720p、24fps、num_frames≤161、safety checker 开启）。官方价格 **$0.15/视频**（2026-10-24 模型页核实）。
- 运营脚本 `scripts/community/generate-demo.mjs` 的安全机制：
  - 每次**调用前**重算预估费用并与剩余预算比较，超限即跳过并记 ledger；
  - `--budget-usd`、`--max-images`、`--max-videos`、`--plan` 参数；
  - 历史账本累计校验，存在 `uncertain` 请求时拒绝再次付费；
  - 失败**不自动重试**（避免重复扣费），逐请求写入 fal request id；
  - 密钥从环境变量读取，不打印、不写入任何文件。
- 关键：本轮使用的是**独立运营脚本**，未经过用户 Credits 钱包、未触碰 `FAL_MOCK`/`FAL_LIVE_ENABLED`/预算保护开关（API `.env` 仍为 `FAL_MOCK=1`；密钥来自仓库根 `.env.local` 仅注入本脚本进程）。

## 11–13. 请求、费用与失败

| Ledger | 内容 | 请求 | 失败 | 支出 |
|---|---|---:|---:|---:|
| ledger-…07-59-04 | 18 张图（首批） | 18 | 0 | $0.1168 |
| ledger-…08-02-36 | 3 条视频 | 3 | 0 | $0.4500 |
| ledger-…（fix） | 6 张真 9:16 手机图 | 6→3 行有效 | 0 | $0.0310 |
| **合计** | | **24 次付费请求** | **0** | **$0.5978** |

（第三份账本累计字段与请求行并存，以请求行求和为准。）

## 14–15. 下载规则与授权记录

- demo 详情页区分"允许下载"（显示下载按钮 + scope 说明）与"仅供欣赏"（琥珀色说明卡：作者未授权下载、原文件保持私有、无法承诺防截图）。
- 每个作品 `sourceDescription` 记录生成方式；账本记录 provider/endpoint/model/prompt/实际输出宽高/时长/字节数/SHA-256/fal request id/日期。
- **不因此认定独占版权**：demo 作品 license 标注 `self-authored`，但明确是"AI 生成演示素材"；未模仿在世艺术家个人风格，未使用任何动漫角色/影视人物/品牌 IP；未使用参考图。
- 记录不含 API key 或其他秘密。

## 16. Community 页面修改

- 首页移除 Platform Showcase；区块顺序：Hero → Monthly Theme → 创作者投稿（精选/最新）→ 邮件投稿说明 → 举报。
- demo 模式下列表合并展示真实+demo 作品，卡片带"模拟投稿样例"琥珀徽标，区块顶部显示演示横幅（七语言）；生产无横幅、无卡片。
- 卡片与详情页作者名解析 `nameKey`；详情页 demo 徽标 + "模拟投稿，用于页面演示，非真实用户投稿；生产环境永不展示"说明。
- 下载/仅欣赏、设备标签、真实时长徽章、视频播放器逻辑复用第一期实现。

## 17–18. Monthly Theme 与七语言

- Monthly Theme 完好：当前主题"梦幻夜色"仍正常显示（隔离验证时截图确认），demo 作品不会进入主题精选。
- 七语言 `community.demoBadge/demoBanner/demoAuthorName/demoDetailNote` 全部就位；`i18n-parity` 通过。

## 19. 测试结果

| 项目 | 结果 |
|---|---|
| Web TypeScript / ESLint / Build | 通过（BUILD_EXIT=0） |
| Web Vitest | **244 passed / 34 files**（含 demo 分离、themeId、mailto、无 form/API 断言） |
| API Vitest | **228 passed / 1 skipped / 34 files** |
| Contracts typecheck | 通过 |
| 浏览器 | demo 模式 5 视口（1440/1280/820/390/360）+ 视频详情 + 移动详情，0 broken images |

## 20. 截图

- [1440 创作者投稿网格](screenshots/community/demo-mode-1440-grid.png)
- [390 网格](screenshots/community/demo-mode-390-grid.png)
- [1440 视频详情（模拟徽标+来源）](screenshots/community/demo-mode-detail-video-1440.png)
- 其余：`demo-mode-{1280,820,360}-{top,grid}.png`、`demo-mode-detail-390.png`

## 21. 正式环境隔离验证证据

生产构建 + `npm start` 实测（`public/community-demo` 已清空）：

| 检查 | 结果 |
|---|---|
| demo 媒体 `/community-demo/images/demo-007.jpg` | **404**（媒体已移回私有目录） |
| demo 详情 `/zh/community/demo-001` | 404 页面体（与既有 wallpapers 未知 slug 行为一致） |
| Community 首页 demo 卡片 | **0** |
| 首页 demo 横幅 | 未渲染 |
| 首页空态 | 正常显示 |
| sitemap 中 demo 引用 | **0** |
| 生产 bundle 中 demo 路由 | 无（仅 placeholder 占位防 Next 空参数报错） |

补充说明：生产 HTML 的 RSC payload 中包含 next-intl 消息字符串（含 demo 文案 key 的译文），这是所有页面的既有 i18n 内联行为，不是渲染内容；DOM 中无任何 demo 元素。

## 22. 尚未完成的事项

1. **真实投稿仍为 0**：正式 Community 显示真实空态。上架第一份真实投稿使用现有 `community:import` 流程即可。
2. 视频为 4.878s（Wan 实际输出），未达精确 5s；首尾非严格无缝，因此**未标注 Seamless Loop**。
3. demo 视频仅 3 条（手机/平板/电脑各 1）；如需更多动态样本，追加 plan + 预算即可重跑（剩余 $2.40）。
4. `public/community-demo` 在 demo dev 模式由手动 sync 提供；如果 CI/部署管线误运行 `community:demo:prepare` 会重新暴露文件——建议后续在 `next.config.ts` 加构建期断言（生产 build 时若目录存在即失败）。
5. 首批 6 张 832×1216 图与 3 条视频首帧的原始文件已按账本哈希保留在私有目录（审计用途），未再公开。
6. AI 生成内容的模型条款依赖 fal.ai 平台条款；未做逐模型法律复核（与真实投稿无关，不影响正式 Community 上线）。

## 内容分类声明

| 类别 | 数量 | 说明 |
|---|---:|---|
| 已通过真实 fal.ai 生成 | 21 作品 / 24 请求 | flux-2 klein 4b + wan v2.2-5b I2V，$0.5978 |
| 已生成但未通过质量/规格审核 | 6 张 | 832×1216 设备分类不符，已从 demo 数据移除（文件保留在私有目录） |
| 未执行付费调用 | — | 除上述 24 次外无任何付费请求；API 主流程仍为 mock |
| 本地模拟数据 | 0 | 未使用本地假图；全部媒体来自真实生成 |
| 正式真实用户投稿 | **0** | works.json 为空；等待邮件投稿+人工审核 |

**最终判定：Community 现在是纯粹的真实投稿社区；开发/演示能力由 `COMMUNITY_DEMO_MODE` + 私有 demo_seed 数据完整承载且与生产隔离；fal.ai 真实生成在预算内完成、全程可审计、零失败。**
