# Backend Modules

This package contains the Fastify API service and domain modules used by the web app
and admin console.

## Modules

- `modules/admin` (prize pool + analytics)
- `modules/auth` (credential verification helpers)
- `modules/bonus` (bonus grants + release flows)
- `modules/draw` (weighted draw engine)
- `modules/fairness` (commit / reveal seed lifecycle)
- `modules/house` (house account + pool balance mutations)
- `modules/risk` (freeze + suspicious activity)
- `modules/user` (registration + lookup)
- `modules/wallet` (balance + ledger history)
- `modules/bank-card`, `modules/top-up`, `modules/withdraw`
- `modules/system` (system config + pool balance)
- `shared` (config + lightweight logging inspired by Practica)

## Scripts

- `pnpm admin:promote <email>`
- `pnpm user:reset-password <email> <new_password>`
- `pnpm dev` (starts the backend API on port 4000)
- `pnpm check` / `pnpm lint` / `pnpm build`
