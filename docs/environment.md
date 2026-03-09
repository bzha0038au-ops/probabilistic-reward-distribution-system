# Environment Variables

## Must Match Across Apps

These values must be identical for auth/session verification to work:

- `ADMIN_JWT_SECRET` (backend + admin console)

## Backend (`apps/backend/.env`)

- `DATABASE_URL` / `POSTGRES_URL` (required)
- `ADMIN_JWT_SECRET` (required)
- `USER_JWT_SECRET` (required)
- `DRAW_COST` (optional seed value for `system_config.draw_cost`)
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `PORT`
- `ADMIN_JWT_SECRET` (optional override)
- `ADMIN_SESSION_TTL`, `USER_SESSION_TTL` (optional)

## Web (`apps/frontend/.env`)

- `AUTH_SECRET` (required, frontend-only)
- `API_BASE_URL` (server-side API base URL)
- `NEXT_PUBLIC_API_BASE_URL` (client-side API base URL)

## Admin (`apps/admin/.env`)

- `ADMIN_JWT_SECRET` (required, must match backend)
- `API_BASE_URL` (backend base URL)

## Consistency Rules

- `ADMIN_JWT_SECRET` must match between backend and admin.
- `USER_JWT_SECRET` must not be shared with the admin or web secrets.
- `AUTH_SECRET` is only for NextAuth in the web app.
- `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` should point to the same backend.
