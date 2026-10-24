# WallHaze AI Studio 设备智能适配与体验优化验收报告

日期：2026-10-21。基线 HEAD：b8b7e02（未提交任何内容）。
状态标记：✅ 已实现并测试通过 / 🟡 仅前端完成 / 🧪 Mock 可测试 / 🔧 需要后端支持 / ⛔ 尚未实现

## 1. 原 Studio 问题分析
- 37 个风格以文字 chip 展示，缩略图只在 hover 预览中出现；分类与搜索缺失。
- 设备、比例、分辨率分成三个区块；屏幕建议需要手动点击，首次进入不会自动适配。
- 后端只接受内置尺寸预设，没有自定义宽高契约。
- Credits 提示是静态文案，真实生成进行中仍显示"需要积分"；确认对话框在余额为 0 时仍提供确认按钮。
- 移动端存在真实横向裁切：网格子项 `min-width:auto` 被风格网格撑到 675px，外层 `overflow-x-clip` 把右侧内容直接裁掉。

## 2. 修改前后布局
- 前：页面最大宽度 1152px，两栏 2fr/3fr，设备区默认折叠但状态与建议分离。
- 后：Studio 专用容器 1280px，桌面两栏 `420px + 1fr`，预览 sticky；平板/手机单列，预览在参数下方；两列加 `min-w-0` 修复裁切。

## 3. 原有风格数量
37 个（7 个分类），全部带 Prompt 模板；已审计、无重复 ID。

## 4. 新增风格
6 个：Paper Cut Art、Clay 3D、Low Poly、Stained Glass、Vaporwave、Botanical Illustration。总计 43。
未新增 Film Noir / Riso 等与现有 cinematic/print 风格重叠的条目。

## 5. 风格分类与预览
分类：Digital Art、Abstract & Minimal、Sketch & Drawing、Painting、Photography、Nature & Landscape、Horror & Dark。
新风格归入现有分类；无版权图片的新风格使用品牌渐变色占位并明确标注 "Gradient preview"，不虚构作品图。
选择器改为：搜索框 + 分类 tabs + 缩略图卡片（名称/一句描述）+ 选中角标 + 取消选择 + "Show all"。

## 6. 自动设备识别方案
`lib/studio/device.ts` 纯函数：
- 设备：无触控或视口 ≥1200 → desktop；触控且 ≥700 → tablet；其余 → phone。不使用品牌识别。
- 物理像素估算：`screen CSS 尺寸 × devicePixelRatio`，明确标注为估算。
- 方向与屏幕比例：由 screen 尺寸计算。
- 推荐：在设备允许的比例中选择最接近屏幕长宽比的，再从现有预设中按面积选择；返回 `exactMatch`。

## 7. 当前设备推荐尺寸
桌面 1440×900 浏览器实测：Desktop · 16:9 · 1920×1080，提示为近似匹配（屏幕是 16:10）。
手机（注入测试 390×844）→ 9:16 1080×1920；平板（820×1180）→ 3:4 1020×1360。均为现有服务端预设。

## 8. 手动设备切换
Auto / Phone / Tablet / Desktop 四态。手动切换后写入 localStorage，刷新保持；Auto 点击会重新检测并清除保存的偏好。

## 9. 自动与手动关系
首次访问默认 Auto；只有挂载时和点击 Auto 时才检测，窗口 resize 不会覆盖手动选择。自定义尺寸在设备切换时保留，并提示"保留了自定义尺寸"。

## 10. 自定义尺寸的实际支持范围
前端与服务端一致：512–2048 px/边、4 px 对齐、面积 ≤ 2048²、不能与预设同时提交、显式比例必须与尺寸一致。价格不变（每次 10 Credits）。

## 11. 自定义尺寸是否实现后端处理
✅ 已实现：contracts 增加 width/height；API 校验器校验并生成 `{width,height}` 的 imageSize，同步与异步生成路径共用；Mock Worker 路径可测试。
🔧 未实现裁剪/留白/缩放后处理；⛔ 未用真实付费模型验证"精确像素输出"。界面报告的是模型返回的真实尺寸（若返回），不承诺逐像素一致。

## 12. 灵感提示词
保留并改造前已存在：点击示例 → 空 Prompt 直接填入；已有 Prompt 时显示 Replace / Append / Cancel；字符计数实时；切换不触碰尺寸/参考图。浏览器实测点击后 textarea 内容改变。

## 13. Generate 状态修复
- Credits 提示改为六态：loading / unavailable / signed-out / ready / insufficient / in-flight。
- 确认按钮仅在"服务可用 + 余额足够"时出现；余额不足显示具体原因与充值入口。
- 实测 0 余额：对话框显示价格与 "Not enough Credits"，只有 Close，页面无 "Generating"。
- 只有真实任务提交后才进入 generating；后端仍强制校验余额与预占。

## 14. 参考图上传
代码路径未改动：类型/大小/魔数校验、5MB 上限、服务端二次校验；13 个相关测试通过。浏览器文件选择器在 IAB 不可用，未做点击上传实测。

## 15. My Library
保留原有收藏/历史 tabs 与 localStorage 数据；本轮未删除任何记录，也未进一步折叠（列为后续优化）。

## 16. 七语言
新增风格名称/描述、Device & Size、搜索、自定义尺寸、Credits 六态文案均补齐 en/zh/ja/ko/es/fr/de；i18n parity 测试通过。

## 17. 检查结果
- Web：16 文件 / 163 测试通过；`tsc --noEmit` 0；`eslint .` 0；`next build` 成功（414 页）。
- API：20 文件 / 149 通过 / 1 既有跳过；typecheck 与构建通过。

## 18. 浏览器实测
IAB 1440×900：两栏 420/764，无横向溢出，Auto 推荐 1920×1080。
IAB 820×1180：单列 757，预览堆叠，无溢出。
IAB 390×844：面板 327，风格 2×133.5，无溢出（修复前为 675 被裁切）。
自定义 1020×1360 应用成功（摘要与目标尺寸行、3:4 预览）；Auto 恢复 1920×1080 并清空偏好；搜索 Vaporwave 并选中成功；灵感示例写入 Prompt 成功。
截图：内置浏览器截图接口本次超时/返回黑屏，未产出截图文件；以上均通过 DOM 几何、计算样式与交互状态验证。

## 19. 修改文件清单
- 新增：`apps/web/lib/studio/device.ts`、`custom-size.ts`、`request.ts`；`apps/web/tests/studio-device.test.ts`、`studio-custom-size.test.ts`、`studio-size-preference.test.ts`、`studio-styles.test.ts`、`credits-notice.dom.test.ts`、`generation-dialog.dom.test.ts`；`apps/api/tests/custom-size.test.ts`、`styles-catalog.test.ts`；本报告。
- 修改：`packages/contracts/src/{generation,index}.ts`；`apps/api/src/catalog/{sizes,styles}.ts`；`generation.validators.ts`；`apps/web/components/{GeneratorSection,StylePicker}.tsx`、`studio/CreditsNotice.tsx`、`studio/GenerationConfirmDialog.tsx`、`lib/styles.ts`、`messages/*.json`（7）、`docs/codex/PROGRESS.md`。

## 20. 未完成
- 精确像素输出的真实模型验证与裁剪/缩放管线。
- 触屏设备的浏览器级自动识别实测（仅注入单测）。
- 文件选择器上传的浏览器实测。
- My Library 进一步折叠/减小默认高度。
- 桌面窗口变窄时仍按"无触控=桌面"分类（有意为之）。

## 21. 后端仍需支持
- 确认模型对自定义 {width,height} 的真实上下限与对齐要求；如不支持精确尺寸，增加受控裁剪/留白并明确标注。
- 若不同尺寸成本不同，需按尺寸定价而非固定 10 Credits。

## 22. 视觉回归
未做像素级截图对比（工具限制）；DOM 布局、断点、无溢出、字体基准（正文 16px、表单 14px+）已验证。品牌深色/紫色渐变语言未变。

## 23. 是否适合进入下一阶段商业化集成
适合：设备/尺寸/风格/状态链路已闭环，门禁与后端校验一致。进入商业化前仍需完成真实模型尺寸验证、Webhook 公网注册与一次真实测试卡支付。
