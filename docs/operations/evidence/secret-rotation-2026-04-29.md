# Secret Rotation Drill 2026-04-29

- Scope: `admin_jwt`, `user_jwt`
- Environment: `local`
- Operator / approver: `bill` (self-approved)
- Deploy root: `/Users/bill/project/reward system`
- Secret store: `.secrets`
- Drain window: `45s`

## Topology

- Rebuilt a checkout-local file-secret layout under `.secrets/`
- Rebuilt checkout-local ops env files under `.env.d/`
- Verified ops scripts against explicit `OPS_ENV_FILES` so the drill consumed
  file-based secrets instead of the historical `apps/*/.env` inline secrets

## Commands

```bash
OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts status --target admin

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts status --target user

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts stage --target admin --generate --apply

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts stage --target user --generate --apply

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/rotate-secret.ts jwt smoke --target admin --require-previous

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/rotate-secret.ts jwt smoke --target user --require-previous

sleep 46

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts finalize --target admin --apply

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/ops/rotate-jwt.ts finalize --target user --apply

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/rotate-secret.ts jwt smoke --target admin

OPS_ENV_FILES=".env.d/compose.env,.env.d/backend.env,.env.d/frontend.env,.env.d/admin.env" \
  ./node_modules/.bin/tsx scripts/rotate-secret.ts jwt smoke --target user
```

## Observed Results

- Before stage:
  - `admin current`: `f6b406cfca94`
  - `user current`: `d02fec5102ab`
- After stage:
  - `admin previous`: `f6b406cfca94`
  - `admin current`: `b29acef64f81`
  - `user previous`: `d02fec5102ab`
  - `user current`: `7ae873e86580`
- Dual-secret smoke:
  - `admin current`: backend/admin accepted
  - `admin previous`: backend/admin accepted
  - `user current`: backend/frontend/portal accepted
  - `user previous`: backend/frontend/portal accepted
- After finalize:
  - `.secrets/admin_jwt_secret_previous` removed
  - `.secrets/user_jwt_secret_previous` removed
  - current-only smoke still passed for admin and user

## Limitations

- This drill did not execute a SaaS canary API-key rotation.
- This drill is local-only evidence and must not be described as production
  rotation proof.
