
> **⚠️ 2026-10-24 修订（拆分域架构）**：阶段 2/3 中"VPS 部署 web 容器 /
> Caddy"步骤已废弃。前端上线流程改为 Cloudflare Workers 部署
> （CLOUDFLARE-FRONTEND-DEPLOY.md §3）；本清单阶段 0–1、4–6 仍适用于
> VPS 后端（compose 项目名 wallhaze-app）。

# 生产上线清单（按序执行，站长操作）

> A=站长，D=已由 DeepSeek 完成并验收。任何一步失败停止并回看对应文档。

## 阶段 0 — 前置（A）

- [ ] A. Contabo VPS 可登录，规格核实（CONTABO-FIRST-SETUP.md §1）
- [ ] A. 域名 DNS → Cloudflare（CLOUDFLARE-DNS-SSL.md §1）
- [ ] A. Google OAuth Web client 已建（client id/secret 可用）
- [ ] A. fal.ai 账号有 FAL_KEY（本轮不启用）
- [ ] D. 镜像已构建：web/api/worker（本地 `docker images wallhaze/*`）

## 阶段 1 — 服务器初始化（A）

- [ ] A. `wallhaze` sudo 用户 + SSH key + 验证（FIRST-SETUP §2）
- [ ] A. Docker + compose plugin（§3）
- [ ] A. `/opt/wallhaze/{apps,secrets,backups}` 布局 + 密钥文件（§4，ENVIRONMENT-VARIABLES.md）
  - `secrets/compose.env`：SITE_DOMAIN / POSTGRES_*
  - `secrets/api.env`：按 .env.production.example；首轮关键值：
    `GENERATION_PAUSED=1`、`PLATFORM_DAILY_COST_LIMIT_MICROS=0`、
    `PAYMENT_PROVIDER=disabled`、`MEDIA_RETENTION_CLEANUP_ENABLED=`（unset）、
    `IMAGE_URL_SECRET=<openssl rand -base64 32>`
- [ ] A. 传输镜像 `docker load`（FIRST-SETUP §4）
- [ ] A. UFW 三件套 + Contabo 防火墙只放行 22/80/443（SECURITY §3）

## 阶段 2 — 首次部署（A）

- [ ] A. `cd /opt/wallhaze/apps/api && ./deploy.sh deploy`
- [ ] A. `./deploy.sh status`：六服务 healthy
- [ ] A. 端口审计：只有 Caddy 出现在 0.0.0.0（deploy 内建检查）
- [ ] A. `curl -s https://<域名>/health` → ok
- [ ] A. 收到 Let's Encrypt 证书（logs caddy 无 acme error）

## 阶段 3 — 功能验收（A，浏览器 1440/820/390）

- [ ] A. 七语言切换（en/zh/ja/ko/es/fr/de）
- [ ] A. Gallery 加载、详情页、下载（cleared 作品）
- [ ] A. 旧 39 张 pending：详情显示"版权审核中"，原图 URL 404；
      `curl -sI https://<域名>/images/styles/abstract.jpg` → 404
- [ ] A. Community 显示真实空态；无 demo 内容；
      `curl -sI https://<域名>/community-demo/images/demo-007.jpg` → 404
- [ ] A. 邮箱投稿入口 mailto 正确
- [ ] A. Monthly Theme 显示"梦幻夜色"
- [ ] A. Google OAuth：console 回调配 `https://<域名>/v1/auth/oauth/google/callback`
      → 实际登录一轮
- [ ] A. 注册/登录/My Creations 打开
- [ ] A. Credits 页面打开；生成按钮因 `GENERATION_PAUSED=1` 显示 503 文案
      （无假成功）
- [ ] A. 购买入口关闭：`/v1/credits/packages` 可读但 checkout 报不可用
      （PAYMENT_PROVIDER=disabled），页面无假支付成功
- [ ] A. Sitemap `curl -s https://<域名>/sitemap.xml | grep -c community` 无 demo
- [ ] A. 隐私政策/服务条款页面可达（当前 noindex 草稿状态为预期）

## 阶段 4 — 数据与备份（A）

- [ ] A. `./deploy.sh backup` → `/backups/daily` 出现 >0 字节 .gz
- [ ] A. `gzip -t` 通过；jobs 日志出现 pg_dump 17.11
- [ ] A. 配置 R2 备份同步（BACKUP-RESTORE §2）+ 一次手动 rclone copy 验证
- [ ] A. 恢复演练：按 BACKUP-RESTORE §3 在一次性容器执行
- [ ] A. 监控接点（MONITORING §3）：磁盘/CPU/备份新鲜度通知渠道确认

## 阶段 5 — 开启真实 AI（A 单独授权，逐项）

- [ ] A. R2 adapter 实现并验收（R2-SETUP §6）→ 切 `STORAGE_DRIVER=r2`
- [ ] A. `secrets/api.env`：FAL_KEY=<key>、PLATFORM_DAILY_COST_LIMIT_MICROS=10000000、
      USER_DAILY_COST_LIMIT_MICROS=2000000、GENERATION_PAUSED 删除
- [ ] A. `./deploy.sh deploy`；单次受控图片生成联调（不开启视频开关）
- [ ] A. 观察费用日志 → 再议 `FAL_VIDEO_LIVE_ENABLED`

## 阶段 6 — 30 天清理启用（A 单独授权）

- [ ] A. staging/隔离环境完成 R2 删除演练 + 备份恢复演练
- [ ] A. `MEDIA_RETENTION_CLEANUP_ENABLED=1` 写入 api.env → deploy
- [ ] A. 观察 48h cleanup 日志（dry-run 计数 vs 实删计数一致）
