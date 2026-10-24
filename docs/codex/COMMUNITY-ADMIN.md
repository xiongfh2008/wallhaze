# WallHaze Community 运营与手动上架手册

## 1. 数据边界

| 数据 | 位置 | 是否公开 |
|---|---|---|
| Community 公开展示记录 | `apps/web/data/community/works.json` | 是 |
| 作者公开资料 | `apps/web/data/community/authors.json` | 是 |
| 投稿联系邮箱、授权证据引用、源文件哈希 | `apps/web/private-media/community/reviews/<slug>.json` | 否 |
| 仅欣赏作品原始文件 | `apps/web/private-media/community/originals/` | 否 |
| 下架后移出的公开预览/下载文件 | `apps/web/private-media/community/withdrawn/` | 否 |
| 运营审计日志 | `apps/web/private-media/community/audit-log.jsonl` | 否 |

`works.json` 只允许出现公开字段；不得把 `contactEmail`、授权邮件原文、身份证件、私有路径写入其中。`getCommunityWorks()` 只返回 `status === "published"` 且 `allowPublicDisplay === true` 的记录；未发布记录不会生成页面、卡片或 sitemap 条目。

## 2. 邮件投稿（唯一渠道）

- 投稿邮箱：`xiongfh2000@gmail.com`
- 网站只提供 `mailto:` 入口、邮件主题/正文模板和复制邮箱，不接收、不解析、不自动发送邮件。
- 邮件模板固定包含：作品名称、作者昵称、作品类型、适配设备、作品说明、创作方式、来源及素材授权、是否允许公开下载、拟授权范围、署名方式、联系邮箱。
- 发送邮件不等于审核通过；没有在线成功状态。

## 3. 人工审核

站长在线下检查：

1. 文件完整、MIME 与扩展名一致。
2. 实际尺寸、比例、设备类别与投稿声明一致。
3. 视频是真实 MP4，可读取尺寸和时长；仅欣赏视频必须有独立低分辨率预览文件。
4. 作者拥有展示/下载所需权利；授权证据引用写入私有 review 记录。
5. 是否涉及未授权人像、动漫角色、商标、第三方作品。
6. 是否允许公开展示；是否允许下载，以及具体下载许可范围。
7. 审核人、审核日期、发布状态。

同意发布后，使用下面的 CLI。**没有 `--publish` 不会发布；`--dry-run` 只校验。**

## 4. 手动上架

准备一个 inbox 目录：

```
community-inbox/my-work/
  submission.json
  wallpaper.jpg
  preview.jpg      # 仅视频且 view-only 时需要独立预览
  poster.jpg       # 视频必须
  avatar.jpg       # 可选
```

字段示例见 `scripts/community/submission.example.json`。

```bash
cd apps/web
node scripts/community/import-submission.mjs \
  --inbox ../../community-inbox/my-work \
  --dry-run

node scripts/community/import-submission.mjs \
  --inbox ../../community-inbox/my-work \
  --reviewer <name> \
  --publish
```

`--publish` 会：

- 校验真实图片/MP4、MIME、尺寸、设备类别、视频时长；
- 生成公开预览（静态图使用 sharp 压缩到最大 1280px；视频使用上传的独立预览或可下载原视频）；
- 下载许可为真时把原文件放入 `public/community/downloads/`；仅欣赏时把原文件放入私有 `originals/`；
- 写入公开 `works.json` / `authors.json`，联系邮箱与证据只写入私有 `reviews/<slug>.json`；
- 追加 `audit-log.jsonl`；
- 不自动重新构建；需要 `npm run build` 后重新启动。

重复 slug、已存在的公开资产、非 HTTPS 社交链接、非标准 MP4、无证据引用、设备类别与真实尺寸不符都会中止。

## 5. 下架/版权投诉

收到投诉后先人工核对作品、派生预览/下载文件和作者授权。执行：

```bash
node scripts/community/unpublish.mjs \
  --slug <slug> \
  --reviewer <name> \
  --reason "complaint #123"
```

该命令只处理 `origin: "submission"` 且 `status: "published"` 的作品：

- 从公开 `works.json` 移除记录（页面/卡片/sitemap 消失）；
- 将 `previewAsset`、`posterAsset`、`downloadAsset` 从 `public/community/` 移到 `private-media/community/withdrawn/<slug>/`，旧 URL 在重建后 404；
- 保留私有 review 记录、原文件、下架原因和审计日志；
- 不删除任何文件；平台示例不能通过此工具下架（由代码/版权 registry 管理）。

下架后必须重新构建并清理生产 CDN/反向代理缓存；仅隐藏页面卡片不够。

## 6. 30 天 Studio 清理隔离

Studio 的 30 天清理只扫描 API 数据库中的 `image_assets`，条件是 `retention_policy='temporary_30d'`。Community 作品存放在静态 `data/community` + `public/community` / `private-media/community`，不是 `image_assets` 行，因此不会被 Studio 清理误删。

如果未来把 Studio 作品发布到 Community，必须建立独立的长期社区资产副本/关联，不能复用会被 30 天清理的原 Studio 资产。

## 7. 平台示例与真实投稿

- `origin: "platform"`：WallHaze 团队策划，只使用现有 CC0/自绘且已登记在媒体 rights registry 的资产；不是用户投稿，不虚构作者、点赞、下载量。
- `origin: "submission"`：邮件投稿、人工审核后发布，显示作者署名。
- 当前公开平台示例 8 件，真实创作者投稿 0 件；Community Submissions 显示真实空态。
- 没有真实 fal.ai 付费生成结果时，平台示例明确标注为 CC0 照片/本地合成或自绘，绝不写成 AI 生成。


## 8. Monthly Theme 配置与关联

- 配置文件：`apps/web/data/community/themes.json`（公开配置，无私人数据）。
- 状态：`draft` / `scheduled` / `active` / `ended` / `disabled`；实际显示还会按 `startsAt`/`endsAt`/`timezone` 重新计算。
- 只有有效窗口内的 `active`（或时间已到的 `scheduled`）主题显示投稿 CTA；`draft`/`disabled` 永不显示；截止后 CTA 关闭。
- 同一时间配置最多一个 active 主题；未来主题可提前写入 `scheduled`。
- 主题文案/封面在 messages 与公开配置中；封面必须使用已登记公开资产。
- 新投稿在 `submission.json` 填可选 `themeId`，导入工具会校验主题存在。
- 主题精选是**人工挑选**：把已发布投稿的 `id` 加入主题的 `publishedWorkIds`，并确保该作品 `origin=submission`、`themeId` 匹配且已发布；平台示例不会被算作主题投稿。
- 没有真实投稿时保持 `publishedWorkIds: []`，页面显示真实空态；不要为截图编造作品。
- 往期主题只在有已发布精选作品时展示；没有真实历史时隐藏。
- 主题区块在客户端按当前时间计算状态（挂载后显示，并每分钟刷新），因此静态 HTML 缓存不会在截止后继续显示投稿 CTA。修改日期/状态后仍需重新构建；生产 CDN 缓存需要按常规部署策略刷新。


## 9. Demo Seed 模拟投稿（仅开发/演示）

- 数据：`data/community/demo-works.json`（21 件，origin=demo_seed，作者统一为"模拟投稿样例"）。
- 媒体：`private-media/community/demo-media/`（fal.ai 真实生成，账本见 `fal-ledgers/`）。
- 开启演示：`COMMUNITY_DEMO_MODE=1 npx next dev`（仅非生产环境生效）+ `npm run community:demo:prepare` 同步媒体到 public。
- 关闭演示：`npm run community:demo:clean` 清除 public/community-demo。
- 生产构建永不渲染 demo 数据（isCommunityDemoMode 双重条件），sitemap 不含 demo。
- 重新生成：编辑 `scripts/community/demo-plan.json`（或新建 plan），用 `scripts/community/generate-demo.mjs --plan <file> --budget-usd 3` 执行；脚本带预算账本、次数上限、失败不重试。生成后运行 `node scripts/community/build-demo-works.mjs` 重建 demo-works.json。
