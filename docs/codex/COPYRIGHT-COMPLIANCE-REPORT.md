# WallHaze 全站媒体版权合规审计与整改报告

- 日期：2026-10-24
- 范围：`apps/web` 的 Gallery、风格预览、动态演示、详情页、sitemap/结构化数据；`apps/api` 用户作品边界；`packages/contracts` 类型检查
- 结论：**旧 39 张 review-pending 壁纸的公开原图访问已实际关闭（31 个本地文件隔离、8 个外部 URL 移除引用），全站 82 个媒体资产建立资产级 registry、哈希、展示/下载权限和复核流程。** 未删除任何旧文件，未把任何 pending 资产升级为 verified，未调用付费 AI，未部署。

## 1. 审计资产总数

| 指标 | 数量 |
|---|---:|
| 登记资产总数 | **82** |
| `verified`（CC0/自绘，允许公开） | **43** |
| `pending`（旧本地素材，已隔离） | **31** |
| `restricted`（旧外部 AI URL，已移除引用） | **8** |
| `rejected` / `removed` | 0 / 0 |
| Gallery 静态作品 | **57**（18 可公开，39 pending 占位） |
| 动态演示 | **8 条 MP4 + 8 Poster + 8 源帧 = 24 个派生资产** |

机器可读：`apps/web/data/media-rights.json`；完整表：`docs/codex/MEDIA-ASSET-INVENTORY.md`。

## 2. 每种来源资产的数量

| sourceType | 数量 | 说明 |
|---|---:|---|
| `wikimedia-cc0` | 40 | 10 张壁纸文件 + 6 张风格图 + 24 个视频/Poster/源帧派生资产 |
| `self-authored` | 3 | `soft-gradient`、`abstract-light`、`light-ribbons-wide`，本地脚本绘制 |
| `legacy-local-unknown` | 31 | 旧本地风格预览；无逐文件授权证据，已隔离 |
| `external-ai-unknown` | 8 | 6 个旧外部风格 URL + 2 个已退役 hero/demo URL；无 provider/model/输出权利证据 |

## 3. 授权分类

| 授权 | 数量 | 状态 |
|---|---:|---|
| CC0 1.0 | 40 | 有 Commons 来源、作者、许可 URL、实时核验日期与证据 |
| Public Domain（非 CC0） | 0 | 本轮未使用 |
| CC BY | 0 | 本轮未使用 |
| CC BY-SA | 0 | 本轮未使用 |
| Self-authored | 3 | 本地程序化绘制，无第三方源 |
| 无法确认 | 39 | 31 个旧本地文件 + 8 个外部 AI URL |

CC0 的 `Copyrighted=True` 元数据与 CC0 不矛盾；授权依据是 `LicenseShortName=CC0`，不是“看起来免费”。本轮没有把 AI 生成自动视为独占版权。

## 4. 授权无法确认的数量

- **31 个旧本地风格文件**：没有逐文件来源/许可证据；已移入 `apps/web/private-media/review-pending/styles/`。
- **8 个旧外部 AI URL**：provider/model 条款、训练/输入权利、输出独占性均无法核实；已从导出目录、首页和 Studio 预览中移除引用。
- 合计 **39 个资产**无法确认合法公开使用，全部不具备公开展示或下载权限。

## 5. 潜在第三方权利风险

- 39 个未确认资产：可能包含角色、商标、可识别人物或受保护风格；列表/清单已标记 `thirdPartyRights`。
- 16 张 CC0 照片：版权已解决；其中香港街景可能含远处人物/招牌，极简室内已裁掉建筑书封面。CC0 不自动清除肖像、商标、建筑外观等非版权权利，manifest 已记录，仍需逐张商用审查。
- 3 个自绘资产：未发现第三方源；仍建议保留绘制脚本与时间戳作为作者证据。

## 6. 已整改的公开访问问题

1. **31 个旧本地原图迁出 `public/`**：移动到 `private-media/review-pending/styles/`，Next.js 不再提供；原 URL 实测 **31/31 = 404**。
2. **8 个旧外部 URL 移除引用**：导出的 `WALLPAPER_STYLES` 不再包含这些 URL；首页 hero、Studio sample、`nebula-city`/`astral-drift` 不再引用旧远程图。
3. **旧 39 张 Gallery 卡片改为占位**：不再请求任何原图/远程图，显示“版权审核中”。
4. **旧 39 张详情页改为占位**：0 个 `<img>`、无 OG image、无 JSON-LD `contentUrl`、无下载按钮，`noindex, nofollow`。
5. **sitemap 只保留 18 个已清除作品**，pending 页面不再出现在 sitemap。
6. **`poppy-field` 修正**：此前错误引用旧 `photography.jpg`，现已改为 `/images/wallpapers/poppy-field.jpg`，与 CC0 来源记录一致。
7. **`/_next/image` 代理验证**：pending 原图 404；verified 原图仍 200，正常预览/下载不回归。
8. **首页视觉替换**：hero 改为 CC0 Carina 星云，Studio sample 改为 CC0 樱花；不再展示无法核实的远程 AI hero。
9. **风格预览**：只有 8 个有 CC0/自绘证据的风格保留图片；原本有图的 37 个未核实风格（31 个旧本地 + 6 个旧远程）回退到明确的渐变占位；另有 9 个从未提供预览图的风格也继续使用渐变。全站 0 破损图片。

## 7. 旧 39 张图片的最终隔离情况

| 组成 | 数量 | 当前状态 |
|---|---:|---|
| 旧本地风格源文件 | 31 | 移入 `private-media/review-pending/styles/`；哈希/字节数/原路径记录；原 URL 404 |
| 旧外部风格 URL | 6 | 从导出目录移除；仅保留审计记录，状态 `restricted` |
| 旧 hero/demo 远程 URL | 2 | 从代码/UI 移除；状态 `restricted` |
| 合计 | **39** | 全部不公开展示、不提供下载；仍为 `review-pending`/`restricted`，未升级 |

隔离映射：`apps/web/private-media/review-pending/manifest.json`；31 条原始文件与哈希均在 `audit-log.jsonl` 记录。没有不可逆删除。

## 8. 原始 URL 实测结果

| 测试 | 结果 |
|---|---|
| 31 个隔离文件原 URL | **31/31 → 404** |
| 43 个允许公开的文件 | **43/43 → 200** |
| `/_next/image` pending 样例 | 404 |
| `/_next/image` verified 样例 | 200 |
| pending 详情 | `<img>` = 0；`og:image` = 0；JSON-LD = 0；robots = `noindex, nofollow` |
| verified 详情（poppy-field） | 7 个 `<img>` 全部为已登记公开资产；OG/JSON-LD 存在；下载可用 |
| sitemap 壁纸 URL | 18（仅 cleared） |
| Gallery 页面 | 33 个 `<img>`，0 个 pending/远程路径；39 个“版权审核中”占位 |
| 破损图片检查 | `/zh`、`/zh/wallpapers`、pending/verified 详情、`/zh/studio` 均为 0 |

截图证据（`docs/codex/screenshots/copyright-audit/`）：

- [Gallery 首屏](screenshots/copyright-audit/gallery-1440-top.png)
- [Gallery 手机分组：39 个审核占位](screenshots/copyright-audit/gallery-1440-static-pending.png)
- [390 手机分组占位](screenshots/copyright-audit/gallery-390-static-pending.png)
- [pending 详情：无图、无下载](screenshots/copyright-audit/detail-pending-1440.png)
- [verified 详情：罂粟花 CC0、来源、下载](screenshots/copyright-audit/detail-verified-1440.png)
- [首页 hero 使用 CC0 星云](screenshots/copyright-audit/home-1440.png)
- [首页精选全部为 cleared 作品](screenshots/copyright-audit/home-1440-featured.png)
- [Studio 风格占位与渐变预览](screenshots/copyright-audit/studio-1440.png)

## 9. 新媒体版权证据完整性

- 15 个 Wikimedia Commons 来源、24 个派生输出：**24/24 `licenseVerified=true`、全部 CC0、0 失败**。
- 证据字段：来源文件页、原图 URL、作者、许可 URL、核验时间、原始尺寸、裁切锚点、改编说明、分发范围、第三方权利说明、SHA-256。
- 视频/Poster/源帧继承 CC0 来源记录；MP4 标注“5 秒静音 H.264 + 本地镜头/粒子合成，非 AI 生成”。
- 自绘资产标注 `self-authored`，无第三方 `sourceUrl`，不伪装成 CC0 或 AI 生成。

## 10. AI 生成资产的权利边界

- 当前公开 Gallery 的 57 张静态作品和 8 条动态演示中，**没有真实 AI 生成资产**；8 条视频是 CC0 照片加本地合成，不是 AI 视频。
- 旧 6 个远程风格 URL 和 2 个退役 hero/demo URL 是外部 text-to-image 输出，无法核实模型/条款/独占性；已标记 `restricted`，不再公开引用。
- 用户生成作品：私有、30 天保留、签名 URL；没有“生成成功即公开”的路径，也没有自动进入 Gallery。
- fal.ai/模型输出不被自动视为独占版权；真实 AI 上线前仍需 provider 条款、模型版本、输入权利、内容安全和商用授权复核。

## 11. 下载和展示权限的实现方式

- 数据模型：`reviewStatus`、`canPubliclyDisplay`、`canOfferDownload`、`publiclyAccessible`、`privatePath`、`sourceUrl`、`licenseUrl`、`licenseEvidence`、`parentAssetIds`、`reviewedAt/reviewedBy`。
- **真正的访问边界是文件位置**：允许的文件在 `public/`；pending/restricted 文件不在 `public/`，由 Next.js 返回 404。客户端字段只用于 UI 和测试，不作为安全控制。
- 旧 39 张：`image = null`；Gallery 卡片/详情页不渲染 `<img>`；无下载入口。
- 已清除 18 张：`image` 为公开路径；`canPubliclyDisplay=true`、`canOfferDownload=true`；详情页显示来源/许可，下载原始文件。
- 任何状态变更必须走 `scripts/media/rights-admin.mjs` 并写 `audit-log.jsonl`；不能手工把 pending 文件拷回 `public/`。
- `npm run rights:check` 校验 registry、文件存在性、哈希、公开/私有位置；测试 `tests/media-rights.test.ts` 覆盖 82 项分类、39 张 pending 无图、31 个隔离映射、CC0 证据完整性。

## 12. 修改文件清单

**数据/权限**
- `apps/web/data/media-rights.json`（新增，82 项）
- `apps/web/lib/media-rights.ts`（新增）
- `apps/web/private-media/review-pending/manifest.json`（新增，31 项映射）
- `apps/web/private-media/review-pending/audit-log.jsonl`（新增，31 条隔离记录）
- `apps/web/private-media/README.md`（新增）

**媒体迁移**
- 31 个文件从 `apps/web/public/images/styles/` 移到 `apps/web/private-media/review-pending/styles/`（无删除）

**代码/UI**
- `apps/web/lib/styles.ts`：移除旧远程/本地未核实图片字段；只保留 8 个 cleared 风格图；hero/demo 改为 CC0 本地图
- `apps/web/lib/wallpapers.ts`：`image: string | null`；新增 `reviewStatus/canPubliclyDisplay/canOfferDownload`；39 张 pending 不产生图片 URL；修正 `poppy-field`
- `apps/web/components/ui/ImageCard.tsx`、`components/FeaturedWallpapers.tsx`、`components/WallpaperBrowser.tsx`：空图占位与“审核中”标签
- `apps/web/components/TrendingMarquee.tsx`：只用 8 个 cleared 风格图
- `apps/web/app/[locale]/wallpapers/[slug]/page.tsx`：pending 无图、无 OG/JSON-LD、noindex；verified 保持来源/下载
- `apps/web/app/sitemap.ts`：仅 18 个 cleared 作品
- `apps/web/messages/{en,zh,ja,ko,es,fr,de}.json`：新增审核占位/受限文案
- `apps/web/package.json`：新增 `rights:check` / `rights:build`

**脚本/测试/文档**
- `apps/web/scripts/media/build-rights-registry.mjs`、`check-rights.mjs`、`quarantine-pending.mjs`、`rights-admin.mjs`
- `apps/web/tests/media-rights.test.ts`（8 tests）；更新 `home-content`、`gallery-assets`、`i18n-parity`
- `docs/codex/MEDIA-ASSET-INVENTORY.md`、`MEDIA-RIGHTS-PROCESS.md`、`MEDIA-SOURCES.md`、本报告

未修改 `apps/api` 的支付、Google OAuth、Credits、30 天清理逻辑；未执行 Git commit/push。

## 13. 自动化测试结果

| 项目 | 结果 |
|---|---|
| Web TypeScript | 通过 |
| Web ESLint | 通过 |
| Web Vitest | **223 passed / 32 files** |
| Web build | 通过 |
| API Vitest | **228 passed / 1 skipped / 34 files**（未改 API） |
| Contracts typecheck | 通过 |
| rights registry check | 82 assets；43 public / 31 private；0 failure |
| 原始 URL 实测 | 31/31 pending 404；43/43 public 200 |
| 浏览器验收 | 0 broken images；pending 详情 0 `<img>`；Gallery 39 个占位 |

API 的 1 个 skip 是既有的显式 opt-in `GEN-27` 真实 120 秒超时测试，与本轮媒体整改无关。

## 14. 仍需人工核实的资产

| 类别 | 数量 | 下一步 |
|---|---:|---|
| 旧本地风格文件 | 31 | 逐张查原始生成记录/作者/条款；无证据则保持隔离 |
| 旧外部 AI URL | 8 | 查 provider/model 条款、输入权利、输出商用许可；无法证明则保持 `restricted` |
| CC0 照片的非版权权利 | 16 | 复核肖像、商标、建筑外观；必要时替换有风险的构图 |
| 自绘资产 | 3 | 保留绘制脚本、时间戳、作者记录 |

## 15. 正式上线前的阻塞事项

1. **人工授权复核**：31 个旧本地 + 8 个旧外部资产尚未完成；不得批量自动放行。
2. **生产 CDN/反向代理缓存**：本机原 URL 已 404，但线上若曾缓存 `/images/styles/*.jpg`，必须 purge 并验证边缘节点。
3. **外部 URL**：8 个第三方 AI URL 不在本站控制范围，只能移除引用；不能保证第三方删除。
4. **真实 AI 资产**：未验证 provider 条款、模型版本、输入权利、商用/独占性；当前公开内容不含真实 AI 资产。
5. **管理后台**：当前复核是本地 CLI + 重建；多审核员/并发/工单系统尚未实现。
6. **正式上线仍需**：对象存储/R2、PostgreSQL 生产压测、监控告警、30 天清理启用、真实支付验收（与本轮媒体整改分开）。

## 结论分级

- **已取得可靠授权证据**：40 个 CC0 资产 + 3 个自绘资产；证据在 registry/manifest/Commons audit。
- **已通过技术限制控制访问**：31 个旧本地文件（私有目录、原 URL 404）；8 个旧外部 URL（从导出目录/UI 移除）。
- **需要人工版权复核**：31 个旧本地文件 + 8 个旧外部 URL + 16 张 CC0 的非版权权利。
- **无法确定合法使用**：8 个旧外部 AI URL（provider/model/条款不可核实）。
- **必须暂停公开使用**：全部 39 个 pending/restricted 资产；当前均未公开。

**最终判定：本轮“旧 39 张原图公开访问”已从 UI 限制升级为文件级隔离，且没有删除原文件；全站媒体权利模型、哈希清单、下架/恢复流程与自动化测试已建立。生产上线仍需完成人工授权复核与缓存清理，不能把技术隔离等同于版权已清除。**
