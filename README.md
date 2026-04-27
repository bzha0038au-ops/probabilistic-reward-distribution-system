# Prize Pool & Probability Engine System

A full-stack reward and draw system with wallet accounting, prize-pool controls, admin operations, and audit-friendly financial flows.

This repo is designed as a practical system skeleton for products such as spin-the-wheel, prize-pool, or reward-center apps, where financial correctness matters more than demo-only UI.

Prefer Chinese documentation? See [README-cn.md](./README-cn.md).

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

- Transaction-safe wallet, draw, and game-settlement flows for reward-center style products
- Separate public web/native user surfaces and admin tooling, so customer flows and higher-risk operations stay isolated
- Backend-owned financial mutations, async worker loops, and audit trails with explicit DB transaction boundaries
- Shared contracts, schema, first-party clients, and SaaS SDK boundaries inside one workspace, so changes move together

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

### 6. Start the primary local stack

```bash
pnpm dev
```

This starts the main web, admin, and backend apps together.

To drain queued auth notifications locally, start the notification worker in a
second terminal:

```bash
pnpm dev:notifications
```

Optional worker processes that are useful while developing payment or SaaS
flows:

```bash
pnpm dev:reconciliation
pnpm dev:payment-webhooks
pnpm dev:saas-billing
```

To run the three user-facing surfaces together:

```bash
pnpm dev:user
```

Additional backend workers are available inside `apps/backend`:

```bash
pnpm --dir apps/backend dev:worker:payment-outbound
pnpm --dir apps/backend dev:worker:payment-operations
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
pnpm check
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:install
pnpm test:load
pnpm test:load:mutations
pnpm dev:notifications
pnpm dev:reconciliation
pnpm dev:payment-webhooks
pnpm dev:saas-billing
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
- Contributor and agent workflow notes: [`AGENTS.md`](./AGENTS.md)

If you want the architecture view after bootstrapping, start with [`docs/architecture.md`](./docs/architecture.md).

If you are evaluating production readiness, also start with
[`docs/operations/README.md`](./docs/operations/README.md). It links the backup,
restore, disaster-recovery, host-hardening, and secret-rotation runbooks plus
the executable Postgres backup/restore assets under [`deploy/`](./deploy).

## System Map

```mermaid
flowchart LR
    A["User Web<br/>Next.js + Auth.js"] --> C["Backend API<br/>Fastify"]
    B["User Native<br/>Expo iOS + Android"] --> C
    G["Admin Frontend<br/>SvelteKit"] --> C
    A --> F["@reward/user-core<br/>User routes + helpers"]
    B --> F
    H["@reward/prize-engine-sdk<br/>/v1/engine/* client"] --> C
    C --> D["PostgreSQL + Drizzle schema"]
    C --> E["Redis"]
    I["Worker processes<br/>notifications / finance / SaaS"] --> C
    C --> J["Shared contracts<br/>@reward/shared-types"]
```

## What This Project Does

- Lets users register, log in, manage sessions, top up, withdraw, draw rewards, inspect wallet history, and play additional user-facing games such as blackjack and quick-eight
- Gives operators a separate admin console to manage prizes, review finance flows, inspect risk and audit events, issue SaaS API keys, and change runtime config safely
- Exposes a separate SaaS prize-engine surface under `/v1/engine/*` for trusted project-to-project integrations through `@reward/prize-engine-sdk`
- Keeps draw execution, wallet mutation, finance review, notification delivery, and background reconciliation inside the backend with explicit ledger writes and worker boundaries
- Keeps schema, migrations, shared contracts, and client packages inside the same workspace so product and platform changes evolve together

The highest-risk path is `executeDraw(userId)`: debit the draw cost, evaluate prize eligibility, write ledger entries, update the house account, and persist the result inside one transaction.

## Highlights

- Weighted draw execution with fairness metadata, prize eligibility checks, and house-account updates
- Wallet ledger, house transactions, and transaction boundaries for financial correctness
- Manual-review payment flows plus dedicated webhook, reconciliation, outbound, and operations worker paths
- Shared first-party user API client (`@reward/user-core`) and separate external SaaS SDK (`@reward/prize-engine-sdk`)
- Admin audit, risk, MFA, finance, and configuration surfaces separated from the public apps
- Workspace-level tests plus backend integration tests against a self-bootstrapped real Postgres instance

## Workspace Map

| Path | Role |
| --- | --- |
| [`apps/frontend`](./apps/frontend) | User-facing web app |
| [`apps/mobile`](./apps/mobile) | User-facing native app for iOS and Android |
| [`apps/admin`](./apps/admin) | Internal operations and finance console |
| [`apps/backend`](./apps/backend) | HTTP API, worker entrypoints, auth, wallet flows, draw engine, game modules, finance orchestration, SaaS surface |
| [`apps/database`](./apps/database) | Drizzle schema and migrations |
| [`apps/shared-types`](./apps/shared-types) | Shared Zod contracts for auth, draw, finance, notification, games, and SaaS |
| [`packages/user-core`](./packages/user-core) | Shared first-party user API client, routes, and fairness helpers |
| [`packages/prize-engine-sdk`](./packages/prize-engine-sdk) | External-facing SaaS prize-engine SDK for `/v1/engine/*` |
| [`packages/README.md`](./packages/README.md) | Package ownership, boundary, and lifecycle guide |
| [`docs`](./docs) | Architecture, environment, deployment, and test docs |

## Worker Processes

Production behavior is not just the Fastify API process. Several loops run as
their own workers and are available locally too:

- `pnpm dev:notifications`: drains auth notification deliveries from the durable outbox
- `pnpm dev:reconciliation`: runs payment reconciliation cycles and repair workflows
- `pnpm dev:payment-webhooks`: processes inbound payment webhook tasks
- `pnpm dev:saas-billing`: runs SaaS billing and webhook automation loops
- `pnpm --dir apps/backend dev:worker:payment-outbound`: submits queued provider orders
- `pnpm --dir apps/backend dev:worker:payment-operations`: handles timeout cleanup and compensation cycles

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
pnpm dev:notifications
pnpm dev:reconciliation
pnpm dev:payment-webhooks
pnpm dev:saas-billing
pnpm dev:mobile
pnpm mobile:ios
pnpm mobile:android
pnpm build
pnpm check
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:install
pnpm test:load
pnpm ops:health
pnpm ops:tail-errors
pnpm ops:check-finance

pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:seed:manual
pnpm db:up
pnpm db:down
pnpm db:reset
```

## Environment

Minimum local values:

- Backend: `DATABASE_URL` or `POSTGRES_URL`, `REDIS_URL`, `ADMIN_JWT_SECRET`, `USER_JWT_SECRET`, `WEB_BASE_URL`, `ADMIN_BASE_URL`
- Frontend: `AUTH_SECRET`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`
- Mobile: `EXPO_PUBLIC_API_BASE_URL`
- Admin: `ADMIN_JWT_SECRET`, `API_BASE_URL`

Secret boundaries matter:

- `USER_JWT_SECRET` is backend-only and must not be reused for admin or web session encryption
- `ADMIN_JWT_SECRET` must match between backend and admin, and must stay distinct from user auth and Auth.js secrets
- `AUTH_SECRET` is for the Next.js/Auth.js session layer only
- Automated money movement still requires both `PAYMENT_OPERATING_MODE=automated` and `PAYMENT_AUTOMATED_MODE_OPT_IN=true`

Full details live in [`docs/environment.md`](./docs/environment.md).

## Auth And Session Boundaries

- Web login uses Auth.js credentials, then exchanges them for a backend session token through `POST /auth/user/session`
- The frontend keeps that backend token only inside the encrypted Auth.js httpOnly cookie and forwards browser business calls through `/api/backend/*`
- The Expo app calls the same user-facing backend endpoints through `@reward/user-core` and stores the backend token in secure native storage
- Admin login uses `POST /auth/admin/login` and stores the admin session in `reward_admin_session`
- Admin MFA is its own backend domain and uses separate production secrets from the user and web auth layers

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
