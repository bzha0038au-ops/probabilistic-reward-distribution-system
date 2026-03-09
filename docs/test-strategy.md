# Test Strategy

## Goals

- Protect critical financial logic (draw flow, balance mutations, config reads).
- Keep test setup light and deterministic.
- Run in CI on every PR/push.

## Scope

- **Unit tests** for:
  - `executeDraw` error paths
  - weighted selection (`pickByWeight`)
  - `system_config` read/write helpers
- **Integration tests** can be added later for API routes against a test DB.

## Where Tests Live

- Backend: `apps/backend/src/**/*.test.ts` (Vitest)
- Admin: `apps/admin/src/**/*.test.ts` (Vitest, currently empty)

## Commands

- `pnpm test` (workspace)
- `pnpm --dir apps/backend test`

CI runs `pnpm test` as part of the main workflow.
