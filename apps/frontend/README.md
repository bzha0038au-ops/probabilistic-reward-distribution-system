# Web App (Next.js)

This is the web member of the user-facing three-surface stack.

## Stack

- Next.js App Router
- Auth.js / NextAuth credentials auth
- Frontend BFF under `/api/backend/*` for browser-originated requests
- shadcn/ui components
- Backend services from `apps/backend`

## Local Development

```bash
# from repo root
pnpm install
cd apps/frontend
cp .env.example .env
pnpm dev
```

## API Routes

Browser-side business requests go through the frontend BFF under `/api/backend/*`.
Set both `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` in `.env` so server and browser
surfaces resolve the same backend base URL during local development.
