# 独立 API 域名配置

网站与模型 API 可以使用不同域名，并由同一个 new-api 服务提供。

| 用途 | 本站配置 |
| --- | --- |
| 网站、控制台、登录回调 | `https://tokenaigate.com` |
| 模型 API 根地址 | `https://api.tokenaigate.com` |
| OpenAI 兼容客户端 Base URL | `https://api.tokenaigate.com/v1` |

## 配置顺序

1. 将 `api.tokenaigate.com` 解析到部署服务器。
2. 在 Nginx 中为该域名配置 HTTPS，转发到现有 `http://127.0.0.1:3000`。保留请求路径，启用 HTTP/1.1、WebSocket 升级转发，并关闭响应缓冲和缓存以支持流式输出。
3. 构建并部署包含本次改动的前后端版本。
4. 在后台「站点与品牌 → 系统信息」设置：
   - **服务器地址**：`https://tokenaigate.com`
   - **API 对外地址**：`https://api.tokenaigate.com`，不带 `/v1`。
5. 保存后检查「API 密钥 → API 地址」、客户端导入、模型详情中的请求示例及控制台快速上手示例。

后台配置键为 `ApiPublicAddress`，状态接口字段为 `api_public_address`。该设置使用已有选项持久化机制，无需数据库表结构迁移。留空时继续使用服务器地址，服务器地址也为空时使用当前页面域名。额外配置的 API 地址列表保留原值；设置了 API 对外地址时，密钥页面会一并展示该默认地址。

## 接口地址

- OpenAI 兼容：根地址后加 `/v1`。
- Anthropic：根地址为 `https://api.tokenaigate.com`，请求路径为 `/v1/messages`。
- Gemini：根地址为 `https://api.tokenaigate.com`，由客户端拼接 `/v1beta/models/...`。

独立 API 地址只用于对外调用地址、客户端导入和示例生成。后台管理请求继续走主站；密码重置、OAuth、支付回调及异步任务媒体地址保留各自的配置逻辑。此配置不会自动禁止从主站域名访问模型 API，也不会自动生成 DNS、证书或 Nginx 配置。

## 验证

```bash
curl -i https://api.tokenaigate.com/v1/models
```

未带密钥时应收到 new-api 的鉴权错误。带有效密钥应返回模型列表。确认客户端最终请求没有重复的 `/v1/v1`；生产环境应使用有效 HTTPS 证书。
