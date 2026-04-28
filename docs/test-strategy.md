# Test Strategy

## Goals

- Protect critical financial logic (draw flow, balance mutations, config reads).
- Keep test setup light and deterministic.
- Run in CI on every PR/push.

## Scope

- **Unit tests** for:
  - `executeDrawInTransaction` orchestration / happy path
  - `executeDraw` error paths
  - weighted selection (`pickByWeight`)
  - `system_config` read/write helpers and command writers
  - auth guards
- **Integration tests** for backend API routes against a real Postgres instance
  (guarded by `RUN_INTEGRATION_TESTS=true` and now self-bootstrapped by the test runner).
- **Admin page-server tests** for action wiring and backend API request shapes.
- **Frontend unit tests** for shared UI helpers.
- **Critical integration gates** for:
  - draw success / failure (`out_of_stock`, `budget_exhausted`, `payout_limited`)
  - `executeDraw` concurrent inventory consistency
  - admin MFA enrollment + login step-up
  - deposit / withdrawal duplicate submissions and out-of-order review actions
  - freeze / release and config mutation routes
- **Browser e2e regression** for:
  - auth baseline (register -> verify email -> sign in)
  - user main flow (top-up request -> admin approve -> draw -> phone verify -> bank card -> withdrawal request)
  - admin high-risk actions exercised against the real backend (withdraw approval / reject / pay, freeze / release, notification retry, system config change)
- **Load smoke** for authenticated user APIs (`/wallet`, `/draw`) to catch obvious throughput regressions.

## Critical Regression Matrix

| Flow | Coverage | Gate |
| --- | --- | --- |
| Register / verify email / login | `tests/e2e/user-auth.spec.ts` | CI blocking |
| Draw win path | `tests/e2e/critical-flows.spec.ts`, `apps/backend/src/integration/backend.draw.classic.integration.test.ts` | CI blocking |
| Gacha multi-pull + batch limits | `apps/backend/src/integration/backend.draw.gacha.integration.test.ts` | CI blocking |
| Draw failure paths (`out_of_stock`, `budget_exhausted`, `payout_limited`) | `apps/backend/src/integration/backend.draw.classic.integration.test.ts` | CI blocking |
| Draw concurrency consistency | `apps/backend/src/integration/backend.draw.classic.integration.test.ts` | CI blocking |
| Top-up request + admin approve | `tests/e2e/critical-flows.spec.ts`, `apps/backend/src/integration/backend.finance.integration.test.ts` | CI blocking |
| Withdrawal request + approve / reject / pay | `tests/e2e/critical-flows.spec.ts`, `apps/backend/src/integration/backend.finance.integration.test.ts` | CI blocking |
| Admin MFA | `apps/backend/src/integration/backend.auth.integration.test.ts` | CI blocking |
| Freeze / release | `tests/e2e/critical-flows.spec.ts`, `apps/backend/src/integration/backend.admin.integration.test.ts` | CI blocking |
| Notification retry | `tests/e2e/critical-flows.spec.ts` | CI blocking |
| System config change | `tests/e2e/critical-flows.spec.ts`, `apps/backend/src/integration/backend.admin.integration.test.ts` | CI blocking |

## Where Tests Live

- Backend: `apps/backend/src/**/*.test.ts` (Vitest)
- Admin: `apps/admin/src/**/*.test.ts` (Vitest)
- Frontend: `apps/frontend/**/*.test.ts` (Vitest)

## Commands

- `pnpm test` (workspace)
- `pnpm --dir apps/backend test`
- `pnpm test:integration` (full backend integration suite against an ephemeral real Postgres instance)
- `pnpm test:integration:critical` (CI gate for draw / finance / admin-risk regressions)
- `pnpm test:e2e` (full Playwright browser regression suite; requires `pnpm test:e2e:install` once per machine)
- `pnpm test:e2e:critical` (CI gate for auth + core user/admin business flows)
- `pnpm test:load` (`/wallet` + `/draw` authenticated smoke)
- `pnpm test:load:mutations` (`POST /draw` + `POST /rewards/claim` write-path smoke on an ephemeral Postgres instance)

For a post-merge or pre-release full sweep after broad backend, frontend, or SDK
changes, run this set from the repo root:

- `pnpm check`
- `pnpm --dir apps/mobile check` when the native app changed
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm test:load`
- `pnpm test:load:mutations`

CI runs `pnpm test` plus blocking `pnpm test:integration:critical`, `pnpm test:e2e:critical`, and an explicit `pnpm --dir apps/mobile check` gate. Those commands are the merge guard for core draw / funds / admin-risk regressions plus React Native type safety, while the full `pnpm test:integration` and `pnpm test:e2e` suites remain available for broader sweeps. The deploy verify workflow runs the full integration and e2e suites for `staging`, while non-staging deploys stay on the critical gates. `pnpm test:load` remains a repeatable smoke gate for throughput regressions.
