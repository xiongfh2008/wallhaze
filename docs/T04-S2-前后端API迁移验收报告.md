# WallHaze T04-S2 前后端 API 迁移验收报告

- 日期：2026-10-20
- 范围：第一批业务 API 迁移（图片生成、图片代理、请求安全校验、限流、错误响应、网络隔离）+ 前端统一 API Client
- 前置：T04-S1 已完成并经审核
- 结论：**通过（附 1 项默认跳过与若干待授权事项，见第六、七节）**

---

## 一、实际迁移接口

| 新接口（apps/api，Fastify v5） | 方法 | 状态 |
| --- | --- | --- |
| `/v1/generations` | POST | 已迁移，行为对齐旧版 |
| `/v1/images/proxy` | GET | 已迁移，行为对齐旧版 |
| `/health` | GET | T04-S1 已有，本轮保留 |

未迁移（按任务要求本轮不做）：用户、数据库、积分、支付、异步任务。

## 二、原接口与新接口映射

| 旧版（Next.js 同源 route） | 新版（apps/api） | 说明 |
| --- | --- | --- |
| `app/api/generate/route.ts`（POST） | `apps/api/src/modules/generation/generation.routes.ts` + `generation.service.ts` + `generation.validators.ts` + `fal.provider.ts` | 守卫顺序、参数校验、限流、预算、并发槽、超时中止逐项保留 |
| `app/api/image/route.ts`（GET） | `apps/api/src/modules/images/images.routes.ts` | 白名单、redirect 检查、MIME 嗅探、流式大小上限逐项保留 |
| `lib/server/request-guard.ts` | `apps/api/src/security/request-guard.ts` | 白名单改为启动时注入（CORS_ALLOWED_ORIGINS + SITE_URL），语义不变 |
| `lib/server/rate-limit.ts` | `apps/api/src/security/rate-limit.ts` | 逐字移植 |
| 旧版扁平 `{ error: string }` 响应 | 统一 `ApiErrorEnvelope`（`{ error: { code, message } }`，packages/contracts） | 文案逐字保留，结构升级；前端在 `lib/api/errors.ts` 统一解析 |

契约：`packages/contracts/openapi.yaml` 0.2.0 与实现一致（guard 顺序、错误码、Schema）。

## 三、安全逻辑核对结果

逐项核对 Next.js Request/Response 与 Fastify Request/Reply 差异后迁移，非简单复制：

| 安全约束 | 核对结果 |
| --- | --- |
| Origin 校验 | 保留：`Sec-Fetch-Site: cross-site` 拒绝 → Origin 白名单精确匹配（`new URL` 规范化，免疫大小写/默认端口/编码花样）→ 无 Origin 放行（仍受限流约束）。fail-closed，无硬编码 localhost |
| 请求类型/大小限制 | 保留：非 `application/json` → 415；严格 JSON parser + 10 MiB 上限 → 413；谎报 Content-Length 亦被拦截（实测 413） |
| UTF-8 严格校验 | 保留：strict parser 对字节级 UTF-8 解码失败 → 400（与旧版文案一致） |
| Prompt/尺寸参数校验 | 保留：prompt 800 字符上限（style 模板追加前）、device 必填、size preset 服务端重解析为官方 `{width,height}`、参考图 data URI 校验 |
| 生成超时与请求中止 | 保留并修正：120s 上游超时与客户端断连信号合并；**框架差异修正**——Node v22 下 `IncomingMessage 'close'` 在 body 被消费时即触发（早于响应），不可作为断连信号；改用 `reply.raw 'close'` + `writableEnded === false` 判定真实断连 |
| 上游异常处理 | 保留：500/429/非 JSON/空图/网络错误/abort 分别映射，`detail` 不出 nervena 到响应体 |
| 结构化日志 | 保留：`event: "generate"`、`outcome`（rejected:* / upstream:* / ok）、`status`、`durationMs`、reqId |
| 并发限制 | 保留：3 个并发槽，断连后 finally 释放（实测释放） |
| 单用户/来源限制 | 保留：诚实降级为全局单桶（无可信代理身份），注释明示 |
| 全局生成预算 | 保留：日配额 + 全局预算，429 + Retry-After |
| 图片代理白名单 | 保留：HTTPS 精确 host（无子域/端口/凭据），客户端白名单仅为 courtesy，服务端为准 |
| Redirect 检查 | 保留：手动跟随且每个跳转目标重新过白名单；跨域跳转 → 502 且不请求目标 |
| 图片 MIME/实际类型验证 | 保留：Content-Type + magic-byte 嗅探双验证 → 415；诚实 Content-Length 与流式累计双路径 → 413 |
| 秘密不泄漏 | 实测（ISO-1/ISO-4）：成功/422/502 路径的响应体与日志均无 DUMMY_KEY、prompt marker、上游 data URI、上游错误细节、fal.run 域名 |
| 真实请求只在后端 | 实测（ISO-2）：FAL_MOCK=1 全流程零出网；deny-all `globalThis.fetch` guard 拦截并记录一切未注册出网（ISO-3/IMG-14） |

本轮修复的真实缺陷（均为迁移过程中暴露，非旧版缺陷）：

1. Fastify 插件封装作用域导致 setErrorHandler 不覆盖同级路由 → 改为根实例直接应用；
2. 同因导致 CORS 头不生效 → 同上修复；
3. `GenerationOutcomeError` 误用 `import type` 导致运行时 `instanceof` 失败（500）→ 改值导入；
4. 客户端断连检测用错信号源（`request.raw 'close'`）→ 改 `reply.raw 'close'`；
5. Mock provider 的 timeout 用例误抛裸 AbortError（被 service 映射成 upstream:failed）→ 改抛 `UpstreamError("timeout")`；
6. strict parser 对非法 body 未写 `outcome` 日志 → 补齐，与旧版日志词汇一致。

另按 NodeNext ESM 规范为全部相对导入补 `.js` 扩展名（多段点号文件名如 `fal.provider` 在 NodeNext 下会被误当扩展名剥离，属存量隐患，本轮随构建修复暴露并解决）。

## 四、前端 API Client（apps/web/lib/api/）

| 文件 | 职责 |
| --- | --- |
| `client.ts` | 唯一把路径变成 fetch 的地方：Base URL 来自 `NEXT_PUBLIC_API_BASE_URL`（未配置 → 明确 "unavailable"，不发请求）；默认 20s 超时与调用方 AbortSignal 合并（`AbortSignal.any`）；区分 canceled/timeout/network 三种失败；HTTP 错误解析为 typed `ApiFailure`（稳定错误码 + Retry-After），永不 throw；`fetchImpl` 为 Mock Adapter 注入点 |
| `errors.ts` | 统一错误模型：`unavailable/network/timeout/canceled/http/invalid`，http 携带 `ApiErrorCode` + `message` + `retryAfterSeconds`，按 code 分支、不依赖文案 |
| `generation.ts` | `generateWallpaper()`：POST `/v1/generations`，150s 客户端预算（高于后端 120s 硬超时），返回 `GenerateOutcome`（永不 reject），响应按契约守卫 |
| `images.ts` | `toProxiedImageUrl()`：白名单 host 重写为 `{API_BASE}/v1/images/proxy?src=...`，防双重包裹，仅 https + 精确 host + 无端口/凭据 |

核对结果：

1. UI 组件无散落 fetch URL：唯一调用点 `components/GeneratorSection.tsx` 走 `generateWallpaper`；`lib/download.ts` 的二进制下载 fetch 复用 `toProxiedImageUrl`（URL 构造仍在 lib/api 层）；
2. 无业务密钥：apps/web 仅引用 `NEXT_PUBLIC_API_BASE_URL`（公开配置）；`FAL_KEY` 不存在于任何前端代码、env 示例与构建产物；
3. 不直接调用 fal.ai，不重复实现后端业务规则（校验上限只在后端与 contracts）；
4. 支持取消（`options.signal`）与 Mock Adapter（`fetchImpl` 注入，Studio/测试可替换进程内 fetch）；
5. Cookie 鉴权/CSRF：本阶段无用户系统，未开放任意 CORS Origin（严格白名单）；凭据方案留待用户/鉴权阶段设计；
6. 本轮修复两处构建错误：`styleId: StyleId | null` 与契约 `string | undefined` 不符（null → undefined，后端降级为"无风格"语义一致）；`lib/download.ts` re-export 未引入本模块作用域。

## 五、新增测试结果

apps/api 共 9 个测试文件、**101 项：100 通过 + 1 默认跳过（GEN-27）**，全部进程内完成（`app.inject()`；唯一例外 GEN-10/11 用临时随机端口复现真实 RST 断连，从不触碰 3000）。测试环境：Dummy Key + 进程内 Mock Provider + 注入式 fetchImpl；`globalThis.fetch` 被替换为"拒绝并记录"守卫，任何逃逸注入边界的出网都会使用例失败。

### 旧 → 新测试映射表

**① 直接复用（逐字移植，12 项）**
- RL-01 ~ RL-12（限流 12 项）：迁移至 `tests/rate-limit.test.ts`，仅改导入路径。

**② 迁移（断言逐字保留、驱动方式改为 inject / Mock Provider，约 60 项）**
- RG-01~08、RG-10~12（守卫单元测试）→ `tests/request-guard.test.ts`；RG-15 经重验修正一个假设（零长度 body 走 strict parser → 400，与旧版一致）；
- RG-09、RG-13~18（守卫行为测试）→ inject 行为验证；
- GEN-01~01b、02~09（成功路径与上游错误映射）、GEN-12~18b（守卫集成）、GEN-19~19e（参考图）、GEN-20/21（暂停/未配置）、GEN-22~25（限流集成，含 Retry-After 精确值）、GEN-26（日志卫生）、GEN-28（守卫自验证）→ `tests/generation-api.test.ts`。

**③ 框架差异重验（3 组）**
- **GEN-10 + GEN-11（合并为一项）**：真实客户端断连。Next.js 依赖 `request.signal`；Fastify 下经验证必须用 `reply.raw 'close'` + `writableEnded === false`，且测试端 `http.request.destroy()` 完整请求后走优雅半关闭不可靠，改用 `net.Socket.resetAndDestroy()` 发真实 RST。断言：`upstream:client-aborted` 日志（status 502）、合并信号 aborted、3 个并发槽全部释放；
- **GEN-09b（改写为真实 Provider 单元）**：裸 fetch AbortError → timeout / client-aborted、generic → failed、503 → status、Authorization 头仅发上游、no-image 映射；
- **RG-08b（增强）**：canonicalOrigin 大小写/默认端口规范化语义（boot 时白名单组合）。

**④ 新后端额外新增（约 45 项）**
- IMG-01 ~ IMG-14（图片代理，旧版无独立测试套件）：非法 src 7 变体、白名单恰一次上游调用、MIME 嗅探 + nosniff + 缓存头、redirect 跟随/拒绝、http 降级拒绝、无 Location、诚实与流式两条 21MiB→413 路径、HTML 谎报 image/png→415、fetch 抛错→502 不泄漏 ECONNREFUSED、404→502、空 body→502、无注入 fetch 被 guard 拦截；
- ISO-1 ~ ISO-6（网络隔离）：秘密不泄漏（响应+日志）、FAL_MOCK 全流程零出网、proxy 默认 fetch 被拦截、502 不含 fal.run、恶意 origin 403 + 拒绝日志、base 白名单语义；
- S1 遗留保留：cors 6、errors 3、env 6、health 2。

### 必验场景覆盖

| 要求场景 | 对应用例 | 结果 |
| --- | --- | --- |
| 请求参数非法 | GEN-12~18b、RG 组 | 通过 |
| Prompt 超长 | GEN 组（validators 400 分支） | 通过 |
| 请求体超限 | errors 413、RG-18、IMG-08/09 | 通过 |
| 未授权来源 | GEN-12/13、ISO-5、cors 套件 | 通过 |
| 限流触发 | GEN-22/23（Retry-After=50217）、RL 全套 | 通过 |
| 同时请求过多 | GEN-24/25（429 并发文案 + Retry-After） | 通过 |
| 客户端取消 | GEN-10+11（真实 RST）、GEN-09b、client canceled | 通过 |
| 上游错误 | GEN-05/07/08 | 通过 |
| 上游超时 Mock | GEN-09、GEN-09b | 通过 |
| 上游成功 Mock | GEN-01/01b/02 | 通过 |
| 图片来源域名非法 | IMG-01、IMG-05、IMG-06 | 通过 |
| 图片响应内容非法 | IMG-10/13、IMG-04（跨域 redirect） | 通过 |
| 秘密不泄漏 | ISO-1/ISO-4、GEN-05 | 通过 |
| 未注册网络出口被阻断 | ISO-2/ISO-3、IMG-14、deny-all guard | 通过 |

**GEN-27（120s 真实计时）默认跳过**，由 `RUN_S2_REAL_120S=1` 环境变量门控，等待单独授权，未自动执行。

构建与类型检查：`npm run build`、`npm run typecheck` 均通过（tsc NodeNext ESM，全部相对导入带 `.js` 扩展名，dist 产物 import 路径合法）。

## 六、未通过项

- 无失败用例（101 项：100 通过 + 1 跳过）。
- GEN-27 未执行（按规则默认跳过，需授权后单独运行）。

## 七、未完成的正式切换事项

1. **未做正式流量切换**：未删改旧版 API 与测试、未切换正式域名、未部署、未 push；
2. Cookie 鉴权与 CSRF 凭据方案：待用户/鉴权阶段设计后实施；
3. 用户 / 数据库 / 积分 / 支付 / 异步任务 API：不在本阶段范围；
4. 部署形态：`apps/api` 生产入口为 `npm start`（`node --import tsx src/server.ts`）；仓库根目录未启用 npm workspaces（根 package.json 不在本次允许修改范围），`@wallhaze/contracts` 以源码形态被 TS paths / vitest alias 解析，故未采用 `node dist/` 直跑——如后续切换正式部署，建议引入 workspaces 或将 contracts 构建为可发布的 dist 包；
5. `NEXT_PUBLIC_API_BASE_URL` 未在任何环境配置中预设——新前端默认 "unavailable"（不发请求），切换需显式配置。

## 八、原项目保护情况

| 要求 | 结果 |
| --- | --- |
| 不访问 `D:\Project\wallhaze\wallhaze\` | 未读取、未修改（`git status` 中该目录仍为未跟踪，与基线一致） |
| localhost:3000 不受影响 | 全程未启停、未请求；所有测试进程内完成 |
| 不修改原项目根目录业务源文件 | `git status`：已跟踪文件零修改，仅新增未跟踪的 `apps/`、`packages/`、`docs/` |
| 不读取 .env.local | 未读取 |
| 不使用真实 FAL_KEY / 不调用真实 fal.ai / 支付 / 数据库 | 全部满足（Dummy Key + 进程内 Mock + deny-all 网络守卫） |
| 不删除原项目测试或旧 API | 未触碰 |
| 不执行 Git Commit/Push | 未执行：HEAD 仍为基线 `b0f6dcf`，工作区无新提交 |
| 不修改 Next.js cacheComponents:true | 未修改（构建输出确认 Cache Components enabled） |
| 修改范围仅 apps/、packages/ 本次迁移相关 | 满足（docs/ 下为本报告） |

## 九、前后端独立运行结论

| 验收项 | 结果 |
| --- | --- |
| 1. apps/web 只依赖 API Client | 通过（UI 组件零散 fetch 为零；URL 构造集中在 lib/api） |
| 2. apps/web 不含业务密钥 | 通过 |
| 3. apps/api 独立构建 | 通过（build + typecheck + 101 项测试全绿） |
| 4. apps/web 独立构建 | 通过（含 Studio 路由与 PPR 预渲染） |
| 5. API Contract 一致 | 通过（openapi.yaml 0.2.0 ↔ 路由实现 ↔ contracts 类型三方一致） |
| 6. Gallery 静态功能 | 通过（构建成功，页面静态预渲染；不依赖新 API） |
| 7. Studio 以 Mock 与 API 联调 | 通过（`generateWallpaper` 接受 `fetchImpl` 注入；未配置 Base URL 时显式 "unavailable"，不发真实请求） |
| 8. 后端错误前端正确显示 | 通过（`ApiErrorEnvelope` → `ApiFailure` → GeneratorSection 分支渲染；unknown route/限流/校验错误均按 code 呈现） |
| 9. 原有 Next.js 服务未受影响 | 通过 |
| 10. 原项目已提交基线不变 | 通过（`b0f6dcf`，工作区零修改已跟踪文件） |

**结论：达到前后端独立运行要求。** 本轮到此停止，正式切换（域名/部署/旧 API 下线/Push）等待单独授权。
