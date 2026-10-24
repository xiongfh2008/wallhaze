# 站长操作清单（需站长执行的每一项）

> D=DeepSeek 已完成；A=站长。预计总耗时 2–3 小时（不含 R2 adapter 开发）。

## 1. Contabo / VPS

| # | 操作 | 参考 |
|---|---|---|
| 1.1 | A. 从 Contabo 邮件取 root 密码，SSH 登录 94.72.126.85 | FIRST-SETUP §1 |
| 1.2 | A. 核实 OS/规格：`cat /etc/os-release; nproc; free -h; df -h /`，与套餐不符即停下反馈 | FIRST-SETUP §1 |
| 1.3 | A. 本地生成 ed25519 SSH key（`ssh-keygen -t ed25519`） | FIRST-SETUP §2 |
| 1.4 | A. 建 `wallhaze` sudo 用户 + authorized_keys，**新终端验证后**再收紧 sshd | FIRST-SETUP §2、SECURITY §1 |
| 1.5 | A. 安装 Docker/compose、fail2ban、UFW（只放行 22/80/443） | FIRST-SETUP §3/§5、SECURITY §3 |
| 1.6 | A. 启用 unattended-upgrades | SECURITY §6 |

## 2. 域名 / Cloudflare

| # | 操作 | 参考 |
|---|---|---|
| 2.1 | A. 站点域名 A 记录 → 94.72.126.85（橙云代理） | CLOUDFLARE §1 |
| 2.2 | A. SSL/TLS = **Full (strict)**；Always Use HTTPS 开 | CLOUDFLARE §2 |
| 2.3 | A. Cache Rules：`/_next/static/*` 长缓存；`/v1/*`、`/community-demo/*` Bypass | CLOUDFLARE §4 |
| 2.4 | A. 上线后 Purge Everything 一次（清旧 39 张历史缓存） | CLOUDFLARE §5 |

## 3. 密钥 / 环境变量

| # | 操作 | 参考 |
|---|---|---|
| 3.1 | A. 生成 `IMAGE_URL_SECRET`/`OAUTH_STATE_SECRET`/`POSTGRES_PASSWORD`（`openssl rand -base64 32/24`） | ENV § Secrets |
| 3.2 | A. 写 `/opt/wallhaze/secrets/{compose.env,api.env}`（chmod 600）——首轮：`GENERATION_PAUSED=1`、`PLATFORM_DAILY_COST_LIMIT_MICROS=0`、`PAYMENT_PROVIDER=disabled`、`MEDIA_RETENTION_CLEANUP_ENABLED` 留空 | ENV 各表 |
| 3.3 | A. 确认根 `.env.local` 里的 FAL_KEY **不复制**到 VPS（首轮 AI 关闭） | ENV § fal.ai |

## 4. R2

| # | 操作 | 参考 |
|---|---|---|
| 4.1 | A. 创建私有桶 `wallhaze-media` + 最小权限 API Token | R2-SETUP §2 |
| 4.2 | A. 创建 `wallhaze-backups` 桶 + Token；配置 rclone 每日同步 + 加密 | BACKUP §2 |
| 4.3 | A. （下一轮）审批 R2 adapter 的 `@aws-sdk/client-s3` 依赖与开发 | R2-SETUP §6 |

## 5. Google OAuth

| # | 操作 | 参考 |
|---|---|---|
| 5.1 | A. Google Cloud → OAuth Web client；Authorized redirect URI 加 `https://<域名>/v1/auth/oauth/google/callback` | ENV § OAuth |
| 5.2 | A. client id/secret 写入 api.env | 同上 |

## 6. fal.ai 预算

| # | 操作 | 参考 |
|---|---|---|
| 6.1 | A. fal 控制台确认余额/账单；本轮**不配置到 VPS** | ENV § fal.ai |
| 6.2 | A. 批准日预算数值后写入 `PLATFORM_DAILY_COST_LIMIT_MICROS`（如 $10/日=10000000） | PRODUCTION-LAUNCH 阶段 5 |

## 7. 支付开关

| # | 操作 | 参考 |
|---|---|---|
| 7.1 | A. 首轮保持 `PAYMENT_PROVIDER=disabled`（购买入口关闭，无假支付成功）；对接 Waffo 时改 `waffo` 并填商户凭据 | ENV § Payments |

## 8. 首次部署与验收

| # | 操作 | 参考 |
|---|---|---|
| 8.1 | A. 本地构建镜像 → save/scp → `docker load`（或配 registry） | DOCKER §2 |
| 8.2 | A. `./deploy.sh deploy` + `./deploy.sh status` | FIRST-SETUP §6 |
| 8.3 | A. 按 PRODUCTION-LAUNCH-CHECKLIST 阶段 3 逐项浏览器验收（1440/820/390） | CHECKLIST |
| 8.4 | A. 备份/恢复演练（阶段 4） | BACKUP §2–3 |
| 8.5 | A. 通知渠道接入并测试（MSMTP/Telegram/拨测任一） | MONITORING §3 |
| 8.6 | A. 单独授权：开启真实 AI（阶段 5）；单独授权：开启 30 天删除（阶段 6） | CHECKLIST |

## 站长不需要做的（已由 D 完成并本地验收）

Dockerfile/compose/Caddyfile 编写、迁移执行、healthcheck 调试、备份脚本与
pg17 版本匹配、端口审计逻辑、demo 数据隔离、旧 39 张图片隔离、全量测试。
