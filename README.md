# Probabilistic Reward Distribution System

A portfolio-oriented full-stack project for **virtual-balance draws**, focused on:
- transaction-safe wallet operations
- configurable prize pool management
- weighted probability engine
- concurrency-safe inventory deduction
- admin analytics and controls

## Tech Stack

- Backend: Laravel (PHP), MySQL/PostgreSQL, Sanctum/JWT-style token auth
- Frontend: React (planned; Blade can be used for MVP)
- Architecture: Controller -> Service -> Repository -> Model

## Core Goals

- Keep all financial mutations atomic
- Prevent negative balances and oversold inventory
- Keep business logic in Service layer (not Controller)
- Maintain extensible design for future production hardening

## Repository Structure

```text
.
├── backend
│   ├── app
│   │   ├── Http/Controllers
│   │   ├── Models
│   │   ├── Repositories
│   │   └── Services
│   ├── config
│   ├── database/migrations
│   ├── routes
│   └── tests
├── frontend
│   └── src
└── docs
```

## Database Tables (Planned)

- `users`
- `wallets`
- `transactions`
- `prizes`
- `draw_records`
- `system_config`

## Concurrency & Consistency Strategy

- Use `DB::transaction()` for draw flow and balance changes
- Use row-level lock (`lockForUpdate`) on wallet and prize rows
- Verify stock and balance after locking
- Record every balance mutation in `transactions`
- Roll back on all domain/technical exceptions

## Draw Flow (Service-level)

1. Lock wallet row and validate available balance
2. Deduct draw cost and record `debit_draw`
3. Select eligible prize by weighted random algorithm
4. Lock selected prize row and verify stock/threshold
5. Decrement stock
6. Credit reward and record `credit_reward`
7. Record draw history
8. Commit transaction

## Non-Goals

- No real payment gateway
- No WebSocket
- No microservices
- No blockchain

## Future Extensions

- Idempotency keys for draw requests
- Retry + dead-letter strategy for async settlement
- Feature flags for probability experiments
- Fraud/risk control module
- A/B testing for prize configuration

## Status

This repository currently contains an initial, Laravel-style skeleton:
- migrations
- model definitions
- service layer skeleton
- API route draft
- admin analytics service

