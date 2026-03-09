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

- `users` stores identity plus long-lived draw state such as `user_pool_balance`,
  `pity_streak`, `last_draw_at`, and `last_win_at`.
- `user_wallets` stores operational balances: `withdrawable_balance`,
  `bonus_balance`, `locked_balance`, and `wagered_amount`.
- `ledger_entries` is the user-facing source of truth for balance history.
- `house_account` holds prize pool, bankroll, reserve, and marketing balances.
- `house_transactions` mirrors all house-side balance movements.

## Runtime Config

Operational values are stored in `system_config` with numeric precision:
- `draw_cost`
- `draw_system.*`
- `pool_system.*`
- `probability_control.*`
- `payout_control.*`
- `economy.*`
- `security.*`

## Transaction Boundary

`executeDraw(userId)` is the main critical section:

1. Lock the user + wallet snapshot (`FOR UPDATE`)
2. Deduct draw cost and write a `ledger_entries` debit
3. Load cached probability pool, apply weights/jitter/EV guard, and pick a candidate
4. Lock the selected prize row and validate eligibility (stock, thresholds, budgets, payout limits)
5. Decrement stock
6. Credit reward into `user_wallets.bonus_balance` and write a reward ledger entry
7. Update `house_account.prize_pool_balance` and persist `house_transactions`
8. Record draw history with fairness, payout-control, and probability metadata

## Eligibility Rules

A prize is eligible when (validated after the candidate is picked and locked):
- `is_active = true`
- `stock > 0`
- `pool_threshold <= effective house prize pool`
- `user_pool_threshold <= users.user_pool_balance`
- `weight > 0`

## Observability

- `ledger_entries` keeps every user balance movement
- `house_transactions` keeps every house-side movement
- `draw_records` stores outcome and metadata
- Admin summary aggregates wins, distributions, spend

## Auth Notes

- Web credentials flow obtains a backend session token via `POST /auth/user/session`.
- The web app includes `Authorization: Bearer <token>` on API calls.
- Admin login uses `POST /auth/admin/login` and stores the token in
  `reward_admin_session`.
- Secrets are split: `USER_JWT_SECRET` (backend only), `ADMIN_JWT_SECRET`
  (backend + admin), `AUTH_SECRET` (web only).
