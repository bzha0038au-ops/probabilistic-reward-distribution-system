# Prize Pool & Probability Engine System

A full-stack reward and draw system with wallet accounting, prize-pool controls, admin operations, and audit-friendly financial flows.

This repo is designed as a practical system skeleton for products such as spin-the-wheel, prize-pool, or reward-center apps, where financial correctness matters more than demo-only UI.

> Payment scope: deposits and withdrawals are still manual-review finance flows.
> This stack does not yet implement outbound gateway execution, signed payment
> webhooks, idempotent retry handling, or recovery
> compensation. Scheduled reconciliation jobs and manual-difference queues now
> exist, but they do not make this backend safe for real-money automatic
> settlement on their own. Keep `PAYMENT_OPERATING_MODE=manual_review` by
> default. If you intentionally enable automated execution in a deployment that
> is deemed ready, you must set both `PAYMENT_OPERATING_MODE=automated` and
> `PAYMENT_AUTOMATED_MODE_OPT_IN=true`. Do not route real-money automatic in/out
> through this backend without that explicit approval.

## Why This Repo

- Transaction-safe wallet flows for top-up, draw, and withdrawal paths
- Separate public user surfaces and admin tooling, so customer flows and operations logic stay isolated
- Backend-owned financial mutations with ledger-style records and DB transaction boundaries
- Shared contracts, schema, and migrations inside one workspace, so changes move together

## Quick Start

If this is your first time in the repo, follow this section exactly. It is the shortest reliable path to a working local environment.

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker
- Free local ports: `3000`, `4000`, `5173`, `5433`, `6379`

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create local env files

```bash
cp apps/database/.env.example apps/database/.env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/mobile/.env.example apps/mobile/.env
```

### 3. Fill the minimum local values

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
USER_JWT_SECRET=local_user_secret_change_me_123456
API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

`apps/admin/.env`

```dotenv
API_BASE_URL=http://localhost:4000
ADMIN_JWT_SECRET=local_admin_secret_change_me_123456
```

`apps/mobile/.env`

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
```

Important:

- `ADMIN_JWT_SECRET` must match between `apps/backend/.env` and `apps/admin/.env`
- For local development, placeholder secrets are fine; for production, use real 32+ character secrets

### 4. Start Postgres and Redis

```bash
pnpm db:up
```

### 5. Run migrations

```bash
pnpm db:migrate
```

### 6. Start all apps

```bash
pnpm dev
```

To drain queued auth notifications locally, start the notification worker in a
second terminal:

```bash
pnpm dev:notifications
```

To run the three user surfaces together:

```bash
pnpm dev:user
```

### 7. Open the local apps

- User app: [http://localhost:3000](http://localhost:3000)
- Admin app: [http://localhost:5173](http://localhost:5173)
- Backend health check: [http://localhost:4000/health](http://localhost:4000/health)
- Native app dev server: `pnpm dev:mobile`
- iOS simulator: `pnpm mobile:ios`
- Android emulator: `pnpm mobile:android`

### Useful next commands

```bash
pnpm db:seed:manual
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:load
pnpm test:load:mutations
pnpm build
pnpm db:reset
```

## Manual QA Data

If you want the UI populated with realistic test records instead of starting from an empty database:

```bash
pnpm db:seed:manual
```

This inserts:

- 1 admin account
- 4 user accounts
- prizes, draw history, deposits, withdrawals
- audit events, admin actions, freeze records, suspicious account data

Default local accounts:

- Admin: `admin.manual@example.com` / `Admin123!`
- User: `alice.manual@example.com` / `User123!`
- User: `bob.manual@example.com` / `User123!`
- User: `carol.manual@example.com` / `User123!`
- User: `frozen.manual@example.com` / `User123!`

## Project At A Glance

- User app: [`apps/frontend`](./apps/frontend)
- Native app: [`apps/mobile`](./apps/mobile)
- Admin app: [`apps/admin`](./apps/admin)
- Backend and financial logic: [`apps/backend`](./apps/backend)
- Database schema and migrations: [`apps/database`](./apps/database)
- Shared API contracts: [`apps/shared-types`](./apps/shared-types)
- Shared internal user client: [`packages/user-core`](./packages/user-core)
- External prize-engine SDK: [`packages/prize-engine-sdk`](./packages/prize-engine-sdk)
- Package boundary guide: [`packages/README.md`](./packages/README.md)

If you want the architecture view after bootstrapping, start with [`docs/architecture.md`](./docs/architecture.md).

If you are evaluating production readiness, also start with
[`docs/operations/README.md`](./docs/operations/README.md). It links the backup,
restore, disaster-recovery, host-hardening, and secret-rotation runbooks plus
the executable Postgres backup/restore assets under [`deploy/`](./deploy).

## System Map

```mermaid
flowchart LR
    A["User Web<br/>Next.js"] --> C["Backend API<br/>Fastify"]
    B["User Native<br/>Expo iOS + Android"] --> C
    G["Admin Frontend<br/>SvelteKit"] --> C
    C --> D["PostgreSQL"]
    C --> E["Redis"]
    C --> F["Shared Contracts + User Core<br/>Zod + TypeScript"]
```

## What This Project Does

- Lets users register, log in, top up, withdraw, draw rewards, and inspect wallet history
- Gives operators a separate admin console to manage prizes, update runtime config, inspect finance data, and review audit/security records
- Keeps draw execution and balance mutation logic inside the backend, protected by DB transactions and ledger entries
- Keeps schema, migrations, and shared contracts inside the same workspace so the system evolves together

The highest-risk path is `executeDraw(userId)`: debit the draw cost, evaluate prize eligibility, write ledger entries, update the house account, and persist the result inside one transaction.

## Highlights

- Weighted draw execution with prize eligibility checks
- Prize-pool and payout controls in the backend
- Wallet ledger and transaction boundaries for financial flows
- Admin audit and finance surfaces separated from the public app
- Workspace-level tests plus backend integration tests against local Postgres

## Workspace Map

| Path | Role |
| --- | --- |
| [`apps/frontend`](./apps/frontend) | User-facing web app |
| [`apps/mobile`](./apps/mobile) | User-facing native app for iOS and Android |
| [`apps/admin`](./apps/admin) | Internal operations and finance console |
| [`apps/backend`](./apps/backend) | HTTP API, auth, wallet flows, draw engine |
| [`apps/database`](./apps/database) | Drizzle schema and migrations |
| [`apps/shared-types`](./apps/shared-types) | Shared request/response contracts |
| [`packages/user-core`](./packages/user-core) | Shared first-party user API client, routes, and fairness helpers |
| [`packages/prize-engine-sdk`](./packages/prize-engine-sdk) | External-facing SaaS prize-engine SDK for `/v1/engine/*` |
| [`packages/README.md`](./packages/README.md) | Package ownership, boundary, and lifecycle guide |
| [`docs`](./docs) | Architecture, environment, deployment, and test docs |

## Tech Stack

| Layer | Choice |
| --- | --- |
| User web | Next.js App Router |
| User native | Expo + React Native |
| Admin console | SvelteKit |
| Backend API | Fastify |
| Database | PostgreSQL |
| ORM / schema | Drizzle ORM |
| Shared contracts | TypeScript + Zod |
| Shared internal user client | Workspace package (`@reward/user-core`) |
| External prize-engine SDK | Workspace package (`@reward/prize-engine-sdk`) |
| Tooling | pnpm workspace, Vitest, GitHub Actions |

### Why Web + Native + Admin?

The main reason is logical isolation.

- The public user product now has two delivery shells: `apps/frontend` for web and `apps/mobile` for iOS + Android
- Those two user surfaces share contracts and request logic through `packages/user-core`
- The admin app still serves a different audience and a different risk level
- The admin app is an internal tool for higher-risk actions like finance review, config changes, and operations work
- Keeping them separate prevents admin auth, admin dependencies, and admin UI complexity from leaking into the public product
- It also makes deployment, performance tuning, and incident blast radius easier to control

This is a system-boundary decision, not a framework collection exercise.

### Why So Many Languages?

The repo looks polyglot, but the main business logic is still TypeScript. The other languages exist because each layer has a different job.

| Language | Why it exists here |
| --- | --- |
| TypeScript | Services, routes, business rules, shared contracts |
| SQL | Migrations and schema changes |
| Svelte / TSX / JSX | UI code in each frontend |
| JSON | Locale files and structured configuration |
| CSS | Styling |
| YAML | CI and deployment workflows |

The point is directness, not variety for its own sake.

## Common Commands

Run from the repo root:

```bash
pnpm dev
pnpm dev:user
pnpm dev:mobile
pnpm mobile:ios
pnpm mobile:android
pnpm build
pnpm check
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:load

pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:seed:manual
pnpm db:up
pnpm db:down
pnpm db:reset
```

## Environment

Minimum required values:

- Backend: `DATABASE_URL` or `POSTGRES_URL`, `ADMIN_JWT_SECRET`, `USER_JWT_SECRET`
- Frontend: `AUTH_SECRET`, `API_BASE_URL`
- Mobile: `EXPO_PUBLIC_API_BASE_URL`
- Admin: `ADMIN_JWT_SECRET`, `API_BASE_URL`

Full details live in [`docs/environment.md`](./docs/environment.md).

## Testing

- `pnpm test`: workspace-level tests
- `pnpm test:integration`: full backend integration suite against a self-bootstrapped real Postgres instance
- `pnpm test:integration:critical`: CI gate for draw / finance / admin-risk regressions
- `pnpm test:e2e`: full Playwright browser regression suite
- `pnpm test:e2e:critical`: CI gate for auth + core user/admin flows
- `pnpm test:load`: authenticated `/wallet` + `/draw` smoke load via `autocannon`
- `pnpm test:load:mutations`: isolated write-path smoke for `POST /draw` + `POST /rewards/claim`
- Measure frontend BFF performance with `next build && next start`; `next dev` adds substantial proxy overhead that is not representative.
- Run `pnpm test:e2e:install` once before the first browser run on a machine.

Test coverage is intentionally backend-heavy because the biggest risk in this system is financial correctness, not visual polish. See [`docs/test-strategy.md`](./docs/test-strategy.md).

## Deployment

- CI: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
- Manual deploy workflow: [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
- Checklist: [`docs/deployment-checklist.md`](./docs/deployment-checklist.md)

## Troubleshooting

- If admin login works in the backend but fails in the admin UI, check that `ADMIN_JWT_SECRET` matches in `apps/backend/.env` and `apps/admin/.env`.
- If the frontend shows session or auth decryption errors, clear browser cookies for `localhost:3000` and make sure `AUTH_SECRET` has not changed.
- If `pnpm test:e2e` fails before launching a browser, run `pnpm test:e2e:install`.
- If `pnpm test:integration` fails now, it is usually a real test/setup failure rather than a missing Docker daemon. `pnpm db:up` is only needed for manual local app development against `docker-compose.yml`.

## Reference Docs

- Architecture: [`docs/architecture.md`](./docs/architecture.md)
- API outline: [`docs/api-outline.md`](./docs/api-outline.md)
- Environment: [`docs/environment.md`](./docs/environment.md)
- Config reference: [`docs/config-reference.md`](./docs/config-reference.md)
- Observability: [`docs/observability.md`](./docs/observability.md)
