# Web App (Next.js)

This is the primary app for the Prize Pool & Probability Engine System.

## Stack

- Next.js App Router
- Auth.js / NextAuth credentials auth
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

All API traffic goes to the backend service (`apps/backend`).
Set `API_BASE_URL` (server) and `NEXT_PUBLIC_API_BASE_URL` (client) in `.env`.
