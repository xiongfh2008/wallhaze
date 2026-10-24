# Contabo VPS 安全加固（站长执行）

> 原则：每一步先做、再验证、后收紧。任何一步失败都不影响回退——
> Contabo 控制台的 **VNC Console / Rescue System** 不依赖 SSH，是最终救援通道。

## 1. 账户与 SSH（详见 CONTABO-FIRST-SETUP.md §2）

1. 创建 `wallhaze` sudo 用户 + SSH 公钥。
2. **新终端验证** key 登录 + sudo 成功后，才允许：
   - `PermitRootLogin no`
   - `PasswordAuthentication no`
3. 生效：`sudo sshd -t && sudo systemctl reload ssh`（先 `-t` 语法检查）。

**回滚**：VNC Console 登录 root，还原 `/etc/ssh/sshd_config.d/*` 并 reload。

## 2. 防暴力破解

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd     # 观察封禁计数
```

默认 sshd jail 即可；不要把 22 端口改成非常见端口来“隐藏”（对扫描无效，徒增混乱）。

## 3. 防火墙 — 三层

| 层 | 内容 | 说明 |
|---|---|---|
| Contabo 防火墙 | CCP → Network Firewall：只放行 22/80/443 | 第一层，绕过主机配置错误 |
| UFW | `deny incoming / allow 22,80,443` | 第二层 |
| Docker 拓扑 | 除 Caddy 外**无任何 `ports:` 发布** | 关键层：Docker 发布端口绕过 UFW，靠“不发布”隔离 |

验证（部署后）：

```bash
sudo ufw status verbose
docker ps --format '{{.Names}}\t{{.Ports}}'   # 只允许 caddy 出现 0.0.0.0:80/443
ss -tlnp | grep -v 127.0.0.1                   # 对外监听仅 sshd/caddy
```

外部扫描验证（本地执行）：`nmap -p 1-10000 94.72.126.85` 应只见 22/80/443。

## 4. Docker 加固

- 容器全部 `security_opt: [no-new-privileges:true]`（compose 已配置）。
- 应用容器以非 root `wallhaze` 用户运行（Dockerfile 已配置）。
- 不挂载 `docker.sock` 到任何容器（jobs 容器无 docker socket）。
- 定期基础镜像更新：`docker pull node:22-bookworm-slim caddy:2.8-alpine postgres:17-alpine` 后重建；每月一次即可。
- 镜像扫描（本地）：`docker scout cves wallhaze/api:latest` 或 `trivy image wallhaze/api:latest`。

## 5. 密钥管理

- 生产密钥只在 `/opt/wallhaze/secrets/*.env`（`chmod 700` 目录、`chmod 600` 文件、属主 root 或 wallhaze 皆可，确保 compose 可读）。
- 禁止：提交 .env 到 Git、把密钥写进 `NEXT_PUBLIC_*`、把密钥打进镜像（.dockerignore 已排除所有 `.env*`）。
- 泄漏处置：立即轮换 `IMAGE_URL_SECRET`（旧签名 URL 全部失效）、轮换数据库密码（同步改 `DATABASE_URL`）、在 Google Cloud 撤销 OAuth client secret。

## 6. 自动安全更新

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

内核更新需要重启——选择维护窗口执行 `sudo reboot`（Docker `restart: unless-stopped` 会自动拉起全部服务）。

## 7. 管理入口保护

- 日常运维走 `wallhaze` 用户 + key；root 仅 Contabo VNC 应急。
- 不要在 VPS 上开放额外管理面板端口（Portainer 等）；需要时用 SSH 隧道：
  `ssh -L 9000:localhost:9000 wallhaze@94.72.126.85`。

## 8. 备份凭据最小权限

R2 备份桶使用**独立 API Token**：仅对 `wallhaze-backups` 桶 `Object Read & Write`，不授予账号级权限；凭据存放 `/opt/wallhaze/secrets/r2-backup.env`（600）。
