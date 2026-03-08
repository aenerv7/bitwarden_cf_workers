**中文** | [English](./README.en.md)

# Bitwarden Workers

> Bitwarden Server API 的 Cloudflare Workers 实现，完全兼容官方 Bitwarden 客户端（Web、桌面、浏览器扩展、移动端）。
>
> 零服务器、零运维，基于 Cloudflare 免费套餐即可运行个人/家庭密码管理器。
>
> 所有密码库数据由客户端端到端加密后存储于 [Cloudflare D1](https://developers.cloudflare.com/d1/)——服务端只保存密文，即使数据库泄露也无法还原明文。D1 自身还提供 AES-256-GCM 静态加密（encryption at rest）和 TLS 传输加密，密钥由 Cloudflare 基础设施托管，无需额外配置。D1 每小时自动创建备份，支持还原到 30 天内的任意时间点——即使误操作清空了全部数据，也可以通过 Cloudflare Dashboard 或 `wrangler d1 time-travel` 一键回滚恢复。

## 功能概览

| 模块 | 端点 | 说明 |
|------|------|------|
| Identity | `/identity/*` | 注册、登录、Token 颁发、WebAuthn/FIDO2 认证 |
| Accounts | `/api/accounts/*` | 用户资料、密钥管理、主密码修改 |
| Sync | `/api/sync` | 全量数据同步 |
| Ciphers | `/api/ciphers/*` | 密码条目 CRUD、批量操作、附件、分享 |
| Folders | `/api/folders/*` | 文件夹管理 |
| Organizations | `/api/organizations/*` | 组织/成员/集合/群组/策略管理 |
| Collections | `/api/collections/*` | 集合管理 |
| Two-Factor | `/api/two-factor/*` | 2FA 设置（TOTP、WebAuthn 等） |
| WebAuthn | `/api/webauthn/*` | 通行密钥注册与认证 |
| Auth Requests | `/api/auth-requests/*` | 免密码登录审批 |
| Sends | `/api/sends/*` | Bitwarden Send（加密文本/文件分享） |
| Devices | `/api/devices/*` | 登录设备管理 |
| Events | `/api/events/*` | 审计日志 |
| Emergency Access | `/api/emergency-access/*` | 紧急访问 |
| Settings | `/api/settings/*` | 等价域名等用户设置 |
| Reports | `/api/reports/*` | 组织安全报告 |
| Icons | `/{hostname}/icon.png` | 网站图标抓取与缓存（跨用户复用） |
| Notifications | `/notifications/hub` | 实时推送（WebSocket / Durable Objects） |
| Config | `/api/config` | 服务端配置 |
| Tasks | `/api/tasks/*` | 定时任务管理 |
| Org Licenses | `/api/organizations/licenses/*` | 自建组织许可证 |
| Attachments | `/attachments/:cipherId/:attachmentId` | 附件下载 |

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Web 框架 | [Hono](https://hono.dev/) |
| 数据库 | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| 对象存储 | [Cloudflare R2](https://developers.cloudflare.com/r2/)（附件） |
| 缓存 | [Cloudflare KV](https://developers.cloudflare.com/kv/)（Icons） + Edge Cache |
| 实时通知 | [Durable Objects](https://developers.cloudflare.com/durable-objects/)（WebSocket） |
| 定时任务 | [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) |
| 认证 | JWT (HMAC-SHA256) |
| 加密 | Web Crypto API / PBKDF2-SHA256 |

---

## 快速开始

### 前置条件

- Node.js >= 18
- npm
- [Cloudflare 账户](https://dash.cloudflare.com/sign-up)（免费即可）

### 本地开发

```bash
npm install
npm run db:generate
npm run db:migrate:local
npm run dev
```

本地服务默认运行在 `http://localhost:8787`。

---

## 部署

提供两种方式：**手动部署** 和 **Fork 后 GitHub Actions 自动部署**。

### 方式一：手动部署

#### 1. 创建 Cloudflare 资源

```bash
npx wrangler login

# D1 数据库
npx wrangler d1 create bitwarden-db

# R2 存储桶（附件）
npx wrangler r2 bucket create bitwarden-attachments

# KV（Icons 缓存）
npx wrangler kv namespace create ICONS_CACHE
npx wrangler kv namespace create ICONS_CACHE --preview
```

#### 2. 更新 `wrangler.toml`

将上一步输出的 ID 填入对应位置：

```toml
[[d1_databases]]
database_id = "<your-d1-database-id>"

[[kv_namespaces]]
binding = "ICONS_CACHE"
id = "<your-kv-production-id>"
preview_id = "<your-kv-preview-id>"
```

#### 3. 迁移数据库并部署

```bash
npm run db:migrate:remote
npx wrangler secret put JWT_SECRET    # 输入一个强随机字符串
npm run deploy
```

#### 4. 验证

```bash
curl https://<your-worker-domain>/alive
curl -I https://<your-worker-domain>/github.com/icon.png
```

---

### 方式二：Fork + GitHub Actions 自动部署

推荐用于长期维护，代码推送到 `main` 分支时自动完成类型检查、数据库迁移和部署。

#### 1. Fork 并启用 Actions

- 在 GitHub 上 Fork 本仓库。
- 进入 Fork 后仓库的 **Actions** 页面，点击启用工作流。

#### 2. 本地创建 Cloudflare 资源

```bash
git clone <your-fork-url>
cd workers
npm ci
npx wrangler login

npx wrangler d1 create bitwarden-db
npx wrangler r2 bucket create bitwarden-attachments
npx wrangler kv namespace create ICONS_CACHE
npx wrangler kv namespace create ICONS_CACHE --preview
```

记录输出中的 D1 `database_id`、KV `id` 和 `preview_id`。

#### 3. 创建 Cloudflare API Token

前往 [Cloudflare Dashboard > API Tokens](https://dash.cloudflare.com/profile/api-tokens)，选择 **Create Custom Token**，配置以下权限：

| 范围 | 资源 | 级别 |
|------|------|------|
| 帐户 | D1 | 编辑 |
| 帐户 | Workers KV 存储 | 编辑 |
| 帐户 | Workers R2 存储 | 编辑 |
| 帐户 | Workers 脚本 | 编辑 |
| 帐户 | 帐户设置 | 读取 |
| 用户 | 成员资格 | 读取 |
| 用户 | 用户详细信息 | 读取 |

#### 4. 配置 GitHub Secrets

在 Fork 仓库的 **Settings > Secrets and variables > Actions** 中添加：

| Secret 名称 | 来源 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 3 步创建的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 首页右侧 Account ID |
| `D1_DATABASE_ID` | 第 2 步创建 D1 的输出 |
| `ICONS_CACHE_ID` | 第 2 步创建 KV 的 production ID |
| `ICONS_CACHE_PREVIEW_ID` | 第 2 步创建 KV 的 preview ID |

> CI 会在部署前自动将 `wrangler.toml` 的本地占位符替换为 Secrets 中的生产值。  
> 如果有 Secret 缺失，workflow 会立即报错并指出缺少哪个。

#### 5. 配置生产密钥

```bash
npx wrangler secret put JWT_SECRET
```

> `JWT_SECRET` 是敏感值，不要写入仓库或 `wrangler.toml`。

#### 6. 触发首次部署

```bash
git commit --allow-empty -m "chore: trigger first deployment"
git push origin main
```

#### 7. 验证

- 在 GitHub **Actions** 确认 `Deploy to Cloudflare Workers` 成功。
- 访问 `https://<your-worker-domain>/alive`，应返回当前时间戳。
- 访问 `https://<your-worker-domain>/github.com/icon.png`，应返回图标图片。

---

## 配置 Bitwarden 客户端

在 Bitwarden 客户端的"自托管"设置中填入你的 Worker 地址：

```
服务端 URL: https://<your-worker-domain>
```

所有客户端（Web Vault、桌面、浏览器扩展、移动端）均使用同一个地址。

---

## 环境变量

在 `wrangler.toml` 的 `[vars]` 中配置，敏感值通过 `npx wrangler secret put` 设置。

### 核心配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | — | **必须修改**。JWT 签名密钥，使用 `wrangler secret put` 配置 |
| `JWT_EXPIRATION` | `3600` | Access Token 有效期（秒） |
| `JWT_REFRESH_EXPIRATION` | `2592000` | Refresh Token 有效期（秒），默认 30 天 |
| `GLOBAL_PREMIUM` | `true` | 全局启用 Premium 功能 |

### 注册与邀请

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SIGNUPS_ALLOWED` | `auto` | 注册控制，见下方说明 |
| `VAULT_BASE_URL` | — | Web Vault 前端地址（如 `https://vault.example.com`），用于生成邀请链接 |
| `FORCE_INVITE_REGISTER` | — | 设为 `true` 时邀请链接一律走注册流程 |
| `INSTALLATION_ID` | — | 自建许可证校验用 Installation ID |

#### 注册控制 (`SIGNUPS_ALLOWED`)

| 值 | 行为 |
|------|------|
| `auto` | **默认**。无用户时允许注册，有用户后自动关闭 |
| `true` | 始终允许注册 |
| `false` | 始终禁止注册（仅邀请有效） |

> 无论哪种模式，通过组织邀请的注册始终有效。  
> 典型用法：保持默认 `auto`，第一个人注册后即自动关闭开放注册。

### Icons 缓存

网站图标服务采用"域名维度缓存"，同一网站的 icon 在所有用户间共享，无需重复抓取。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ICONS_CACHE_SUCCESS_TTL_SECONDS` | `1209600` | 成功缓存 TTL（14 天） |
| `ICONS_CACHE_NEGATIVE_TTL_SECONDS` | `43200` | 负缓存 TTL（12 小时），对无 icon 站点避免反复请求 |
| `ICONS_MAX_IMAGE_BYTES` | `51200` | 可缓存 icon 最大字节数（50KB） |

成本优化建议：
- 访问量大时可将成功缓存提高到 30 天（`2592000`）。
- 负缓存保持 6-24 小时区间，避免长期错误锁死。

---

## Cloudflare 资源绑定

| 绑定名 | 类型 | 用途 |
|--------|------|------|
| `DB` | D1 | 主数据库 |
| `ATTACHMENTS` | R2 | 附件文件存储 |
| `ICONS_CACHE` | KV | Icons 缓存（跨用户复用） |
| `NOTIFICATION_HUB` | Durable Object | 实时 WebSocket 推送 |

---

## 定时任务

通过 Cron Triggers 自动执行，无需额外基础设施：

| Cron | 任务 | 说明 |
|------|------|------|
| `*/5 * * * *` | DeleteSendsJob | 每 5 分钟清理到期 Send |
| `0 0 * * *` | DeleteCiphersJob | 每日午夜永久删除 30 天前软删除的 Cipher |
| `0 22 * * 5` | DatabaseExpiredGrantsJob | 每周五 22:00 UTC 清理过期 Refresh Token |

---

## 项目结构

```
workers/
├── src/
│   ├── index.ts                  # Worker 入口与路由挂载
│   ├── routes/                   # API 路由
│   │   ├── identity.ts           # 认证与 Token
│   │   ├── accounts.ts           # 用户账户
│   │   ├── sync.ts               # 数据同步
│   │   ├── ciphers.ts            # 密码条目
│   │   ├── folders.ts            # 文件夹
│   │   ├── organizations.ts      # 组织管理
│   │   ├── collections.ts        # 集合
│   │   ├── two-factor.ts         # 双因素验证
│   │   ├── webauthn.ts           # 通行密钥
│   │   ├── auth-requests.ts      # 免密登录
│   │   ├── sends.ts              # 安全分享
│   │   ├── devices.ts            # 设备管理
│   │   ├── events.ts             # 审计日志
│   │   ├── settings.ts           # 用户设置
│   │   ├── reports.ts            # 安全报告
│   │   ├── icons.ts              # 网站图标
│   │   ├── config.ts             # 服务端配置
│   │   └── tasks.ts              # 定时任务
│   ├── services/                 # 业务逻辑
│   │   ├── icons/                # Icons 抓取、缓存、安全校验
│   │   ├── crypto.ts             # 加密工具
│   │   ├── totp.ts               # TOTP 验证
│   │   ├── scheduled.ts          # Cron 任务处理
│   │   ├── events.ts             # 事件记录
│   │   ├── policy-validators.ts  # 策略校验
│   │   └── signup-guard.ts       # 注册控制
│   ├── middleware/               # 中间件
│   │   ├── auth.ts               # JWT 认证
│   │   ├── error.ts              # 错误处理
│   │   └── debug.ts              # 调试日志
│   ├── durable-objects/          # Durable Objects
│   ├── db/                       # Drizzle 数据库 schema
│   ├── models/                   # 响应模型
│   └── types/                    # TypeScript 类型定义
├── drizzle/                      # SQL 迁移文件
├── .github/workflows/deploy.yml  # CI/CD 自动部署
├── wrangler.toml                 # Workers 部署配置
├── tsconfig.json
└── package.json
```

---

## 安全

- **端到端加密**：所有密码库数据在客户端加密，服务端只存储密文。
- **密码哈希**：PBKDF2-SHA256，与 Bitwarden 官方一致。
- **JWT 签名**：HMAC-SHA256，`JWT_SECRET` 必须使用 `wrangler secret put` 设置强随机值。
- **Token 轮换**：Refresh Token 每次使用后自动更换。
- **防枚举**：Prelogin 端点对不存在的用户也返回默认 KDF 参数。
- **注册保护**：默认 `auto` 模式，首个用户注册后自动关闭开放注册。
- **SSRF 防护**：Icons 服务拒绝 IP 直连、内网地址、非标准端口。

---

## License

AGPL-3.0
