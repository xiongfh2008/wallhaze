# WallHaze Google OAuth 真实联调与上线准备报告

- 日期：2026-10-23
- 范围：`apps/api`、`apps/web`、`docs/codex`（未部署、未提交 Git、未调用付费 AI、未执行真实支付）
- 本地服务：Web `http://localhost:3100`，API `http://localhost:4000`
- 回调：`http://localhost:4000/v1/auth/oauth/google/callback`
- 真实性声明：本报告不包含任何 Client Secret、OAuth Token、授权码或 Cookie 的值。真实 Google 授权必须由本人完成；截至本报告生成时，真实登录场景标记为“等待本人授权”。

## 结论摘要

| 项目 | 状态 |
|---|---|
| OAuth 代码审计（13 项） | 已完成 |
| 本轮代码修复 | 已完成（恢复不自动合并、独立 State 密钥、returnTo 回跳、错误场景测试） |
| Google Cloud 本地配置 | 已可用（Client ID/Secret 已存在，Google 接受该 Client） |
| OAuth 状态接口 | `{"google":true}` |
| 首次 Google 登录（场景 A） | 等待本人授权 |
| 再次登录（场景 B） | 等待本人授权 |
| 已有邮箱账户显式绑定（场景 C） | 代码/自动化已完成，真实操作等待本人 |
| Session/Cookie（场景 F） | 自动化已验证，真实浏览器复测等待本人 |
| 生产上线 | 未执行，等待生产 Client/域名/审批 |

## 1. 现有 OAuth 代码审计

### 1.1 审计结论

| # | 检查项 | 结论 | 证据 |
|---|---|---|---|
| 1 | Callback 路由与上轮报告一致 | 通过 | `apps/api/src/business/routes.ts:394` `GET /v1/auth/oauth/google/callback` |
| 2 | Client ID / Secret 只在后端 | 通过 | Secret 只出现在 `config/env.ts`、`app.ts`、`business/oauth.ts`；`apps/web` 无任何 Secret 引用 |
| 3 | 未通过 `NEXT_PUBLIC_*` 暴露 Secret | 通过 | Web 唯一公开变量是 `NEXT_PUBLIC_API_BASE_URL`（`apps/web/.env.local`），仅 API 地址 |
| 4 | State / PKCE / Nonce 实际参与验证 | 通过 | `start` 生成 state/verifier/nonce，签名写入 HttpOnly cookie；`callback` 校验 state、用 verifier 换码、用 nonce 校验 ID Token |
| 5 | ID Token 校验 issuer/audience/有效期/签名 | 通过 | `business/oauth.ts`：JWKS RS256 验签 + `iss`/`aud`/`exp`/`iat`/`nonce`/`email_verified` |
| 6 | Google `sub` 是绑定唯一标识 | 通过 | `auth_accounts.provider_account_id = identity.subject`，`UNIQUE(provider,provider_account_id)` |
| 7 | `email_verified` 符合业务要求 | 通过 | Provider 拒绝非 `true`；`assertOAuthIdentity` 再校验一次 |
| 8 | 回调后 URL 不泄漏 Token | 通过 | 仅设置 HttpOnly `wh_session` cookie 后 302 到站内 `returnTo`；无 id/access token 进入 URL |
| 9 | `returnTo` 只能回本站 | 通过 | API `safeReturnTo` 只接受相对路径或 allowlist origin，且存于签名 cookie；Web `safeNextPath` 同等限制 |
| 10 | 首次/重复登录不重复建用户/钱包 | 通过 | `auth_accounts` 唯一约束 + 同一事务创建 user/wallet/link；重复登录按 link 复用 |
| 11 | 不按相同邮箱自动合并已有密码账户 | 通过（本轮修复） | `signInWithOAuth` 对已存在邮箱抛 `email_exists`，不写入 link |
| 12 | Google 绑定只能由已认证账户发起 | 通过 | `start?mode=link` 要求有效会话；`callback` 再次校验 session.user.id 与 state 中 userId 一致 |
| 13 | Logout 后 Session 失效 | 通过 | `signOut` 删除 `auth_sessions` 行并清 cookie；新增 OAuth session 登出测试 |

### 1.2 审计发现并修复的问题

1. **自动合并违背本轮规范**：上一轮为通过真实登录测试临时启用了“已验证邮箱自动合并”。本轮按规范恢复为不自动合并，已有密码账户必须显式绑定。
2. **OAuth State 密钥复用了媒体签名密钥**：原 `OAUTH_STATE_SECRET ?? IMAGE_URL_SECRET ?? "dev-only-oauth-state"` 不符合独立密钥要求。已改为独立、必填、≥32 字符、且不得等于 `IMAGE_URL_SECRET`，缺失即启动失败。
3. **场景 E 缺失**：登录入口没有携带来源页，登录后总是去 `/account`。已实现 `?next=` 安全回跳（Header、Studio、Credits、Account、Orders），Google 回跳做本地化。
4. **绑定冲突错误不够具体**：区分“该账户已绑定另一个 Google”（`google_already_linked`）与“该 Google 已绑定另一个账户”（`google_identity_taken`），并补齐七语言文案。
5. **测试缺口**：补充登出失效、State 过期、Provider 故障、禁用账户、跨账户占用 Google 身份、State 密钥失败模式、登录回跳。

## 2. 本轮实际修复

- `apps/api/src/business/auth.ts`：`signInWithOAuth` 恢复“邮箱已存在 → `email_exists`”，不再自动建 link；`linkOAuthIdentity` 明确两种冲突原因。
- `apps/api/src/app.ts`：新增并导出 `resolveOAuthOptions`；Google 已配置时强制独立 `OAUTH_STATE_SECRET`，校验长度/独立性，不再回退 `IMAGE_URL_SECRET`。
- `apps/api/src/business/routes.ts`：回调映射新增 `google_identity_taken`；其余流程不变。
- `apps/web/lib/auth/return-to.ts`（新增）：`safeNextPath` / `loginHref` / `localizePath`。
- `apps/web/components/auth/AuthPanel.tsx`：`LoginPanel` 读取并校验 `?next=`；密码登录与 Google 登录都回跳该页；OAuth 错误提示保留。
- `apps/web/components/Header.tsx`、`Studio/CreditsNotice.tsx`、`credits/CreditsClient.tsx`、`auth/AccountPanel.tsx`、`auth/SettingsPanel.tsx`、`account/orders/page.tsx`：登录链接携带当前安全路径。
- 七语言新增 `google_identity_taken` 等错误文案。
- `.env`（未纳入 Git）：生成并写入 32 字节随机 `OAUTH_STATE_SECRET`；值未打印。
- 文档：`docs/codex/OPERATIONS.md`、`DECISIONS.md` 更新为“不自动合并 + 独立 State 密钥”。

## 3. Google Cloud 最终配置清单（逐项操作）

| 步骤 | 设置 | 本地值 / 说明 |
|---|---|---|
| 1 | Google Auth Platform → Branding | App name `WallHaze`；Support email 填你的邮箱；Logo 可选 |
| 2 | Audience | `External`；当前处于 Testing 时，把本人测试 Google 账号加入 **Test users** |
| 3 | Data Access | 仅 `openid`、`email`、`profile`；不申请敏感/受限范围 |
| 4 | Clients → Create client | 类型 **Web application** |
| 5 | Authorized redirect URIs | 精确添加 `http://localhost:4000/v1/auth/oauth/google/callback`（协议/端口/路径完全一致） |
| 6 | Authorized JavaScript origins | **本地不需要**。本项目使用后端重定向，不加载 Google JS SDK/GSI，不要求浏览器端 origin |
| 7 | 本地 Web / API | Web `http://localhost:3100`；API `http://localhost:4000` |
| 8 | 生产（未来） | 单独创建生产 OAuth Client；回调 `https://api.<domain>/v1/auth/oauth/google/callback`；HTTPS；配置 Authorized domains |
| 9 | 发布 | Testing → In production；`openid email profile` 为基础范围，通常无需敏感范围审核，但需品牌/隐私政策合规 |
| 10 | 安全 | Client Secret 只放 `apps/api/.env`；不入库、不进前端、不发聊天、不写日志 |

## 4. 本地实际配置

- Callback：`http://localhost:4000/v1/auth/oauth/google/callback`
- `GOOGLE_OAUTH_REDIRECT_URI` 与该地址一致。
- `API_PUBLIC_URL=http://localhost:4000`；`WEB_APP_URL=http://localhost:3100`。
- `CORS_ALLOWED_ORIGINS=http://localhost:3100`。
- OAuth State Cookie：HttpOnly、`SameSite=Lax`、`Path=/v1/auth/oauth`、10 分钟、生产 `Secure`。
- Session Cookie：HttpOnly、`SameSite=Lax`、`Path=/`、30 天、HTTPS 下 `Secure`。

## 5. 凭据状态（只报告是否存在，未读取/输出值）

| 变量 | 是否已配置 |
|---|---|
| `GOOGLE_CLIENT_ID` | 是 |
| `GOOGLE_CLIENT_SECRET` | 是 |
| `OAUTH_STATE_SECRET` | 是（本轮生成，独立随机，值未输出） |
| `GOOGLE_OAUTH_REDIRECT_URI` | 是 |
| `API_PUBLIC_URL` / `WEB_APP_URL` | 是 |

Google 已接受该 Client：`/start` 返回 302 到 `accounts.google.com` 的登录/同意页，`client_id`、`redirect_uri`、`scope`、S256、nonce 均正确。Secret 的有效性只有完成一次真实换码后才能最终确认。

## 6. OAuth 状态接口

```json
{"google":true}
```

前端按钮在运行时查询该接口；无需重新构建前端即可从禁用变为可用。本轮已实测按钮为可用状态。

## 7-11. 真实登录测试状态

| 场景 | 状态 | 说明 |
|---|---|---|
| A 首次 Google 登录（全新邮箱） | **等待本人授权** | 需要一个尚未注册到 WallHaze 的 Google 账号（并加入 Test users）。成功后应为 1 用户 / 1 钱包 / 初始 0 Credits |
| B 再次登录 | **等待本人授权** | 在 A 或 C 完成后退出，再用同一 Google 账号登录，应复用同一 user/wallet |
| C 已有邮箱密码账户 | 代码/自动化完成，**真实操作等待本人** | Google 邮箱与现有账户相同 → `email_exists`；用密码登录 → 设置页“绑定 Google” → 授权 → 之后 Google 登录原账户 |
| D 错误场景 | 自动化通过，取消授权真实待测 | State 过期/不匹配、Provider 故障、禁用账户、未配置均有测试；重复回调依赖 state cookie 清除 + Google code 单次使用 |
| E 登录后回跳 | 代码/自动化完成，真实待测 | 从 Studio/Credits/My Creations/Account 的登录入口携带 `?next=`，成功后回原页；外部 returnTo 被拒绝 |
| F Session/Cookie | 自动化通过，真实浏览器待测 | 刷新保持登录、退出后受保护 API 401、无 localStorage token |

## 12. Session / Cookie 验证

- Web 3100 与 API 4000 同为 `localhost`，Session cookie 主机级共享、不按端口隔离；页面与 API 均使用 `localhost`（不可混用 `127.0.0.1`）。
- CORS 精确允许 `http://localhost:3100` 且 `credentials: include`。
- 登录后刷新页面，Header 通过 `/v1/auth/session` 恢复状态。
- 退出删除服务端 session 行；新增测试验证旧 cookie 立即失效。
- Token 不在 localStorage；Web 端无 token 读取代码。

## 13. Credits 与业务关联

- OAuth 新用户在同一事务中创建 `credit_wallets`，余额 0，不赠送 Credits。
- 已有密码账户绑定 Google 后复用原 user/wallet（当前本地账户 200 Credits 不受影响）。
- 生成接口仍由后端执行钱包预占与校验；登录成功不等于可免费生成。
- OAuth 后 `/v1/credits/wallet`、`/v1/creations`、`/v1/auth/session` 均按同一 session 解析。

## 14. 用户间数据隔离

- 所有 creations 查询带 `WHERE user_id=$1`；私有图片需要 owner session 或短期签名。
- 自动化证据：`tests/routes-business.test.ts` “Another user can never see or fetch the first user's creation” —— 另一个用户列表为 0，私有图片 404，未认证 401。
- 真实双 Google 账户隔离测试等待场景 A/B 完成后执行。

## 15. 错误场景

| 场景 | 行为 | 状态 |
|---|---|---|
| 用户取消授权 | 回到登录页 `oauthError=denied`，显示“已取消 Google 登录” | 文案/路由已实现，真实点击待测 |
| State 失效/不匹配/过期 | `oauthError=state`，不建会话 | 自动化通过（含过期测试） |
| 重复回调 | state cookie 已清除 → `state`；真实 code 单次使用由 Google 拒绝 | 逻辑已覆盖，真实重复待测 |
| 无效授权码 | Provider 换码失败 → `oauthError=failed` | 自动化覆盖（Provider 故障） |
| Session 过期 | `/v1/auth/session` 返回 null，受保护接口 401 | 既有 session 测试覆盖 |
| 已禁用用户 | 关联用户 `status!=active` → `oauthError=suspended` | 自动化通过 |
| 数据库异常 | 路由捕获 → `oauthError=failed`，不泄漏堆栈 | 代码路径；未做破坏性测试 |
| Google 暂时不可用 | 同上 `failed`，通用文案 | 自动化通过（模拟 Provider 故障） |
| 未配置 Google | `status=false`，`start` 503，按钮禁用 | 自动化通过 |

## 16. 自动化测试

| 套件 | 结果 |
|---|---|
| API 全量 | 192 通过，1 跳过（27 个文件） |
| OAuth 专项 | 24 个测试：`oauth-routes` 12、`google-oauth` 7、`oauth-config` 5 |
| Web 全量 | 169 通过（21 个文件） |
| 新增覆盖 | 不自动合并、跨账户占用身份、登出失效、State 过期、Provider 故障、禁用账户、独立 State 密钥、登录回跳 |

## 17. TypeScript / Lint / Build

| 检查 | 结果 |
|---|---|
| `apps/api` `tsc --noEmit` | 通过 |
| `apps/api` `npm run build` | 通过 |
| `apps/api` Vitest | 通过 |
| `apps/web` `tsc --noEmit` | 通过 |
| `apps/web` ESLint | 通过 |
| `apps/web` Vitest | 通过 |
| `apps/web` `next build` | 通过（含静态预渲染 Suspense 处理） |

## 18. 正式域名上线所需配置

1. 生产 OAuth Client（独立于本地），回调 `https://api.<domain>/v1/auth/oauth/google/callback`。
2. `API_PUBLIC_URL`、`WEB_APP_URL`、`SITE_URL`、`GOOGLE_OAUTH_REDIRECT_URI` 使用 HTTPS 域名。
3. `OAUTH_STATE_SECRET` 独立随机（≥32 字符），与 `IMAGE_URL_SECRET` 不同；生产缺失即拒绝启动。
4. `CORS_ALLOWED_ORIGINS` 精确到生产 Web origin；Cookie `Secure` 自动开启。
5. API 与 Web 应处于同一可注册域（例如 `api.example.com` + `www.example.com`），否则 State cookie 的 `SameSite=Lax` 会阻止回调携带；若必须跨站，需要重新设计为 `SameSite=None; Secure` 或服务端 state 存储。
6. PostgreSQL（非 PGlite）+ 独立 worker；`EMBED_WORKER` 仅本地。
7. 品牌：Authorized domains、隐私政策、服务条款、支持邮箱；发布 Audience 到 In production。

## 19. Google 品牌与 OAuth 发布准备

- Branding：应用名 WallHaze、支持邮箱、Logo（可选）、隐私政策/条款 URL。
- Audience：External；Testing 阶段仅 Test users 可登录；正式开放需发布。
- Data Access：`openid email profile` 为基础身份范围，不申请 Drive/Gmail 等敏感范围。
- 发布前：移除测试用户依赖、确认回调域名 HTTPS、完成品牌校验（如 Google 要求）。
- Authorized JavaScript Origins：本流程不需要；不要为后端重定向额外引入 GSI。

## 20. 未完成与阻塞项

| 项目 | 状态 | 说明 |
|---|---|---|
| 真实 Google 授权（A/B/C） | 等待本人 | 必须由本人在 Google 页面完成；不得模拟 |
| 场景 A 需要第二个 Google 账号 | 等待本人 | 若只有一个 Google 账号且邮箱已注册，先执行 C |
| 真实取消授权（D） | 等待本人 | 点击 Google 页面返回/取消 |
| 真实浏览器 Cookie 刷新/登出（F） | 等待本人 | 自动化已覆盖服务端行为 |
| 生产 Client/域名/发布 | 等待生产环境 | 本轮不部署、不改 DNS、不迁移生产库 |
| 支付/真实 AI | 未执行 | 遵守项目安全约束 |

## 附：本人联调步骤（浏览器）

1. **场景 C（推荐先做）**：打开 `http://localhost:3100/zh/login` → 点“使用 Google 继续” → 选择 `你的现有账号邮箱` → 预期看到“该邮箱已有密码账户…”（`email_exists`）。用邮箱密码登录 → `/zh/account/settings` → “绑定 Google” → 授权 → 回到设置页显示“已绑定 Google”。
2. **场景 B**：设置页退出登录 → 登录页点 Google → 选择同一账号 → 应回到账户页，用户/钱包/200 Credits 不变。
3. **场景 A**（需第二个未注册的 Google 账号，且已加入 Test users）：退出 → Google 登录 → 应创建新用户、钱包 0 Credits。
4. **场景 D**：再点 Google，在 Google 页面点取消/返回 → 应回到登录页显示“已取消 Google 登录”。
5. **场景 E**：退出后从 `/zh/studio`、`/zh/credits`、`/zh/my-creations`、`/zh/account` 的“登录”入口进入，完成登录后应回到对应页面。
6. **场景 F**：登录后刷新页面仍在登录；退出后访问 `/zh/credits` 应要求登录；浏览器开发者工具 Application → Local Storage 中不应有 token。

完成后把结果（成功/报错页面文字）发我，我再核对数据库计数、绑定记录与最终报告状态。
