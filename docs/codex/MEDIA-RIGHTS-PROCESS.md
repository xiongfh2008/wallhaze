# WallHaze 媒体版权下架与复核流程（最小可用）

- 适用范围：`apps/web` 的静态 Gallery、风格预览、动态演示及其派生 Poster/帧；用户生成作品仍走 API 私有存储与 30 天保留。
- 权威数据：`apps/web/data/media-rights.json`（82 项资产，逐文件哈希）。
- 可读清单：`docs/codex/MEDIA-ASSET-INVENTORY.md`。
- 隔离目录：`apps/web/private-media/review-pending/`（不在 `public/`，Next.js 不提供）。

## 状态与字段

| 字段 | 含义 |
|---|---|
| `reviewStatus` | `pending` / `verified` / `restricted` / `rejected` / `removed` |
| `canPubliclyDisplay` | 是否允许公开展示；服务端以文件是否在 `public/` 为最终边界 |
| `canOfferDownload` | 是否允许提供下载；不等于版权本身 |
| `publiclyAccessible` | 当前文件是否由本站公开提供 |
| `privatePath` | 隔离副本路径（若非公开） |
| `sourceUrl` / `licenseUrl` / `licenseEvidence` | 来源、许可与证据 |
| `parentAssetIds` | 派生关系（Poster/MP4 → 源帧） |
| `reviewedAt` / `reviewedBy` | 人工复核记录 |

`pending` 和 `restricted` 资产不得出现在 `public/`，不得有公开图片 URL、OG image、JSON-LD `contentUrl`、sitemap 条目或下载入口。

## 投诉/下架 7 步

1. **记录投诉**：投诉人、联系方式、涉事 URL、资产 ID、权利主张、证据附件。
2. **定位资产与派生版本**：在 `apps/web/data/media-rights.json` / `MEDIA-ASSET-INVENTORY.md` 查 `assetId`、原 URL、`parentAssetIds`；若涉及风格图，同时检查引用该图的 Gallery 卡片、Poster、MP4 和详情页。
3. **暂停公开访问**：
   ```bash
   node scripts/media/rights-admin.mjs takedown \
     --asset style.<id> \
     --reviewer <name> \
     --reason "<complaint id + summary>"
   ```
   对派生资产逐个执行（当前不自动级联，避免误伤）；远程 `remote.*` 资产无本地文件，直接把状态改为 `restricted`/`removed` 并重建。
4. **保存证据**：`private-media/review-pending/audit-log.jsonl` 记录操作、时间、执行人、原因；原始文件、哈希、隔离路径留在 `private-media/`。
5. **人工复核**：核对原作者、原页面、许可证、许可范围、改编/署名义务、肖像/商标/建筑等非版权权利。不得仅凭 API `LicenseShortName` 自动放行。
6. **记录结论并恢复**：
   - 批准公开展示且允许下载：
     ```bash
     node scripts/media/rights-admin.mjs restore --asset style.<id> \
       --reviewer <name> --decision verified --license CC0-1.0 \
       --license-url <url> --evidence "<Commons page + archived evidence>" \
       --reason "<review conclusion>"
     ```
   - 只允许展示、不允许下载：追加 `--display-only`。
   - 拒绝：`--decision rejected`（文件保持隔离）。
7. **验证**：
   ```bash
   cd apps/web
   npm run rights:check
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   重建后实测原 URL 应 404，批准后的 URL 应 200；如生产有 CDN/反向代理，必须清理对应缓存。

## 约束

- 不删除隔离文件；不把 pending 文件手工拷回 `public/`。
- 不自动把 `review-pending` 改为 `verified`。
- 外部 AI 生成 URL 不在本站控制范围；只能移除引用并记录为 `restricted`。
- 当前流程是本地 CLI + 静态数据重建，没有管理后台；生产若需要多审核员并发，需接数据库和审计后台。
