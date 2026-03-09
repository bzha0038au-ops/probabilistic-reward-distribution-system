# Prize Pool & Probability Engine System

A portfolio-grade, full-stack **virtual balance draw platform** built with:
- **Next.js** (user-facing web)
- **SvelteKit** (admin console)
- **Fastify** (backend API)
- **Auth.js / NextAuth** (web credentials auth) + backend-issued admin sessions
- **PostgreSQL + Drizzle ORM** (transaction-safe ledger and inventory)
- **shadcn/ui** components for the frontend

## Project Goals

- Transaction-safe wallet operations
- Configurable prize pools with weighted probabilities
- Row-level inventory locking
- Full audit trail of balance changes
- Admin controls + analytics dashboard

## Repository Structure

```
.
├── apps
│   ├── frontend         # Client app (user-facing UI)
│   ├── admin            # Admin console (SvelteKit, admin UI lives here)
│   ├── backend          # HTTP API + domain services
│   └── database         # Drizzle schema + migrations (no business logic)
├── docs
│   ├── architecture.md
│   └── api-outline.md
└── references           # Source templates (ignored from git)
```

## Core Modules

- Authentication (credentials) + role-based access
- Wallet + transactions (atomic balance mutations)
- Prize pool management (weights, thresholds, stock)
- Draw engine (weighted selection + row locks)
- Admin analytics (distribution, spend, pool balance)

## Database Tables

- `users` (merged user + balance)
- `admins`, `admin_permissions`
- `bank_cards`, `top_ups`, `withdrawals`
- `prizes`, `draw_records`, `transactions`, `system_config`

## Operational Config

- `system_config` stores runtime parameters like `pool_balance` and `draw_cost`
  as numeric values (adjustable without redeploy).

## Concurrency Strategy

- All draw mutations run in a **single DB transaction**
- `SELECT ... FOR UPDATE` on wallet + prize rows
- Stock decrements happen only after lock
- Every balance change is logged in `transactions`

## Runtime Topology

- `apps/frontend` (web) and `apps/admin` (admin console) are separate frontends.
- Both call the same backend API (`apps/backend`) and share the same Postgres database.
- Frontends do not access the database directly.

## Auth Flow

- Web: NextAuth credentials flow calls `POST /auth/user/session` to obtain a backend token.
- API calls from the web include `Authorization: Bearer <token>`.
- Admin: SvelteKit console calls `POST /auth/admin/login` and stores the token in
  `reward_admin_session` for admin-only routes.

## Quick Start (Local)

1. `pnpm install`
2. `cd apps/database`
3. Copy env: `cp .env.example .env` (or set `DATABASE_URL`)
4. Run migrations:
   - `pnpm db:migrate`
5. Start the backend API: `cd ../backend && pnpm dev`
6. Start the client: `cd ../frontend && pnpm dev` (no DB connection needed)
7. Start the admin console: `cd ../admin && pnpm dev` (no DB connection needed, visit `/admin`)

## Environment

- Backend: `DATABASE_URL`, `AUTH_SECRET`, optional `DRAW_COST`
- Frontend: `AUTH_SECRET`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`
- Admin: `API_BASE_URL`, `AUTH_SECRET`

## Notes

The `references/` folder contains the five source repos used for UI and structure inspiration:
- `nextjs-postgres-auth-starter` (base auth + credentials flow)
- `ui` (shadcn/ui components)
- `Next-JS-Landing-Page-Starter-Template` (marketing layout patterns + assets)
- `CMSaasStarter` (CMS shell)
- `practica` (backend config/logging structure inspiration)
