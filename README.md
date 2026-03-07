# Bitwarden Workers

> Bitwarden Server API 的 Cloudflare Workers 实现，与官方 Bitwarden 客户端兼容。

## 技术栈

- **运行时**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **框架**: [Hono](https://hono.dev/) - 轻量高性能 Web 框架
- **数据库**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **认证**: JWT (HMAC-SHA256)
- **加密**: Web Crypto API

## 已实现的 API

| 模块 | 端点 | 描述 |
|------|------|------|
| Identity | `/identity/*` | 用户认证、KDF、登录、Token 颁发、双因素验证 |
| Accounts | `/api/accounts/*` | 用户资料、密钥管理、主密码修改、公钥同步 |
| Sync | `/api/sync` | 全量及增量数据同步 (Ciphers, Folders, Collections, Orgs, Devices) |
| Ciphers | `/api/ciphers/*` | 密码条目 CRUD、批量操作、集合与附件管理、分享 |
| Folders | `/api/folders/*` | 个人文件夹管理 |
| Organizations | `/api/organizations/*` | 组织管理、成员管理、集合管理、群组与策略管理 |
| Collections | `/api/collections/*` | 集合管理 |
| Auth-Requests| `/api/auth-requests/*`| 登录请求（免密登录验证） |
| Devices | `/api/devices/*` | 设备列表与管理、推送通知令牌 |
| Events | `/api/events/*` | 审计日志与系统事件收集 |
| Two-factor | `/api/two-factor/*` | 2FA/MFA 设置（Authenticator, WebAuthn 等） |
| WebAuthn | `/api/webauthn/*` | 验证器、通行密钥注册与认证 |
| Sends | `/api/sends/*` | Bitwarden Send (加密文本/文件分享) |
| Tasks | `/api/tasks/*` | 计划任务触发与内部定时管理 |
| Config | `/api/config` | 服务端配置获取 |

## 快速开始

### 前置条件

- Node.js >= 18
- npm / pnpm
- Cloudflare 账户（用于部署）

### 本地开发

```bash
# 安装依赖
npm install

# 生成数据库迁移
npm run db:generate

# 应用迁移（本地 D1）
npm run db:migrate:local

# 启动开发服务器
npm run dev
```

### 部署到 Cloudflare

```bash
# 1. 创建 D1 数据库
npx wrangler d1 create bitwarden-db

# 2. 更新 wrangler.toml 中的 database_id

# 3. 应用迁移
npm run db:migrate:remote

# 4. 配置生产 JWT_SECRET
npx wrangler secret put JWT_SECRET

# 5. 部署
npm run deploy
```

### 自动化部署（GitHub Actions）

项目已配置 GitHub Actions，代码推送到 `main` 分支时会自动完成类型检查、数据库迁移和部署。

#### 前置准备

1. **创建 Cloudflare 资源**（仅首次）：

```bash
# 创建 D1 数据库
npx wrangler d1 create bitwarden-db

# 创建 R2 存储桶
npx wrangler r2 bucket create bitwarden-attachments

# 设置生产环境 JWT_SECRET（Worker Secret 会覆盖 wrangler.toml 中的明文变量）
npx wrangler secret put JWT_SECRET
```

2. **创建 Cloudflare API Token**：

   前往 [Cloudflare Dashboard > API Tokens](https://dash.cloudflare.com/profile/api-tokens)，创建自定义 Token，需要以下权限：
   - Account > Cloudflare Workers > Edit
   - Account > D1 > Edit
   - Account > R2 > Edit

3. **配置 GitHub Secrets**：

   在 workers 仓库的 **Settings > Secrets and variables > Actions** 中添加：

   | Secret 名称 | 说明 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 上一步创建的 Cloudflare API Token |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID（在 Dashboard 首页右侧可见） |
   | `D1_DATABASE_ID` | D1 数据库 ID（通过 `npx wrangler d1 list` 查看） |

#### 部署流程

配置完成后，每次向 `main` 分支推送代码，GitHub Actions 会自动执行：

1. 安装依赖并进行 TypeScript 类型检查
2. 将 D1 数据库迁移应用到生产环境
3. 部署 Worker 到 Cloudflare

可在仓库的 **Actions** 标签页查看部署状态和日志。

### 配置 Bitwarden 客户端

在 Bitwarden 客户端中设置自托管服务器地址：
- **服务端 URL**: `https://your-worker.your-subdomain.workers.dev`

## 项目结构

```
workers/
├── src/
│   ├── index.ts              # Worker 入口，路由挂载
│   ├── routes/               # API 路由目录
│   │   ├── identity.ts       # 认证及 Token
│   │   ├── accounts.ts       # 账户配置
│   │   ├── sync.ts           # 数据同步
│   │   ├── ciphers.ts        # 密码管理
│   │   ├── organizations.ts  # 组织/企业管理
│   │   ├── folders.ts        # 文件夹
│   │   ├── collections.ts    # 集合管理
│   │   ├── two-factor.ts     # 双重身份验证设置
│   │   ├── webauthn.ts       # 通行密钥
│   │   ├── sends.ts          # 分享管理
│   │   ├── devices.ts        # 登录设备
│   │   ├── auth-requests.ts  # 免密码登录验证请求
│   │   ├── events.ts         # 审计日志
│   │   └── config.ts         # 服务端设定
│   ├── middleware/           # 中间件（授权，错误捕获）
│   ├── db/                   # Drizzle 数据库模式定义
│   ├── services/             # 定时任务、加密解密服务
│   └── types/                # 类型定义
├── drizzle/                  # SQL 迁移文件
├── wrangler.toml             # Workers 部署配置
├── drizzle.config.ts         # Drizzle Studio 配置
└── package.json
```

## 环境变量

在 `wrangler.toml` 的 `[vars]` 中配置，或通过 `npx wrangler secret put` 设置敏感值。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | — | **必须修改**。JWT 签名密钥，生产环境请用 `wrangler secret put` 配置 |
| `JWT_EXPIRATION` | `3600` | Access Token 有效期（秒） |
| `JWT_REFRESH_EXPIRATION` | `2592000` | Refresh Token 有效期（秒），默认 30 天 |
| `GLOBAL_PREMIUM` | `true` | 全局启用 Premium 功能 |
| `VAULT_BASE_URL` | — | Web Vault 前端地址（如 `https://vault.example.com`），用于生成邀请链接 |
| `FORCE_INVITE_REGISTER` | — | 设为 `true` 时，邀请链接一律走注册流程 |
| `SIGNUPS_ALLOWED` | `auto` | 控制开放注册行为，见下方说明 |
| `INSTALLATION_ID` | — | 自建许可证校验用的 Installation ID |

### 注册控制 (`SIGNUPS_ALLOWED`)

面向个人/家庭自托管场景，支持在首个用户注册后自动关闭开放注册，防止他人随意注册。

| 值 | 行为 |
|------|------|
| `auto` | **默认值**。系统中无用户时允许注册，有用户后自动关闭开放注册 |
| `true` | 始终允许任何人注册 |
| `false` | 始终禁止开放注册 |

> 无论哪种模式，通过组织邀请的注册始终有效——被邀请人可以正常完成注册。

典型用法：部署后不做任何配置（默认 `auto`），第一个人注册成为管理员后，后续用户只能通过组织邀请加入。

## 安全说明

- **JWT_SECRET** 必须在生产环境中使用 `wrangler secret put` 配置为强随机值
- 密码使用 PBKDF2-SHA256 哈希，与 Bitwarden 官方实现一致
- 所有密码库数据在客户端加密，服务端只存储密文
- Refresh token 使用 rotation 策略，每次使用后自动更换
- 防用户枚举：prelogin 端点对不存在的用户也返回默认 KDF 参数
- 注册控制：默认 `auto` 模式下，首个用户注册后自动关闭开放注册

## License

AGPL-3.0
