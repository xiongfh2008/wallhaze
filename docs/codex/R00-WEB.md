# R00 Web 审计

审计时间：2026-10-21。范围仅 `apps/web`、`packages/contracts`、`docs`。未构建、未访问浏览器端口、未调用生成或支付服务、未读取密钥、未修改业务文件或执行 Git 写操作。既有未提交修改保持原状。

## 当前验证结果

| 检查 | 结果 |
|---|---|
| Vitest | 10 文件，112 用例通过，0 失败，0 跳过 |
| TypeScript | `tsc --noEmit --incremental false`，exit 0 |
| ESLint | `eslint .`，exit 0，无输出 |
| 生产构建 | 本轮未执行，避免与并发 3100 开发服务争用 `.next` |

全部命令从 `apps/web` 执行，使用指定 Node。Vitest 首次在沙箱内因 Vite 临时缓存 rename EPERM 导致 10 个套件无法加载（0 用例执行），随后经提升权限原命令重跑通过；这不是业务测试失败。测试现有 fetch 守卫阻断真实请求，适配器测试使用进程内注入。

## FE04–FE09 实际状态

- FE04：Studio 表单、尺寸/风格/参考图校验、确认和状态机已经存在。`CREDITS_SERVICES` 的 auth/pricing/wallet 三项全 false，正式生成提交结构性阻断。结果分支和状态机通过单测，但不代表真实服务可用。
- FE05：登录/注册页面为禁用入口和服务不可用说明；AuthPanel 无凭证输入框。AuthAdapter 方法全部返回 unavailable，无真实会话或 OAuth。
- FE06：钱包、套餐、流水、订单为诚实空态，Checkout 禁用。CreditsAdapter 为拟议前端接口，尚非后端契约；金额采用最小货币单位和 currency。
- FE07：My Creations 读取本地历史，20 条上限，支持确认删除、坏图状态和下载；云端 creations 适配器全 unavailable。
- FE08：账户、设置、订单存在；语言切换可用，登出/账户删除/订单后端均未接入。
- FE09：About/FAQ/Help/Contact 为公开内容，Privacy/Terms 标注草稿并 noindex。账户相关路由 noindex，sitemap 排除私有及法律草稿路由。

## 需修复的具体问题

### P1：作品中心下载结果不诚实

`apps/web/components/creations/MyCreationsClient.tsx:39–50`：`downloadImage` 返回 `opened`（跨域下载失败后仅打开原图）时，组件仍显示 `creations.downloadSaved`；返回 `failed` 时则清空提示，没有失败反馈。同仓库 Gallery 和 Studio 已分别处理 downloaded/opened/failed。应复用 common.downloadOpened/common.downloadFailed，增加忙碌态避免重复点击，并覆盖三种返回值。

### P2：再次创作未携带作品参数

该组件的再次创作链接（约 182 行）固定 `/studio`。用户保存的 prompt/styleId/device/ratio/sizePresetId 未传递，无法按原设置再次创作。坏图说明保留参数以便再次创作，但目前用户只能自行抄写。应使用受校验、一次性恢复机制携带非参考图参数；不可恢复参考图本体，因为历史按设计不存参考图。

### P2：Gallery 元数据含未经证实的创作者归属

`apps/web/app/[locale]/wallpapers/[slug]/page.tsx:143–144` 为所有图片统一输出 JSON-LD `creditText: WallHaze` 和 `creator: Organization WallHaze`。`lib/wallpapers.ts` 明确全部 39 图尚待逐图版权审查，种子数据也没有创作者或来源凭据字段。不能从目前数据证明 WallHaze 是每张图片创作者。建议删除无证据的归属字段，或仅在有逐图来源证明时输出。

### P2：FAQ 对下载与授权的表述过度确定

`messages/en.json` 的 faq.q2A 宣称文件直接保存到设备，但真实 helper 可能仅打开新标签或失败；faq.q6A 宣称图库图片可供个人使用且仅 some pending，而数据明确全部 39 张 review-pending。terms.ipBody 也宣称个人使用许可。应分别表述为下载操作能力和未核实的使用权，不能以待审状态推导个人授权。七语言应同步修订，避免仅保证 key 相等。

## 测试覆盖缺口与后续建议

- 当前组件 DOM 测试只覆盖 AuthPanel 和 MyCreations，未覆盖作品下载结果、再次创作恢复、存储删除失败反馈。
- 现有 i18n 测试校验 key parity，不能证明文本语义一致或内容主张真实。SEO noindex 用源码子串断言，未验证最终渲染 head。
- API generation 成功响应只校验 imageUrl 是字符串，未校验 HTTPS URL、宽高正整数、contentType 类型。未来打开真实服务前应补齐响应校验，避免错误载荷显示为成功并污染本地历史。
- 通用客户端文档承诺 never throws，但 AbortSignal.timeout/any 在 try 外调用；非法 timeout 或缺失浏览器 API 可直接抛错。当前内置调用使用合法正数，因此是未来集成健壮性缺口。
- 六个服务 gate 关闭是当前安全边界，不能通过简单改常量宣称登录、钱包、支付、云端作品、账户能力完成。真实集成需要正式契约、会话和服务端权限/计费校验。
- 真实网络图像是否可达、本轮 UI 视觉表现、生产构建与响应头未在此审计中复验；不得引用旧报告的浏览器或构建结论作为当前验证。

本报告为只读业务审计结果，不包含实现修复。
