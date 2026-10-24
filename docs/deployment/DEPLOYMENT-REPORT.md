# WallHaze Contabo VPS 4 自托管生产部署准备 — 最终报告

- 日期：2026-10-24
- 交付：Contabo VPS 4（4 vCPU / 8 GB / 100 GB）+ Docker Compose + PostgreSQL 容器
  + Cloudflare DNS/CDN + Cloudflare R2（规划）+ fal.ai（默认关闭）完整部署准备
- 结论：**部署资产全部就绪并在本地以生产镜像完成 Compose 全链路验收；
  站长按文档执行即可首次部署。未登录 VPS、未改 DNS、未创建收费云资源、
  未调用付费 fal.ai、未执行 Git 提交。**

## DeepSeek 已完成

### 修改/新增文件

| 文件 | 内容 |
|---|---|
| `apps/api/Dockerfile`、`apps/api/Dockerfile.worker` | API/Worker 多阶段镜像（node:22-slim、非 root、动态入口探测 .dist-entry） |
| `apps/web/Dockerfile` | Next.js 16 standalone 镜像（contracts 以 vendor 方式进 workspace root） |
| `apps/api/compose.production.yaml` | 生产编排：caddy/web/api/worker/postgres/jobs，internal 网络隔离、healthcheck 依赖、mem/cpu 限额、日志滚动 |
| `apps/api/compose.local-test.yaml`、`.env.local-test*` | 本地镜像验收 override（不上 VPS） |
| `apps/api/Caddyfile` | 同域反代：`/v1/*`、`/health` → api，其余 → web；安全头、25MB 上传、超时 |
| `apps/api/jobs/crontab-runner.sh` | cron：每日/每周 pg_dump、完整性校验、30 天清理 dry-run 统计、pg17 客户端匹配 |
| `apps/api/deploy.sh` | deploy/rollback/status/logs/backup；内置危险命令自检 |
| `apps/api/.env.production.example` | 全量生产变量模板（与 env.ts 逐项核对） |
| `.dockerignore` | 排除密钥/private-media/demo 数据/node_modules/dist |
| `apps/web/next.config.ts` | `output:"standalone"` + turbopack root 显式化 + outputFileTracingExcludes |
| `packages/contracts/tsconfig.build.json` + dist + package.json(exports) + 源码 .js 扩展 | contracts 从"仅类型"变为可运行时解析的包（API 值导入 IMAGE_PROXY_ERRORS/定价常量的前提） |
| `apps/web/vendor/contracts/` + `scripts/sync-vendor-contracts.mjs` | web 侧 contracts 进 workspace root（turbopack 约束） |
| `apps/api/src/config/env.ts`、`src/app.ts`、`src/business/payment.ts` | 新增 `PAYMENT_PROVIDER=disabled`（生产安全"购买关闭"值 + DisabledPaymentAdapter fail-closed） |
| `docs/deployment/*.md`（13 份） | 架构/初始化/安全/Docker/环境变量/备份恢复/Cloudflare/R2/上线清单/回滚/资源评估/监控/站长清单 |

### 实现的功能

1. 同域反向代理方案（`https://域名/v1/*` → api）：已对照代码验证兼容——cookie 由
   `SITE_URL`/CORS https 推导 Secure、OAuth 回调可配同域路径、API 无 prefix 路由
   原样透传、支付 webhook 路径不 rewrite。
2. 三镜像多阶段构建：本地/CI 构建 → save/load 到 VPS，**VPS 零编译**（Next build
   内存峰约 2 GB，与 8 GB VPS 运行态叠加有 OOM 风险，流程上禁止）。
3. PostgreSQL 17 容器：无公网映射、healthcheck、内存调参、持久化 volume；
   迁移 v1–v6 由 API 启动自动执行 + deploy.sh 一次性显式 migrate。
4. jobs 容器：每日/每周备份（保留 7/4）、gzip 完整性校验、备份新鲜度检查、
   30 天清理 dry-run 统计（删除总开关保持关闭）。
5. `PAYMENT_PROVIDER=disabled`：新增生产安全值——API 正常启动、checkout 报
   "不可用"，杜绝假支付成功；对接 Waffo 前的正确姿态。
6. 生产环境 fail-closed 保持并复核：`IMAGE_URL_SECRET` 缺失拒绝启动、
   `GENERATION_PAUSED=1`、`PLATFORM_DAILY_COST_LIMIT_MICROS=0` 双保险、
   mock 支付在生产被拒。

### 本地测试（Docker Compose 全链路，生产镜像）

| 项 | 结果 |
|---|---|
| api/worker/web 镜像构建 | ✅（488MB/488MB/1.31GB） |
| 六服务按序启动，healthcheck 全 green | ✅ |
| PostgreSQL 迁移 v1–v6 | ✅（schema_migrations 实查 6 行） |
| volume 持久化 | ✅（插入标记 → restart postgres → 仍在；完整 down（无 -v）→ up → 数据仍在） |
| worker 重启恢复 | ✅（healthy，poll/lease 正常） |
| 幂等唯一约束 | ✅（generation_jobs/payment_orders/credit_ledger `(user_id,idempotency_key)` 实查存在） |
| 端口审计 | ✅（生产拓扑仅 Caddy 80/443；web/api 仅本地测试绑 127.0.0.1） |
| 备份 | ✅（pg_dump 17.11 与 server 匹配；.gz 完整性通过；轮换生效） |
| 媒体隔离（镜像内） | ✅（web 镜像仅 8 张 cleared 风格图；31 张 pending、demo 媒体、private-media 均不存在） |
| Web/API 自动化测试 | ✅ API 228 passed+1 skipped；Web 244 passed；两仓 typecheck/lint/build 通过 |

### 构建过程中发现并修复的问题

1. **仓库不是 npm workspaces**（根 lockfile 只含旧 web 依赖）→ Dockerfile 改为
   各 app 独立 `npm ci`；web lockfile 缺 testing-library 条目已用
   `npm install --package-lock-only` 对齐。
2. **contracts 运行时不可解析**：`node dist/...` 无法找到 `@wallhaze/contracts`
   （dev 用 tsx+paths 掩盖）→ contracts 补 build 配置产出 dist + exports；
   API 镜像以独立 stage 编译后装进 node_modules（在 node_modules 内直接 npm
   会破坏 COPY 布局，已踩坑并绕开）。
3. **tsc 输出布局不固定**（common-root 随编译图变化）→ 构建期 `find dist -name
   server.js` 记录 `.dist-entry`，CMD 运行时读取。
4. **Turbopack workspace root**：容器内 app 目录外不允许编译 → web 依赖装进
   app 目录 + contracts vendor 进树（同步脚本入库）。
5. healthcheck 引号/CMD 列表形态、web standalone CMD 路径、CRLF 行尾、
   alpine pg client 与 server 版本匹配——均已修复并记录。

### 尚未云端验证（需要站长执行后验证）

- Contabo 真实 OS/网络/防火墙行为；Contabo 防火墙与 UFW 双层实测。
- 真实域名 Let's Encrypt 签发、Cloudflare Full(strict) 链路。
- R2 实际连通（adapter 尚未实现——见缺口）。
- Google OAuth 真实回调、Waffo 真实支付（均属站长配置后的联调）。
- VPS 真实内存/磁盘基线（本地实测数据见 VPS-RESOURCE-REPORT，趋势可信）。

## 已登记的关键缺口

1. **R2 adapter 未实现**（当前 LocalStorage 过渡，容量约束与实施清单见
   R2-STORAGE-SETUP.md §4/§6）——上线路径最大技术项。
2. 监控通知渠道未接（MONITORING §3 提供 msmtp/Telegram/拨测三选一；接入前
   不宣称告警上线）。
3. 30 天清理保持 dry-run；staging 演练 + 站长批准后才可启用。
4. Community demo 数据已通过镜像内实测隔离；上线后建议补一个"生产构建时
   `public/community-demo` 存在即失败"的 next.config 断言。

## 站长需要操作（摘要，逐项见 USER-ACTION-CHECKLIST.md）

1. **VPS**：SSH 登录核实规格 → 建 sudo 用户+key → Docker/UFW/fail2ban →
   密钥目录（FIRST-SETUP/SECURITY）。
2. **域名**：Cloudflare A 记录 + Full(strict) + 缓存规则 + 上线 Purge（CLOUDFLARE）。
3. **密钥**：生成并写入 `secrets/{compose.env,api.env}`（首轮
   `GENERATION_PAUSED=1`、预算=0、`PAYMENT_PROVIDER=disabled`、清理开关留空）。
4. **R2**：开两个私有桶 + 最小权限 token；备份 rclone 同步（R2-SETUP/BACKUP）。
5. **Google OAuth**：回调配 `https://<域名>/v1/auth/oauth/google/callback`。
6. **fal.ai**：本轮不配置；启用前单独批准预算并写入微单位上限。
7. **支付**：保持 disabled；对接 Waffo 时改 `waffo`+凭据。
8. **首次部署授权**：执行 `./deploy.sh deploy` 并按
   PRODUCTION-LAUNCH-CHECKLIST 阶段 2–4 验收；开启 AI 与清理需再次单独授权。

## 安全边界执行声明

未 SSH 登录 VPS；未安装/更改 VPS 软件；未改 DNS；未创建收费云资源；未执行
生产 migration（仅本地隔离容器）；未调用付费 fal.ai（本轮零调用）；未执行
真实支付；未删除任何用户作品/未启用生产清理；未 Git commit/push；未访问
`D:\Project\wallhaze\wallhaze\`。
