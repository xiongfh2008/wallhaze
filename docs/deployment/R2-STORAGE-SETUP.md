# R2 对象存储接入（Cloudflare R2）

## 1. 现状与结论（2026-10-24 更新）

- **R2 adapter 已实现并通过离线测试**：`apps/api/src/business/r2-storage.ts`
  （零新依赖：原生 fetch + SigV4，`r2-sign.ts`）实现 `PrivateStorage`
  put/get/delete，与 Memory/LocalStorage 同一契约（含 MIME/魔数校验）。
- 接入开关：`STORAGE_DRIVER=r2`（默认 local）；凭据不全时**拒绝启动**
  （fail-closed）。env 变量：`R2_ENDPOINT / R2_ACCESS_KEY_ID /
  R2_SECRET_ACCESS_KEY / R2_BUCKET`（+预留 `R2_PUBLIC_BUCKET`），**API 与
  Worker 都要配置**（二者共享 secrets/api.env）。
- 离线测试：`tests/r2-adapter.test.ts`（7 项：SigV4 编码/确定性、fail-closed、
  endpoint 校验）。
- **Staging 连接验收**（站长已备好两个桶）：见 §7 的一条命令。
- LocalStorage 过渡仍为首次部署默认；验收通过后切 `STORAGE_DRIVER=r2`。

## 2. 站长侧：开通 R2（一次性）

1. Cloudflare Dashboard → R2 → Create bucket：
   - `wallhaze-media`（私有，Object Storage）
   - Location: Automatic；禁止公开访问（所有读取走签名 URL 或反代鉴权）。
2. R2 → Manage API Tokens → Create：仅授权 `wallhaze-media` 的 Object Read & Write。
3. 记录：Account ID、Access Key ID、Secret、Endpoint `https://<account>.r2.cloudflarestorage.com`。
4. 生命周期规则（可选）：`tmp/` 前缀 1 天过期（未来上传临时区）。
5. 凭据写入 `/opt/wallhaze/secrets/r2.env`（chmod 600）。

## 3. 媒体分类与隔离策略（实现时的目标键位）

| 类别 | 前缀 | 访问方式 |
|---|---|---|
| 用户私有作品（30 天保留） | `media/<jobId>/asset.<ext>` / `poster.jpg` | 仅签名 URL（现有 HMAC 机制迁移为 R2 预签名或反代签发） |
| Community 仅供欣赏原图 | `community/originals/<slug>.<ext>` | **永不公开**；仅站长线下取用 |
| Community 已审核公开文件 | `community/downloads/<slug>.<ext>` | 公开读（bucket 内该前缀可读或反代） |
| 审核中素材（旧 39 张等） | 不上 R2（保持本地私有目录） | 隔离不变 |
| 临时上传 | `tmp/<uuid>` | 生命周期 1 天删除 |
| 数据库备份 | 独立 `wallhaze-backups` 桶 | 见 POSTGRESQL-BACKUP-RESTORE.md |

## 4. 容量约束（LocalStorage 过渡期的硬限制）

100 GB SSD 分配：系统+镜像 ~15G、Postgres ~10G、备份 volume 滚动 ~5G、日志 <1G、
**媒体上限 ~40G**。按 5s 视频 ≈2–10MB、图片 ≈0.2–1MB 估算，可支撑早期运营；
到达 30G（`df` 告警线）前必须完成 R2 迁移。

## 5. 访问路径与旧图隔离

- 生产 web 镜像已验证：只含 8 张 cleared 风格图；31 张 review-pending 与 demo 媒体
  不在镜像内（`docker run --rm wallhaze/web:latest ls ...` 实测）。
- 接入 CDN 后需要对 `/images/styles/*` 做一次 Purge（见 CLOUDFLARE-DNS-SSL.md §5），
  防止历史缓存的旧 URL 绕过源站 404。
- 图片代理 `/v1/images/proxy` 的 allowlist 不含 R2；实现 R2 时把
  `packages/contracts/src/images.ts` 的 `IMAGE_PROXY_ALLOWED_HOSTS` 增加签名域名或改为
  纯预签名 URL 方案。

## 6. 剩余实施项（adapter 已完成后的后续）

已落地：SigV4 模块、R2Storage（put/get/delete + 校验）、env schema、
server/worker fail-closed 接线、离线测试、验收脚本。仍待做：


1. 视频 Range 对外路径：签名 URL 直连 R2（原生支持 Range），或 Nginx
   `location /v1/media/` 反代 R2（带访问校验）——路由层工作。
2. 30 天清理在 R2 驱动下的 staging 全套重跑（adapter delete 已透传，语义不变）。
3. 迁移脚本：把 volume 内既有 LocalStorage 对象逐条搬上 R2 并校验 SHA-256。
4. 公共媒体管线：`R2_PUBLIC_BUCKET` 的写入路径（Gallery/Community 公开文件）。

## 7. Staging 连接验收（站长执行，一条命令）

```bash
cd apps/api
# 方式 A：临时环境变量
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com R2_ACCESS_KEY_ID=<Access Key ID> R2_SECRET_ACCESS_KEY=<Secret> npm run r2:test

# 方式 B：本地凭据文件（不入 Git；.gitignore 已含 .env.r2-test）
#   echo "R2_ENDPOINT=..." > .env.r2-test  等，然后：
npm run r2:test
```

脚本 `scripts/r2/r2-connect-test.mts` 只碰 `deployment-test/<日期>-<随机>/`
前缀；对两个桶各做 PUT→HEAD→GET(校验字节)→DELETE→404 复验；私有桶匿名
访问必须 401/403（400 仅当 S3 XML 错误码属鉴权类且响应零文件字节时才算
通过——先上传真实对象、签名 GET 作对照，再发无凭据请求）；MP4 上传后
HEAD 元数据、Range bytes=0-99（206+精确字节）、整段下载+probe 尺寸/时长、
单对象删除。HEAD/GET 仅对网络错误与 5xx 做最多 3 次有界重试（PUT/DELETE
单发不重试）；网络错误按 cause 链分类为 TIMEOUT/DNS/TLS/CONN_RESET/NETWORK
并脱敏输出；创建的对象在正常/异常/SIGINT 路径统一清理。输出脱敏报告
（账号 ID 掩码、密钥绝不打印），任一 FAIL 退出码非 0。凭据缺失时直接
ABORT，不伪造成功。

2026-10-25 二轮实测（17/18）后定稿：私有桶 HEAD 已由有界重试修复；
唯一余项"匿名 GET 400 InvalidArgument"经核实为 **R2 S3 API 对无签名请求
的协议性拒绝**（签名对照组在同一 URL 上 200 成功，排除构造问题；官方
错误码文档未覆盖此场景，属 R2 与 AWS S3 的行为差异）。验收口径（已实
现于 `src/business/r2-errors.ts` 分类器，附 9 项离线单测）：

- 目标 A（S3 API 未授权访问）：签名 GET 成功 + 匿名 GET 无 2xx、零文件
  字节 → 通过；400+InvalidArgument 记为 "protocol-rejection-unsigned"
  （对象未取得），并注明**不单独证明 Bucket ACL**；400+其他码 → 判
  "构造可疑" FAIL；404 → "鉴权状态不明" FAIL。双桶（public/private）都
  探测。
- 目标 B（Bucket 公共访问关闭）：S3 API 探测无法证明 r2.dev/自定义域名
  层的状态（该层与 S3 endpoint 独立，且 S3 token 无权查询）。以站长在
  Dashboard 的确认为准：两桶 Public Development URL（r2.dev）与自定义
  域名均未启用；应用侧私有媒体仅经签名 URL（HMAC+时效+30 天门禁）。
- 清理完整性：cleanup 逐 key 打印删除结果并计数，另以 **LIST（仅限
  本次 `deployment-test/<RUN>/` 前缀）验证为空**，不再以 0ms 记录代替
  证明。
