# Observability

## Logging

The backend uses a shared logger (`apps/backend/src/shared/logger.ts`) that:
- Writes structured logs via Pino
- Includes request context fields (`requestId`, `traceId`, `userId`, `role`, `locale`)

Use `logger.info|warning|error|debug(message, metadata)` from services and routes.

## Tracing

We propagate a trace identifier using headers:
- `x-trace-id` (preferred)
- `x-request` (legacy fallback; backend will mirror to `x-trace-id`)

The request context plugin ensures every request has a trace id. If the client
does not send one, the backend generates it and returns it in the response headers.

## Guidelines

- Always include structured metadata on warnings/errors (ids, amounts, table names).
- Never log secrets or passwords.
- Use `x-trace-id` when calling the API from web/admin clients to correlate logs.
