# 跨域认证与 Google OAuth 配置手册

> 架构：前端 `https://wallhaze.com`（Cloudflare Workers）↔ 后端
> `https://api.wallhaze.com`（Contabo VPS / Nginx / Fastify）。
> 结论先行：**采用方案 A（浏览器直连 API + CORS 凭证）**，无需 BFF，
> 无需改动任何认证代码。以下逐项是代码核实结果，不是假设。

## 1. 方案评估

### 方案 A（选定）：浏览器直连 api.wallhaze.com

- 所有 API 调用都发生在**客户端组件**（`lib/api/client.ts` 的
  `fetch(..., { credentials: "include" })`；Header/CloudCreations/Credits 等均
  `"use client"`）。**服务端组件不发起 API 调用、不读 cookie** —— 这消除了
  "Workers SSR 读不到 api 子域 cookie" 的整个问题类。
- Cookie 属于 `api.wallhaze.com`（API 自己 `Set-Cookie`，Path=/，无 Domain 属性
  ⇒ host-only cookie）。浏览器对 wallhaze.com 的跨域 fetch 在 CORS +
  `Access-Control-Allow-Credentials` + `SameSite=None`（见 §4）下会携带它。
- Fastify CORS 是**精确 origin 白名单**（`CORS_ALLOWED_ORIGINS`），加上
  `credentials: true`——正是跨域凭证的标准形态。

### 方案 B（否决）：Workers BFF 同源转发

- 需要把 `/v1/*` 经 wallhaze.com Worker 转发到 VPS，并处理 cookie 域改写、
  OAuth 重定向改写、流式响应转发——改动大、引入新故障面，且现有代码
  **没有**任何 SSR 侧会话读取需求。不采用；将来若需要 SSR 个性化再评估。

## 2. 浏览器 Fetch credentials（代码事实）

- `apps/web/lib/api/client.ts:92`：`credentials: "include"` — 每个请求带 cookie。
- 无 `mode:"no-cors"`、无第三方屏蔽；Workers 前端只是静态宿主，不影响 fetch。

## 3. CORS 允许来源 / ACAC

- API 侧：`CORS_ALLOWED_ORIGINS=https://wallhaze.com`（精确匹配；开发机另加
  `http://localhost:3100` 等）。
- cors 中间件对白名单 origin 返回 `Access-Control-Allow-Origin: <精确 origin>`
  + `Access-Control-Allow-Credentials: true`（不允许 `*`）。
- 预检（OPTIONS）由同一中间件处理；Nginx/Cloudflare 不得剥离这些头
  （Cloudflare 默认不剥；Nginx 模板未加 `proxy_hide_header`）。

## 4. Session Cookie 属性（关键差异）

代码现状（`apps/api/src/middleware/auth.ts`）：

```
wh_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=...; [Secure]
```

**跨站（wallhaze.com → api.wallhaze.com）请求中，`SameSite=Lax` 的 cookie 不会
随 cross-site fetch 发送**。`site` 判定：wallhaze.com 与 api.wallhaze.com 是
**same-site**（同一 registrable domain wallhaze.com 的子域）——Samesite=Lax 在
**同站跨源**（same-site cross-origin）下**会被发送**。

> 结论：`SameSite=Lax` 可用（站点同为 wallhaze.com 顶级域）。但注意两点：
> 1. `Lax` 只在顶层导航带 cookie 的规则适用于**跨站**；这里 fetch 是同站跨源，
>    Chrome/Safari/Firefox 均随请求发送。**已按规范确认，上线后必须用真实
>    浏览器复测一次**（验收清单 §9）。
> 2. 无 `Domain=` 属性 ⇒ host-only，只有 api.wallhaze.com 收得到 —— 正确的
>    最小化（前端 Worker 永远读不到它，符合 HttpOnly 边界）。
> 3. `Secure`：当 `SITE_URL`/任一 CORS origin 是 https 时自动加（代码逻辑），
>    生产恒为 https ⇒ 恒 Secure。

CSRF 说明：API 每个可变请求都校验 `Origin`（strict allowlist，request-guard），
配合 SameSite=Lax 与 JSON-only content-type 检查 —— 现有防线保持不变。

## 5. Google OAuth 全链路（代码核实）

代码路径（不变，仍是 Fastify 接收回调）：

1. 前端点"Google 登录" → 打开 `GET https://api.wallhaze.com/v1/auth/oauth/google/start?returnTo=...`
2. API 302 → Google，state 存 **API 域**签名 cookie（`OAUTH_STATE_SECRET` HMAC）
3. Google 回调 → **`https://api.wallhaze.com/v1/auth/oauth/google/callback`**
   （这是 Google Cloud 后台必须登记的精确 URI）
4. API 校验 state（读自己的 cookie——同域导航，无 SameSite 问题）、换 code、
   建/绑定用户、`Set-Cookie wh_session`（api.wallhaze.com）
5. 302 → `WEB_APP_URL + returnTo`（= `https://wallhaze.com/...`，returnTo 白名单
   仅允许同站路径，防开放重定向——代码已有）
6. 用户回到 wallhaze.com；此后所有 API fetch（跨源同站）自动带 session cookie

**需要站长做的**：Google Cloud Console → Credentials → OAuth Web client →
Authorized redirect URIs 添加 EXACTLY
`https://api.wallhaze.com/v1/auth/oauth/google/callback`；
Authorized JavaScript origins 添加 `https://wallhaze.com`。
`GOOGLE_CLIENT_ID/SECRET` 只写进 VPS 的 `secrets/api.env`。

## 6. 登录后的页面返回 / 登出

- `returnTo`：前端生成（`loginHref(pathname)`），API 白名单校验后原样回跳。
- 登出：客户端调 `POST /v1/auth/signout`（credentials:include）→ API 清
  session 行 + `Set-Cookie wh_session=; Max-Age=0` → 前端 `router.refresh()`。
  跨域清除同样依赖 §4 的 cookie 发送规则。

## 7. SSR 页面如何识别登录状态

**不需要**。所有账号 UI（Header 的余额/菜单、My Creations、Credits、Account）
都是客户端组件挂载后 `getSession()`。SSR HTML 恒为匿名视图 + 客户端水合后
更新——这与 Cloudflare Workers 边缘缓存完全兼容（HTML 无用户信息，见缓存规则）。

## 8. API 错误处理 / 私有作品 / Credits

- 统一 ApiErrorEnvelope；401 → 前端跳登录（带 returnTo）。
- 私有媒体：签名 URL（IMAGE_URL_SECRET HMAC，短时效）+ 30 天过期拒绝——
  URL 指向 api.wallhaze.com，鉴权在 API 完成，与前端域无关。
- Credits 钱包：requireUser 中间件（session cookie）——同 §4 机制。

## 9. 上线验收清单（浏览器实测，站长）

- [ ] wallhaze.com 打开 → 登录（邮箱+密码）→ Header 显示账户（跨域 cookie 生效）
- [ ] Google 登录全链路（start→Google→callback→回 wallhaze.com 已登录）
- [ ] 登录后 My Creations 出现云端作品；Credits 余额正确
- [ ] 登出 → Header 回匿名态；刷新仍是匿名
- [ ] DevTools：`wh_session` cookie 域=api.wallhaze.com、HttpOnly、Secure、
      SameSite=Lax；跨域 fetch 请求头包含 Cookie
- [ ] 生成一张图（mock 或批准后真实）→ 私有签名 URL 可加载、过期后 404
