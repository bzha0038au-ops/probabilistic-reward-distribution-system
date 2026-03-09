# API Outline

## Response Envelope

Success:
```json
{ "ok": true, "data": {}, "requestId": "optional" }
```

Error:
```json
{ "ok": false, "error": { "message": "string", "code": "optional", "details": ["optional"] }, "requestId": "optional" }
```

## Auth

- `GET /health`
- `POST /auth/register`
- `POST /auth/user/session` (returns backend token for web sessions)
- `POST /auth/admin/login` (returns admin token; stored as `reward_admin_session`)

## Auth Headers

- User routes require `Authorization: Bearer <token>`
- Admin routes require the `reward_admin_session` cookie

## User

- `GET /wallet`
- `GET /transactions?limit=50`
- `POST /draw`
- `GET /bank-cards`
- `POST /bank-cards`
- `PATCH /bank-cards/{bankCardId}/default`
- `GET /top-ups`
- `POST /top-ups`
- `GET /withdrawals`
- `POST /withdrawals`

## Admin

- `GET /admin/prizes`
- `POST /admin/prizes`
- `PATCH /admin/prizes/{prizeId}`
- `PATCH /admin/prizes/{prizeId}/toggle`
- `DELETE /admin/prizes/{prizeId}` (soft delete)
- `GET /admin/analytics/summary`
