# API Outline

## Auth

- `POST /api/auth/register`
- `POST /api/auth/*` (Auth.js / NextAuth handlers)

## User

- `GET /api/wallet`
- `GET /api/transactions?limit=50`
- `POST /api/draw`

## Admin

- `GET /api/admin/prizes`
- `POST /api/admin/prizes`
- `PATCH /api/admin/prizes/{prizeId}`
- `PATCH /api/admin/prizes/{prizeId}/toggle`
- `GET /api/admin/analytics/summary`
