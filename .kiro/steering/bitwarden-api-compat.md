---
inclusion: auto
---

# Bitwarden API 兼容性指南

## 核心原则

本项目需要兼容所有官方 Bitwarden 客户端（Web Vault、Android、iOS、桌面、浏览器扩展）。不同客户端的行为差异是最常见的 bug 来源。

## PascalCase vs camelCase 问题（最重要）

**官方 Bitwarden 服务端是 C#/.NET，ASP.NET 的 JSON 反序列化默认大小写不敏感。**

不同客户端发送的字段名大小写不同：
- **Web Vault**（TypeScript）：camelCase → `{ "type": 1, "name": "..." }`
- **Android**（Kotlin）：PascalCase → `{ "Type": 1, "Name": "..." }`
- **iOS**（Swift）：可能是 camelCase 或 PascalCase

### 解决方案

所有解析请求体的端点必须使用 `normalizeKeys()` 函数处理：

```typescript
function normalizeKeys(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    const result: any = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        result[camelKey] = obj[key];
    }
    return result;
}
```

### 嵌套包装键也需要兼容

客户端可能发送：
- `{ "cipher": {...} }` 或 `{ "Cipher": {...} }`
- `{ "folder": {...} }` 或 `{ "Folder": {...} }`
- `{ "send": {...} }` 或 `{ "Send": {...} }`

正确写法：
```typescript
const body = normalizeKeys(rawBody.cipher || rawBody.Cipher || rawBody);
```

## 端点路径兼容

不同客户端可能请求不同路径的同一功能：
- Prelogin: `/identity/accounts/prelogin` 和 `/api/accounts/prelogin` 都需要支持
- Register: 旧版 `/api/accounts/register` 和新版三步流程 `/identity/accounts/register/*`
- Cipher 创建: `POST /api/ciphers`（无 collection）和 `POST /api/ciphers/create`（有 collection）

### 免鉴权端点

以下端点必须在 `authMiddleware` 之前注册：
- `POST /api/accounts/register`
- `POST /api/accounts/prelogin`
- `POST /api/accounts/prelogin/password`
- `POST /identity/accounts/prelogin`
- `POST /identity/accounts/register/*`（三步注册流程）
- `POST /identity/connect/token`

## 响应格式要求

### 不要返回 `null` 作为响应体

Kotlin 客户端（Android）使用 `kotlinx.serialization` 反序列化响应，期望 JSON 对象而非 `null`。

错误：`return c.json(null, 200)`
正确：`return c.json({ object: 'register' }, 200)`

### send-verification-email 端点

必须返回纯 JSON 字符串（`"token_value"`），不是对象（`{"emailVerificationToken":"..."}`）。
客户端用 `JsonPrimitive` 反序列化此响应。

## CORS 配置

### 动态回显策略

不使用固定的 `Access-Control-Allow-Headers` 白名单，因为 Bitwarden 客户端版本迭代会不断添加新的自定义头（如 `Device-Type`、`Bitwarden-Client-Name`、`Is-Prerelease`、`Auth-Email`、`Device-Identifier` 等）。

当前方案：读取预检请求的 `Access-Control-Request-Headers` 并原样回显。

### credentials 模式

Web Vault 发送 `credentials: 'include'`，此时 `Access-Control-Allow-Origin` 不能是 `*`，必须返回具体的 origin。当前方案：从请求的 `Origin` 头动态获取。

## 注册控制

`SIGNUPS_ALLOWED` 环境变量：
- `"true"`: 始终允许注册
- `"false"`: 禁止注册（仅组织邀请有效）
- `"auto"`（默认）: 首个用户可注册，之后自动关闭

注意：默认 `auto` 模式下，一旦有用户注册成功，后续注册会被拒绝。自托管场景建议设为 `"true"`。

## Cloudflare 免费计划限制

- Durable Objects 必须使用 `new_sqlite_classes`（不是 `new_classes`）
- D1 数据库有读写次数限制
- Workers 有 CPU 时间限制（10ms free tier）

## 调试技巧

- Cloudflare Dashboard → Workers → Logs → Real-time 查看实时日志
- 代码中的 `console.log` 会出现在 Workers 日志中
- debug 中间件会记录每个请求的方法、路径、客户端信息和请求体摘要
- 调试完成后记得清理 `console.log` 调试语句
