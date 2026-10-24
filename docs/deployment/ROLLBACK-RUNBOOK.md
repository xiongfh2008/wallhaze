# 回滚手册

## 0. 铁律

- 任何回滚**不动** `wallhaze_postgres_data` / `wallhaze_pg_backups` volume。
- 禁止命令（deploy.sh 内置自检会拒绝执行含这些模式的脚本）：
  `docker compose down -v`、`docker volume prune`、`docker system prune --volumes`、
  一切针对数据目录的 `rm -rf`。

## 1. 应用回滚（schema 未变或向后兼容）

```bash
cd /opt/wallhaze/apps/api
./deploy.sh rollback <旧tag>        # 例：wallhaze/api:v-2026102401
./deploy.sh status                  # 全部 healthy
curl -s https://<域名>/health
```

镜像保留策略：每次 `deploy` 前手动 `docker tag wallhaze/api:latest wallhaze/api:v-<日期><序号>`
（三个镜像同理）；本地构建侧推荐按 git SHA 打 tag 后 `docker save` 传输。

## 2. 应用回滚（新版执行过 migration）

### 2a. migration 是加列/加表（可向后兼容）

直接回滚镜像即可；旧代码忽略新列。`schema_migrations` 保持新版——**不要手工
删除 migration 记录**。

### 2b. migration 破坏性（删列/改类型/不可逆）

1. 停写入：`docker compose stop api worker web`（保留 postgres）。
2. 立即备份现状：`./deploy.sh backup`。
3. 用**上次备份**在一次性容器演练（BACKUP-RESTORE §3），确认含回滚点数据。
4. 恢复路径（唯一支持）：重建**新库对象**后重放备份——
   ```bash
   # 在 postgres 容器内创建一个新 DB，从备份导入，验证后切换 DATABASE_URL
   docker compose exec postgres psql -U $POSTGRES_USER -c \
     "CREATE DATABASE wallhaze_rollback;"
   gunzip -c <backup>.sql.gz | docker compose exec -T postgres \
     psql -U $POSTGRES_USER -d wallhaze_rollback
   # 校验后：改 api.env DATABASE_URL → deploy.sh deploy（api 重启连新库）
   ```
5. 原库保留为 `wallhaze` 不删除，待 7 天观察期后由人工决定处置。

> 项目 migration 现状（v1–v6）均为**新增列/表**，暂无破坏性迁移；未来出现时
> 必须同时提供 down 脚本或"双写过渡"方案，并在本节登记。

## 3. 反向代理/证书回滚

```bash
# 改坏 Caddyfile：
cp Caddyfile Caddyfile.bak.$(date +%s)   # 保持这个习惯
docker compose restart caddy
docker compose logs caddy --tail 50      # acme 错误则检查 DNS/443
```

证书 volume（`wallhaze_caddy_data`）**不删**；删除会重新签发并可能撞限流。

## 4. 数据库故障

- 容器损坏：`docker compose restart postgres` → healthcheck；
  仍失败则 `docker logs wallhaze-postgres-1` 留证，先 `./deploy.sh backup`
  （若还能连），再按 BACKUP-RESTORE §3 灾难恢复路径。
- 数据目录损坏：先 `docker run --rm -v wallhaze_postgres_data:/pg -v $PWD:/out \
  alpine tar czf /out/pg-$(date +%s).tgz /pg` 取证，再走备份恢复。

## 5. 回滚后验证

- [ ] `./deploy.sh status` 全 healthy
- [ ] `/health` 200、首页 200、`/v1/credits/pricing` 200
- [ ] 登录/会话正常（cookie 域未变）
- [ ] `schema_migrations` 与预期一致
- [ ] Community 空态/无 demo；pending 图 404
