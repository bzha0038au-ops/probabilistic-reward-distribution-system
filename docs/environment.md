# Environment Variables

## Must Match Across Apps

These values must be identical for auth/session verification to work:

- `ADMIN_JWT_SECRET` (backend + admin console)

## Backend (`apps/backend/.env`)

- `DATABASE_URL` / `POSTGRES_URL` (required)
- `ADMIN_JWT_SECRET` (required)
- `USER_JWT_SECRET` (required)
- `DRAW_COST` (optional seed value for `system_config.draw_cost`)
- `DRAW_POOL_CACHE_TTL_SECONDS` (optional, probability pool cache TTL; `0` disables)
- `REDIS_URL` (optional, enables shared rate limiting + probability pool cache)
- `AUTH_NOTIFICATION_WEBHOOK_URL` (optional but required for production delivery of
  password reset, verification, and login alert messages)
- `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES`,
  `PHONE_VERIFICATION_TTL_MINUTES` (optional token/code TTL overrides)
- `ANOMALOUS_LOGIN_LOOKBACK_DAYS` (optional; login anomaly comparison window)
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `PORT`
- `ADMIN_JWT_SECRET` (optional override)
- `ADMIN_SESSION_TTL`, `USER_SESSION_TTL` (optional)

## Web (`apps/frontend/.env`)

- `AUTH_SECRET` (required, frontend-only)
- `API_BASE_URL` (server-side API base URL)

## Admin (`apps/admin/.env`)

- `ADMIN_JWT_SECRET` (required, must match backend)
- `API_BASE_URL` (backend base URL)

## Consistency Rules

- `ADMIN_JWT_SECRET` must match between backend and admin.
- `USER_JWT_SECRET` must not be shared with the admin or web secrets.
- `AUTH_SECRET` is only for NextAuth in the web app.
- In production, JWT secrets must be at least 32 characters.
- In production, configure `AUTH_NOTIFICATION_WEBHOOK_URL`; otherwise reset and
  verification tokens are created but not delivered to end users.
