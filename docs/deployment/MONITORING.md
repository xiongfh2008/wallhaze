# 轻量监控方案（8 GB VPS 友好）

> 原则：不引入 Prometheus+Grafana 全栈（~1 GB+ 内存）。用"结构化日志 +
> 健康探针 + 外部拨测 + 通知渠道"四层，内存成本 <50 MB。

## 1. 已内建（部署自带）

| 信号 | 来源 |
|---|---|
| 服务存活 | compose healthcheck（api `/health`、web `/`、pg `pg_isready`、worker/caddy/jobs 探针） |
| AI 请求结果 | api JSON 日志 `outcome: upstream:timeout/upstream:failed/rejected:*` |
| 支付 webhook | `payment webhook` 相关日志行 |
| 备份成败 | jobs.log `daily backup ok/FAILED`、integrity check 行 |
| 30 天清理 | jobs.log 每 30 分钟 dry-run 计数（启用删除后为实删计数） |
| 迁移失败 | api 启动 fatal 日志（boot 即失败，docker restart 策略可见） |

查看：`./deploy.sh logs api|worker|jobs|caddy`；备份日志
`docker compose exec jobs cat /backups/jobs.log`。

## 2. 主机层（VPS 上 cron + 阈值，A 配置）

`/opt/wallhaze/backups/host-monitor.sh`（每 5 分钟，cron）：

```sh
#!/bin/sh
ALERT=/opt/wallhaze/backups/alert.log
notify() { echo "[$(date -u +%FT%TZ)] $*" >> "$ALERT"; }  # TODO: 接通知渠道
# 磁盘 >80%
df -P / | awk 'NR==2 {gsub("%","",$5); if ($5>80) notify("disk " $5 "%")}'
# 内存 >90%
free | awk '/Mem:/ {u=$3/$2*100; if (u>90) printf "%s mem %.0f%%\n", strftime("%FT%TZ"),u >> "'"$ALERT"'"}'
# 容器非 healthy
for s in caddy web api worker postgres jobs; do
  st=$(docker inspect -f '{{.State.Health.Status}}' wallhaze-$s 2>/dev/null)
  [ "$st" = "healthy" ] || notify("container $s: $st")
done
# 备份新鲜度：24h 内必须有今日备份
find /var/lib/docker/volumes/wallhaze_pg_backups/_data/daily -mtime -1 | grep -q . || notify "backup stale >24h"
```

> `notify()` 目前只落盘。**未接入真实通知渠道前，不宣称告警已上线**（见 §3）。

## 3. 通知渠道（A 任选其一接入 notify()）

| 渠道 | 做法 |
|---|---|
| 邮件（推荐起步） | `msmtp` + Gmail 应用密码；`notify(){ echo "$@" \| mail -s "[wallhaze] alert" xiongfh2000@gmail.com; }` |
| Telegram Bot | curl `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>&text=...` |
| 企业微信/钉钉 | webhook curl POST |
| Uptime 拨测 | Cloudflare Health Checks / UptimeRobot 监控 `https://域名/health`（免费，主机之外独立探测） |

配置后发一条测试告警确认可达，才算"告警上线"。

## 4. 业务指标（无额外组件，从日志抽取）

需要时用 `deploy.sh logs` + grep 组合，或后续加一个 30 行的 log-tail 脚本：

- AI Job 失败率：`logs api | grep -c 'outcome: upstream:failed'`（对比总数）
- fal.ai 费用：预算账本在 VPS 外（本地生成脚本）；线上费用以 fal 控制台 +
  `PLATFORM_DAILY_COST_LIMIT_MICROS` 硬限兜底；到达上限时 API 返回
  `rejected:daily-budget`（日志可查）。
- Credits 异常：`credit_ledger` 变动在支付 webhook 路径有日志；Wallet 对账
  `npm run ops`（reconcileAll）已有。
- R2 错误：adapter 落地后按调用失败日志（尚未实现）。

## 5. 资源基线

`docker stats --no-stream` 每日一次可写进 host-monitor 输出，供
VPS-RESOURCE-REPORT 的实测数据回填。
