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
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /auth/register`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/user/session` (returns backend token for web sessions)
- `GET /auth/user/session`
- `GET /auth/user/sessions`
- `DELETE /auth/user/session`
- `DELETE /auth/user/sessions/{sessionId}`
- `POST /auth/user/sessions/revoke-all`
- `POST /auth/admin/login` (returns admin token; stored as `reward_admin_session`)
- `GET /auth/admin/session`
- `GET /auth/admin/sessions`
- `DELETE /auth/admin/session`
- `DELETE /auth/admin/sessions/{sessionId}`
- `POST /auth/admin/sessions/revoke-all`
- `POST /auth/email-verification/request`
- `POST /auth/email-verification/confirm`
- `POST /auth/phone-verification/request`
- `POST /auth/phone-verification/confirm`

## Auth Headers

- User routes require a backend session token. The web frontend supplies it from
  the server-side BFF, not from browser JavaScript.
- Admin routes require the `reward_admin_session` cookie
- Use `x-trace-id` to correlate requests across systems
- Password reset, verification, and anomalous-login notifications are persisted in
  the auth notification outbox and delivered asynchronously with retries.
- Interactive notification endpoints can return `429` when per-email/phone
  throttles are hit or `503` when delivery providers are unavailable.

## User

- `POST /top-ups` and `POST /withdrawals` currently create internal finance
  orders only. They do not execute a payment gateway or auto-settle real-money
  movement.
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

- `GET /admin/payment-capabilities` (manual-review capability overview; lists
  missing automation gaps before real-money auto-settlement is possible; also
  returns payment provider config governance and plaintext secret findings)
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
- `GET /admin/notification-deliveries`
- `POST /admin/notification-deliveries/{deliveryId}/retry`
- `POST /admin/freeze-records`
- `POST /admin/freeze-records/{userId}/release`
- `GET /admin/system-config`
- `PATCH /admin/system-config`
