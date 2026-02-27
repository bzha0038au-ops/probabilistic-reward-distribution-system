# API Outline

## Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

## User

- `GET /api/wallet`
- `GET /api/wallet/history?limit=50`
- `POST /api/draw`

## Admin

- `GET /api/admin/prizes`
- `POST /api/admin/prizes`
- `PUT /api/admin/prizes/{prize}`
- `PATCH /api/admin/prizes/{prize}/toggle`
- `GET /api/admin/analytics/summary`
