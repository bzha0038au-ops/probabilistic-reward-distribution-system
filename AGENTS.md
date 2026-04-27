# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Workspace Shape

pnpm workspace (`pnpm-workspace.yaml`) with two roots:

- `apps/*` — `frontend` (Next.js user web), `mobile` (Expo iOS+Android), `admin` (SvelteKit), `backend` (Fastify API + workers), `database` (Drizzle schema + migrations), `shared-types` (Zod contracts).
- `packages/*` — `user-core` (`@reward/user-core`): shared first-party user API client, route table, fairness helpers, and platform helpers consumed by `frontend` and `mobile`; `prize-engine-sdk` (`@reward/prize-engine-sdk`): SaaS prize-engine SDK for external or trusted server-to-server callers. Boundary rules live in `packages/README.md`.

Cross-package imports use workspace aliases: `@reward/database`, `@reward/shared-types`, `@reward/user-core`, `@reward/prize-engine-sdk`.

## Commands (run from repo root)

Dev:
- `pnpm dev` — frontend + admin + backend in parallel.
- `pnpm dev:user` — frontend + mobile + backend (the user-facing trio).
- `pnpm dev:notifications` — auth-notification worker (separate process; needed for password-reset / email / phone delivery to drain locally).
- Other workers: `pnpm dev:reconciliation`, `pnpm dev:payment-webhooks`, plus `dev:worker:payment-outbound` / `dev:worker:payment-operations` inside `apps/backend`.

Database (Postgres on `5433`, Redis on `6379`):
- `pnpm db:up` / `pnpm db:down` / `pnpm db:reset` (Docker Compose).
- `pnpm db:generate` (drizzle-kit) / `pnpm db:migrate` / `pnpm db:studio`.
- `pnpm db:seed:manual` — populates a realistic admin + 4 users + prizes/finance/audit data. Default creds in `README.md`.

Quality gates:
- `pnpm check` — runs the `guard:generated-src-js` script (see below) then `tsc --noEmit` across all workspaces.
- `pnpm lint` — ESLint per workspace (`@typescript-eslint`, `no-explicit-any` is an **error**, not a warning).
- `pnpm build` — workspace build chain. Mobile is intentionally excluded from `build`/`lint` chains; check it with `pnpm --dir apps/mobile check`.

Tests:
- `pnpm test` — workspace Vitest suites (`-r --if-present`).
- Single-package run: `pnpm --dir apps/backend test`. Single test file: `pnpm --dir apps/backend exec vitest run src/modules/draw/execute-draw.unit.test.ts`.
- `pnpm test:integration` — backend integration suite. The runner self-bootstraps a real Postgres via `pg-embedded`; you do **not** need `pnpm db:up`. Set `RUN_INTEGRATION_TESTS=true` is handled by the runner.
- `pnpm test:integration:critical` — CI merge gate for draw / finance / admin-risk regressions.
- `pnpm test:e2e` — Playwright (config at `playwright.config.ts`, `workers: 1`, baseURL `http://127.0.0.1:3000`). Run `pnpm test:e2e:install` once per machine first.
- `pnpm test:e2e:critical` — CI merge gate for auth + core flows.
- `pnpm test:load` — `autocannon` smoke against `/wallet` + `/draw`.

Backend operator scripts: `pnpm --dir apps/backend admin:promote <email>` and `user:reset-password <email> <new_password>`.

## Architecture (Big Picture)

**Three user surfaces, one backend.** `apps/frontend` (web) and `apps/mobile` (Expo) are the public product, sharing routes/contracts/request helpers via `packages/user-core`. `apps/admin` is the internal SvelteKit console for higher-risk operations and is intentionally isolated. All three call the Fastify backend in `apps/backend`. The backend is the only thing that touches Postgres or Redis.

**Auth is split, deliberately.** Three secrets that must not be reused:
- `USER_JWT_SECRET` — backend only (issues user session tokens).
- `ADMIN_JWT_SECRET` — backend + admin console (must match between them).
- `AUTH_SECRET` — Next.js / Auth.js only.

Web flow: NextAuth credentials → `POST /auth/user/session` returns a backend token → stored only in the encrypted httpOnly Auth.js cookie. Browser business calls go to the Next BFF at `/api/backend/*`, which forwards them to the backend with the backend token. The Expo app calls the same endpoints through `@reward/user-core` and sends the backend token as a bearer header. Admin login (`POST /auth/admin/login`) sets `reward_admin_session`. There are extra admin-MFA secrets (`ADMIN_MFA_ENCRYPTION_SECRET`, `ADMIN_MFA_BREAK_GLASS_SECRET`) that must also be distinct in production.

**Layering inside the backend** (`apps/backend/src/`):
- `http/routes/**` — Fastify routes do request parsing + response mapping only. Use the shared response envelope (`shared/respond.ts`); do **not** put business logic here (`CONTRIBUTING.md`).
- `http/validators/**` — Zod request validators.
- `modules/<domain>/service.ts` — orchestration, transactions, balance mutations.
- Domain modules: `admin`, `admin-mfa`, `admin-permission`, `audit`, `auth`, `bank-card`, `bonus`, `control`, `crypto`, `draw`, `fairness`, `house`, `payment`, `risk`, `session`, `system`, `top-up`, `user`, `wallet`, `withdraw`.
- `workers/` — separate processes for auth notifications, payment outbound/operations/webhooks, and reconciliation. Production runs these as their own containers; do not move their loops back into the API process.

**The critical section: `executeDraw(userId)`.** This is the most important code path in the repo. In `apps/backend/src/modules/draw/`, inside one DB transaction:
1. Lock user + wallet (`FOR UPDATE`).
2. Debit `draw_cost` and write a `ledger_entries` debit.
3. Apply weights/jitter/EV guard against the cached probability pool, pick a candidate.
4. Lock the prize row, validate eligibility (active, stock, pool/user thresholds, weight, payout caps).
5. Decrement stock, credit reward to `user_wallets.bonus_balance`, write reward ledger entry.
6. Update `house_account.prize_pool_balance` and write `house_transactions`.
7. Persist `draw_records` with fairness + payout-control metadata.

When touching draw or wallet code, preserve the transaction boundary, the lock order, and the ledger writes. The integration suite has concurrency tests — run `pnpm test:integration:critical` before claiming a draw/finance change is done.

**Wallet model.** `users` holds identity + long-lived draw state (`user_pool_balance`, `pity_streak`). `user_wallets` holds operational balances (`withdrawable_balance`, `bonus_balance`, `locked_balance`, `wagered_amount`). `ledger_entries` is the user-facing source of truth for balance history. `house_account` + `house_transactions` mirror the house side. Never mutate balances outside a service-layer transaction that also writes a ledger entry.

**Source of truth for contracts and schema:**
- API contracts: `apps/shared-types/src/{draw,finance,notification,...}.ts` (Zod + types).
- Drizzle schema: `apps/database/src/modules/{prize,finance,notification,...}.ts`.
- Module-specific notes: `apps/backend/src/modules/draw/README.md`, `.../payment/README.md`, `.../auth/NOTIFICATIONS.md`.

**Payments default to manual review.** `PAYMENT_OPERATING_MODE=automated` now requires the separate `PAYMENT_AUTOMATED_MODE_OPT_IN=true` approval switch before startup will allow automated execution. The backend still needs explicit operational review before enabling real-money automation. `payment_providers.config.adapter` is just a routing key; don't add code that auto-settles funds casually, and keep new payment work on the existing manual-review queues unless the task is specifically about controlled automation rollout. Provider secrets belong in a secret manager and are referenced by `config.secretRefs.*` only.

**Runtime config lives in `system_config`** (numeric precision): `draw_cost`, `draw_system.*`, `pool_system.*`, `probability_control.*`, `payout_control.*`, `economy.*`, `security.*`. Read/write through the `system` module helpers; do not hardcode.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`).
- `no-explicit-any` is enforced — narrow with Zod or unknown + type guards instead of casting.
- Source lives in `src/`; compiled output goes to `dist/`. The repo-root `pnpm check` runs `scripts/check-generated-src-js.mjs`, which fails the build if stray `.js`/`.js.map` siblings show up next to `.ts` sources under `src/`. Don't commit compiled JS into `src/`.
- Use the shared response envelope for every API route (`{ ok, data, requestId }` / `{ ok, error, requestId }`). See `docs/api-outline.md`.

## Operational Notes

- Health probes: `/health`, `/health/live`, `/health/ready`. Metrics at `/metrics` (Prometheus). These are intended for the internal network in production.
- Observability: OpenTelemetry + Sentry are wired into the backend; `pino` is the logger. Auth notifications use `notification_deliveries` as a durable outbox + DLQ; the worker claims rows with `FOR UPDATE SKIP LOCKED` so API and worker replicas scale independently.
- Deployment: single-host Compose template at `docker-compose.prod.yml`, runbooks under `docs/operations/`, executable backup/restore in `deploy/`. CI: `.github/workflows/ci.yml`; deploy: `.github/workflows/deploy.yml`.

## Repo Hygiene Warning

The working tree currently contains many duplicate files with `" 2"` in the filename (e.g. `Dockerfile 2`, `playwright.config 2.ts`, `apps/backend/src/modules/payment/service 2.ts`, `tests/e2e/critical-flows.spec 2.ts`, etc.) — these are sync-conflict copies, not real sources. They are visible in `git status` as untracked. Do not edit, build against, or import from `* 2.*` files; use the canonical name. If asked to clean them up, confirm scope with the user first since they are unstaged and would be lost.

## Deeper References

- `README.md` — quick start, env layout, default seed accounts.
- `docs/architecture.md` — fuller architecture pass.
- `docs/test-strategy.md` — what each test layer guards and the critical regression matrix.
- `docs/api-outline.md` — full route list and envelope shape.
- `docs/environment.md` — every env var, including secret-file `<NAME>_FILE` overrides for production.
- `docs/operations/README.md` — backup, restore, DR, host-hardening, secret rotation.
