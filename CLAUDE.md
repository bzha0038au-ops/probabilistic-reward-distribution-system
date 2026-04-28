# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Shape

pnpm workspace (`pnpm-workspace.yaml`) with two roots:

- `apps/*` — `frontend` (Next.js 14 + next-auth 5 beta, C-side users), `mobile` (Expo 54 / RN 0.81, iOS+Android, C-side users), `admin` (SvelteKit 2 / Svelte 5, internal staff), `saas-portal` (Next.js, B-side tenant self-service), `backend` (Fastify 4 API + workers), `database` (Drizzle 0.29 schema + migrations), `shared-types` (Zod contracts).
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

**One reward+risk OS, two product surfaces.** B-side and C-side are not two independent systems and not the same product reskinned. They share an **engine layer** and diverge at the **product layer**.

- **Shared engine (build once, used by both):** randomized reward engine, budget control, risk constraints, distribution stability (variance / payout caps), ledger (user + house), audit, fairness, `system_config` runtime knobs, observability/alerting, and the generic portion of the funds/freeze/compliance foundation. The C-side `executeDraw` transaction discipline (lock order, ledger writes, house mirror) is engine-layer; pity / gacha framing / user-facing copy is product-layer.
- **Not shared (product surfaces):** C-side wraps the engine into consumer-visible products (wallet, draw, blackjack, Texas, prediction markets, forum, KYC, signing, live dealer). B-side wraps the *same engine* into a strategy-reward API for AI agents — inputs: behavior + score + novelty + risk; outputs: budget- and variance-constrained randomized reward decisions.

**Decision rule when adding code:** is this an *engine* concern (selection, budgets, variance, ledger, audit, fairness, freeze taxonomy) or a *product surface* concern (UX, framing, customer-specific contract)? Engine code must work for both consumers and agent tenants — don't bake C-side assumptions (single human user, wallet UI, pity streaks) into it. If you find yourself reimplementing weighted selection, variance bounds, or ledger writes inside a product module, push it down to the engine.

---

- **C-side (consumer reward + funds-account platform)** — `apps/frontend` (web) + `apps/mobile` (Expo), sharing routes/contracts/request helpers via `packages/user-core`. Goal: end users register/login, manage a wallet, top up / withdraw, claim rewards, play single-player + multiplayer games, participate in prediction markets, and engage with community. `apps/admin` (SvelteKit) is the internal console for higher-risk C-side operations, organized into `(engine) / (c) / (b)` route groups.
  - **Shipped (post `b08a6fa` platform expansion):** web+mobile shells, account/session/security incl. user MFA, wallet + ledger reconciliation daemon, top-up + withdrawal application, reward center with data-driven mission engine, single-player games (draw, blackjack, quick-eight), **funds-freeze taxonomy** with reason × scope, **KYC** (tiered, doc upload, admin review queue), **AML screening** (provider-pluggable, hits queue), **legal-document signing** (versioned, forced re-acceptance), **Texas Hold'em** on the multiplayer substrate, **shared-pool prediction markets**, **realtime substrate** (WebSocket, table/seat/round state machine, time bank, hand history, anti-collusion hooks), **forum moderation**.
  - **Not yet built:** live-dealer video pipeline, gameplay enhancement modes (dual bet, deferred doubling, snowball — these are product-layer wrappers, do not push down into engine).
- **B-side (SaaS reward-engine API)** — `apps/backend/src/modules/saas` + `packages/prize-engine-sdk` + `saas-billing-worker` + `apps/saas-portal` (tenant self-service) is a **cross-platform anti-exploit reward engine API for AI agents**. Customers are B2B platforms hosting AI agents (think ecosystems like b.ai where agents earn money — that's the *reference ecosystem this plugs into*, not a competitor).
  - **API shape:** `POST /v1/engine/rewards` takes `{ environment, agent, behavior, riskEnvelope?, budget?, idempotencyKey }`; legacy `POST /v1/engine/draws` retained for back-compat. Outputs are reward decisions constrained by per-tenant budget and variance envelopes. Supports single-agent and multi-agent (`groupId`) reward mechanisms.
  - **Shipped:** four selection strategies (`weighted_gacha`, `epsilon_greedy`, `softmax`, `thompson`), `saasRewardEnvelopes` (window × cap-hit-strategy × scope), `agentRiskState` + `agentBlocklist` anti-exploit pipeline, `saasDistributionSnapshots` + `/v1/engine/observability/distribution`, `fairness-audit-worker` (auto reveal + verify), `saasOutboundWebhooks` with HMAC + delivery tracking, real `sandbox` vs `live` environment isolation (envelope/ledger/distribution/billing all bucketed), TS + Python SDKs with idempotency + retry, `saas-portal` Next.js tenant portal.
  - **Not yet built:** zero-friction tenant onboarding (auto-provision sandbox project + sample prizes + copy-paste SDK snippet on signup).

All surfaces call the Fastify backend in `apps/backend`. The backend is the only thing that touches Postgres or Redis.

**Do not reuse C-side UX patterns (pity, user wallet displays, gacha framing) for B-side saas features.** The reward-selection logic on the B-side is bandit/exploration-shaped, not gacha-shaped — distribution design, parameter control, risk constraints, and dynamic adjustment across calls are first-class concerns. The C-side `executeDraw` transaction discipline (lock order, ledger writes) is still a useful template for atomicity, but the selection algorithm and tenant-scoped budget/variance envelopes are different concerns.

**Auth is split, deliberately.** Three secrets that must not be reused:
- `USER_JWT_SECRET` — backend only (issues user session tokens).
- `ADMIN_JWT_SECRET` — backend + admin console (must match between them).
- `AUTH_SECRET` — Next.js / Auth.js only.

Web flow: NextAuth credentials → `POST /auth/user/session` returns a backend token → stored only in the encrypted httpOnly Auth.js cookie. Browser business calls go to the Next BFF at `/api/backend/*`, which forwards them to the backend with the backend token. The Expo app calls the same endpoints through `@reward/user-core` and sends the backend token as a bearer header. Admin login (`POST /auth/admin/login`) sets `reward_admin_session`. There are extra admin-MFA secrets (`ADMIN_MFA_ENCRYPTION_SECRET`, `ADMIN_MFA_BREAK_GLASS_SECRET`) that must also be distinct in production.

**Layering inside the backend** (`apps/backend/src/`):
- `http/routes/**` — Fastify routes do request parsing + response mapping only. Use the shared response envelope (`shared/respond.ts`); do **not** put business logic here (`CONTRIBUTING.md`).
- `http/validators/**` — Zod request validators.
- `modules/<domain>/service.ts` — orchestration, transactions, balance mutations.
- Domain modules: `admin`, `admin-mfa`, `admin-permission`, `aml`, `audit`, `auth`, `bank-card`, `blackjack`, `bonus`, `community`, `control`, `crypto`, `draw`, `engine-reconciliation`, `fairness`, `forum`, `gamification`, `hand-history`, `holdem`, `house`, `kyc`, `legal`, `mfa`, `payment`, `play-mode`, `prediction-market`, `quick-eight`, `risk`, `saas`, `session`, `system`, `table-engine`, `table-monitoring`, `top-up`, `user`, `user-mfa`, `wallet`, `withdraw`.
  - **Engine layer** (B/C shared, do not duplicate): `table-engine` (table/seat/round state machine), `hand-history` (event-sourced replay), `table-monitoring` (anti-collusion + ops view), `fairness`, `engine-reconciliation`, `risk` (freeze taxonomy + scope), `audit`, `system` (`system_config` knobs), `mfa` (shared TOTP primitives consumed by `user-mfa` + `admin-mfa`).
  - **C-side product modules** wrap the engine: games (`draw`, `blackjack`, `quick-eight`, `holdem`, `prediction-market`), reward (`gamification`, `bonus`), compliance (`kyc`, `aml`, `legal`), social (`forum`, `community`), funds (`wallet`, `top-up`, `withdraw`, `payment`, `bank-card`, `crypto`, `house`), play UX (`play-mode`). All share wallet/ledger invariants — debit/credit goes through the service-layer transaction pattern modeled by `draw`. `holdem` and `prediction-market` build on `table-engine` + `hand-history`; never reimplement those.
  - **B-side product module** is `saas` only — a reward-engine API for AI-agent platforms. Concerns: tenant-scoped budgets, variance envelopes, exploration vs. exploitation, anti-exploit guards. **Never** import C-side product modules from `saas`, and never push C-side framing (pity, user wallet, gacha copy) into engine code.
- `workers/` — separate processes: `auth-notification`, `payment-outbound`, `payment-operations`, `payment-webhook`, `payment-reconciliation`, `wallet-reconciliation` (daily ledger-integrity audit, writes `reconciliation_alerts`), `saas-billing`, `fairness-audit` (auto-reveal + verify B-side fairness epochs), `holdem-timeout` + `blackjack-timeout` (force-action on time-bank expiry). Production runs these as their own containers; do not move their loops back into the API process.
- Route registration order in `http/routes/index.ts`: observability → internal → payment → saas → prize-engine → auth → user → admin.

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
- API contracts: `apps/shared-types/src/*.ts` (Zod + types). Notable: `saas.ts` (B-side reward engine + envelopes + strategies), `holdem.ts` + `realtime.ts` + `hand-history.ts` + `table-engine.ts` + `table-monitoring.ts` (multiplayer substrate), `prediction-market.ts`, `kyc.ts` + `aml.ts` + `legal.ts` (compliance), `community.ts` + `forum.ts`, `play-mode.ts`, `risk.ts`.
- Drizzle schema: `apps/database/src/modules/*.ts`.
- Module-specific notes: `apps/backend/src/modules/draw/README.md`, `.../payment/README.md`, `.../auth/NOTIFICATIONS.md`.

**Payments default to manual review.** `PAYMENT_OPERATING_MODE=automated` now requires the separate `PAYMENT_AUTOMATED_MODE_OPT_IN=true` approval switch before startup will allow automated execution. The backend still needs explicit operational review before enabling real-money automation. `payment_providers.config.adapter` is just a routing key; don't add code that auto-settles funds casually, and keep new payment work on the existing manual-review queues unless the task is specifically about controlled automation rollout. Provider secrets belong in a secret manager and are referenced by `config.secretRefs.*` only.

**Runtime config lives in `system_config`** (numeric precision): `draw_cost`, `draw_system.*`, `pool_system.*`, `probability_control.*`, `payout_control.*`, `economy.*`, `security.*`. Read/write through the `system` module helpers; do not hardcode.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`).
- `no-explicit-any` is enforced — narrow with Zod or unknown + type guards instead of casting.
- Source lives in `src/`; compiled output goes to `dist/`. The repo-root `pnpm check` runs `scripts/check-generated-src-js.mjs`, which fails the build if stray `.js`/`.js.map` siblings show up next to `.ts` sources under `src/`. Don't commit compiled JS into `src/`.
- Use the shared response envelope for every API route. Success: `{ ok: true, data, requestId?, traceId? }`; failure: `{ ok: false, error: { message, code?, details? }, requestId?, traceId? }`. Helper: `apps/backend/src/http/respond.ts`. See `docs/api-outline.md`.
- JWT secret rotation: each of `USER_JWT_SECRET` and `ADMIN_JWT_SECRET` accepts a `*_PREVIOUS` companion var so old tokens validate during rotation. Startup validation (`apps/backend/src/shared/session-secret.ts`) enforces all secrets are pairwise-distinct and ≥32 chars in production — including `ADMIN_MFA_ENCRYPTION_SECRET` and `ADMIN_MFA_BREAK_GLASS_SECRET`.

## Operational Notes

- Health probes: `/health`, `/health/live`, `/health/ready`. Metrics at `/metrics` (Prometheus). These are intended for the internal network in production.
- Observability: OpenTelemetry + Sentry are wired into the backend; `pino` is the logger. Auth notifications use `notification_deliveries` as a durable outbox + DLQ; the worker claims rows with `FOR UPDATE SKIP LOCKED` so API and worker replicas scale independently.
- Deployment: single-host Compose template at `docker-compose.prod.yml`, runbooks under `docs/operations/`, executable backup/restore in `deploy/`. CI: `.github/workflows/ci.yml`; deploy: `.github/workflows/deploy.yml`.

## Repo Hygiene Warning

Most of the historical `" 2"` sync-conflict duplicates have been cleaned. One known straggler remains: `apps/backend/src/integration/backend.finance.webhook.integration.scenarios 2.ts`. Treat any `* 2.*` file as a sync-conflict copy — do not edit, build, or import from it; use the canonical name. If asked to clean them up, confirm scope with the user first since they are typically unstaged.

## Deeper References

- `README.md` — quick start, env layout, default seed accounts.
- `docs/architecture.md` — fuller architecture pass.
- `docs/test-strategy.md` — what each test layer guards and the critical regression matrix.
- `docs/api-outline.md` — full route list and envelope shape.
- `docs/environment.md` — every env var, including secret-file `<NAME>_FILE` overrides for production.
- `docs/operations/README.md` — backup, restore, DR, host-hardening, secret rotation.
