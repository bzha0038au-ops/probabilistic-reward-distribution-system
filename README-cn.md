# 奖池与概率引擎系统

这是一个带钱包记账、奖池控制、后台运营和审计能力的全栈奖励 / 抽奖系统。

这个仓库更像一套“能落地的系统骨架”，适合转盘、奖池、奖励中心这类产品。重点不是做一个演示页，而是把财务正确性、运营控制和系统边界先设计清楚。

## 为什么值得看

- 充值、抽奖、提现这些高风险路径都按事务边界处理
- 用户前台和管理后台明确拆开，逻辑隔离更清楚
- 财务变更都由 backend 统一执行并落到账本记录
- schema、migration、共享类型放在同一个 workspace，变更不容易漂移

## 快速开始

如果你第一次进这个仓库，直接照这部分做。这是本地跑起来最短、也最稳定的路径。

### 前置要求

- Node.js 20+
- pnpm 9+
- Docker
- 本地空闲端口：`3000`、`4000`、`5173`、`5433`、`6379`

### 1. 安装依赖

```bash
pnpm install
```

### 2. 创建本地环境变量文件

```bash
cp apps/database/.env.example apps/database/.env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/admin/.env.example apps/admin/.env
```

### 3. 填最少可运行配置

`apps/database/.env`

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/reward_local
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5433/reward_local
POSTGRES_SSL=false
```

`apps/backend/.env`

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/reward_local
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5433/reward_local
ADMIN_JWT_SECRET=local_admin_secret_change_me_123456
USER_JWT_SECRET=local_user_secret_change_me_123456
WEB_BASE_URL=http://localhost:3000
ADMIN_BASE_URL=http://localhost:5173
PORT=4000
REDIS_URL=redis://127.0.0.1:6379
```

`apps/frontend/.env`

```dotenv
AUTH_SECRET=local_frontend_auth_secret_change_me_123456
API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

`apps/admin/.env`

```dotenv
API_BASE_URL=http://localhost:4000
ADMIN_JWT_SECRET=local_admin_secret_change_me_123456
```

注意：

- `apps/backend/.env` 和 `apps/admin/.env` 里的 `ADMIN_JWT_SECRET` 必须一致
- 本地开发可以先用占位 secret，生产环境必须换成真实的 32 位以上密钥

### 4. 启动 Postgres 和 Redis

```bash
pnpm db:up
```

### 5. 执行 migration

```bash
pnpm db:migrate
```

### 6. 启动全部应用

```bash
pnpm dev
```

### 7. 打开本地地址

- 用户前台：[http://localhost:3000](http://localhost:3000)
- 管理后台：[http://localhost:5173](http://localhost:5173)
- 后端健康检查：[http://localhost:4000/health](http://localhost:4000/health)

### 下一步常用命令

```bash
pnpm db:seed:manual
pnpm test
pnpm test:integration
pnpm build
pnpm db:reset
```

## 手工测试数据

如果你不想从空数据库开始，而是希望页面一打开就有可点的数据：

```bash
pnpm db:seed:manual
```

这会插入：

- 1 个管理员账号
- 4 个普通用户账号
- 奖品、抽奖记录、充值、提现数据
- 审计事件、管理员操作、冻结记录、可疑账户数据

默认本地账号：

- 管理员：`admin.manual@example.com` / `Admin123!`
- 用户：`alice.manual@example.com` / `User123!`
- 用户：`bob.manual@example.com` / `User123!`
- 用户：`carol.manual@example.com` / `User123!`
- 用户：`frozen.manual@example.com` / `User123!`

## 项目总览

- 用户前台：[`apps/frontend`](./apps/frontend)
- 管理后台：[`apps/admin`](./apps/admin)
- 后端与财务逻辑：[`apps/backend`](./apps/backend)
- 数据库 schema 与 migration：[`apps/database`](./apps/database)
- 前后端共享契约：[`apps/shared-types`](./apps/shared-types)

如果你在系统跑起来之后想继续看架构，先读 [`docs/architecture.md`](./docs/architecture.md)。

## 系统关系

```mermaid
flowchart LR
    A["用户前台<br/>Next.js"] --> C["Backend API<br/>Fastify"]
    B["管理后台<br/>SvelteKit"] --> C
    C --> D["PostgreSQL"]
    C --> E["Redis"]
    C --> F["共享契约<br/>Zod + TypeScript"]
```

## 这个项目做什么

- 用户可以注册、登录、充值、提现、抽奖、查看钱包和历史记录
- 运营人员有独立后台，可以管理奖品、修改运行参数、查看财务数据、查看审计与安全记录
- 所有余额变更和抽奖关键路径都放在 backend，走数据库事务和账本记录
- 数据库 schema、migration、共享类型都放在同一个 workspace 里维护，避免前后端各自漂移

系统最关键的高风险路径是 `executeDraw(userId)`：扣除抽奖成本、判断奖品资格、写账本、更新平台账户、记录抽奖结果，全部在一次事务里完成。

## 亮点

- 带奖品资格判断的加权抽奖逻辑
- 放在 backend 内部的奖池与赔付控制
- 面向财务路径的钱包账本和事务边界
- 和公开用户端隔离的运营 / 审计 / 财务后台
- workspace 级测试，加上基于本地 Postgres 的 backend 集成测试

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| [`apps/frontend`](./apps/frontend) | 面向用户的产品前台 |
| [`apps/admin`](./apps/admin) | 面向运营和财务的后台控制台 |
| [`apps/backend`](./apps/backend) | HTTP API、鉴权、钱包流程、抽奖引擎 |
| [`apps/database`](./apps/database) | Drizzle schema 与 migration |
| [`apps/shared-types`](./apps/shared-types) | 前后端共享请求 / 响应契约 |
| [`docs`](./docs) | 架构、环境、部署、测试文档 |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 用户前台 | Next.js App Router |
| 管理后台 | SvelteKit |
| 后端 API | Fastify |
| 数据库 | PostgreSQL |
| ORM / schema | Drizzle ORM |
| 共享契约 | TypeScript + Zod |
| 工程工具 | pnpm workspace、Vitest、GitHub Actions |

### 为什么是两个前端？

核心原因是逻辑隔离。

- 用户前台和管理后台服务的是两类不同对象，风险级别也不同
- 用户前台是公开产品，关注用户流程、会话体验和页面交互
- 管理后台是内部工具，承载财务查看、参数调整、风控操作和审计查询
- 分开以后，admin 的认证、权限、依赖和复杂界面不会污染用户侧产品
- 这样也更利于部署、性能优化和故障隔离

所以这里不是为了“多上一个框架”，而是明确把“用户面”和“运营面”当成两个独立边界处理。

### 为什么会有这么多种语言？

看起来语言很多，但核心业务逻辑仍然主要是 TypeScript。其他语言的存在，是因为每一层承担的职责不同。

| 语言 | 在这个仓库里的作用 |
| --- | --- |
| TypeScript | 服务、路由、业务规则、共享契约 |
| SQL | migration 和 schema 变更 |
| Svelte / TSX / JSX | 两个前端各自的 UI 代码 |
| JSON | 多语言文案和结构化配置 |
| CSS | 样式 |
| YAML | CI 和部署流程 |

重点是直接表达，不是为了堆技术名词。

## 常用命令

在仓库根目录执行：

```bash
pnpm dev
pnpm build
pnpm check
pnpm lint
pnpm test
pnpm test:integration

pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:seed:manual
pnpm db:up
pnpm db:down
pnpm db:reset
```

## 环境变量

最少需要：

- backend：`DATABASE_URL` 或 `POSTGRES_URL`、`ADMIN_JWT_SECRET`、`USER_JWT_SECRET`
- frontend：`AUTH_SECRET`、`API_BASE_URL`、`NEXT_PUBLIC_API_BASE_URL`
- admin：`ADMIN_JWT_SECRET`、`API_BASE_URL`

完整说明见 [`docs/environment.md`](./docs/environment.md)。

## 测试

- `pnpm test`：workspace 级测试
- `pnpm test:integration`：基于本地 Postgres 的 backend 集成测试

当前测试重点明显偏后端，这是刻意的。这个系统最大的风险是财务路径出错，而不是页面细节不够漂亮。详细说明见 [`docs/test-strategy.md`](./docs/test-strategy.md)。

## 部署

- CI： [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
- 手动部署 workflow： [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
- 部署清单： [`docs/deployment-checklist.md`](./docs/deployment-checklist.md)

## 常见排查

- 如果 backend 能登录但 admin 侧登录失败，先检查 `apps/backend/.env` 和 `apps/admin/.env` 里的 `ADMIN_JWT_SECRET` 是否一致。
- 如果 frontend 出现 session 或 auth 解密错误，先清掉 `localhost:3000` 的浏览器 cookie，再确认 `AUTH_SECRET` 没被改过。
- 如果 `pnpm test:integration` 一启动就失败，先确认 Docker 已启动，并且已经执行过 `pnpm db:up`，本地 Postgres 监听在 `5433`。

## 参考文档

- 架构说明： [`docs/architecture.md`](./docs/architecture.md)
- API 概览： [`docs/api-outline.md`](./docs/api-outline.md)
- 环境变量： [`docs/environment.md`](./docs/environment.md)
- 配置项说明： [`docs/config-reference.md`](./docs/config-reference.md)
- 可观测性： [`docs/observability.md`](./docs/observability.md)
