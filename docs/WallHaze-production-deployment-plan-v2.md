# WallHaze 生产部署计划 v2 — Waffo 审核链路完整版（2026-10-31）

> 本文档是第二轮 Waffo 整改（Prompt Sift 官方规范重写 + 输出审核 + Gallery 复查 + 部署准备）
> 的正式部署计划。**本文档不自动执行部署**——所有标 🔴 的步骤需要 owner 人工操作与凭据。

---

## 1. 源码包

| 项 | 值 |
|---|---|
| 文件 | `D:\Project\wallhaze-deploy\wallhaze-staging-source-20261031.tar.gz` |
| 大小 / 文件数 | 138,147,896 字节 / 1004 文件 |
| SHA256 | `e784dfa69fab8f007592b64113cd1346c0a76c83f8d32f83216ce26a8c101485` |
| 排除 | `wallhaze/`（受保护用户媒体）、`.git`、`node_modules`、`.next`/`.vinxt`/`dist`/`.turbo`、`.data`（本地 PGlite）、`.cloudflare`、`private-media`、全部真实 `.env*`（仅保留 `*.example` 模板）、`*.tar.gz` |
| 已验证 | 归档内 0 个禁用路径；包含全部审核链路新文件（moderation.ts / blocklist.json / output-moderation.ts / gallery-moderation.ts / gallery-rescan.ts / 008_moderation_logs.sql / pricing 页 / acceptable-use 页 / gallery-manifest.json） |
| 旧包状态 | `wallhaze-staging-source-20261025.tar.gz` **已过期**——早于两轮整改，不可再用于构建 |

上传（owner 执行）：
```bash
scp wallhaze-staging-source-20261031.tar.gz <user>@94.72.126.85:/opt/wallhaze/
ssh <user>@94.72.126.85
mkdir -p /opt/wallhaze/src-20261031 && tar -xzf /opt/wallhaze/wallhaze-staging-source-20261031.tar.gz -C /opt/wallhaze/src-20261031
sha256sum /opt/wallhaze/wallhaze-staging-source-20261031.tar.gz   # 必须与上表一致
```

## 2. 环境变量清单（/opt/wallhaze/secrets/api.env 增量）

模板：`apps/api/.env.staging.example`（已更新）。在既有文件基础上**新增/确认**：

| 变量 | 必填 | 说明 |
|---|---|---|
| `WAFFO_MERCHANT_ID` | 🔴（live 必需） | 已有（支付用）。Prompt Sift **复用同一凭据**（官方文档："uses existing payment API Key"） |
| `WAFFO_PRIVATE_KEY` | 🔴（live 必需） | 已有。RSA-SHA256 请求签名私钥（PEM） |
| `WAFFO_MODERATION_ENDPOINT` | 否 | 默认 `https://api.waffo.ai` |
| `WAFFO_MODERATION_SEMANTIC` | 否 | `off`/`shadow`/`enforce`，默认 `enforce` |
| `WAFFO_MODERATION_REVIEW_MAX_WAIT_SECONDS` | 否 | review 持有重扫预算，默认 120s（≤600） |
| `WAFFO_MODERATION_REVIEW_RETRY_INTERVAL_SECONDS` | 否 | 重扫间隔，默认 30s |
| `OUTPUT_MODERATION_API_KEY` | 🔴（live 必需） | OpenAI Moderation（omni-moderation-latest）密钥。**空 = live 生成的媒体永不落盘/发布** |
| `OUTPUT_MODERATION_ENDPOINT` / `_MODEL` / `_FRAMES` | 否 | 默认 `https://api.openai.com/v1/moderations` / `omni-moderation-latest` / 5 帧（1..10） |
| `FFMPEG_PATH` / `FFPROBE_PATH` | 否 | 默认 `ffmpeg`/`ffprobe`（Docker 镜像内已安装） |
| `GALLERY_RESCAN_MANIFEST_URL` | 🔴（gallery-rescan job） | 例 `https://wallhaze.com/gallery-manifest.json` |

**安全语义（测试覆盖）**：凭据缺失时——prompt 筛选与输出审核均失败关闭；mock 生成不受影响；绝不伪造 allow。

**参考图输入审核（本轮新增）**：LIVE 模式下，用户上传的参考图（图片编辑 refImage、图生视频源图/源作品）在**创建任务入口**先经输出审核服务检测：block → 422 `CONTENT_FILTERED` 拒绝（不创建任务、不预留积分）；不可筛查 → 503 失败关闭；mock 模式豁免。判定写入 moderation_logs（内容哈希伪 id，不存图像）。

**Gallery 违规自动隔离（本轮新增）**：`npm run moderation:scan-gallery -- --isolate` 对 block 判定的社区作品**自动隐藏**：公开文件移入 `private-media/moderation/quarantine/`（字节保留，永不删除）+ works.json 状态翻转 `withdrawn`（页面/sitemap/manifest 全部停止展示）；注册表管理的资产（预置壁纸/风格预览/演示视频）记录后交由既有媒体版权隔离 CLI 处理。审计日志记录人工恢复路径（移回文件 + 状态翻回 published）。API 侧定时复查发现违规时记 `flagged_for_takedown` 并以退出码 2 告警。

**输出审核覆盖范围（如实声明）**：OpenAI Moderation omni 模型在**图像**上可测类别为 sexual、violence(/graphic)、self-harm；`sexual/minors`、`hate`、`harassment`、`illicit` 仅支持文本输入（文本侧已由 Waffo Prompt Sift + 本地词库双层覆盖）；该 API **不支持**深伪与版权侵权判定（官方明确不可用于 CSAM 检测）。深伪/版权/疑似 CSAM 一律走人工复核与举报通道（hello@wallhaze.com），AUP 页面已如实写明。

## 3. 数据库兼容性与迁移

- 迁移 008（moderation_logs）：`id uuid DEFAULT gen_random_uuid()` 需要 **PG13+**；compose 使用 `postgres:17-alpine` ✅。
- 仅**增量**迁移（CREATE TABLE/INDEX，无改动、无删除），与 v1–v7 共存。
- 应用方式不变：API 镜像启动时 `migrate()` 自动执行；deploy.sh 的 migrate 步骤先于 api 启动。

**备份与回滚（既有机制，确认可用）**：
- 备份：`./deploy.sh backup`（jobs 容器内 pg_dump → wallhaze_app_backups 卷）+ crontab-runner 每日备份。
- 迁移前手动备份（🔴 owner 执行）：`./deploy.sh backup` 并确认 dump 文件存在且 >0 字节。
- 回滚：镜像回滚 `./deploy.sh rollback`（用上一镜像重启 app 服务）；schema 回滚 = 用备份恢复（008 是新表，回滚旧镜像时该表残留无害——旧代码不引用）。

## 4. 后端部署步骤（Contabo VPS，owner 人工执行）

```bash
cd /opt/wallhaze/src-20261031/apps/api
# 0) 凭据就位：/opt/wallhaze/secrets/api.env 增加第 2 节的 🔴 变量
# 1) 构建（ffmpeg 已加入镜像——输出审核视频帧提取依赖它）
docker build -f apps/api/Dockerfile -t wallhaze/api:latest /opt/wallhaze/src-20261031
cd /opt/wallhaze/src-20261031/apps/api
# 2) 备份
./deploy.sh backup
# 3) 部署（postgres → migrate → api → worker）
./deploy.sh deploy
# 4) 定时任务（profiles: retention；含新增 gallery-rescan）
docker compose --profile retention up -d db-retention media-retention gallery-rescan
# 5) 验证
./deploy.sh status
curl -s http://127.0.0.1:4000/healthz
docker logs wallhaze-app-api-1 --tail 50      # 确认 migrate 日志 + 无 boot 报错
docker compose --profile retention ps          # 3 个 retention 服务 Up
```

**端口审计**：deploy.sh 维持 `127.0.0.1:4000` 唯一发布端口；host Nginx（api.wallhaze.com）不变、不改 DNS。

## 5. 前端部署步骤（Cloudflare Workers）

```bash
# 本地或 CI（需 owner 授权）
cd apps/web
npm run build:vinext && npm run deploy:vinext     # VINEXT_KV_CACHE 绑定不变
```
- 新增公开文件随构建发布：`/gallery-manifest.json`（81 项，见下）、`/pricing`、`/acceptable-use`、sitemap 双入口。
- **发布 manifest 前置**：`SITE_URL=https://wallhaze.com npm run community:manifest`（已生成 apps/web/public/gallery-manifest.json，构建时打包）。

## 6. 两阶段发布策略（本轮确定）

**阶段一（合规页面与代码上线，生成保持关闭）**
- 部署源码包（第 1 节）+ 执行后端 `deploy.sh deploy` 与前端 `build:vinext && deploy:vinext`。
- `PAYMENT_PROVIDER=disabled`（支付关闭）、`GENERATION_PAUSED=1` 或成本预算保持 0（生成暂停）、`FAL_LIVE_ENABLED`/`FAL_VIDEO_LIVE_ENABLED` 为空。
- 不修改用户余额、历史数据、DNS。可公开验证：`/pricing`、`/acceptable-use`、Terms 六类禁止内容、模型披露、gallery-manifest。
- `OUTPUT_MODERATION_API_KEY`/`WAFFO_*` 未配置也不影响阶段一：无 live 生成流量，审核链处于安全关闭态。

**阶段二（凭据接入 + 真实联调 + 受控验证，验证通过后才评估开放生成）**
1. 注入 `WAFFO_MERCHANT_ID`/`WAFFO_PRIVATE_KEY`（Prompt Sift）与 `OUTPUT_MODERATION_API_KEY`（OpenAI 输出审核）。
2. 真实接口联调（第 7 节命令）：一次低成本图片任务走完 Prompt Sift → fal → 输出审核全链；验证 blocked prompt（不调 fal、积分释放）、review hold 超时（MODERATION_PENDING）、参考图拒绝（422）。
3. 受控测试：正常 allow 场景 + 异常场景（断开 Waffo 出口→任务失败关闭；违规 prompt→拦截；违规输出→不发布）。
4. 生产成本限额验证：`PLATFORM_DAILY_COST_LIMIT_MICROS`/`USER_DAILY_COST_LIMIT_MICROS` 设为**明确的小额上限**（例如平台 $5/日、单用户 $1/日）——**不得设为无限额**，验证预算拒绝路径。
5. gallery-rescan 首轮运行 + moderation_logs 抽查。
6. 全部通过后，owner 决定是否开放真实生成（先 `GENERATION_PAUSED=0` + 小额预算灰度，**不一次性开放全部用户**）。

## 6.1 上线前人工操作清单（🔴 全部 owner）

1. **Waffo 商户凭据**：确认 `WAFFO_MERCHANT_ID`/`WAFFO_PRIVATE_KEY` 为 Waffo 正式值（Prompt Sift 与支付共用；beta 期 scan-prompt 免费）。
2. **OpenAI Moderation key**：创建并注入 `OUTPUT_MODERATION_API_KEY`（输出审核关闭 = live 生成不可用，这是设计行为）。
3. **支付**：保持 `PAYMENT_PROVIDER=disabled` 直至 Waffo 复审通过；`/pricing` 购买按钮保持诚实禁用态。
4. ** budgets**：`PLATFORM_DAILY_COST_LIMIT_MICROS`/`USER_DAILY_COST_LIMIT_MICROS` 从 0 调整为实际值——必须与输出审核 key 就位**同时**进行。
5. **FAL live 开关**：`FAL_LIVE_ENABLED=1`/`FAL_VIDEO_LIVE_ENABLED=1` 仅在 1–4 完成后开启。
6. **gallery-rescan**：前端发布后确认 `https://wallhaze.com/gallery-manifest.json` 可访问，再启动该服务。
7. **Git 提交**：两轮整改的变更尚未提交（owner 决定提交切分与信息）。
8. **基线扫描（可选但建议）**：本地 `npm run moderation:scan-gallery` 跑一次 81 项全量基线，报告存 `private-media/moderation/`。

## 7. 部署后验证

```bash
# 输入审核链路（mock 模式不可测——live 才走 Waffo；用 1 个低成本图片任务验证）
# 期望：Waffo scan-prompt 调用出现；moderation_logs 出现 pre_generation 行
docker exec wallhaze-app-postgres-1 psql -U wallhaze -c \
  "SELECT stage,service,action,disposition FROM moderation_logs ORDER BY created_at DESC LIMIT 5;"
# gallery-rescan 首轮
docker logs wallhaze-app-gallery-rescan-1 --tail 20
```

## 8. 已知限制（明确声明，不含假设）

- **Waffo 无 pending 查询/回调接口**（llms.txt 全索引核实：content-safety 仅有 scan-prompt）。官方 review 处理 = "hold and retry"，本实现为有界持有（默认 120s）→ 超时任务以 `MODERATION_PENDING` 结束并释放积分，`requestId` 入库供人工向 Waffo 申诉。
- **输出审核服务为 OpenAI Moderation API**（Waffo AIGC 文档允许自建输出审核；Waffo 内容安全 API 仅 prompt）。视频覆盖 = 均匀采样默认 5 帧 × 全图审核；帧提取失败（无 ffmpeg）→ 失败关闭。
- **fal.ai `enable_safety_checker: true`** 保留为服务商侧第一层（FLUX 系列）；它不替代本实现——输出字节在存储前仍由本链路审核。
- poster（I2V）是用户输入参考图的回显，属输入而非输出，不在输出阶段重复审核。
- 本地开发机无 ffmpeg：帧提取的真实执行在 Docker 镜像内验证（镜像已安装 ffmpeg，构建后实测 `ffmpeg -version` 可用）；本地仅验证失败关闭语义（测试覆盖）。抽帧覆盖首帧、末帧与均匀中间帧（`frameOffsets` 单测锁定）。
