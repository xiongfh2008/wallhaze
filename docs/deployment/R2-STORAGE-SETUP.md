# R2 对象存储接入（Cloudflare R2）

## 1. 现状与结论

- **代码中尚无 R2/S3 适配器**。`apps/api` 只有 `LocalStorage`（JSON+base64 文件）与
  `MemoryStorage`，接口为 `PrivateStorage`（put/get/delete）。
- 本轮部署准备**未实现 R2 adapter**（代码改动超出部署准备范围且需要站长先开通 R2）。
  首次部署使用 `STORAGE_DIR=/app/.data/media` + Docker volume——功能完整但媒体存放在
  VPS 磁盘，100 GB 容量约束见下。
- **这是上线路径上的最大技术缺口**，实施清单见 §6。

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

## 6. R2 adapter 实施清单（下一轮开发任务）

1. 新增 `apps/api/src/business/r2-storage.ts`：实现 `PrivateStorage` 接口
   （S3 兼容 API，`@aws-sdk/client-s3` SigV4；新增依赖需站长批准）。
2. env 增加 `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET/R2_BUCKET/R2_ENDPOINT`（zod 校验，
   production + 未配置 → fail-closed 与 IMAGE_URL_SECRET 同模式）。
3. `storage.ts` 工厂：`STORAGE_DRIVER=r2|local`；worker 与 api 必须同驱动。
4. 视频 Range 支持：签名 URL 直连 R2（R2 原生支持 Range），或反代 `handle /media/*`
   反向代理到 R2（带访问校验）。
5. 30 天清理：`media-lifecycle.ts` 的删除调用改为 adapter 透传；`delete_failed` 重试
   语义保持；dry-run 开关逻辑不变。
6. 隔离测试：本地 MinIO 或 rclone serve 模拟 S3；put/get/delete/Range/大文件/MIME
   校验 + `media-lifecycle` 全套测试在 R2 驱动下重跑。
7. 迁移脚本：把 volume 内既有 `LocalStorage` 对象逐条搬上 R2 并校验 SHA-256。
