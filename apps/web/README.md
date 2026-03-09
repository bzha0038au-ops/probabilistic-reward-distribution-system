# Web App (Next.js)

This is the primary app for the Prize Pool & Probability Engine System.

## Stack

- Next.js App Router
- Auth.js / NextAuth credentials auth
- PostgreSQL + Drizzle ORM
- shadcn/ui components

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## API Routes

- `POST /api/auth/register`
- `POST /api/draw`
- `GET /api/wallet`
- `GET /api/transactions`
- `GET /api/admin/prizes`
- `POST /api/admin/prizes`
- `PATCH /api/admin/prizes/{prizeId}`
- `PATCH /api/admin/prizes/{prizeId}/toggle`
- `GET /api/admin/analytics/summary`

