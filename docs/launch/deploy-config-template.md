# 生产部署配置模板（配置即模板，不包含任何真实密钥）

复制为部署环境变量配置后按注释填值。**默认全部闸门关闭**——开放顺序见 09 runbook。

## 基础

```bash
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
SITE_URL=https://wallhaze.com
TRUST_PROXY=1                       # 仅在反向代理后启用
CORS_ALLOWED_ORIGINS=https://wallhaze.com,https://www.wallhaze.com
```

## 数据库与安全

```bash
DATABASE_URL=postgres://...         # 必填
IMAGE_URL_SECRET=<32+ 随机串>       # 必填，签名 URL 密钥
OAUTH_STATE_SECRET=<独立随机串>     # 必填，禁止复用 IMAGE_URL_SECRET
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## 存储（R2，fail-closed）

```bash
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...   R2_ACCESS_KEY_ID=...   R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...       R2_PUBLIC_BASE=...     # 如用公开 CDN 前缀
```

## 支付（Waffo）

```bash
PAYMENT_PROVIDER=waffo              # 上线第一步先用 disabled 冒烟
PAYMENT_ENVIRONMENT=live            # 先 test 跑通再切 live
WAFFO_MERCHANT_ID=...               # M1：商户后台核对
WAFFO_STORE_ID=...
WAFFO_PRIVATE_KEY=...               # M3：密钥托管+轮换流程
WAFFO_MODERATION_*                  # Prompt Sift scope（M4：确认已开通）
```

## AI（fal）

```bash
FAL_KEY=...                         # 填了也不代表对用户开放（闸门独立）
FAL_LIVE_ENABLED=1                  # 图片真实调用
FAL_VIDEO_LIVE_ENABLED=1            # 视频（如开放）
# 生产严禁：FAL_MOCK=1（会导致启动失败）
```

## 输出审核（fail-closed：不配置则 live 生成全部拒绝落盘）

```bash
OUTPUT_MODERATION_API_KEY=...
OUTPUT_MODERATION_*                 # 按 env.ts 注释
```

## 商业化闸门（默认关闭；开放顺序见 runbook §4）

```bash
PURCHASES_PUBLIC_ENABLED=0          # 1=开放新建购买
PURCHASES_PAUSED=0                  # 1=暂停售卖（webhook/退款/sync 不受影响）
STUDIO_PUBLIC_ENABLED=0             # 1=开放 AI Studio
VIDEO_PUBLIC_ENABLED=0              # 1=开放付费视频（独立闸门）
GENERATION_PAUSED=0                 # 1=全停生成（API+Worker）
```

## 预算护栏（微美元；未设=无限制——P1-2，上线必须设）

```bash
USER_DAILY_COST_LIMIT_MICROS=5000000      # $5/用户/日（UTC 日界）
PLATFORM_DAILY_COST_LIMIT_MICROS=200000000 # $200/平台/日（0=全停）
```

## 前端（apps/web）

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.wallhaze.com   # 未配置=前端按关闭态渲染（fail-closed）
```

## 上线前自查清单

- [ ] 三个 *_SECRET 互不相同且 ≥32 字符
- [ ] PAYMENT_ENVIRONMENT 与 Waffo 后台环境一致
- [ ] 预算双限已设置
- [ ] Webhook 地址已在 Waffo 后台登记且只有一个（02 文档 §2）
- [ ] CORS 白名单只含正式域名
