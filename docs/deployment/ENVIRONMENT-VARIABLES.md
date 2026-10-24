# 生产环境变量说明（Contabo VPS）

> 变量名与 `apps/api/src/config/env.ts`（zod 校验，启动即失败）逐一核对。
> Web 侧只有一个构建期变量 `NEXT_PUBLIC_API_BASE_URL`（`apps/web/.env.example`）。
> 模板文件：`apps/api/.env.production.example`。
>
> 存放：`/opt/wallhaze/secrets/api.env`（chmod 600）与
> `/opt/wallhaze/secrets/compose.env`（compose 插值用：SITE_DOMAIN、POSTGRES_*）。
> 永不提交 Git；永不放进 `NEXT_PUBLIC_*`；永不打进镜像（.dockerignore 已排除 `**/.env*`）。

## compose.env（compose 插值，非容器运行时）

| 变量 | 必填 | 敏感 | 作用 | 验证 |
|---|---|---|---|---|
| `SITE_DOMAIN` | ✅ | 否 | Caddy 签证书的域名（如 `wallhaze.example.com`） | `dig +short $SITE_DOMAIN` = 94.72.126.85 |
| `POSTGRES_DB` | ✅ | 否 | 数据库名（默认 wallhaze） | `docker compose exec postgres psql -l` |
| `POSTGRES_USER` | ✅ | 否 | 数据库用户 | 同上 |
| `POSTGRES_PASSWORD` | ✅ | ✅ | 数据库密码（openssl rand -base64 24） | api 容器 `pg_isready`/boot 日志 |

## api.env（api + worker 共用）

### 核心

| 变量 | 必填 | 敏感 | 作用 | 默认/配置 | 验证 |
|---|---|---|---|---|---|
| `NODE_ENV` | ✅ | 否 | 必须为 `production`（启用密钥强制校验等） | 写死 production | 启动日志 |
| `PORT` / `HOST` | 否 | 否 | 容器内 4000/0.0.0.0 | 保持默认 | healthcheck |
| `LOG_LEVEL` | 否 | 否 | fastify 日志级别 | info | — |
| `SITE_URL` | ✅ | 否 | 用户可见站点 origin；驱动 secureCookies 与 OAuth 默认 | `https://<域名>` | 登录 cookie 带 Secure |
| `CORS_ALLOWED_ORIGINS` | ✅ | 否 | 严格 origin 白名单（CORS + origin guard） | `https://<域名>` | 跨域请求 200；陌生 origin 403 |
| `API_PUBLIC_URL` | ✅ | 否 | API 对外基址（同域部署=站点域名） | 同 SITE_URL | OAuth 回调拼接 |
| `WEB_APP_URL` | 否 | 否 | OAuth 完成后回跳（默认第一个 CORS origin） | 同 SITE_URL | 登录后回到站点 |
| `TRUST_PROXY` | 建议 `1` | 否 | 仅影响 request-guard 限流取真实 IP（Fastify trustProxy 恒为 false） | 未设=全部请求共享 Caddy IP | 日志 reqId 对应不同 IP |
| `DATABASE_URL` | ✅ | ✅ | `postgresql://user:pass@postgres:5432/wallhaze` | compose 内部网络 | 迁移日志 + `/health` |
| `IMAGE_URL_SECRET` | ✅ | ✅ | 私有媒体签名 URL 的 HMAC 密钥；**生产缺省直接拒绝启动** | `openssl rand -base64 32` | 轮换后旧签名全部失效 |
| `OAUTH_STATE_SECRET` | 建议 | ✅ | OAuth state cookie HMAC（缺省回落 IMAGE_URL_SECRET） | 同上生成 | Google 登录流程 |

### Google OAuth

| 变量 | 必填 | 敏感 | 作用 | 验证 |
|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 欲启用登录则✅ | ✅ | Google Cloud OAuth Web client | `/v1/auth/oauth/google/status` 返回 configured |
| `GOOGLE_OAUTH_REDIRECT_URI` | 欲启用登录则✅ | 否 | 必须与 console 完全一致：`https://<域名>/v1/auth/oauth/google/callback` | 登录跳转回调 200 |

### fal.ai（首轮部署保持关闭）

| 变量 | 必填 | 敏感 | 作用 | 首轮值 |
|---|---|---|---|---|
| `FAL_KEY` | 启用 AI 时 | ✅ | fal 密钥；仅 provider 使用，不进日志 | 留空 |
| `FAL_MOCK` | — | 否 | 强制本地 mock（开发/测试） | **unset**（生产不得 mock） |
| `FAL_LIVE_ENABLED` | 启用 AI 时 | 否 | 真实图片计费调用的显式开关（需+KEY） | **unset** |
| `FAL_VIDEO_LIVE_ENABLED` | 启用视频时 | 否 | 视频计费第二开关（需+前者+KEY） | **unset** |
| `GENERATION_PAUSED` | ✅ | 否 | `1`=生成路由 503（运营暂停开关） | **`1`**（验收后再开） |
| `PLATFORM_DAILY_COST_LIMIT_MICROS` | 启用前✅ | 否 | 平台日成本上限（micro-USD，0=硬停） | **`0`**（启用 AI 时再设，如 10000000=$10/日） |
| `USER_DAILY_COST_LIMIT_MICROS` | 启用前✅ | 否 | 单用户日成本上限 | `0` 同上 |

### Worker / 清理

| 变量 | 必填 | 作用 | 首轮值 |
|---|---|---|---|
| `EMBED_WORKER` | ✅ | 必须为 `0`（worker 是独立容器） | `0` |
| `WORKER_POLL_MS` / `WORKER_LEASE_SECONDS` | 否 | 轮询/租约 | 2000 / 60 |
| `STORAGE_DIR` | 建议 | 私有媒体目录（容器内 `/app/.data/media`，挂 volume） | `/app/.data/media` |
| `MEDIA_RETENTION_CLEANUP_ENABLED` | ✅ | 30 天删除总开关；**unset=全 dry-run** | **unset**（staging 演练+站长批准后才设 1） |

### 支付 / Ops

| 变量 | 作用 | 首轮值 |
|---|---|---|
| `PAYMENT_PROVIDER` | `mock`/`waffo`；生产代码拒绝 mock adapter 真实收款 | 保持 `mock`（前端购买入口关闭） |
| `PAYMENT_ENVIRONMENT` | `test`/`prod` | `test` |
| `WAFFO_*` | Waffo 商户凭据（启用支付时） | 留空 |
| `OPS_SHUTDOWN_TOKEN` | dev 专用关机端点；**生产必须 unset** | unset |
| `BODY_LIMIT_BYTES` | JSON 体积上限 | 默认 1MiB |

## Web 构建参数（compose build args）

| 变量 | 必填 | 作用 | 首轮值 |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 否 | 烘焙进客户端 bundle 的 API 基址；**同域部署留空=相对路径**（推荐，切换域名零重建） | 留空 |

> 绝不能出现的变量：任何密钥加 `NEXT_PUBLIC_` 前缀（会进浏览器 bundle）。

## 轮换手册

- `IMAGE_URL_SECRET`：改 api.env → `./deploy.sh deploy`（滚动重启）→ 旧 URL 即失效。
- `POSTGRES_PASSWORD`：`ALTER USER` → 同步改 compose.env/api.env → 重启 postgres+api+worker。
- OAuth secret：Google Cloud 重置 → 改 api.env → 重启 api。
