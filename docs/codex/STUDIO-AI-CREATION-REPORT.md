# WallHaze V2.0 AI Studio 智能创作专项验收报告

日期：2026-10-22。基线 HEAD：b8b7e02（无 Git 写操作）。
状态：✅ 已实现并测试 / 🟡 仅前端 / 🧪 Mock 验证 / 🔴 需真实模型验证 / ⛔ 未实现

## 1. 当前代码与功能现状
- 前后端：Next.js 16 + Fastify + PostgreSQL(PGlite 本地) + Waffo(测试)。
- 生成：异步 Job → Worker → fal.ai `flux-2/klein/4b`（文生图）或 `/edit`（参考图编辑）。
- Credits：真实钱包、服务端定价 10 Credits、预占/结算/释放、失败释放。
- Studio：43 个风格、Auto/手动设备与尺寸、自定义宽高、参考图、灵感示例、真实门禁。

## 2. 旧版页面处理
旧版 `app/`、`components/`、`lib/`、`tests/` 未改动、未同步、未回归；本轮不删除任何旧文件，未来清理需单独授权与迁移清单。受保护目录未访问。

## 3. Studio 结构（前后）
- 前：风格文字 chip；设备/比例/尺寸分散；参考图文案笼统；无 Prompt Builder；空预览用竖图填充任意画幅。
- 后：左栏 420px（风格 → 设备与尺寸卡 → 描述 → 主体图片 → Credits → Generate），右栏大预览（sticky）；平板/手机单列、预览下移；空预览按目标比例显示渐变空态。

## 4. 自动设备识别
`detectDeviceProfile`：视口宽度 + 触控能力分类（无品牌识别）；物理像素用 `screen × DPR` 估算；方向/比例由 screen 计算；结果标注"推荐"而非设备型号。首次挂载检测一次，Auto 点击重算，resize 不覆盖手动选择；手动选择持久化到 localStorage。

## 5. 常用设备推荐
从服务端支持的预设中选择最接近屏幕比例与面积的条目：手机 9:16 1080×1920、平板 3:4 1020×1360、电脑 16:9 1920×1080；不虚构模型原生尺寸。桌面 1440×900 实测得到 1920×1080 且标记为近似（屏幕为 16:10）。

## 6. 自定义尺寸与最终导出
✅ 前后端请求链路：512–2048/边、4px 对齐、面积 ≤ 2048²、与预设互斥、比例一致性；服务端校验后以 `{width,height}` 传给 Provider。
⛔ 无裁剪/留白/缩放后处理；下载文件就是模型输出。模型若返回接近尺寸，界面展示实际尺寸（若供应商返回）。
🔴 精确像素输出未用真实付费模型验证。

## 7. 现有风格数量
43 个（原有 37 + 上轮新增 6），全部有 Prompt 模板；无重复 ID。

## 8. 新增风格
本轮未新增；上一轮新增 Paper Cut Art、Clay 3D、Low Poly、Stained Glass、Vaporwave、Botanical Illustration。候选中的 Film Noir 等因与现有 cinematic 重叠未加。

## 9. 风格 Prompt 设计
每个风格：`promptTemplate`（具体视觉特征）+ 解析出的 palette/lighting/texture/composition/negativePrompt；分类基线 + 逐风格覆盖（anime/cyberpunk/cinematic/水彩/油画/像素/恐怖等）。模板版本 `STYLE_PROMPT_VERSION=2`，并写入任务。

## 10. Prompt Builder 真实组合
输入：场景 + 风格 + 设备/比例/自定义尺寸 + 是否有参考图。
输出示例（中文描述 + cinematic + desktop）：
`Scene: 一只橘猫坐在窗前. Style: cinematic film still, anamorphic widescreen mood, teal and orange color grade... Palette: teal and orange cinematic grade. Lighting: anamorphic key light with practical highlights. Texture: film grain and shallow depth of field. Composition: widescreen staging with layered foreground. Wide desktop wallpaper composition: give the scene breathing room on the left and right... Compose for a 16:9 landscape frame.`
用户描述 800 字上限，最终 Prompt 1600 字上限，分别校验；空输入与超长返回 400。

## 11. handraw-style 参考与许可
已研究其结构：编号风格、分类、双语提示词、核心风格特征、色彩/构图参数、主题与场景组合。其 LICENSE 为宽松许可但要求衍生作品保留作者 "yang0" 与仓库链接。本项目未复制其提示词、风格条目或预览图片，仅借鉴"结构化风格特征 + 提示词组合"的方法，因此未分发衍生内容；本报告记录来源：https://github.com/yang0/handraw-style 。

## 12. 上传主体图片流程
UI 名称 "Add a Subject Photo"；支持 PNG/JPEG/WebP、≤5MB、魔数校验；文件读取为 data URI 提交；不写入 localStorage；日志不记录 base64；服务端再次校验。任务结算（成功/失败/租约清扫）后从 `generation_jobs.request` 删除 `refImage`。图片会发送给 AI 供应商，UI 已说明。

## 13. 背景融合实现
单次指令式编辑：`/edit` 端点 + `image_urls` + 组合 Prompt。Prompt 明确"使用参考图主体、保留外观、放入新场景、匹配透视/光线/接触阴影/色调、不得替换主体"。没有分割、Mask、分层合成或二次融合。
🧪 Mock 测试验证参数与流程；🔴 视觉保真度未验证。

## 14. 参考图与最终画面关系
参考图作为编辑输入，不是贴图；最终画面由模型生成。无参考图时走文生图，不包含主体保留指令。参考图-only 请求使用中性场景描述，不会失败。

## 15. 当前模型与能力
`fal-ai/flux-2/klein/4b`（文生图）与 `.../edit`（图片编辑），payload 含 prompt、image_size、image_urls、safety checker、PNG 输出。能接受参考图与编辑指令；是否稳定保留身份/纹样、是否支持负向提示词未验证（negativePrompt 未发送）。

## 16. 能力不足的替代方案
如需更高保真：主体分割 → 背景生成 → 合成 → 融合/调色 → 输出检查。该管线尚未实现；需真实模型与授权后评估。

## 17. Credits 定价来源
价格由服务端 `generationPricing()` 返回（当前 10 Credits/次）；预占、成功扣减、失败释放均在服务端账本完成；前端只展示服务端价格。参考图编辑与文生图当前同价；若未来成本不同，应在服务端按模式定价。

## 18. 生成状态真实性
Credits 提示六态；确认按钮只在"服务可用 + 余额足够"时出现；0 余额实测只显示 Close 与原因，无 "Generating"；只有真实任务提交后才进入 generating；后端独立校验余额与预占。

## 19. 前后端修改文件
新增：`apps/api/src/catalog/{prompt-builder,style-meta}.ts`、`apps/api/tests/prompt-builder.test.ts`。
修改：`apps/api/src/catalog/styles.ts`、`generation.validators.ts`、`business/{routes,worker,jobs,maintenance}.ts`、`tests/{generation-api,jobs,routes-business}.test.ts`；`apps/web/components/GeneratorSection.tsx`、`messages/*.json`（7）、`tests/studio-styles.test.ts`；`docs/codex/PROGRESS.md`。

## 20. 自动化测试结果
- API：21 文件，159 通过 / 1 跳过；typecheck、构建通过。
- Web：20 文件，164 通过；typecheck、ESLint、生产构建通过（414 页）。

## 21. 浏览器验收
- 1440×900：两栏 420/764，16:9 预览 384×216，空态标签正确，无溢出。
- 820×1180：单列 757，预览堆叠，无溢出。
- 390×844：面板 327，无溢出。
- 中文：本地化灵感示例，"添加主体图片"，"更换设备或尺寸"；0 余额门禁正确。
- 截图：IAB 截图接口超时/黑屏，未产出文件；以上为 DOM 几何与交互状态验证。

## 22. 未完成
- 自定义尺寸的导出后处理（裁剪/留白/缩放）。
- 分割/Mask 融合管线。
- 真实模型画质与主体保真度验收。
- 文件选择器上传的浏览器实测（IAB 不支持）。
- 负向提示词实测。
- 旧版代码迁移/清理清单（需授权）。

## 23. 尚需真实 AI 测试
- 43 个风格的视觉一致性与差异化。
- 参考图主体保留（人脸/宠物花纹/商品结构）。
- 自定义尺寸的模型实际输出与成本差异。
- 安全审核/NSFW 行为。

## 24. 商业化接入条件
参数链路、Prompt 版本、Credits 门禁与隐私处理已达到可接入状态；但真实模型画质、主体融合效果、精确尺寸导出与公网 Webhook 支付回调仍需上线前验收。结论：可进入下一阶段联调，不应直接对外宣称画质或身份保真已达标。
