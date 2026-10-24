# Contabo VPS 4 — WallHaze 生产架构

- 服务器：Contabo Cloud VPS 4（4 vCPU / 8 GB RAM / 100 GB SSD）
- Hostname：`vmi3619434`，IPv4：`94.72.126.85`（以登录后实际核实为准）
- 取消 Railway；数据库与对象存储改为 VPS 内 PostgreSQL 容器 + Cloudflare R2

## 1. 拓扑

```
Internet
   │  80/443（仅此两个端口对外）
   ▼
[Caddy]  ── TLS 终止（Let's Encrypt 自动签发）
   │  /v1/* /health  →  [api]   Fastify  :4000（internal）
   │  /*             →  [web]   Next.js  :3000（internal）
   │
   ├── [worker]  生成任务容器       （internal，独立进程，不对外）
   ├── [postgres] PostgreSQL 17     （internal，无端口映射，volume 持久化）
   └── [jobs]    cron：备份/校验/清理 dry-run（internal）
                     │
                     └── pg_dump → wallhaze_pg_backups volume → 异地 R2（见备份文档）
外部服务：Cloudflare R2（媒体）、Cloudflare DNS/CDN、fal.ai（AI）、Google OAuth
```

## 2. 与现有代码的对接点（已核实）

| 关注点 | 现状 | 部署决策 |
|---|---|---|
| API 路由 | 全部挂根：`/health`、`/v1/*`（Fastify 无 prefix） | Caddy 按路径转发，**不做任何 rewrite**，支付 webhook 路径原样透传 |
| 同域 vs 子域 | Web `credentials: "include"`；API strict-origin allowlist；cookie HttpOnly，`secureCookies` 由 `SITE_URL`/CORS 是否 https 推导 | **同域部署**（`https://域名/v1/*` → api），CORS 配站点域名即可；OAuth 回调配 `https://域名/v1/auth/oauth/google/callback` |
| 数据库 | `DATABASE_URL` → `createPostgresDatabase`，启动自动 `migrate()`（checksum 校验，失败即退出） | 容器内 `postgres:5432`，`DATABASE_URL=postgresql://...@postgres:5432/wallhaze` |
| Worker | 独立入口 `src/worker.ts`；无 provider 直接拒绝启动（fail-closed） | 独立容器，`EMBED_WORKER=0`；API 侧同值 |
| 存储 | 仅 `LocalStorage`（JSON+base64）/`MemoryStorage`，**无 R2/S3 adapter** | 首次部署沿用 LocalStorage volume；R2 适配器为已登记缺口（见 R2-STORAGE-SETUP.md §7） |
| 信任链 | Fastify `trustProxy:false` 固定；`TRUST_PROXY=1` 仅影响 request-guard 限流取 IP | Caddy 设置 `X-Real-IP`，api.env 设 `TRUST_PROXY=1` |
| Mock 防护 | 生产拒绝 mock 支付 adapter；generation 在无 provider 时 503 | 上线初期 `GENERATION_PAUSED=1`、`PLATFORM_DAILY_COST_LIMIT_MICROS=0` 双保险 |

## 3. 资源规划（8 GB / 4 vCPU）

| 容器 | mem_limit | cpus | 说明 |
|---|---|---|---|
| postgres | 1.5G | 1.5 | shared_buffers=512MB |
| web | 768M | 1.5 | Next standalone，heap 512M |
| api | 768M | 1.5 | heap 512M |
| worker | 1G | 1.5 | heap 768M；视频下载缓冲 |
| caddy | 128M | 0.5 | |
| jobs | 128M | 0.5 | pg_dump 峰值受 PG 内存限制 |
| 合计上限 | ≈4.3G | ≤4 | 系统余 ≈3.7G（page cache 供 Postgres） |

防 OOM 原则：

1. **不在 VPS 上构建**。镜像在本地/CI 构建（`docker build` + `docker save` 或 registry），VPS 只 `load` + `up`。构建 Next.js 需要 2 GB+ 内存，与运行时叠加会 OOM。
2. Worker 默认并发 1（代码即如此）；视频处理的临时文件走容器 tmpfs/临时层，处理完即释放。
3. 日志统一 `json-file`，10MB × 5 滚动，防磁盘写满。
4. 100 GB SSD 分配：系统+镜像 ≈15G、Postgres+备份 volume ≈20G 上限（7 日+4 周滚动）、日志 <1G、媒体暂存 <10G——长期媒体必须上 R2。

## 4. 网络与端口

- `edge` 网络：仅 Caddy；`internal` 网络：web/api/worker/postgres/jobs。
- **没有任何 `ports:` 映射到 PostgreSQL/API/Worker**。Docker 发布端口会绕过 UFW，因此靠"不发布"而非"防火墙挡"来保证。
- 唯一例外：本地 compose 测试把 web/api 绑到 `127.0.0.1`（`compose.local-test.yaml`），生产 compose 无此配置。
- Contabo 防火墙（Config option 或 CCP 防火墙）额外只放行 22/80/443，作为第二层。

## 5. 数据流

- 生成：web → api（Postgres 建 job）→ worker（lease 抢占）→ fal.ai → 对象存储（现 LocalStorage，规划 R2）→ 签名 URL 返回。
- 媒体访问：签名 URL（`IMAGE_URL_SECRET` HMAC）+ 30 天 retention 字段过滤；过期/删除中对象 404。
- 备份：jobs 容器每日 `pg_dump` → backups volume → 运维脚本上传 R2 私有 bucket（站长配置凭据后启用）。
