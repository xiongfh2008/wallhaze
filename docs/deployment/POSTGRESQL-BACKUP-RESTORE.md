# PostgreSQL 备份与恢复

## 1. 备份策略（已实现于 jobs 容器）

| 任务 | 计划（UTC） | 保留 | 位置 |
|---|---|---|---|
| 每日 `pg_dump`（gzip） | 03:15 | 7 份（自动轮换） | `wallhaze_pg_backups` volume `/backups/daily/` |
| 每周 `pg_dump` | 周日 04:15 | 4 份 | `/backups/weekly/` |
| 完整性校验（`gzip -t`） | 每日 01:00 | — | 失败写 jobs.log |
| 30 天清理 dry-run 统计 | 每 30 分钟 | — | 仅日志，删除总开关关闭 |

首次启动立即执行一次备份，避免新部署无保护。日志：`/backups/jobs.log`。

## 2. 异地备份（站长操作，一次性配置）

仅 volume 内备份不满足要求；每日把最新备份同步到 R2 私有桶：

1. Cloudflare R2 → Create API Token：权限只限 `wallhaze-backups` 桶的 Object Read & Write。
2. `sudo nano /opt/wallhaze/secrets/r2-backup.env`（chmod 600）：
   ```
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<token id>
   R2_SECRET_ACCESS_KEY=<token secret>
   R2_BACKUP_BUCKET=wallhaze-backups
   R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   ```
3. 安装 rclone（host）：`curl https://rclone.org/install.sh | sudo bash`，
   配置 `rclone config`（S3 类型，endpoint 用上面的 R2_ENDPOINT）。
4. host crontab（`sudo crontab -e`）：
   ```
   30 3 * * * rclone copy /var/lib/docker/volumes/wallhaze_pg_backups/_data/daily r2:wallhaze-backups/daily --max-age 48h && rclone copy /var/lib/docker/volumes/wallhaze_pg_backups/_data/weekly r2:wallhaze-backups/weekly >> /opt/wallhaze/backups/rclone.log 2>&1
   ```
5. 备份加密（推荐）：rclone 内置 `rclone crypt` remote，或上传前
   `age -r <recovery-pubkey> file.gz > file.gz.age`；恢复时用私钥解密。
6. **告警**：rclone 失败写入日志；建议配 Cloudflare Workers/健康检查服务拉取
   最新对象时间戳做"备份新鲜度"监控（未配置真实通知渠道前不宣称告警上线）。

## 3. 恢复演练（staging/隔离环境，每季度）

```bash
# 1) 起一个一次性 postgres（绝不指向生产 volume）
docker run -d --name restore-drill -e POSTGRES_PASSWORD=drill \
  -e POSTGRES_DB=wallhaze postgres:17-alpine
sleep 5
# 2) 解压 + 恢复
gunzip -c wallhaze-<stamp>.sql.gz | \
  docker exec -i restore-drill psql -U postgres -d wallhaze
# 3) 验证
docker exec restore-drill psql -U postgres -d wallhaze -c \
  "SELECT count(*) FROM users; SELECT count(*) FROM credit_wallets; \
   SELECT count(*) FROM image_assets; SELECT count(*) FROM schema_migrations;"
# 期望：schema_migrations 含版本 1..6；业务表行数与备份时点一致。
docker rm -f restore-drill
```

**真机恢复**（灾难场景）：

```bash
./deploy.sh status                       # 确认故障面
docker compose -f compose.production.yaml stop api worker web   # 停写入
gunzip -c /backups/daily/<latest>.sql.gz | \
  docker compose -f compose.production.yaml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose -f compose.production.yaml start api worker web caddy
```

注意：`psql` 恢复到**已有 schema 的库**会因对象已存在而报错；灾难恢复
标准做法是先重建数据库对象（仅在 `POSTGRES_DB` 已被清空/新建的库上执行
恢复）。**任何情况下都不删除 `wallhaze_postgres_data` volume**——先从
volume 复制出损坏数据留证：`docker run --rm -v wallhaze_postgres_data:/pg
-v $PWD:/out alpine tar czf /out/pg-damaged-$(date +%s).tgz /pg`。

## 4. 恢复后校验清单

- [ ] `schema_migrations` 版本完整（1–6）
- [ ] `/health` 200；登录/会话正常
- [ ] 抽查一个用户钱包余额与 ledger 一致（credits 幂等表）
- [ ] 抽查 image_assets 的 `storage_status`/`expires_at`
- [ ] 支付订单/ webhook 事件行数与账本一致
