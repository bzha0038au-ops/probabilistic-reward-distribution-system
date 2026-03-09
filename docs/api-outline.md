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
- Use `x-trace-id` to correlate requests across systems

## User

- `GET /stats`
- `GET /fairness/commit`
- `GET /fairness/reveal?epoch=...`
- `GET /wallet`
- `GET /transactions?limit=50` (returns `ledger_entries` history)
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
- `GET /admin/auth-events?cursor=...&direction=next`
- `GET /admin/auth-events/export`
- `GET /admin/admin-actions?cursor=...&direction=next`
- `GET /admin/admin-actions/export`
- `GET /admin/freeze-records?page=1`
- `POST /admin/freeze-records`
- `POST /admin/freeze-records/{userId}/release`
- `GET /admin/system-config`
- `PATCH /admin/system-config`
