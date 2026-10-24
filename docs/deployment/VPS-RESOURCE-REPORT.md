# VPS 资源评估（Contabo Cloud VPS 4）

> 基于本地 Docker Compose 实测（Windows Docker Desktop，Linux VPS 行为一致或更优）
> + 代码静态分析。VPS 登录后以 `free -h`/`df -h` 实测为准（FIRST-SETUP §1）。

## 1. 镜像体积（本地实测）

| 镜像 | 大小 | 说明 |
|---|---:|---|
| wallhaze/api | 488 MB | node:22-slim + 运行时依赖 + dist |
| wallhaze/worker | 488 MB | 同 api，不同 CMD |
| wallhaze/web | 1.31 GB | standalone + public（含 Gallery 图片素材 ~26MB）+ Next 运行时 |

合计 ~2.3 GB；加上 postgres/caddy/jobs 基础镜像与层缓存，磁盘占用 ≈3.5 GB。
100 GB SSD 中占比很小。

## 2. 内存预算（compose mem_limit，硬上限）

| 服务 | 上限 | 预期稳态 |
|---|---:|---:|
| postgres | 1.5G | 300–500M（shared_buffers 512M） |
| web | 768M | 150–300M |
| api | 768M | 120–250M |
| worker | 1G | 200–400M（视频下载峰值 +N 字节缓冲，50MB 上限/请求） |
| caddy | 128M | <30M |
| jobs | 128M | <30M（pg_dump 峰值 ~100M） |
| **合计上限** | **4.3G** | 稳态 ≈1–1.5G，峰值 <3G |

8 GB 结论：**充足**。系统 + page cache 余量 ≥3.7G；Postgres 的
effective_cache_size=2GB 依赖 page cache，不会与容器上限冲突。

## 3. CPU

- 4 vCPU：cpus 合计上限 5.5（超卖场景 compose 会排队，不会 OOM）。
- 生成路径（fal.ai 托管）无本地 CPU 大户；视频仅下载+写盘。
- Next build **不在 VPS 执行**（本地/CI 构建 → save/load），避免 2 GB+ 构建
  内存与线上进程叠加导致 OOM。

## 4. 磁盘（100 GB）

| 项 | 预算 |
|---|---:|
| 系统 + Docker + 镜像 | ~15G |
| postgres volume | ~5G 起步 |
| backups volume（7 日+4 周滚动） | ~5G 上限（gzip 后每份 <10M 起步） |
| 媒体（LocalStorage 过渡期） | 软上限 40G，30G 触发 R2 迁移告警 |
| 日志（10M×5×6 容器滚动） | <1G |
| 余量 | ≥30G |

## 5. 已实测项（本地 compose）

- 构建：api/worker/web 三镜像 build 成功。
- 启动顺序：postgres(healthy) → jobs（首跑备份）→ api（migrations v1–v6 自动执行）
  → worker/web healthy。
- healthcheck：api `/health`、web `/`、worker 进程探针、pg `pg_isready` 全通过。
- 持久化：schema_migrations 插入标记 → `compose restart postgres` → 标记仍在；
  完整 `down`（无 -v）→ `up` 后数据仍在（volume 复用）。
- worker 重启：healthy，`started (poll=2000ms, lease=60s)`。
- 幂等约束：`generation_jobs (user_id,idempotency_key)`、`payment_orders`、
  `credit_ledger` 唯一约束在迁移后的库中实测存在。
- 端口审计：生产拓扑仅 Caddy 对外；本地测试的 127.0.0.1 绑定用于直连验收。
- 备份：pg_dump 17.11 与 server 版本匹配；`.gz` 完整性校验通过。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 构建在 VPS 执行 → OOM | 流程禁止；镜像本地/CI 构建后 save/load |
| 日志写满磁盘 | json-file 10M×5 + deploy.sh status 巡检 |
| 媒体撑满 100G | 30G 告警 → R2 迁移（R2-SETUP §6）；30 天清理兜底（默认关） |
| pg_dump 与 server 版本错位 | jobs 启动时装 postgresql17-client 并优先用 libexec 二进制（已修） |
| 单机故障 | 每日异地 R2 备份 + Contabo Snapshot 作为二级（不作为唯一手段） |
