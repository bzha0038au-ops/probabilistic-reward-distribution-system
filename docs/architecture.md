# Architecture Notes

## Stack

- Next.js App Router (user-facing web)
- SvelteKit (admin console)
- Fastify API service (backend)
- Drizzle ORM with PostgreSQL
- Auth.js / NextAuth (web) + backend-issued admin sessions

## Layering

- Fastify routes: request parsing + response mapping
- Service layer: draw orchestration, balance mutations, analytics
- Data access: Drizzle schema + SQL transactions
- Shared contracts: `apps/shared-types` (Zod + TS types)

## Wallet Model

User balances are stored directly on the `users` table (wallets merged).

## Runtime Config

Operational values are stored in `system_config` with numeric precision:
- `pool_balance`
- `draw_cost`

## Transaction Boundary

`executeDraw(userId)` is the main critical section:

1. Lock user balance row (`FOR UPDATE`)
2. Deduct draw cost + log transaction
3. Determine eligible prizes by pool balance + weight
4. Lock selected prize row
5. Decrement stock
6. Credit reward + log transaction
7. Record draw history
8. Update pool balance

## Eligibility Rules

A prize is eligible when:
- `is_active = true`
- `stock > 0`
- `pool_threshold <= pool_balance`
- `weight > 0`

## Observability

- Ledger keeps every balance movement
- Draw records store outcome and metadata
- Admin summary aggregates wins, distributions, spend

## Auth Notes

- Web credentials flow obtains a backend session token via `POST /auth/user/session`.
- The web app includes `Authorization: Bearer <token>` on API calls.
- Admin login uses `POST /auth/admin/login` and stores the token in
  `reward_admin_session`.
