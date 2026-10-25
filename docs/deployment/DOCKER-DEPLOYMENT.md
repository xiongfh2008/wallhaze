
> **⚠️ 2026-10-24 修订**：最终架构中 **web 容器与 Caddy 均不再部署到 VPS**。
> VPS 只运行 `wallhaze-app` compose 项目（api / worker / postgres / jobs）。
> api 通过 `127.0.0.1:4000` 由**宿主 Nginx** 反代为 https://api.wallhaze.com
> （模板：`apps/api/nginx/api.wallhaze.com.conf`）。前端部署见
> CLOUDFLARE-FRONTEND-DEPLOY.md。下文保留 web 镜像构建作为**回退路径**
> （`DEPLOY_TARGET=node`），但生产不再使用。

# Docker 部署（Contabo VPS 4）

## 0. 仓库事实（构建前必读）

- **非 npm workspaces**：根 `package.json` 无 `workspaces`；`apps/api` 与 `apps/web` 各自带 lockfile（2026-10-24 已用 `npm install --package-lock-only` 对齐）。
- `@wallhaze/contracts` 在运行时被**值导入**（`IMAGE_PROXY_ERRORS`、定价常量），已从"纯类型源码包"升级为可构建包（`packages/contracts` 新增 `tsconfig.build.json` + `dist/` 产物 + `exports` 指向 dist；源码相对导入补 `.js` 扩展）。**本地跑过 `npm run build`（contracts）一次**，容器内构建亦会重编译。
- tsc 输出布局：`apps/api/dist/apps/api/src/**`（无 rootDir 所致），容器入口已按此写。

## 1. 文件清单

| 文件 | 用途 |
|---|---|
| `apps/web/Dockerfile` | Next.js 16 standalone 镜像（`output: "standalone"` 已加入 next.config.ts） |
| `apps/api/Dockerfile` | Fastify API 镜像 |
| `apps/api/Dockerfile.worker` | Worker 镜像（同 API 构建，CMD 为 worker.js） |
| `apps/api/compose.production.yaml` | 生产编排（caddy/web/api/worker/postgres/jobs） |
| `apps/api/compose.local-test.yaml` | 本地镜像测试 override（**不上 VPS**） |
| `apps/api/Caddyfile` | 反代配置（域名用 `{$SITE_DOMAIN}` 环境变量占位） |
| `apps/api/jobs/crontab-runner.sh` | cron：每日/每周备份、完整性校验、30 天清理 dry-run |
| `apps/api/deploy.sh` | deploy/rollback/status/logs/backup |
| `apps/api/.env.production.example` | 生产环境变量模板 |
| `.dockerignore` | 排除密钥、private-media、demo 数据、node_modules、dist |

## 2. 构建与传输（本地执行，VPS 不编译）

```bash
# 本地构建（先跑通 local-test 全套验收）
cd D:\Project\wallhaze
docker compose -f apps/api/compose.production.yaml -f apps/api/compose.local-test.yaml \
  --env-file apps/api/.env.local-test build web api worker

# 传输镜像（无 registry 时）
docker save wallhaze/web:latest wallhaze/api:latest wallhaze/worker:latest | gzip > wallhaze-images.tar.gz
scp wallhaze-images.tar.gz wallhaze@94.72.126.85:/opt/wallhaze/
# VPS：docker load < /opt/wallhaze/wallhaze-images.tar.gz
```

有 registry 时改为 push/pull，`deploy.sh deploy <tag>` 按 tag 回滚。

## 3. 生产启动顺序（deploy.sh 已封装）

1. `postgres` 先行（healthcheck `pg_isready`）
2. one-shot migrate（API 镜像内执行；API 启动时亦会自动 migrate，checksum 不符即拒绝启动）
3. `api` → `worker` → `web`（互相 `depends_on: service_healthy`）
4. `caddy` 最后（upstream 全 healthy 才接流量）
5. 端口审计：发布端口必须是且仅是 80/443

## 4. 健康检查

| 服务 | 探针 | 说明 |
|---|---|---|
| postgres | `pg_isready` | 10s 间隔 |
| api | `GET /health`（容器内 fetch） | 既有真实端点 |
| web | `GET /api/health` | Next 返回 404 也算"进程活着"？——**否**，此探针要求 2xx；如 404 则改为 `/`。已验证 Next standalone 对 `/` 返回 200，若探针失败改 `CMD` 内 URL |
| worker | 进程存活（node -e echo） | worker 无 HTTP 端口；失败率靠日志/告警 |
| caddy | `caddy version` | 配置错误不会让容器 unhealthy，需配合 `docker compose logs caddy` |

## 5. 资源与日志

- 全部服务 `mem_limit`/`cpus` 见架构文档；`restart: unless-stopped`。
- 日志：`json-file` 10MB×5；查看用 `./deploy.sh logs <service>`。
- 优雅关闭：Fastify/Next 均响应 SIGTERM；compose stop 默认 10s 超时，Worker 在 lease 内被中断的任务会被下一个 worker 按 fencing 安全重取。

## 6. 危险命令禁令（写进脚本与流程）

`deploy.sh` 启动即自检：脚本内出现 `down -v|volume prune|system prune --volumes` 直接拒绝运行。
任何时候都不要执行 `docker compose down -v` / `docker volume prune` / 删除 `wallhaze_postgres_data`。
磁盘紧张时只允许：日志滚动检查、旧镜像 `docker image prune -f`（无 volume）、备份 rotation（自动）。
