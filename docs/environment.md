# Environment Variables

## Must Match Across Apps

These values must be identical for auth/session verification to work:

- `AUTH_SECRET` (backend, web, admin)

## Backend (`apps/backend/.env`)

- `DATABASE_URL` / `POSTGRES_URL` (required)
- `AUTH_SECRET` (required)
- `DRAW_COST` (optional seed value for `system_config.draw_cost`)
- `WEB_BASE_URL`, `ADMIN_BASE_URL`, `PORT`
- `ADMIN_JWT_SECRET` (optional override)
- `ADMIN_SESSION_TTL`, `USER_SESSION_TTL` (optional)

## Web (`apps/frontend/.env`)

- `AUTH_SECRET` (required, must match backend)
- `API_BASE_URL` (server-side API base URL)
- `NEXT_PUBLIC_API_BASE_URL` (client-side API base URL)

## Admin (`apps/admin/.env`)

- `AUTH_SECRET` (required, must match backend)
- `API_BASE_URL` (backend base URL)

## Consistency Rules

- `AUTH_SECRET` must match across all apps.
- `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` should point to the same backend.
