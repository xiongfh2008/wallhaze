# 《WallHaze FE04–FE09 前端自主研发与综合验收报告》

生成时间：2026-10-21 ｜ 执行环境：Windows / PowerShell / npm 10.9.9 / apps/web（Next.js 16.4.0 + React 19.3.0 + Tailwind 4 + next-intl 4.14.9）

---

## 1. 执行总览

| 项 | 值 |
|---|---|
| 任务书所列"原 Git HEAD" | `b0f6dcfb2fce190c60527c814151b9e4373aac59` |
| 本轮实际开始时 HEAD | `b8b7e026ddd1ff33cc49fcc0e28b996c098bdbe8`（用户已在 b0f6dcf 之上自行提交新架构基线，FE04-A 改动亦在该提交中） |
| 当前 HEAD | `b8b7e026ddd1ff33cc49fcc0e28b996c098bdbe8`（未变化） |
| 本轮是否发生 Git 写操作 | **否**（零 add / commit / push / reset / checkout） |
| 分支 | master（与 origin/master 一致） |
| 暂存区 | 空 |
| 总体任务完成率 | 本轮授权范围（FE04 复核 + FE05–FE09 开发 + 统一测试 + 验收 A–H + 报告）**100%** |

说明：FE04-A 已在上一轮完成并验收（报告：docs/WallHaze-FE04A-AI-Studio-前端完善与自动化测试报告.md）。本轮按任务书要求"不重复开发"，仅对 FE04 做复核（83 用例全绿），开发工作集中于 FE05–FE09。

---

## 2. FE04 AI Studio（复核确认，上一轮完成）

- **页面布局**：桌面左右双栏（左：Prompt 编辑器 / 风格 / 设备 / 比例 / 尺寸 / 参考图 / Credits 提示 / 生成按钮；右：预览 / 状态 / 错误 / 成果 / 下载 / 重试取消），移动端上下堆叠。
- **Prompt**：多行输入、字符计数（上限按后端契约 800）、超长校验、清空、Prompt Examples、风格切换不丢内容；"空 Prompt + 合法风格"组合按契约允许。
- **风格**：分类 / 搜索 / 缩略图 / 选中态 / 取消选择 / `?style=<id>` URL 预选，非法 style ID 安全降级。
- **设备和尺寸**：Phone / Tablet / Desktop，由 lib/sizes.ts 联动比例与尺寸，只显示后端支持项，切换时修复非法组合且不清空无关输入。
- **参考图**：上传 / 拖拽 / 预览 / 替换 / 删除 / 类型与大小校验 / 错误提示；object URL 正确清理；不落 localStorage。
- **Credits 提示**：CreditsNotice + GenerationConfirmDialog；无虚构余额/价格；正式提交被结构性阻断（后端服务未配置时 gate 直接返回 unavailable，非仅 UI 禁用）。
- **状态机**：idle / validating / confirmation / blocked / submitting / generating / succeeded / failed / canceled / timed_out；无虚构 Job ID、百分比或云端保存。
- **结果预览**：大图 / 尺寸信息 / 下载 / 再次创作 / 错误与超时提示 / 取消。
- **自动化测试**：studio-form(21) + studio-state(12) + generation-flow(12) + studio-pricing(5) + studio-reference(13) = 63 用例，本轮复核全部通过。

---

## 3. FE05 登录注册前端（本轮完成）

- **页面**：`/login`、`/signup`、`/account`（未登录引导态），均跟随 `[locale]` 路由自动适配语言前缀，均 noindex。
- **AuthPanel 组件**：Logo、登录/注册标题、Google 入口（disabled）、邮箱入口（disabled）、serviceNotice（"Account services are not connected yet…"）、login↔signup 切换、隐私/条款入口、返回首页。**组件中不存在任何 `<input>` 字段——凭证在结构上无法被收集**（DOM 测试断言 `querySelectorAll("input").length === 0`）。
- **接口适配**：`lib/api/auth.ts` 提供 AuthAdapter（getSession / getCurrentUser / signInWithPassword / signUpWithPassword / signInWithGoogle / signOut）与 getAuthStatus；`AUTH_SERVICES_CONFIGURED = false` 时所有方法返回统一 `{ok:false, failure:{kind:"unavailable"}}`；gate 意外开启但无实现时抛错。未配置 Auth 服务时 getAuthStatus 恒为 `{state:"unavailable"}`。
- **未连接 Auth 时的表现**：禁用按钮 + 明确文案；无假会话、无假跳转、不标记已登录。
- 未自行选择/安装任何 Auth Provider（未装 next-auth 等）。

---

## 4. FE06 Credits 积分钱包前端（本轮完成）

- **钱包页面** `/credits`（noindex），九模块齐备：余额区（空态 + unavailable 说明）、积分套餐区（空态，无硬编码测试套餐）、购买说明、积分流水（空态）、充值订单（空态）、常见问题（3 组）、未登录引导、购买受限说明 + disabled Buy 按钮、restricted 区块。
- **接口适配**：`lib/api/credits.ts` 提供 getWallet / listCreditPackages / listCreditTransactions / createCheckout / listPaymentOrders；`CREDIT_WALLET_SERVICES_CONFIGURED = false` 全部返回 unavailable。金额类型为 `priceMinorUnits + currency`（整数最小货币单位，无浮点钱）；PaymentOrder 为 provider-agnostic 结构（不含 Stripe/Paddle 专有字段）。
- **Checkout 受限状态**：服务未就绪时 createCheckout 结构性返回 unavailable，UI 的购买按钮 disabled，无假购买成功，未接入任何真实支付服务。

---

## 5. FE07 My Creations 作品中心（本轮完成）

- **本地历史**：继续使用 `wallhaze:history:v1`、上限 20 条、Key 与数据结构不变；新增 `removeGenerationHistoryEntry(id)`（仅删本地记录、其余保留、失败返回 false 不抛错）。
- **作品展示** `/my-creations`（noindex）：标题、数量（aria-live）、图片网格（复用 WallpaperImage）、本地历史标注（"Stored locally… not synced / not cloud"诚实文案）、空态 + 去 Studio 引导。
- **下载**：复用 downloadImage（文件名 `wallhaze-<id前8位>`）；远程图失效时 onError 进入"Image no longer available"错误态，保留 prompt/尺寸便于再次创作，下载按钮 disabled。
- **删除**：window.confirm 真实确认 → 仅删本地记录 → aria-live 通知；明确"Nothing is deleted in any cloud — none exists yet"。
- **云端能力边界**：`lib/api/creations.ts` 提供 listCreations（cursor 分页）/ getCreation / deleteCreation / downloadCreation 适配接口，`CREATION_SERVICES_CONFIGURED = false` 全部 unavailable，不实际调用。
- 不保存图片二进制/base64（isHistoryEntry 强制 `https://` imageUrl，data: URI 记录加载时被过滤——测试覆盖）；不虚构图片永久有效。

---

## 6. FE08 账户中心前端（本轮完成）

- **账户首页** `/account`（noindex）：登录引导卡（去登录/注册）、"Account services are not connected yet" unavailable 说明、settings/orders 入口卡、无账户也可用功能卡（Gallery/Studio）。
- **设置页** `/account/settings`：语言偏好为**真实可用**项（site-wide LanguageSwitcher，含"此设置立即生效且保存在本设备"说明）；退出登录为诚实不可用态（disabled + 说明，无假登出）；删除账户仅提供说明文案，无假删除。
- **订单页** `/account/orders`：unavailable 说明 + 空态 + 登录引导；订单结构复用 provider-agnostic 的 PaymentOrder，不提前绑定特定支付方；不展示不存在的订单为成功。
- **接口适配**：`lib/api/account.ts`（getAccount / updateLanguagePreference / deleteAccount，`ACCOUNT_SERVICES_CONFIGURED=false`）；`lib/api/orders.ts`（listOrders / getOrder，`ORDER_SERVICES_CONFIGURED=false`）。
- 未在 localStorage 保存认证 Token；未创建虚构用户信息。

---

## 7. FE09 网站内容页面（本轮完成）

| 页面 | 索引策略 | 内容要点 |
|---|---|---|
| /about | 可索引 | 仅描述已确认能力（免费画廊、Studio 概念、即将开放的 Credits）；无虚构地址/团队/用户数/合作伙伴 |
| /faq | 可索引 | q1–q8 覆盖任务书全部 7 主题：画廊用法、下载、Studio 是什么、Credits 概念、生成未开放原因、授权与商业使用限制、本地 vs 云端历史（+账户） |
| /help | 可索引 | 基本使用说明 + 3 组故障排查 + FAQ/Contact 链接 |
| /contact | 可索引 | 无表单；诚实声明暂无官方联系渠道；未编造邮箱 |
| /privacy | **noindex + DRAFT 徽章** | 全节"待审核确定"；不声明真实隐私处理行为/保留期限/公司主体 |
| /terms | **noindex + DRAFT 徽章** | 同上；不声明退款权利等未生效条款 |

- 法律草稿统一通过 ContentShell 的 draft 模式渲染"Draft — pending legal review"琥珀色 note 区块，不要求用户确认、不作为生效条款展示。
- **上线阻塞项**：/privacy 与 /terms 必须经正式法律审核后方可去 noindex 上线。
- 导航更新：Header 增加 My Creations、Credits、Sign in（→/login 真实链接）；Footer 的 FAQ/About/Contact/Privacy/Terms 从占位改为真实路由。社交图标保持 FE01 的 PlaceholderLink"coming soon"占位（未伪造真实社交地址）。
- sitemap.ts：新增 /about /faq /help /contact；账户类与法律草稿页全部排除；39 张壁纸 slug 不变。

---

## 8. 实际文件变更清单（均相对 HEAD b8b7e02，全部位于 apps/web/）

### 本轮新增
```
apps/web/lib/api/auth.ts                      FE05 Auth 适配层
apps/web/lib/api/credits.ts                   FE06 Credits 适配层
apps/web/lib/api/creations.ts                 FE07 Creations 适配层
apps/web/lib/api/account.ts                   FE08 Account 适配层
apps/web/lib/api/orders.ts                    FE08 Orders 适配层
apps/web/components/auth/AuthPanel.tsx        登录/注册面板
apps/web/components/creations/MyCreationsClient.tsx   作品网格客户端组件
apps/web/components/pages/ContentShell.tsx    内容页共享外壳
apps/web/app/[locale]/login/page.tsx
apps/web/app/[locale]/signup/page.tsx
apps/web/app/[locale]/account/page.tsx
apps/web/app/[locale]/account/settings/page.tsx
apps/web/app/[locale]/account/orders/page.tsx
apps/web/app/[locale]/credits/page.tsx
apps/web/app/[locale]/my-creations/page.tsx
apps/web/app/[locale]/about/page.tsx
apps/web/app/[locale]/faq/page.tsx
apps/web/app/[locale]/help/page.tsx
apps/web/app/[locale]/contact/page.tsx
apps/web/app/[locale]/privacy/page.tsx
apps/web/app/[locale]/terms/page.tsx
apps/web/tests/services-gates.test.ts         六 gate 全量断言 + 禁网自检
apps/web/tests/i18n-parity.test.ts            七语言 key 一致 + 路由/noindex/sitemap 断言
apps/web/tests/creations-local.test.ts        本地历史删除/上限/data:URI 过滤
apps/web/tests/components.dom.test.ts         jsdom 组件测试（AuthPanel + MyCreations）
apps/web/package-lock.json                    devDeps 安装产生（apps/web 首个本地 lockfile）
docs/WallHaze-FE04-FE09-前端自主研发与综合验收报告.md   本报告
```

### 本轮修改
```
apps/web/lib/history.ts                +removeGenerationHistoryEntry
apps/web/lib/seo.ts                    +pageMetadata（noindex 支持）
apps/web/app/sitemap.ts                +about/faq/help/contact
apps/web/components/Header.tsx         导航加入 my-creations/credits/signIn
apps/web/components/Footer.tsx         五个内容页占位改真实链接
apps/web/eslint.config.mjs             no-unused-vars 增加 ^_ 忽略约定
apps/web/vitest.config.mts             include 扩至 *.tsx
apps/web/package.json                  +3 个 devDependencies
apps/web/messages/{en,zh,ja,ko,es,fr,de}.json   新增约 160 个 namespace key
```

### 上一轮 FE04-A 遗留未提交改动（本轮未触碰，与上述一并处于工作区）
```
apps/web/components/GeneratorSection.tsx / StudioStylePreselect.tsx / studio/*
apps/web/lib/api/generation.ts / lib/studio/*
apps/web/tests/studio-*.test.ts / generation-flow.test.ts 等
docs/WallHaze-FE04A-AI-Studio-前端完善与自动化测试报告.md
```

### 删除
无（未删除任何既有文件）。

### 依赖安装记录（任务书授权清单内）
| 包 | 版本 | 用途 |
|---|---|---|
| jsdom | ^30.1.3 (dev) | 组件 DOM 测试环境 |
| @testing-library/react | ^16.3.3 (dev) | 按任务书清单安装（见下方说明） |
| @testing-library/user-event | ^14.6.8 (dev) | 按任务书清单安装 |

- 安装命令：`npm install -D jsdom @testing-library/react @testing-library/user-event --legacy-peer-deps`（cwd=apps/web）。
- `--legacy-peer-deps` 原因：npm 10.9.9 arborist `#loadPeerSet` 解析 `@vitest/browser-playwright@5.0.5` peer 时崩溃（`Cannot read properties of null (reading 'edgesOut')`，已知 bug），dry-run 验证后使用。
- 安装后核对：apps/web/package-lock.json 为新增文件（此前不存在），仅新增 apps/web 本地依赖树；**仓库根 package.json / package-lock.json 未改动**；未执行 npm audit fix。
- **清单外依赖阻塞项**：@testing-library/react 16 的硬性 peer `@testing-library/dom` 不在授权清单内，按任务书规则**未安装**并记为阻塞项。DOM 测试因此改用 `react-dom/client`（createRoot + act）+ jsdom 手动渲染方案，零新增依赖达成同等断言能力。

---

## 9. 测试与构建

| 检查 | 实际结果 |
|---|---|
| TypeScript（apps/web `tsc --noEmit`） | 通过（无输出，exit 0） |
| ESLint（apps/web） | 通过（0 error / 0 warning，exit 0） |
| Vitest 测试文件数 | **10** |
| Vitest 用例总数 | **112** |
| Vitest Passed | **112** |
| Vitest Failed | 0 |
| Vitest Skipped | 0 |
| apps/web Build（Next.js 16，仅 apps/web） | 通过（exit 0；39 slug × 7 locale 详情页 + 全部新路由 + sitemap.xml + robots.txt 均产出） |
| apps/api 原有回归（进程内 Mock） | 通过：9 文件 / **100 passed / 1 skipped**（与已知基线一致；GEN-27 真实 120 秒测试未执行） |
| 浏览器验证（dev 端口 3100，自管实例） | 6 批全部 PASS（见下） |

新增测试明细：
- services-gates.test.ts（8）：六个服务 gate 全关闭；auth/credits/creations/account/orders 共 20 个方法全返回 unavailable；凭证参数传入后被丢弃；getAuthStatus 恒 unavailable；禁网自检 0 出站请求。
- i18n-parity.test.ts（5）：七语言 keySet 完全相等（643 keys）；新 namespace 存在；17 条路由注册表与页面文件一一对应；noindex 源码断言（私有页+法律页含 noindex:true，公开内容页不含）；sitemap 含公开内容页+39 壁纸、不含任何 noindex 路由。
- creations-local.test.ts（7）：单删命中/未知 id/无 window 降级；读取与写入双向 20 条上限；data:URI 记录被过滤；全程 0 出站请求。
- components.dom.test.ts（9，jsdom）：AuthPanel 双 disabled 按钮、0 个 input、服务提示、全部链接目标；MyCreations 空态、2 条渲染且 DOM 无 base64 泄漏、确认删除（confirm spy）+localStorage 同步、取消保留、onError 坏图态+下载禁用、data:URI 记录不进 DOM。所有测试运行于 setup.safety.ts 禁网守卫之下（Mock 默认拒绝真实出站网络）。

浏览器验收明细（6 批，全部 PASS）：
1. /en 首页、/en/wallpapers、/en/wallpapers/sakura-nights：渲染正常；canonical 与 8 条 hreflang（7 语言+x-default）；无 noindex；无破损图片。
2. /en/studio、/en/login、/en/credits：Studio 控件齐备且生成被 gate 阻断；login disabled 按钮+无输入字段+服务提示；credits 空钱包+disabled 购买，无假余额/价格；两页均 noindex。
3. /en/my-creations、/en/account、/en/privacy：三页 noindex；my-creations 空态+本地存储诚实说明；account 登录引导+无假用户数据；privacy 有 DRAFT 徽章。
4. /en/faq、/en/help、/en/contact：三页可索引+canonical；FAQ 覆盖 7 主题（源码与 en.json 逐条核实）；contact 无假表单、诚实无渠道。
5. /zh/studio、/ja/studio、/ko/studio：标题/导航/按钮分别为「工作室 — 创作 AI 壁紙」/「スタジオ — AI壁紙を作成」/「스튜디오 — AI 배경화면 만들기」，结构完整，hreflang 9 链接。
6. /en/terms（noindex+DRAFT，无虚构主体）、/es/studio、/de/studio（"Estudio — Crea fondos de IA" / "Studio — KI-Hintergrundbilder erstellen"）：全部通过。

---

## 10. 多语言情况（en / zh / ja / ko / es / fr / de）

| 项 | 结果 |
|---|---|
| messages key 数量 | 七语言各 **643 keys，完全一致**（i18n-parity 测试断言 extra=[] missing=[]） |
| 新增 namespace | meta+22、auth、account、wallet、creations、content、about、faq、help、contact、privacy、terms（约 160 key/语言） |
| 页面覆盖 | 全部新页面（FE05–FE09 的 17 条路由）七语言全部到位 |
| 浏览器抽查 | zh/ja/ko/es/de 的 Studio 页实测翻译真实渲染（引用见第 9 节批次 5/6）；en 为基准 |
| 未浏览器抽查 | fr（受浏览器批次 URL 上限限制）；其 messages 与六语言经测试断言结构一致，构建期全部语言页面成功产出 |
| 构建验证 | 7 语言 × 全部路由在 `next build` 中成功静态/部分预渲染 |

---

## 11. 安全保护（逐项确认）

| 问题 | 回答 |
|---|---|
| 是否触碰受保护目录 `wallhaze\`？ | **否**（仅出现在 git status untracked 列表中，从未读取/扫描/修改） |
| 是否触碰 localhost:3000？ | **否**（仅使用自管 3100 实例；结束时已停止本次启动的进程） |
| 是否使用真实密钥 / 读取 .env.local？ | **否** |
| 是否调用真实 fal.ai AI？ | **否**（生成提交被 gate 结构性阻断；测试全程禁网守卫） |
| 是否触发真实支付？ | **否**（未接入任何支付服务；checkout 结构性 unavailable） |
| 是否修改 apps/api？ | **否**（只读，仅运行既有测试） |
| 是否修改 packages/contracts？ | **否**（只读） |
| 是否修改根目录业务代码 / package.json / package-lock.json / .next？ | **否** |
| 是否关闭 cacheComponents？ | **否**（next.config.ts 保持 `cacheComponents: true`，构建验证通过） |
| 是否删除/弱化既有安全测试？ | **否**（apps/api 100+1 结果与基线一致；apps/web 既有 83 用例全保留通过） |
| 是否执行 Git Commit/Push 等写操作？ | **否** |
| 是否部署 / 改动域名 DNS？ | **否** |
| 是否伪造登录/余额/付款/云端保存/AI 成功？ | **否**（全部为结构级阻断 + 明确"服务未开放"文案） |

---

## 12. 当前真实可用功能（诚实分级）

**已真实可用（无后端依赖）**
- Gallery 浏览、筛选、详情、下载（FE02/FE03 既有）
- AI Studio 参数配置、风格/设备/尺寸联动、参考图上传校验、Prompt 管理（提交步骤按设计阻断）
- 本地生成历史（localStorage，上限 20）、My Creations 查看/下载/删除本地记录
- 语言切换（含 /account/settings 内偏好说明）
- About / FAQ / Help / Contact 内容页
- 多语言与 SEO 基础设施（canonical/hreflang/sitemap/robots）

**UI 已完成，等待后端**
- 登录/注册/账户中心、Credits 钱包与套餐、积分流水、充值订单、云端作品中心、账户删除/登出

**仅测试环境模拟（进程内 Mock，不进正式 UI）**
- 适配器 unavailable 返回结构、API client 注入 fetchImpl 的行为断言、jsdom 组件交互

**尚未完成（需后端/授权后开发）**
- 真实生成 Job 提交与轮询、真实 Auth、真实钱包计价、支付与 Checkout、对象存储与云端作品、法律页正式生效

---

## 13. 后端接口需求清单（仅建议，未修改后端）

统一约定建议：错误响应含稳定 `kind` 枚举（unavailable / unauthorized / validation / not_found / rate_limited / server_error）；列表走 cursor 分页（`cursor` + `nextCursor`）；金额用 `priceMinorUnits`（整数）+ ISO `currency`；订单对象 provider-agnostic（不含 Stripe/Paddle 专有字段）。

1. **Auth API**：`GET /v1/auth/session`；`POST /v1/auth/sign-in`（email+password）；`POST /v1/auth/sign-up`；`GET /v1/auth/google`（OAuth 跳转）+ 回调；`POST /v1/auth/sign-out`。响应建议：`{user:{id,email,displayName,locale}, session:{expiresAt}}`。
2. **Credits/Wallet API**：`GET /v1/credits/wallet` → `{balance, currency?|unit, updatedAt}`；`GET /v1/credits/transactions?cursor=`（type: purchase/usage/refund，amountSigned）。
3. **Pricing API**：`GET /v1/credits/packages` → `[{id, credits, priceMinorUnits, currency, badge?}]`（前端已按此消费，禁止硬编码套餐）。
4. **Checkout API**：`POST /v1/credits/checkout` → `{checkoutUrl, expiresAt}`（服务端创建支付会话；前端已预留 createCheckout(packageId, successUrl, cancelUrl)）。
5. **Generation Jobs API**：`POST /v1/generation/jobs`（prompt/styleId/device/ratio/sizePresetId/referenceUploadId）→ `{jobId, status}`；`GET /v1/generation/jobs/:id`（queued/running/succeeded/failed/canceled/timed_out + resultImageUrl/width/height/creditsCharged）；`POST /v1/generation/jobs/:id/cancel`。
6. **Creations API**：`GET /v1/creations?cursor=`；`GET /v1/creations/:id`；`DELETE /v1/creations/:id`；`GET /v1/creations/:id/download`（302 或流）。
7. **Orders API**：`GET /v1/orders?cursor=`；`GET /v1/orders/:id` → `{id, status(pending/paid/failed/refunded), packageId, amountMinorUnits, currency, createdAt}`。
8. **Account API**：`GET /v1/account`；`PATCH /v1/account`（含 locale 偏好）；`DELETE /v1/account`。

---

## 14. 遗留问题

**P0**：无（本轮范围内无阻塞交付的问题）。

**P1**
1. /privacy 与 /terms 为未经法律审核的草稿（已 noindex + DRAFT 徽章）——**正式上线前必须完成法律审核**。
2. 所有商业化动作（生成提交/登录/钱包/支付/云端作品）等待后端服务；前端已完成结构性等待位。
3. `@testing-library/dom` 为授权清单外依赖未安装（RTL 16 硬性 peer）；现有 DOM 测试用手动渲染方案达成同等覆盖，后续如需 user-event 高保真交互测试需授权补充安装。

**P2**
1. dev 模式控制台存在 2 条 Next.js 16 `instant` 校验错误（cacheComponents 开发态校验器对 /studio 既有动态结构的提示；生产构建 exit 0、页面渲染与水合正常，非本轮引入）。
2. Gallery 页控制台偶发 1 条 Intl 格式化警告（既有，FE02 范围）。
3. Footer 社交图标为 FE01 既定 PlaceholderLink"coming soon"占位（浏览器检查工具将其判为 `#` 死链；属有意设计，避免伪造真实社交地址）。
4. 手机尺寸为响应式 Tailwind 断点实现（sm:/lg:），浏览器验收工具不支持视口 resize，未做真机/模拟器截图级验证（代码与构建层面确认）。
5. Studio 参考图拖拽在真实浏览器拖放事件下的行为依赖既有 FE04-A 测试与实现，本轮未重复人工验证。

---

## 15. 最终建议（回答 15 问）

1. **FE04～FE09 哪些真正完成？** FE05、FE06、FE07、FE08、FE09 本轮全部实际完成（代码+页面+七语言文案+测试）；FE04 在上一轮已完成、本轮复核通过。六个阶段无遗留未实现项。
2. **前端是否具备完整商业化页面结构？** 具备。登录/注册/账户/Credits/订单/作品中心/内容页/法律页结构齐备，统一走 lib/api 适配层，类型与错误状态一致，后端就位后为"接入"而非"新建"。
3. **哪些能力被有意阻断？** 凭证收集（无 input 字段）、生成提交、Checkout、登出、账户删除、云端作品操作——全部为服务 gate 结构性阻断，并配明确"服务未开放"文案；这是防伪造的机制而非 UI 假按钮。
4. **自动化测试是否真实存在并运行？** 是。apps/web 10 个测试文件 / 112 用例全部真实运行通过（含 jsdom 组件测试与禁网守卫自检）；apps/api 既有 100 passed / 1 skipped 回归通过。
5. **是否仍有构建或类型错误？** 无。tsc --noEmit、ESLint、next build、vitest 四项全部 exit 0。
6. **是否适合下一步固化 Git 基线？** 适合。工作区包含 FE04-A（上轮）与本轮 FE05–FE09 两组连贯改动，测试与构建全绿；建议审核后由你执行 commit（本轮按授权未做任何 Git 写操作）。注意 apps/web/package-lock.json 应一并纳入。
7. **后端应按什么顺序继续开发？** 建议：① Auth API（解锁登录态与账户页）→ ② Credits Wallet + Packages/Pricing（解锁余额/套餐真实数据）→ ③ Generation Jobs（解锁 Studio 提交，消费 Credits）→ ④ Creations + 对象存储（云端作品）→ ⑤ Checkout/Orders（真实支付，最后接入，风险隔离）。前端适配层已按上述接口形态预留，逐个开启 `*_SERVICES_CONFIGURED` 即可灰度接入。

---

## 附：验收执行顺序记录

阶段0 预检（Git 状态核实 + FE04 复核 83 用例）→ FE05 → FE06 → FE07 → FE08 → FE09（每阶段代码+文案即时落地）→ 统一 i18n 补丁（七语言 643 keys 校验一致）→ 依赖安装（授权清单内 3 包，--legacy-peer-deps 绕过 npm arborist bug）→ 新增 4 个测试文件 → Vitest 112/112 → 验收 A（tsc ✅）→ B（ESLint 修复 1 error/13 warnings 后 0/0 ✅）→ C（Vitest ✅）→ D（build exit 0 ✅）→ E（路由/SEO：测试断言 + 浏览器 canonical/hreflang/noindex/sitemap ✅）→ F（apps/api 100+1 ✅）→ G（浏览器 6 批 ✅，结束后停止自启进程）→ H（每问题 1 轮修复即通过）→ 本报告。

**本轮到此停止。** 未执行任何 Git 写操作、后端改动、支付/认证/存储接入或部署；等待审核后决定 Git 基线固化与后端研发排期。
