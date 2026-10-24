# Contabo VPS 首次初始化（站长执行）

> 本文档由站长在获得部署授权后按序执行。执行前请先阅读
> `CONTABO-SECURITY.md`。全程约 60–90 分钟。

## 0. 前置条件

- Contabo 控制台可登录，VPS `vmi3619434`（94.72.126.85）已开通。
- 本地已生成 SSH 密钥对（没有则 `ssh-keygen -t ed25519 -C "wallhaze-vps"`）。
- 域名已托管到 Cloudflare（见 CLOUDFLARE-DNS-SSL.md）。

## 1. 首次登录与系统核实（root 密码来自 Contabo 邮件）

```bash
ssh root@94.72.126.85
# 核实真实规格与系统（与文档假设不一致时停下来汇报）：
cat /etc/os-release && uname -m        # 预期 Debian 12/Ubuntu 24.04, x86_64
nproc && free -h && df -h /            # 预期 4 vCPU / ~8GB / ~100GB（实际可用略小）
```

> 若实际规格与套餐不符（例如 swap/可用盘更小），先在部署群里说明再继续。

## 2. 创建管理员用户 + SSH Key（先验证再收紧）

```bash
adduser --disabled-password --gecos "" wallhaze
usermod -aG sudo wallhaze
install -d -m 700 -o wallhaze -g wallhaze /home/wallhaze/.ssh
# 把本地公钥内容粘贴进来：
echo "ssh-ed25519 AAAA... wallhaze-vps" > /home/wallhaze/.ssh/authorized_keys
chown wallhaze:wallhaze /home/wallhaze/.ssh/authorized_keys
chmod 600 /home/wallhaze/.ssh/authorized_keys
```

**保持当前 root 会话不要退出**，新开终端验证：

```bash
ssh wallhaze@94.72.126.85          # 必须成功
sudo -v                             # 必须成功
```

验证通过后才继续第 3 步。锁死时的救援方案：Contabo 控制台 → VNC Console（不依赖 SSH）。

## 3. 基础系统 + Docker

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install ca-certificates curl gnupg ufail2ban ufw git
# Docker 官方源（engine + compose plugin）
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update && sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker wallhaze    # 重新登录生效
sudo systemctl enable --now docker
```

Ubuntu 24.04 把 `ufail2ban` 换成 `fail2ban`。

## 4. 目录布局与密钥

```bash
sudo mkdir -p /opt/wallhaze/apps /opt/wallhaze/secrets /opt/wallhaze/backups
sudo chown -R wallhaze:wallhaze /opt/wallhaze
chmod 700 /opt/wallhaze/secrets
```

从本地传输部署资产（在**本地**仓库根执行）：

```bash
scp -r apps/api/{compose.production.yaml,Caddyfile,jobs,deploy.sh,.env.production.example} \
    wallhaze@94.72.126.85:/opt/wallhaze/apps/api/
# 镜像二选一：本地构建后传输（推荐，VPS 不编译）
docker compose -f apps/api/compose.production.yaml -f apps/api/compose.local-test.yaml \
  --env-file apps/api/.env.local-test build web api worker   # 本地先验证
docker save wallhaze/web:latest wallhaze/api:latest wallhaze/worker:latest \
  | gzip > /tmp/wallhaze-images.tar.gz
scp /tmp/wallhaze-images.tar.gz wallhaze@94.72.126.85:/opt/wallhaze/
# VPS 上：
docker load < /opt/wallhaze/wallhaze-images.tar.gz
```

密钥文件（VPS 上，`chmod 600`）：

```bash
sudo -u wallhaze nano /opt/wallhaze/secrets/api.env       # 见 ENVIRONMENT-VARIABLES.md
sudo -u wallhaze nano /opt/wallhaze/secrets/compose.env   # SITE_DOMAIN / POSTGRES_*
chmod 600 /opt/wallhaze/secrets/*.env
```

## 5. 防火墙（SSH 保持可用后再做）

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # 或自定义 SSH 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

> Docker 发布端口会绕过 UFW——生产 compose 里除 Caddy 外没有任何 `ports:`，
> 这是真正的隔离层；UFW 是第二层。

## 6. 首次部署

```bash
cd /opt/wallhaze/apps/api
./deploy.sh deploy          # preflight → migrate → web/api/worker → caddy
./deploy.sh status          # 全部 healthy；对外端口只有 80/443
curl -s https://你的域名/health | jq .status      # "ok"
```

## 7. 收紧 SSH（确认第 2/6 步全部正常后）

```bash
sudo sshd -t && sudo systemctl reload ssh
# /etc/ssh/sshd_config：
#   PermitRootLogin no
#   PasswordAuthentication no
#   PubkeyAuthentication yes
```

## 8. 首次部署验收

- [ ] `deploy.sh status` 六个服务 healthy
- [ ] `https://域名` 首页七语言可切换
- [ ] `https://域名/health` 返回 ok
- [ ] `curl -s https://域名/v1/credits/pricing` 正常 JSON
- [ ] Community 显示真实空态（无 demo 内容）
- [ ] `/v1/auth/oauth/google/start` 行为符合当前 OAuth 配置状态
- [ ] 磁盘/内存：`free -h`、`df -h` 与架构文档预估一致
