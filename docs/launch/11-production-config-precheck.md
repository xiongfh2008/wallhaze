# 11 — 生产配置只读预检（Production Config Precheck）

**日期**: 2026-11-03
**方法**: VPS SSH 只读（`/opt/wallhaze/secrets/api.env` 键名与值长度、容器运行时 `docker exec env`）
**约束**: 未修改任何配置；未输出任何密钥值

## 1. 逐项核查

### 支付

| 变量 | 生产状态 | 格式 | 与预期匹配 | 安全影响 |
|---|---|---|---|---|
| PAYMENT_PROVIDER | SET(8) = disabled | ✅ | ✅ 关闭态 | 无交易可能 |
| PAYMENT_ENVIRONMENT | SET(4) = test | ✅ | ⚠️ 需切 live 才能收真实款 | 无 |
| PURCHASES_PUBLIC_ENABLED | **ABSENT** → false | — | ✅ 默认关闭 | 购买入口关闭 |
| PURCHASES_PAUSED | **ABSENT** → false | — | ✅（但 PUBLIC 已 false，无影响） | — |
| WAFFO_MERCHANT_ID | **EMPTY** | — | ❌ 商户未配置 | 结账不可用 |
| WAFFO_STORE_ID | **EMPTY** | — | ❌ | 同上 |
| WAFFO_PRIVATE_KEY | **EMPTY** | — | ❌ | 同上（与本地 .env 不同：本地已配） |

### 生成

| 变量 | 生产状态 | 格式 | 匹配 | 安全影响 |
|---|---|---|---|---|
| FAL_MOCK | SET(1) = 1 | ✅ | ✅ mock 模式 | 零 fal.ai 消费 |
| FAL_LIVE_ENABLED | EMPTY | — | ✅ 关闭 | — |
| FAL_VIDEO_LIVE_ENABLED | EMPTY | — | ✅ 关闭 | — |
| GENERATION_PAUSED | SET(1) = 1 | ✅ | ✅ 暂停 | 新任务 503 |
| STUDIO_PUBLIC_ENABLED | **ABSENT** → false | — | ✅ Studio 关闭 | 前端 Coming Soon |
| VIDEO_PUBLIC_ENABLED | **ABSENT** → false | — | ✅ 视频关闭 | — |
| FAL_KEY | SET(72) | ✅ | ✅ key 在但 live 关 | 未使用 |

### 成本控制

| 变量 | 值 | 状态 |
|---|---|---|
| PLATFORM_DAILY_COST_LIMIT_MICROS | 100000000 ($100/day) | ✅ 已设置 |
| USER_DAILY_COST_LIMIT_MICROS | 10000000 ($10/day) | ✅ 已设置 |

### 内容审核

| 变量 | 状态 | 影响 |
|---|---|---|
| WAFFO_MODERATION_ENDPOINT | ABSENT → 默认 api.waffo.ai | ✅ |
| WAFFO_MODERATION_SEMANTIC | ABSENT → 默认 enforce | ✅ |
| OUTPUT_MODERATION_API_KEY | **ABSENT** | ⚠️ 输出审核不可用（fail-closed） |

### 基础设施

| 变量 | 状态 |
|---|---|
| DATABASE_URL | SET(109) ✅ |
| STORAGE_DRIVER | SET(2) = r2 ✅ |
| R2_ENDPOINT / R2_BUCKET | SET ✅ |
| IMAGE_URL_SECRET | SET(64) ✅ |
| SITE_URL / API_PUBLIC_URL / WEB_APP_URL | SET ✅ |
| CORS_ALLOWED_ORIGINS | SET(87) ✅ |

## 2. 容器运行时确认

```
PAYMENT_PROVIDER=disabled
PAYMENT_ENVIRONMENT=test
GENERATION_PAUSED=1
FAL_MOCK=1
FAL_LIVE_ENABLED=(空)
FAL_VIDEO_LIVE_ENABLED=(空)
STUDIO_PUBLIC_ENABLED=(空)
VIDEO_PUBLIC_ENABLED=(空)
PURCHASES_PUBLIC_ENABLED=(空)
PURCHASES_PAUSED=(空)
OUTPUT_MODERATION_API_KEY=(空)
PLATFORM_DAILY_COST_LIMIT_MICROS=100000000
```

## 3. 结论

| 类别 | 判定 | 说明 |
|---|---|---|
| 商业化开关 | **全部关闭** ✅ | 四个闸门均 false/ABSENT |
| 支付 | **disabled** ✅ | 无交易可能 |
| 生成 | **paused + mock** ✅ | 新任务 503 + mock 输出 |
| 意外开放风险 | **零** | 即使误设 FAL_LIVE，GENERATION_PAUSED 和输出审核缺失双保险拦截 |
| Waffo 结账就绪度 | **MANUAL_REQUIRED** | 需填入商户三件套 + 面板映射产品 |
| 输出审核就绪度 | **MANUAL_REQUIRED** | 需注入 OUTPUT_MODERATION_API_KEY |
| 成本守卫 | **CONFIG_VERIFIED** | 平台 $100/日、用户 $10/日 |

## 4. 闸门真值表验证

| 开放态 | STUDIO_PUBLIC | VIDEO_PUBLIC | PURCHASES_PUBLIC | 预期行为 | 生产当前 |
|---|---|---|---|---|---|
| A 全关 | false | false | false | Coming Soon / 无购买 / 503 | **✅ 当前状态** |
| B 仅 Studio | true | false | false | 表单可见 / 无购买 | 未在此配置运行 |
| C Studio+购 | true | false | true | 购买可用 / 图片可用 | 未在此配置运行 |
| D 全开 | true | true | true | 全功能 | 未在此配置运行 |
