# Cloudflare DNS / SSL 配置

## 1. DNS（站长在 Cloudflare 执行）

| 记录 | 类型 | 内容 | 代理 |
|---|---|---|---|
| `@`（或子域） | A | 94.72.126.85 | 开启（橙色云） |
| `www`（如用） | CNAME | 站点域名 | 开启 |

- 邮件投稿用 gmail，无需 MX 改动（域名如已有 MX 保持不动）。
- Waffo/Google 回调基于同一域名路径，不需要额外子域。

## 2. SSL/TLS 模式

- SSL/TLS → Overview → **Full (strict)**。
  - 原因：Caddy 自动持有 Let's Encrypt 公信证书，Full(strict) 要求原站出示
    可信证书；不能降为 "Flexible"（那会 http 回源，cookie 安全与重定向循环风险）。
- Edge Certificates：
  - Always Use HTTPS：开。
  - HSTS：可开（max-age 6 个月起，先不含 preload，稳定后再加）。
  - Min TLS 1.2；TLS 1.3 开。

## 3. 源站证书

Caddyfile 用 `{$SITE_DOMAIN}` 从环境变量取域名，首次启动自动 ACME 签发：

- 前提：DNS A 记录已生效（否则 Let's Encrypt HTTP-01 失败，看
  `docker compose logs caddy`）。
- 证书持久化在 `wallhaze_caddy_data` volume；**不要删除该 volume**（会触发
  重新签发，频繁触发会撞 Let's Encrypt 限流）。

## 4. Cloudflare 缓存策略（站点行为相关）

| 路径 | 缓存 | 说明 |
|---|---|---|
| `/_next/static/*` | Cache Everything，1 年 | 指纹化静态资源 |
| `/images/*` `/videos/*`（Gallery 公共素材） | 可缓存 1 天–1 个月 | CC0 已核实素材 |
| `/community-demo/*` | **Bypass**（生产本应 404，双保险） | demo 隔离 |
| `/v1/*`（API） | **Bypass**（含签名 URL、会话、webhook） | 默认同源 API 不缓存 |
| 其他 HTML | Respect origin（Next 默认 no-store） | — |

Cloudflare Rules → Cache Rules 按上表建；签名媒体 URL 含 HMAC query，不能
被 CDN 缓存共享（一律 Bypass）。

## 5. 与旧 39 张 review-pending 图片的隔离

- 这些文件的公开路径（`/images/styles/<name>.jpg` 等）已在本轮整改中移出
  `public/`，源站 404。
- **缓存风险**：若 Cloudflare 此前缓存过这些 URL，源站 404 后 CDN 可能仍回
  旧内容。上线后执行：Caching → Configuration → **Purge Everything**（一次性），
  或按前缀 `/images/styles/` 精准 purge。
- 之后新域名从一开始就没有这些 URL 的缓存，问题不会复现。

## 6. 验证清单

```bash
curl -sI https://<域名> | grep -iE "server|cf-ray"      # 经 Cloudflare
curl -sI https://<域名>/health                          # API 健康（透传）
curl -s https://<域名>/v1/credits/pricing | head -c 200
curl -sI https://<域名>/images/styles/abstract.jpg      # 期望 404（隔离验证）
openssl s_client -connect <域名>:443 -servername <域名> </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer                          # Let's Encrypt（Full strict 生效）
```
