# Prize Pool & Probability Engine System

A portfolio-grade, full-stack **virtual balance draw platform** built with:
- **Next.js** (UI + API routes)
- **Auth.js / NextAuth** (credentials auth)
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
│   └── web              # Next.js app (UI + API routes)
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

## Concurrency Strategy

- All draw mutations run in a **single DB transaction**
- `SELECT ... FOR UPDATE` on wallet + prize rows
- Stock decrements happen only after lock
- Every balance change is logged in `transactions`

## Quick Start (Local)

1. `cd apps/web`
2. `pnpm install`
3. Copy env: `cp .env.example .env`
4. Set `POSTGRES_URL` + `AUTH_SECRET`
5. Run migrations:
   - `pnpm db:generate`
   - `pnpm db:migrate`
6. Start: `pnpm dev`

## Notes

The `references/` folder contains the five source repos used for UI and structure inspiration. It is ignored in git to keep the main codebase clean.

