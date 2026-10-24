# WallHaze V2.0 动态壁纸与二次元风格升级验收报告

- 日期：2026-10-24
- 范围：`apps/api`、`apps/web`、`packages/contracts`、本地 PGlite 迁移、Mock 视频资源
- 结论：**阶段 A（Mock 安全的 5 秒 Image-to-Video MVP + 3–5 秒 Text-to-Video + 二次元风格体系）已完成并验证**。真实视频 Provider 调用保持禁用，尚未产生任何付费请求。

## 1. 原有静态生图是否保留

**状态：已实现并验证。**

- `/v1/generations` 同步静态接口未改；静态 Prompt Builder、参考图、尺寸预设、设备比例、Credits、历史/收藏均保留。
- Studio 的静态表单仍原样挂载；模式切换只是隐藏/显示，不会卸载静态表单或删除其状态。
- 浏览器回归：在静态模式实际生成了一张 Mock 图片，结果正常显示；随后切回动态模式，静态状态仍在。
- 全量 API 测试包含既有静态鉴权、Credits、Job/Worker、创建记录与安全测试。

## 2. 动态壁纸入口和用户流程

**状态：已实现并验证（Mock）。**

- Studio 顶部新增分段模式：**静态壁纸** / **动态壁纸**。
- 动态模式提供：
  - 创作方式：文字生成视频 / 图片生成视频
  - 风格、画面描述、运动描述
  - 目标设备、画面比例（只显示 Provider 支持的 9:16、16:9、1:1）
  - 视频时长（按 Provider 能力动态显示）
  - Credits 报价、生成按钮
  - Poster + 视频预览、播放/暂停、循环、静音、时长
  - MP4 下载
- 静态 → 动态切换时通过同页 draft 传递有效的风格、Prompt、设备与比例；每个模式自己的表单状态保持挂载。
- My Creations 的“再次创作”会打开 `?media=video` 并尽量带入 prompt/style。

## 3. 文字生成视频实现程度

**状态：Mock 验证通过；真实模型需要测试/授权。**

- 已实现 `text_to_video` 异步 Job，复用现有 Generation Jobs、Worker、Credits、预算与幂等体系。
- Mock Provider 生成真实可播放的 3/4/5 秒、无声 H.264 MP4，并带 Poster。
- Live Provider Adapter 已按 Kling Video v3 Standard T2V 官方 schema 实现：
  - Endpoint：`fal-ai/kling-video/v3/standard/text-to-video`
  - `prompt`、`duration`（3–15 秒官方支持；产品首期暴露 3/4/5）、`aspect_ratio`、`generate_audio=false`、`negative_prompt`
  - Queue：submit → poll status → result；无自动重试
- Live Adapter 使用注入 fetch 做了 payload/queue 单元测试，**没有发出真实请求**。

## 4. 图片生成视频实现程度

**状态：Mock 验证通过；真实模型需要测试/授权。**

- 支持两种来源：
  1. 从 My Creations 选择自己的静态图片；
  2. 上传自有图片（PNG/JPEG/WebP，≤5 MB，magic bytes 校验）。
- 服务端校验来源属于当前用户、任务成功、媒体类型为 image；Live 模式拒绝 Mock 图片。
- 来源图片在服务端转为 data URI 并临时放入 Job；任务结算后从 request 中移除。
- Mock I2V 已从真实私有创建成功生成 5 秒视频。
- 首期 Live I2V Adapter：Wan 2.2-5B I2V，官方 5 秒、720p、`aspect_ratio` 9:16/16:9/1:1；Prompt 强制主体身份/构图保持与局部运动。
- 未实现 Kling I2V Adapter；官方 schema 已研究，见 §7。

## 5. 支持的真实视频时长

**状态：按 Provider 能力开放；Mock 验证通过；真实模型未验证。**

| 模式 | 首期开放 | 说明 |
|---|---|---|
| Image-to-Video | **5 秒** | 默认 Wan 2.2-5B I2V；不提供无效的 3/4 秒按钮 |
| Text-to-Video | **3 / 4 / 5 秒** | Kling v3 Standard 官方支持 3–15 秒；首期只开放产品范围 3–5 |
| 默认 | 5 秒 | UI 与后端一致 |

- 后端 capability matrix 是唯一开关：I2V 3 秒会返回 400；T2V 3 秒单价 40 Credits。
- 没有实现视频裁剪；如果未来通过裁剪提供 3/4 秒，需要按 Provider 原始成本计费并重新验收。

## 6. 视频分辨率

**状态：Mock 已实现；真实分辨率部分需要验证。**

- Mock：360×640（9:16）、640×360（16:9）、480×480（1:1），3/4/5 秒，无音频。
- Wan I2V：官方 720p 输出；Adapter 请求 `resolution: "720p"`。
- Kling T2V Standard：官方页面未给出明确输出分辨率；Adapter 不虚报，保存时对下载 MP4 做 best-effort `tkhd` 解析，解析失败时保留 null。
- 没有开放自定义视频像素尺寸；视频比例/分辨率受 Provider 限制。
- 新增了无依赖 MP4 元数据探针，优先记录真实 width/height；fragmented MP4 的 mvhd duration 可能为 0，界面以播放器实际 metadata 与请求时长兜底。

## 7. 视频 Provider 及官方参数

**状态：Adapter 已实现并用注入 fetch 验证；真实调用未执行（需要授权）。**

| Provider | 用途 | 关键官方参数 | 价格 | 状态 |
|---|---|---|---|---|
| `fal-ai/wan/v2.2-5b/image-to-video` | I2V，首期默认 | `image_url`、`prompt`、`num_frames`（5 秒=120 @24fps）、`resolution=720p`、`aspect_ratio` 9:16/16:9/1:1、无音频 | 官方 $0.15/视频 | Adapter 已实现；真实模型未验证 |
| `fal-ai/kling-video/v3/standard/text-to-video` | T2V，首期默认 | `prompt`、`duration` 3–15、`aspect_ratio` 16:9/9:16/1:1、`generate_audio=false`、`negative_prompt` | 官方 $0.084/s（音频关闭；5 秒约 $0.42） | Adapter 已实现；真实模型未验证 |
| `fal-ai/kling-video/v3/standard/image-to-video` | I2V 候选 | `start_image_url`、`duration` 3–15、`generate_audio`；无 aspect_ratio 参数 | 约 $0.084/s 起 | **尚未接入**；需真实测试 |

官方参考：

- https://fal.ai/models/fal-ai/wan/v2.2-5b/image-to-video
- https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video
- https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api

队列模式已按官方 submit → status → result 实现；不自动重试，避免重复付费。

## 8. Prompt 与 Motion Prompt 设计

**状态：已实现并验证。**

- 新增 `buildVideoPrompt`（`VIDEO_PROMPT_BUILDER_VERSION = 1`），独立于静态 Prompt Builder 版本，避免影响已排队的静态任务。
- 组合顺序：
  1. Scene（用户画面）
  2. 视频模式约束（Text-to-Video 连续单镜头；Image-to-Video 保留原图主体/构图）
  3. 风格模板 + palette / lighting / texture / composition
  4. 设备与画面比例
  5. Motion：允许运动的部位、方向、强度、镜头、背景、循环意图
  6. 目标时长
  7. 安全约束：不切镜、不突然抖动、不主体变形、不重绘主体
- `style-motion.ts` 为动漫系列（anime、retro-cel、shoujo、shonen、chibi、mecha、cozy-anime）、cyberpunk、nature、dark-fantasy、chinese-ink、3d-cartoon 提供专属运动指导；其余风格按分类继承安全默认值。
- 不承诺无缝循环；Prompt 只表达 loop intent，UI 不显示 “Seamless Loop”。
- 测试：风格模板、Motion、主体保持、时长与版本均覆盖。

## 9. 二次元新增风格

**状态：已实现并验证。**

审计已存在的 Anime 系列后复用/升级，不重复新增同义 ID：

| 需求 | 实现 ID | 说明 |
|---|---|---|
| Anime Cinematic | `anime`（升级） | 原 Anime 升级为电影感动漫 |
| Shonen Action | `shonen`（升级） | 热血动作 |
| Shojo Romance | `shoujo`（升级） | 少女浪漫 |
| Chibi Kawaii | `chibi`（升级） | Q 版萌系 |
| Slice of Life | `cozy-anime`（升级） | 日常治愈 |
| Retro Anime | `retro-cel`（升级） | 复古日系动画 |
| Mecha Sci-Fi | `mecha`（升级） | 机甲科幻 |
| Anime Fantasy | **`anime-fantasy`（新增）** | 奇幻冒险动漫 |
| 既有补充 | `manga`、`ukiyo-e-anime` | 保留并归入动漫分类 |

- 新增独立风格分类 **Anime & Manga**；7 语言标签/描述/分类说明齐备。
- 新增风格的预览在缺少正式预览资源时使用已有渐变 fallback，并明确标记为艺术预览；没有伪造完成图。

## 10. 其他新增风格

**状态：已实现并验证（可用性/ID/i18n）；部分预览素材仍使用渐变。**

- 新增：
  - `chinese-ink` — Chinese Ink Painting
  - `3d-cartoon` — 3D Cartoon
- 已有并复用：Photography、Cinematic、Watercolor、Oil Painting、Pixel Art、Cyberpunk、Vaporwave、Dreamcore、Minimalist、Dark Fantasy、Fantasy、Nature、Clay 3D 等。
- Style Registry 总数 46；原 ID 全部保留；新增 ID 唯一。
- 静态 Prompt 与视频 Motion 都通过同一 Style Registry 生效。

## 11. 动态壁纸预览与 MP4 下载

**状态：Mock 已实现并验证；真实 Provider 返回未验证。**

- 预览：使用所选设备比例，Poster，播放/暂停，`loop`，`muted`，`playsInline`，`preload="none"`；默认不自动播放，尊重省流量与减少动画偏好；播放后才加载视频。
- 浏览器实测 Mock 视频：`duration=4.9968`、`muted=true`、`loop=true`、`playsInline=true`、无需自动播放。
- 下载：`Download MP4` 使用短期签名 URL，响应带 `Content-Disposition: attachment; filename="wallhaze-<id>.mp4"`。
- 私有视频访问：
  - 签名 URL 或 owner cookie；
  - GET/HEAD；
  - 单段 Range → 206 + `Content-Range`；
  - 非法 Range → 416；
  - `Content-Type: video/mp4`、`Accept-Ranges: bytes`；
  - 不支持任意外部视频 URL 代理。
- 未在音频、设备系统级安装上做虚假承诺；页面明确说明 iPhone/Android/桌面的系统限制。

## 12. My Creations 视频功能

**状态：已实现并 Mock 验证。**

- 云端作品同时支持 image / video：
  - 类型徽标、Poster、视频时长、风格、创建时间、Mock 标记；
  - All / Images / Live Wallpapers 过滤与计数；
  - 播放、MP4 下载、云端删除、再次创作。
- “再次创作”视频会打开 Live Studio，并带入 prompt/style。
- 不会删除既有图片记录；设备本地历史/收藏逻辑保持独立。
- 视频属于私有账户资源，不自动进入公开 Gallery。

## 13. 视频 Credits 计费设计

**状态：已实现并 Mock 验证；真实计费未执行，需业务批准。**

| 模式/时长 | 价格 | Provider 成本上界（预算用） |
|---|---|---:|
| 静态图片（既有） | 10 Credits | $4.00（既有） |
| I2V 5s（Wan） | **40 Credits** | $0.50 |
| T2V 3s（Kling） | **40 Credits** | $0.50 |
| T2V 4s（Kling） | **50 Credits** | $0.65 |
| T2V 5s（Kling） | **60 Credits** | $0.80 |

- 价格由后端 `GET /v1/credits/pricing` 返回；前端不计算价格。
- 按当前套餐（Starter $0.05/credit、Creator $0.04/credit、Studio $0.0345/credit）：
  - I2V 40 Credits 收入约 $2.00/$1.60/$1.38，对应 Wan 约 $0.15 成本；
  - T2V 5s 60 Credits 收入约 $3.00/$2.40/$2.07，对应 Kling 约 $0.42 成本。
- 这些是技术实现与建议价格，**不是已批准的商业定价**；需要所有者确认毛利、税费和退款政策。
- Mock Job 成功会释放预占，不扣 Credits；Live Job 成功 Capture，失败 Release。

## 14. 动态生成预算与幂等保护

**状态：已实现并测试（Mock/本地实时路径）；真实 Provider 不确定状态未实测。**

- 复用统一 `generation_jobs`：
  - `media_type`、`generation_mode`、`duration_seconds`、`source_creation_id`；
  - 视频与图片共用 Credits 预留、Capture、Release、日预算和平台预算。
- 视频 Job 的价格/成本上界由后端按模式+时长选择；平台日预算和用户日预算继续生效。
- Idempotency-Key 去重；任务创建与预占在同一事务。
- Worker：
  - 视频租约在 claim 后延长到 900 秒；
  - Provider 调用硬超时 8 分钟；Queue 轮询；
  - Live `attempt > 1` 直接 `UPSTREAM_UNCERTAIN`，不再次调用 Provider；
  - 超时/可能计费失败保留成本上界，不向用户扣费；
  - Mock 成功释放预占。
- 测试覆盖：重复幂等、Live Capture、失败 Release、成本预算、租约回收不二次调用。
- 生产多 Worker/PG 的真实并发仍需验证。

## 15. API/Worker/Storage 变更

**状态：已实现；本地迁移已验证；生产迁移未执行。**

- Migration `005_media.sql`：
  - `generation_jobs`：`media_type`、`generation_mode`、`duration_seconds`、`source_creation_id`、`width/height`、`video_metadata`；
  - `image_assets` 扩展为统一媒体资产：media type、duration、width/height、poster key/MIME、metadata。
  - 旧图片行通过默认值兼容。
- 契约：新增 Video请求/能力/定价类型，共享 `MEDIA_TYPES`、`GENERATION_MODES`、`VIDEO_DURATION_SECONDS`。
- API：
  - `POST /v1/generations/jobs` 支持 video（未另建不受控的视频任务系统）；
  - 同步 `POST /v1/generations` 明确拒绝 `mediaType=video`，视频只能走异步 Job；
  - `GET /v1/credits/pricing` 返回 video capability matrix；
  - `GET /v1/creations?mediaType=image|video`；
  - `GET /v1/creations/:id/video`（GET/HEAD + Range）；
  - `GET /v1/creations/:id/poster`；
  - `/download` 按媒体类型返回正确的签名 MP4/图片 URL。
- Worker：按 `ClaimedJob.mediaType` 选择图片/视频 adapter；视频成功写入视频 + poster；失败释放；来源数据结算后清理。
- Storage：本地私有存储支持 MP4/图片、大小上限（视频 50 MB）、MIME/容器校验；签名 URL 用独立 media kind 防跨类型重放。
- **生产限制**：当前本地存储为 JSON/base64；Range 路由会读入完整文件后切片。正式部署应使用支持 Range/流式读取的对象存储。

## 16. 测试与构建结果

**状态：已实现并验证。**

| 检查 | 结果 |
|---|---|
| API TypeScript | 通过 |
| API Vitest（全量） | **220 passed, 2 skipped（33 files）** |
| API Build | 通过；Mock MP4/Poster 复制到 `dist/assets/live-mock/` |
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest（全量） | **190 passed（25 files）** |
| Web Build | 通过（414 pages） |
| Contracts TypeScript | 通过 |

重点测试：

- T2V/I2V Job 创建、独立价格、Mock 成功；
- I2V 3 秒拒绝、T2V 3 秒接受；
- 上传来源与 My Creations 来源；
- Live 成功 Capture、失败 Release、预算 spent；
- Live 租约回收不二次调用 Provider（UPSTREAM_UNCERTAIN）；
- 私有视频 signed URL、GET/HEAD、Range 206、非法 Range 416；
- Poster MIME、MP4 MIME、下载 disposition；
- 独立 `FAL_VIDEO_LIVE_ENABLED` 安全开关；
- MP4 元数据探针；
- 视频请求/执行器、视频 Prompt/Motion；
- 风格 ID、i18n 7 语言、二次元分类；
- 静态生成回归。

浏览器验收：

- 1440×900、820×1180、390×844；
- 静态生成成功；
- 静态 → 动态保留 Prompt/风格/设备/比例；
- Mock T2V 5 秒成功；
- Mock I2V 从自有图片成功；
- 视频播放（4.9968 秒、静音、循环、playsInline）；
- My Creations 视频过滤/卡片/下载入口；
- Gallery 动态空态；
- 页面无水平溢出。

## 17. 桌面和移动端截图

- 模式切换/顶部：`docs/codex/screenshots/live-studio-top-1440.png`
- 动态 Studio：`live-studio-1440.png`、`live-studio-820.png`、`live-studio-390.png`
- 最终结果：`final-live-result-1440.png`、`final-live-playing-1440.png`、`final-live-result-820.png`、`final-live-result-390.png`
- 移动结果/操作：`live-result-actions-390.png`、`final-live-form-390.png`
- My Creations 视频：`live-creations-1440.png`、`live-creations-390.png`
- Gallery 动态空态：`gallery-live-1440.png`、`gallery-live-390.png`

截图目录：`docs/codex/screenshots/`。

## 18. 真实视频模型是否已经验证

**状态：需要真实模型测试。**

- **没有**发出任何真实视频请求。
- Live Adapter 的 endpoint、字段、queue 流程、时长/比例、音频关闭参数均通过注入 fetch 的单元测试；没有验证：
  - 真实 fal.ai 视频输出是否可下载；
  - Wan 实际 720p 尺寸与输出格式；
  - Kling 标准 T2V 的实际分辨率/编码/文件大小；
  - 真实 Poster 可用性（T2V）；
  - 真实费用、延迟和失败率。
- 本地 `FAL_MOCK=1`；`FAL_VIDEO_LIVE_ENABLED` 未开启。

## 19. 当前仍未解决的问题

1. **真实视频 Provider 未联调**；未产生任何付费调用。
2. T2V Live 目前没有 Poster：Kling 只返回视频；UI 用渐变 + 视频首帧/手动播放兜底。Poster 抽取需要服务端视频处理。
3. I2V 只开放 5 秒（Wan 首期）；Kling I2V 的 3–5 秒能力尚未接入。
4. 未实现视频裁剪、无缝循环处理、Live Photo 导出、Android/桌面专用格式。
5. 生产对象存储、流式 Range、生命周期/孤儿清理未实现；本地存储为 base64 JSON。
6. 来源图片以临时 data URI 存在 Job request，结算后删除；尚未落为独立 source media asset。
7. Kling T2V 实际宽高/分辨率依赖下载后的 best-effort 解析；fragmented MP4 的时长可能为 null，UI 以播放器实际时长兜底。
8. 公开 Gallery 动态壁纸仍为空态；没有素材授权/隐私/内容审核流程，不会自动发布用户视频。
9. 视频商业定价、成本上界与退款策略仍待所有者批准。
10. 未做生产 PostgreSQL 多 Worker/队列/备份演练；本地 PGlite 单进程已验证。
11. 本地 My Creations 历史仍为图片设施；视频以云端 creations 呈现。

## 20. 正式使用前需要的配置或批准

**状态：被外部条件阻塞。**

1. **真实视频调用**：必须同时设置 `FAL_LIVE_ENABLED=1`、`FAL_VIDEO_LIVE_ENABLED=1` 和有效 `FAL_KEY`，并单独获得所有者授权。`FAL_VIDEO_LIVE_ENABLED` 默认必须关闭；本轮没有开启。
2. **预算与定价**：确认 40/50/60 Credits 价格、$0.50/$0.65/$0.80 成本上界、日预算和毛利。
3. **真实模型单次受控测试计划**：按 Provider 逐个验证 endpoint、时长、比例、分辨率、音频、返回格式、Poster、失败/不确定状态与账单。
4. **生产存储**：R2/S3 或等价对象存储、签名 URL、HEAD/Range 流式读取、生命周期清理，以及真实 MP4 的 Content-Type/编码检查。
5. **视频后期能力**：T2V Poster 抽取、需要时的裁剪、Seamless Loop 处理、iPhone Live Photo/Android/桌面格式。
6. **授权与合规**：公开动态 Gallery 的素材授权、隐私、内容审核；现有 39 张静态 Gallery 仍为 review-pending。
7. **生产数据库**：独立 PostgreSQL、多 Worker、迁移审批与备份/恢复演练。不得直接对生产库运行本轮迁移。
8. **安全策略**：保持认证、Credits、预算、暂停、幂等、租约与 Provider 不确定状态保护；不要为了“让视频跑起来”绕过这些层。

---

### 状态汇总

| 项目 | 状态 |
|---|---|
| 静态生图保留与回归 | 已实现并验证 |
| Studio 静/动切换与表单 | 已实现并验证 |
| 二次元 + 主流风格扩展 | 已实现并验证 |
| 风格静态 Prompt / Motion Prompt | 已实现并验证 |
| 异步视频 Job / Worker / Mock MP4 / Poster | Mock 验证通过 |
| 独立视频定价/预留/结算/预算/幂等 | Mock 验证通过 |
| 私有视频 Range/HEAD/签名下载 | Mock 验证通过 |
| My Creations 视频管理 | Mock 验证通过 |
| 真实 Wan / Kling 视频调用 | 需要真实模型测试 |
| T2V Live Poster | 尚未实现（需视频后期处理） |
| iPhone Live Photo / 专用格式 / 无缝循环 | 尚未实现 |
| 生产存储 / PostgreSQL 多 Worker / 正式部署 | 被外部条件阻塞 |
| 视频真实计费与商业定价 | 被所有者批准阻塞 |
