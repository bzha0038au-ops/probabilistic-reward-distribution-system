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
  (guarded by `RUN_INTEGRATION_TESTS=true`).
- **Admin page-server tests** for action wiring and backend API request shapes.
- **Frontend unit tests** for shared UI helpers.

## Where Tests Live

- Backend: `apps/backend/src/**/*.test.ts` (Vitest)
- Admin: `apps/admin/src/**/*.test.ts` (Vitest)
- Frontend: `apps/frontend/**/*.test.ts` (Vitest)

## Commands

- `pnpm test` (workspace)
- `pnpm --dir apps/backend test`
- `pnpm test:integration` (requires local Postgres; see `docker-compose.yml`)

CI runs `pnpm test` as part of the main workflow.
