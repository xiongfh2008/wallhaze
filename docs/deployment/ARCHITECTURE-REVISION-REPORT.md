# 最终部署架构修正报告（Cloudflare 前端 + Contabo 后端）

- 日期：2026-10-24
- 决策：前端 `wallhaze.com` 迁至 **Cloudflare Workers（vinext）**；Contabo VPS
  只运行后端 `wallhaze-app`（api/worker/postgres/jobs）；`api.wallhaze.com`
  经宿主已有 Nginx 反代；**不安装 Caddy**、**不部署 web 容器**、不触碰
  tarot / vidsavey / 现有 wallhaze(Redis) 项目。

## 1. 最终部署架构

```
浏览器
 ├─ https://wallhaze.com ──────────── Cloudflare Workers（vinext, wallhaze-web）
 │                                     www→apex 由 Redirect Rule 处理
 └─ https://api.wallhaze.com ── CF CDN（Proxied, Full strict）
                                  └─ VPS 94.72.126.85 宿主 Nginx（80/443 已占用，复用）
                                      └─ 127.0.0.1:4000 → wallhaze-app compose:
                                          api（loopback 发布）
                                          worker（无端口，内部网络）
                                          postgres 17（无端口，volume）
                                          jobs（备份 cron，内部网络）
外部：R2（媒体/备份，adapter 待实现）· fal.ai（默认关闭）· Google OAuth
```

## 2. Cloudflare Workers 适配结论（代码审计）

| 审计项 | 结果 |
|---|---|
| Next.js 版本 | 16.4.0 / React 19 / App Router |
| Server Components | ✅ 页面均为 RSC + 静态预渲染；**无 `cookies()/headers()` 调用** |
| Route Handlers | **无**（web 不拥有业务 API） |
| Middleware | Next 16 `proxy.ts`（next-intl）→ vinext 官方支持 ✅ |
| 登录状态 | 全部在客户端组件 fetch（`credentials:"include"`）；SSR 无会话读取 → 无跨子域 cookie 问题 |
| 图片优化 | 不用 next/image 优化器（自定义 `<img>`）→ 无 sharp/workerd 限制 |
| 构建 | vinext=Vite 插件，无 sharp/webpack 依赖；**cacheComponents 仅实验支持**（本项目未依赖动态 PPR 洞） |
| `npx vinext check` | **91% 兼容**（9 支持 / 2 部分：turbopack rules→PostCSS 已由 init 处理、cacheComponents 实验 / 0 阻断） |

## 3. vinext / OpenNext 选型依据

选 **vinext**（本地已实际验证）；OpenNext 为备选：

- OpenNext 当前 peer 要求 next `>=16.4.1`（本项目 16.4.0 不在范围），采用需先升级 Next 并全量回归 244 测试。
- vinext 是 Cloudflare 官方推荐路径；`vinext init` 非破坏性（`next dev/build` 仍可用——已验证双构建）。
- vinext 为 **Beta** —— 缓解：(a) 本地 workerd 运行时全路由验证通过（见 §4）；
  (b) 保留 `DEPLOY_TARGET=node` 的 standalone 镜像构建作为即时回退路径（已验证）。

## 4. 本地验证结果（D，Cloudflare Runtime 实测而非仅 next build）

`vite preview`（workerd）：

- 路由 200：`/`、`/zh`、`/wallpapers`、`/zh/wallpapers`、
  `/zh/wallpapers/sakura-nights`（详情 SSR 正确）、`/zh/community`
  （空态+月主题）、`/zh/studio`、`/zh/login`、`/zh/my-creations`、
  sitemap（162 URL）、robots
- 七语言 200；en 无前缀 307 行为正确
- 隔离保持：pending 图 404、demo 媒体 404
- `NEXT_PUBLIC_API_BASE_URL=https://api.wallhaze.com` 已实测**内联进 client chunk**
- 双构建（vinext + next）✅；Web 244 测试 / typecheck / lint ✅（已忽略构建产物）

## 5. VPS 后端（wallhaze-app）本地验收

- compose 项目名固定 `wallhaze-app`（volume/network 均带 `wallhaze_app_` 前缀，
  与现有 `wallhaze`(Redis) 项目零冲突）。
- **端口审计**：api 仅 `127.0.0.1:4000`（供宿主 Nginx）；worker/jobs 无端口；
  postgres 仅 expose——**无任何公网映射**（Docker 发布端口绕过 UFW 的风险从根上消除）。
- 迁移 v1–v6 ✅；六服务 healthcheck ✅（本地已跑通）；备份 pg_dump **17.11 匹配**
  （修复了 alpine v16 符号链接问题：`--force-overwrite` 安装 + 重指
  /usr/bin/pg_dump → 实测备份含 **19 个 CREATE TABLE**）；幂等唯一约束在库 ✅。
- 内存预算（7.8GiB 实机）：postgres 1.5G/api 768M/worker 1G/jobs 128M 上限，
  稳态 ≈1–1.5G —— 与 tarot/vidsavey/redis 共存余量充足（实测约 7.1GiB 可用）。

## 6. Nginx 新站点（模板：`apps/api/nginx/api.wallhaze.com.conf`）

- 独立 server block：`listen 80/443 ssl http2; server_name api.wallhaze.com;`
- 反代 `127.0.0.1:4000`；`proxy_buffering off`（视频流）、25m 上传、300s 超时、
  X-Real-IP/X-Forwarded-* 透传；HSTS/nosniff/DENY 头。
- 证书：Cloudflare Origin CA（Full strict 兼容）或 certbot；占位路径已标注。
- 文件头写明：**备份先行**（`cp -a sites-available`）、`nginx -t` 强制、
  回滚=删除 enabled 软链；**不含**对 arcunara/vidsavey/default 的任何引用。

## 7. 生产环境变量（已更新 `.env.production.example`）

关键拆分域值：`SITE_URL=https://wallhaze.com`、
`CORS_ALLOWED_ORIGINS=https://wallhaze.com`、
`API_PUBLIC_URL=https://api.wallhaze.com`、
`GOOGLE_OAUTH_REDIRECT_URI=https://api.wallhaze.com/v1/auth/oauth/google/callback`
（代码核实的真实回调路径）、`TRUST_PROXY=1`（宿主 Nginx 后取真实 IP）。
前端侧 `.env.cloudflare.example` 仅一个变量，明令禁止任何服务端密钥。

## 8. 跨域认证与 OAuth（方案 A，代码核实）

详见 `CROSS-ORIGIN-AUTH.md`。要点：认证全在客户端 fetch；cookie 为
api.wallhaze.com host-only（HttpOnly/Secure/SameSite=Lax）；
wallhaze.com ↔ api.wallhaze.com 为**同站跨源**（同 registrable domain），
Lax cookie 会随请求发送（规范结论，上线浏览器复测项已列入验收 §9）；
CORS 精确白名单 + ACAC；OAuth 回调由 Fastify 在 API 域接收，returnTo 白名单
回跳前端。**未改任何认证/OAuth 代码。**

## 9. Redis 复用结论：**不依赖、不复用**

代码检索：任务队列为 PostgreSQL `FOR UPDATE SKIP LOCKED` + lease（无 Redis
客户端依赖；仅 rate-limit 注释建议未来共享存储）。现有 `wallhaze-redis`
属于其他项目——**不接入、不重建、不修改**。

## 10. Contabo 现有服务保护

- 独立 compose 项目名 + 独立 network/volume 前缀（`wallhaze_app_`）。
- 不安装 Caddy/第二 Nginx；新站点是独立文件，不 symlink 进 default。
- 端口避让：80/443(Nginx)、8100(tarot)、8000(vidsavey)、6379(redis)——
  compose 仅用 loopback 4000 + 内部 5432。
- 文档明确"不重启/不修改"既有容器；deploy.sh 危险命令自检保留。

## 11. 云端部署前阻塞问题

1. **R2 adapter 未实现**（唯一大缺口；LocalStorage 过渡，40G 软上限）。
2. vinext 为 Beta：需灰度期观察 + 保留 Node 回退（已备）。
3. 监控通知渠道未接（方案已给）。
4. 30 天清理保持 dry-run（staging 演练+批准后启用）。
5. 站长侧配置未做：DNS api 记录、Origin CA/证书、Google 回调 URI、
   Workers 自定义域 wallhaze.com、www 重定向规则。

## 12. DeepSeek 已完成（本轮增量）

- vinext 接入全套（init 产物 + 修复 standalone 冲突：`output` 改
  `DEPLOY_TARGET=node` 门控；eslint/tsconfig 排除构建产物；CRLF 修复）
- workerd 运行时全路由验证 + 隔离 404 复测 + 双构建回归
- `compose.production.yaml` 重写为后端专用 `wallhaze-app`（loopback api、
  内部 pg/worker/jobs、独立命名）；本地验收（迁移/备份 19 表/健康/端口审计）
- Nginx `api.wallhaze.com` 模板（含备份/回滚/nginx -t 步骤）
- `.env.production.example` / `.env.cloudflare.example` / `wrangler.toml`
- jobs 备份 pg17 修复（--force-overwrite + 符号链接重指，实测通过）
- 文档：新增 CLOUDFLARE-FRONTEND-DEPLOY.md、CROSS-ORIGIN-AUTH.md；
  6 份既有文档加"架构已修订"横幅并指向新手册

## 13. 站长必须完成（详见 USER-ACTION-CHECKLIST.md 更新版）

1. Cloudflare：Workers 自定义域 wallhaze.com；Redirect Rule www→apex；
   api A 记录 94.72.126.85（Proxied）；SSL Full(strict)；缓存规则
  （`/v1/*`、`/community-demo/*` Bypass）。
2. VPS（授权后）：装 wallhaze-app（secrets + `docker load` + deploy.sh）；
   Nginx 站点（备份→cp→ln→nginx -t→reload）；Origin CA 证书。
3. Google Cloud：回调 `https://api.wallhaze.com/v1/auth/oauth/google/callback`，
   origin `https://wallhaze.com`。
4. R2：两桶 + token（媒体桶等 adapter；备份桶即刻可用）。
5. 前端部署授权后：`build:vinext` + 本地 preview 验收 + `deploy:vinext`。

## 14. 最终上线步骤（摘要）

① DNS/证书/Nginx 就绪 → ② wallhaze-app deploy.sh deploy（migrate+healthy）→
③ api.wallhaze.com 冒烟（/health、pricing、CORS 预检）→ ④ 前端
`build:vinext` + preview 复验 → ⑤ `deploy:vinext` + 绑定 wallhaze.com →
⑥ 跨域认证浏览器验收（CROSS-ORIGIN-AUTH §9）→ ⑦ 缓存规则与 Purge →
⑧ 观察 48h（灰度）→ ⑨ 单独授权开启真实 AI / 清理。

## 15. 回滚步骤（摘要）

- 前端：Cloudflare 上一版本 Worker 一键回滚；或切 `DEPLOY_TARGET=node`
  镜像部署（构建已验证）。
- 后端：`deploy.sh rollback <tag>`（ROLLBACK-RUNBOOK，volume 永不触碰）。
- Nginx：删 enabled 软链 + `nginx -t` + reload（模板头部内置步骤）。

## 安全边界执行声明

未 SSH 登录 VPS；未修改 Nginx/DNS/Cloudflare 资源；未触碰 tarot/vidsavey/
现有 redis 容器（仅本地文档与模板）；未调用付费 fal.ai；未 Git commit/push；
未访问受保护目录。
