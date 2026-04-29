# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Workspace Shape

pnpm workspace (`pnpm-workspace.yaml`) with two roots:

- `apps/*` — `frontend` (Next.js consumer web), `saas-portal` (Next.js tenant self-serve portal), `mobile` (Expo iOS+Android), `admin` (SvelteKit internal console), `backend` (Fastify API + workers), `database` (Drizzle schema + migrations), `shared-types` (Zod contracts).
- `packages/*` — `user-core` (`@reward/user-core`): shared first-party user API client, route table, fairness helpers, realtime/table helpers, and platform helpers consumed by `frontend` and `mobile`; `prize-engine-sdk` (`@reward/prize-engine-sdk`): SaaS prize-engine SDK for external or trusted server-to-server callers. Boundary rules live in `packages/README.md`.

Cross-package imports use workspace aliases: `@reward/database`, `@reward/shared-types`, `@reward/user-core`, `@reward/prize-engine-sdk`.

`AGENTS.md` is a summary, not the source of truth for the live tree. If a domain looks broader than this file suggests, inspect the current app/package directory before assuming an older boundary still holds.

## Commands (run from repo root)

Dev:
- `pnpm dev` — frontend + admin + backend in parallel.
- `pnpm dev:user` — frontend + mobile + backend (the consumer trio).
- `pnpm dev:saas-portal` — tenant self-serve SaaS portal on port `3002`.
- Targeted surfaces: `pnpm dev:frontend`, `pnpm dev:mobile`, `pnpm dev:admin`, `pnpm dev:backend`.
- Common worker loops: `pnpm dev:notifications`, `pnpm dev:reconciliation`, `pnpm dev:payment-webhooks`, `pnpm dev:wallet-reconciliation`, `pnpm dev:saas-billing`, `pnpm dev:fairness-audits`, `pnpm dev:holdem-timeouts`, `pnpm dev:blackjack-timeouts`.
- Additional backend worker entrypoints remain available inside `apps/backend`, especially `dev:worker:payment-outbound` and `dev:worker:payment-operations`.

Database (Postgres on `5433`, Redis on `6379`):
- `pnpm db:up` / `pnpm db:down` / `pnpm db:reset` (Docker Compose).
- `pnpm db:generate` (drizzle-kit) / `pnpm db:migrate` / `pnpm db:studio`.
- `pnpm db:seed:manual` — populates a realistic admin + 4 users + prizes/finance/audit data. Default creds live in `README.md`.
- `pnpm db:seed:saas-portal-demo` — adds portal demo tenants, sandbox projects, starter keys, and sample prize-engine data for browser QA.

Quality gates:
- `pnpm check` — runs `guard:generated-src-js` first, then workspace checks across `frontend`, `saas-portal`, `mobile`, `admin`, `backend`, `database`, `shared-types`, `user-core`, and `prize-engine-sdk`.
- `pnpm lint` — root lint/type gate across the same set. Mobile participates in the root lint/check chain now.
- `pnpm build` — workspace build chain for `frontend`, `saas-portal`, `admin`, `backend`, `database`, `shared-types`, `user-core`, and `prize-engine-sdk`. Mobile is intentionally excluded from `build` only.

Tests:
- `pnpm test` — workspace Vitest suites (`-r --if-present`).
- Single-package run: `pnpm --dir apps/backend test`. Single test file: `pnpm --dir apps/backend exec vitest run src/modules/draw/execute-draw.unit.test.ts`.
- `pnpm test:integration` — backend integration suite. The runner self-bootstraps a real Postgres via `pg-embedded`; you do not need `pnpm db:up`.
- `pnpm test:integration:critical` — CI merge gate for draw / finance / admin-risk regressions.
- Integration targeting: `pnpm test:integration -- --spec src/integration/backend.saas.integration.test.ts`.
- `pnpm test:e2e` — custom Playwright runner in `tests/e2e/run.ts`; run `pnpm test:e2e:install` once per machine first.
- `pnpm test:e2e:critical` — CI merge gate for auth + core user/admin flows.
- `pnpm test:load` — authenticated smoke against `/wallet` + `/draw`.
- `pnpm test:load:mutations` — write-path smoke for `/draw` + `/rewards/claim`.

Backend operator / ops scripts:
- `pnpm --dir apps/backend admin:promote <email>`
- `pnpm --dir apps/backend user:reset-password <email> <new_password>`
- `pnpm verify:saas-decision-billing`
- `pnpm ops:health`, `pnpm ops:tail-errors`, `pnpm ops:check-finance`, `pnpm ops:freeze-deploys`, `pnpm ops:rotate-jwt`, `pnpm ops:ai-diagnose`, `pnpm ops:postmortem`

## Architecture (Big Picture)

**Four surfaces, one backend data plane.** `apps/frontend` (consumer web) and `apps/mobile` (Expo) are the public C-side product, sharing routes/contracts/request helpers via `packages/user-core`. `apps/admin` is the internal SvelteKit console for higher-risk operations and is intentionally isolated. `apps/saas-portal` is a separate Next.js self-serve surface for B-side tenant/project/key/billing workflows. All four talk to the Fastify backend in `apps/backend`. The backend is the only thing that touches Postgres or Redis.

**Product boundary: C-side vs B-side.** Keep the end-user product and the SaaS prize-engine product conceptually separate even when they reuse the same backend primitives. The C-side is the consumer product: wallet, deposits/withdrawals, rewards, draw/games, realtime table play, prediction markets, compliance, and community features for human users on `frontend` and `mobile`. The B-side is the agent-facing SaaS reward engine: tenant/project/api-key managed infrastructure plus `/v1/engine/*` APIs that send behavior/score/context into the engine and receive budget/risk/variance-constrained stochastic rewards back through `@reward/prize-engine-sdk`. They may share ledger, randomness, risk controls, fairness, budget policy, and observability internals, but they do not share product semantics, UX, customer type, or API framing. Do not collapse B-side work into "just another user feature", and do not model C-side roadmap items as SaaS agent primitives unless the task is explicitly about shared engine infrastructure.

**Auth is split, deliberately.** These secrets must not be reused:
- `USER_JWT_SECRET` — backend user-session signing only. Consumer web, mobile, and `saas-portal` may validate or forward tokens, but this is not an Auth.js secret.
- `ADMIN_JWT_SECRET` — backend + admin console (must match between them).
- `AUTH_SECRET` — Auth.js only, for Next.js surfaces such as `apps/frontend` and `apps/saas-portal`.

Web flow: Auth.js credentials -> `POST /auth/user/session` returns a backend token -> stored only in the encrypted httpOnly Auth.js cookie. Browser business calls go to the Next BFF at `/api/backend/*`, which forwards them to the backend with the backend token.

Portal flow: `apps/saas-portal` is a separate Auth.js app with its own session cookie and backend-token cookie, but it still talks to the same backend user auth plane and then calls `/portal/saas/*`. Do not mix portal proxy policy or portal UI semantics into the consumer web BFF.

Mobile flow: the Expo app calls the same user endpoints through `@reward/user-core` and sends the backend token as a bearer header.

Admin flow: `POST /auth/admin/login` sets `reward_admin_session`. There are extra admin-MFA secrets (`ADMIN_MFA_ENCRYPTION_SECRET`, `ADMIN_MFA_BREAK_GLASS_SECRET`) that must also be distinct in production.

**Layering inside the backend** (`apps/backend/src/`):
- `http/routes/**` — Fastify routes do request parsing + response mapping only. Use the shared response envelope (`shared/respond.ts`); do not put business logic here.
- `http/validators/**` — Zod request validators.
- `modules/<domain>/service.ts` — orchestration, transactions, balance mutations.
- `realtime/` — generic authenticated WebSocket transport for table/lobby/private user events. Shared schemas live in `@reward/shared-types/realtime`.
- `workers/` — separate processes for auth notifications, fairness audits, table timeout handling, payment webhook/reconciliation/outbound/operations loops, wallet reconciliation, and SaaS billing. Production runs these as their own containers; do not move their loops back into the API process.

Current backend domain modules are broader than the original draw/payment core. Expect active code in domains such as `aml`, `community`, `forum`, `gamification`, `hand-history`, `holdem`, `blackjack`, `prediction-market`, `quick-eight`, `saas`, `table-engine`, `table-monitoring`, `engine-reconciliation`, plus the original wallet/auth/payment/draw paths.

`apps/backend/src/http/routes/index.ts` and `apps/backend/src/http/routes/admin/index.ts` both honor `PLAYWRIGHT_MINIMAL_BACKEND=true`. In that mode the backend intentionally skips `saas`, `portal`, `prize-engine`, and some admin route families. If routes appear "missing" during local or CI browser tests, check that flag before debugging the server.

**The critical section: `executeDraw(userId)`.** This is still the most important code path in the repo. In `apps/backend/src/modules/draw/`, inside one DB transaction:
1. Lock user + wallet (`FOR UPDATE`).
2. Debit `draw_cost` and write a `ledger_entries` debit.
3. Apply weights/jitter/EV guard against the cached probability pool, pick a candidate.
4. Lock the prize row, validate eligibility (active, stock, pool/user thresholds, weight, payout caps).
5. Decrement stock, credit reward to `user_wallets.bonus_balance`, write reward ledger entry.
6. Update `house_account.prize_pool_balance` and write `house_transactions`.
7. Persist `draw_records` with fairness + payout-control metadata.

When touching draw or wallet code, preserve the transaction boundary, the lock order, and the ledger writes. The integration suite has concurrency tests; run `pnpm test:integration:critical` before claiming a draw/finance change is done.

**Wallet model.** `users` holds identity + long-lived draw state (`user_pool_balance`, `pity_streak`). `user_wallets` holds operational balances (`withdrawable_balance`, `bonus_balance`, `locked_balance`, `wagered_amount`). `ledger_entries` is the user-facing source of truth for balance history. `house_account` + `house_transactions` mirror the house side. Never mutate balances outside a service-layer transaction that also writes a ledger entry.

**Source of truth for contracts and schema:**
- API contracts: `apps/shared-types/src/{draw,finance,saas,realtime,...}.ts` (Zod + types).
- Drizzle schema: `apps/database/src/modules/{prize,finance,notification,saas,...}.ts`.
- Package boundary rules: `packages/README.md`.
- Module-specific notes: `apps/backend/src/modules/draw/README.md`, `apps/backend/src/modules/payment/README.md`, `apps/backend/src/realtime/README.md`, `apps/backend/src/modules/auth/NOTIFICATIONS.md`.

**Payments default to manual review.** `PAYMENT_OPERATING_MODE=automated` requires the separate `PAYMENT_AUTOMATED_MODE_OPT_IN=true` approval switch before startup will allow automated execution. The payment module now includes adapters, webhook intake, reconciliation, outbound submission, and timeout/compensation loops, but that does not make casual real-money automation acceptable. `payment_providers.config.adapter` is still just a routing key; keep new money-movement work on the existing reviewable queues unless the task is specifically about controlled automation rollout. Provider secrets belong in a secret manager and are referenced by `config.secretRefs.*` only.

**Runtime config lives in `system_config`** (numeric precision): `draw_cost`, `draw_system.*`, `pool_system.*`, `probability_control.*`, `payout_control.*`, `economy.*`, `security.*`. Read/write through the `system` module helpers; do not hardcode.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`).
- `no-explicit-any` is enforced — narrow with Zod or `unknown` + type guards instead of casting.
- Source lives in `src/`; compiled output goes to `dist/`. The repo-root `pnpm check` runs `scripts/check-generated-src-js.mjs`, which fails the build if stray `.js`/`.js.map` siblings show up next to `.ts` sources under `src/`. Do not commit compiled JS into `src/`.
- Use the shared response envelope for every API route (`{ ok, data, requestId }` / `{ ok, error, requestId }`). See `docs/api-outline.md`.

## Operational Notes

- Health probes: `/health`, `/health/live`, `/health/ready`. Metrics at `/metrics` (Prometheus). These are intended for the internal network in production.
- Observability: OpenTelemetry + Sentry are wired into the backend; `pino` is the logger. Auth notifications use `notification_deliveries` as a durable outbox + DLQ; the worker claims rows with `FOR UPDATE SKIP LOCKED` so API and worker replicas scale independently.
- Deployment: single-host Compose template at `docker-compose.prod.yml`, runbooks under `docs/operations/`, executable backup/restore in `deploy/`. CI: `.github/workflows/ci.yml`; deploy: `.github/workflows/deploy.yml`.

## Repo Hygiene Warning

Most historical sync-conflict copies with `" 2"` in the filename have been cleaned up. Source files under `apps/*` and `packages/*` should use the canonical filename only. If a new `* 2.*` file appears in source, treat it as a conflict artifact, do not import from it, and confirm scope before deleting it if it is unstaged user work.

## Deeper References

- `README.md` — quick start, env layout, seed accounts, and SaaS portal demo seed flow.
- `docs/architecture.md` — fuller architecture pass.
- `docs/test-strategy.md` — what each test layer guards and the critical regression matrix.
- `docs/api-outline.md` — full route list and envelope shape.
- `docs/config-reference.md` — runtime/system config reference.
- `docs/environment.md` — every env var, including secret-file `<NAME>_FILE` overrides for production.
- `docs/observability.md` — tracing, metrics, and error-capture notes.
- `docs/operations/README.md` — backup, restore, DR, host-hardening, and secret rotation.
- `packages/README.md` — package boundary rules.
- `apps/backend/src/modules/draw/README.md` — draw module notes.
- `apps/backend/src/modules/payment/README.md` — payment module boundary and dependency map.
- `apps/backend/src/realtime/README.md` — websocket transport rules.
