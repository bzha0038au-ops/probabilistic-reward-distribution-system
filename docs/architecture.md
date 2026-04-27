# Architecture Notes

## Stack

- Next.js App Router (user-facing web)
- Expo + React Native (user-facing iOS + Android)
- SvelteKit (admin console)
- Fastify API service (backend)
- Dedicated auth-notification worker process (backend)
- Drizzle ORM with PostgreSQL
- Auth.js / NextAuth (web) + shared user-core API layer + backend-issued admin sessions

## Layering

- Fastify routes: request parsing + response mapping
- Service layer: draw orchestration, balance mutations, analytics
- Data access: Drizzle schema + SQL transactions
- Shared contracts: `apps/shared-types` (Zod + TS types)
- Shared user client: `packages/user-core` (routes, API request helpers, platform base URLs)

## Source Of Truth

- Draw contract/statuses: `apps/shared-types/src/draw.ts`
- Finance contract/statuses: `apps/shared-types/src/finance.ts`
- Notification contract/statuses: `apps/shared-types/src/notification.ts`
- Finance persistence schema: `apps/database/src/modules/finance/index.ts`
- Draw persistence schema: `apps/database/src/modules/prize.ts`
- Notification persistence schema: `apps/database/src/modules/notification.ts`
- Module notes: `apps/backend/src/modules/draw/README.md`,
  `apps/backend/src/modules/payment/README.md`,
  `apps/backend/src/modules/auth/NOTIFICATIONS.md`

## Wallet Model

- `users` stores identity plus long-lived draw state such as `user_pool_balance`,
  `pity_streak`, `last_draw_at`, and `last_win_at`.
- `user_wallets` stores operational balances: `withdrawable_balance`,
  `bonus_balance`, `locked_balance`, and `wagered_amount`.
- `ledger_entries` is the user-facing source of truth for balance history.
- `house_account` holds prize pool, bankroll, reserve, and marketing balances.
- `house_transactions` mirrors all house-side balance movements.

## Payment Boundary

- Deposits and withdrawals currently stop at internal order creation, balance
  locking, admin review metadata, and ledger updates.
- `payment_providers.config.adapter` is only a routing key that selects a
  backend adapter implementation. Admin configuration must not own raw gateway
  HTTP request construction or direct third-party execution behavior.
- Payment execution belongs behind a code-level adapter contract
  (`createDepositOrder`, `createWithdrawal`, `queryOrder`, `handleWebhook`,
  `verifySignature`, `buildIdempotencyKey`,
  `mapProviderStatusToInternalStatus`).
- The backend does not yet own a real payment gateway loop: no outbound gateway
  calls, no webhook callback entrypoint, no callback signature verification, no
  idempotency keys, and no automatic recovery/compensation.
- Scheduled payment reconciliation now runs independently from webhooks and
  writes persistent run history plus a manual-review diff queue.
- Treat the finance module as manual-review money movement only until those
  pieces exist end to end.
- `payment_providers.config` is reserved for non-secret routing and risk fields
  such as channel enablement, priority, supported flows, limits, currency,
  callback allowlists, route tags, and risk thresholds.
- Provider secrets such as API keys, private keys, certificates, and signing
  keys must live in a secret manager or KMS. Only secret reference ids belong
  in provider config, under `config.secretRefs.*`.

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
- `notification_deliveries` acts as a durable outbox / dead-letter store
- A separate auth-notification worker claims rows with `FOR UPDATE SKIP LOCKED`
  so API replicas and worker replicas can scale independently

## Auth Notes

- Web credentials flow obtains a backend session token via `POST /auth/user/session`.
- The web app stores that backend token only inside the Auth.js encrypted
  httpOnly session cookie.
- Browser business requests go to the Next.js BFF under `/api/backend/*`, and
  the server layer forwards them to the backend with the backend token.
- The Expo mobile app calls the same user endpoints through `@reward/user-core`
  and sends the backend token as a bearer token on native requests.
- Admin login uses `POST /auth/admin/login` and stores the token in
  `reward_admin_session`.
- Secrets are split: `USER_JWT_SECRET` (backend only), `ADMIN_JWT_SECRET`
  (backend + admin), `AUTH_SECRET` (web only).
