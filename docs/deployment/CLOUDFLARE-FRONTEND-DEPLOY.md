# Cloudflare 前端部署手册（wallhaze.com — vinext on Workers）

> **最终架构**：前端 `wallhaze.com` 运行在 **Cloudflare Workers（vinext）**；
> API `api.wallhaze.com` 运行在 Contabo VPS（Nginx → Fastify）。
> VPS 上**不部署任何 Next.js/Web 容器**。

## 1. 选型结论：vinext（本地已验证）

| 维度 | vinext 1.3.0（选定） | OpenNext (@opennextjs/cloudflare 1.20) |
|---|---|---|
| 支持程度 | 官方推荐路径；本项目 `npx vinext check` **91% 兼容**（9 支持 / 2 部分 / 0 阻断） | 成熟适配器；peer 要求 next `>=16.4.1`（本项目 16.4.0 需升级） |
| 构建方式 | Vite 插件（`vite build`），保留 app/ 目录与 next.config | `opennextjs-cloudflare build`，复刻 Next 构建 |
| SSR | ✅ 本地 workerd 预览全路由 SSR 200（见 §4 验证） | ✅ |
| 登录状态 | 无冲突：本项目 SSR 页面不读 cookie，认证全部在客户端 fetch（见 AUTH 手册） | 同 |
| 缓存 | ISR=SWR 模型；本项目静态预渲染页正常 | Cache API + KV/R2 可选 |
| API 调用 | 构建期内联 `NEXT_PUBLIC_API_BASE_URL`（已实测 client chunk 内联 `https://api.wallhaze.com`） | 同 |
| 图片优化 | 本项目不用 next/image 优化器（自定义 `<img>` 包装），无此限制 | 部分支持 |
| Workers 限制 | `cacheComponents` 为实验支持（本项目页面均静态预渲染，未依赖 PPR 动态洞）；turbopack rules 不生效（Tailwind 改走 PostCSS，init 已生成 postcss.config.mjs） | nodejs_compat 同样需要 |
| 生产可靠性 | Beta（官方明确）；本地 workerd 验证通过 + 灰度期可随时回退 Node 部署 | 更久经生产 |
| 迁移工作量 | **已完成**：init 自动改造 + `output:"standalone"` 改为 `DEPLOY_TARGET=node` 门控（Node 容器路径保留，可作回退） | 需升级 next 至 16.4.1+ 并重测 244 个测试 |

**决策**：vinext 已通过本地 workerd 运行时验证（非仅 `next build`），且保留
Node 容器部署作为回退路径。若生产灰度出现 vinext 特有问题，切回
`DEPLOY_TARGET=node` 镜像部署（或评估 OpenNext + next 16.4.1 升级）。

## 2. 已准备的文件（D 完成）

| 文件 | 作用 |
|---|---|
| `apps/web/vite.config.ts` | vinext + cloudflare 插件（init 生成） |
| `apps/web/cloudflare.config.ts` | Worker 定义（name `wallhaze-web`、nodejs_compat、assets 策略） |
| `apps/web/wrangler.toml` | 生产路由 `wallhaze.com`（custom_domain）+ vars + observability |
| `apps/web/.env.cloudflare.example` | 边缘环境模板（仅 `NEXT_PUBLIC_API_BASE_URL`，明令禁止任何服务端密钥） |
| `apps/web/postcss.config.mjs` | Tailwind 经 PostCSS（vinext 不跑 turbopack.rules） |
| package.json scripts | `dev:vinext` / `build:vinext` / `start:vinext`（本地 workerd 预览）/ `deploy:vinext` |
| `apps/web/next.config.ts` | `output:"standalone"` 改为仅 `DEPLOY_TARGET=node` 时启用——Cloudflare 构建不再产出 standalone（修复了 vinext 构建失败） |
| eslint/tsconfig | 忽略 `.cloudflare/`、`dist/`、`vendor/` 构建产物 |

### 密钥红线（已复核）

- 前端 bundle 只含 `NEXT_PUBLIC_API_BASE_URL`。
- **FAL_KEY / DATABASE_URL / GOOGLE_CLIENT_SECRET / WAFFO_* / POSTGRES_PASSWORD 从不出现在 web 仓库**（.dockerignore、.gitignore、模板注释三重声明）。

## 3. 构建与部署（站长，需单独授权才执行生产部署）

```bash
cd apps/web
# 1) 构建（本地/CI；不要在 VPS 上构建）
NEXT_PUBLIC_API_BASE_URL=https://api.wallhaze.com npm run build:vinext
#    产物：.cloudflare/output/v0（约 40MB bundle + assets）

# 2) 本地 workerd 运行时验收（必须做，不只是 next build）
npm run start:vinext   # vite preview → http://localhost:3000 逐路由验证

# 3) 部署（授权后）
npx wrangler login     # 一次性
npm run deploy:vinext  # 或 npx @vinext/cloudflare deploy
# 首次部署后：Workers & Pages → wallhaze-web → Domains & Routes → Add → wallhaze.com
```

### www 重定向

wrangler.toml 只绑定 apex。`www.wallhaze.com` → `wallhaze.com`：
Cloudflare Dashboard → Rules → Redirect Rules（或 Bulk Redirects）：
`www.wallhaze.com/*` → `https://wallhaze.com/$1`，301，保留查询串。

### 预览环境（staging）

Workers & Pages → wallhaze-web → Settings → Domains & Routes 增加
`staging.wallhaze.com`（或用 workers.dev 子域）；构建时用
`NEXT_PUBLIC_API_BASE_URL=https://api-staging...`（如后续建 staging API）。

## 4. 本地验证记录（D，2026-10-24）

`vite preview`（workerd 运行时）实测：

- 路由全 200：`/`、`/zh`、`/wallpapers`、`/zh/wallpapers`、
  `/zh/wallpapers/sakura-nights`（详情 SSR：夜樱/审核中状态渲染正确）、
  `/zh/community`（真实空态 + 本月主题"梦幻夜色"）、`/zh/studio`、
  `/zh/login`、`/zh/my-creations`、`/sitemap.xml`（162 URL）、`/robots.txt`
- 七语言 200（en 走无前缀，`/en/*` 307 → 无前缀，符合 localePrefix:"as-needed"）
- 隔离保持：`/images/styles/abstract.jpg`（pending）→ **404**；
  `/community-demo/...` → **404**
- 双构建：`build:vinext` ✅ 与 `next build`（回退路径）✅ 均通过
- Web 244 测试 / typecheck / lint 全通过（已忽略构建产物目录）

## 5. 已知限制与回退

- vinext 为 Beta；`cacheComponents` 实验支持（本项目未依赖其动态特性）。
- vinext 构建会内联**构建时**的 `NEXT_PUBLIC_API_BASE_URL`——改 API 域名需重新构建。
- 回退路径 A：`DEPLOY_TARGET=node npm run build` → Node standalone 镜像（已验证）。
- 回退路径 B（更大改动）：升级 next ≥16.4.1 后改用 OpenNext。
