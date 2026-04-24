---
inclusion: always
---

# Bitwarden Workers 项目概览

## 项目定位

这是一个运行在 Cloudflare Workers 上的 Bitwarden 兼容后端 API 服务，使用 Hono 框架 + D1 数据库 + Drizzle ORM。不包含 Web Vault 前端。

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono
- **数据库**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **存储**: R2 (附件)、KV (图标缓存)
- **实时通知**: Durable Objects (WebSocket/SignalR)
- **部署**: GitHub Actions → Cloudflare Workers

## 项目结构

```
src/
├── index.ts              # 主入口，路由挂载，CORS，全局中间件
├── db/schema.ts          # Drizzle 数据库 schema
├── middleware/
│   ├── auth.ts           # JWT 认证中间件（HMAC-SHA256）
│   ├── debug.ts          # 调试日志中间件
│   └── error.ts          # 错误处理中间件
├── routes/               # 各功能路由
│   ├── identity.ts       # 认证：Prelogin、Register（三步流程）、Token
│   ├── accounts.ts       # 用户账户管理、Profile、密钥轮换
│   ├── ciphers.ts        # 密码条目 CRUD（最复杂的路由）
│   ├── folders.ts        # 文件夹 CRUD
│   ├── sends.ts          # Send 安全分享
│   ├── sync.ts           # 全量同步
│   ├── config.ts         # 服务端配置
│   ├── organizations.ts  # 组织管理
│   └── ...               # 其他路由
├── services/             # 业务逻辑服务
│   ├── crypto.ts         # 加密/哈希工具
│   ├── signup-guard.ts   # 注册控制守卫
│   ├── push-notification.ts
│   └── ...
└── types/index.ts        # TypeScript 类型定义
```

## 关键配置

- `wrangler.toml`: Workers 配置，环境变量，D1/R2/KV 绑定
- `drizzle/`: 数据库迁移文件
- Durable Objects 必须使用 `new_sqlite_classes`（Cloudflare 免费计划要求）
