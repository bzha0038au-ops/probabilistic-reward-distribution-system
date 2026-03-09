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

All API traffic now goes to the backend service (`apps/backend`).
Set `NEXT_PUBLIC_API_BASE_URL` in `.env`.
