# Observability

## Goal

For any user-reported failure, on-call should be able to pivot within a few
minutes from:

- the frontend or admin error event
- to the backend request and trace
- to the service release / commit
- to the relevant database spans and operational metrics

## Error Aggregation

All three application surfaces now support Sentry-style exception aggregation:

- `apps/backend`: `SENTRY_DSN` for backend exceptions and worker failures
- `apps/frontend`: `NEXT_PUBLIC_SENTRY_DSN` for browser errors and `SENTRY_DSN`
  for Next.js server-side proxy failures
- `apps/admin`: `PUBLIC_SENTRY_DSN` for browser errors and `SENTRY_DSN` for
  server-side load / action failures

Every error event is tagged with:

- `service`
- `environment`
- `release`
- `commit_sha`

The backend also attaches request-scoped context when available:

- `requestId`
- `traceId`
- `userId`
- `role`
- `locale`

## Logging

The backend shared logger (`apps/backend/src/shared/logger.ts`) writes
structured Pino logs and now includes:

- request context fields (`requestId`, `traceId`, `userId`, `role`, `locale`)
- deployment metadata (`service`, `environment`, `release`, `commitSha`)

Use `logger.info|warning|error|debug(message, metadata)` from services and
routes, and always include identifiers, amounts, and table names on warnings or
errors.

Never log secrets, passwords, tokens, full card numbers, or raw notification
recipients.

## Tracing

The backend now starts OpenTelemetry spans and can export them over OTLP/HTTP.

Configuration:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_TRACE_SAMPLE_RATIO`
- `OBSERVABILITY_SERVICE_NAME`
- `OBSERVABILITY_ENVIRONMENT`
- `OBSERVABILITY_RELEASE`
- `OBSERVABILITY_COMMIT_SHA`

The backend returns a canonical `x-trace-id` response header and also includes
`traceId` in the JSON API envelope so frontend/admin error events can point
directly at the backend trace.

Tracing coverage includes:

- inbound HTTP requests via Node auto-instrumentation
- Drizzle query execution spans
- Redis / network spans when the corresponding auto-instrumentations are active

Recommended trace backends:

- Grafana Tempo via OTLP collector
- Jaeger via OTLP collector
- Datadog APM via OTLP collector / agent

## Health Checks

The backend exposes three unauthenticated health endpoints:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

These endpoints return raw JSON instead of the standard API envelope.

`/health/ready` returns:

- `200` with `status: "ready"` when all required dependencies are healthy
- `200` with `status: "degraded"` when only optional dependencies are unhealthy
- `503` with `status: "not_ready"` when required dependencies are unhealthy

The readiness payload currently checks:

- `postgres` connectivity
- `redis` connectivity when `REDIS_URL` is configured
- auth email provider availability
- auth SMS provider availability
- payment automation readiness gating when automated mode is requested

Health responses also include:

- `service`
- `environment`
- `release`
- `commitSha`

## Metrics

The backend exposes `GET /metrics` in Prometheus text format.

Current metrics include:

- Node.js / process defaults via `prom-client`
- `reward_backend_app_up`
- `reward_backend_build_info`
- `reward_backend_http_requests_total`
- `reward_backend_http_request_duration_seconds`
- `reward_backend_dependency_status`
- `reward_backend_draw_requests_total`
- `reward_backend_auth_notification_deliveries`
- `reward_backend_auth_notification_oldest_pending_age_seconds`
- `reward_backend_withdrawals_stuck_total`
- `reward_backend_withdrawals_oldest_stuck_age_seconds`

`/metrics` refreshes dependency probes, notification backlog state, and stuck
withdrawal gauges before rendering.

## Dashboards And Alerts

Provision Prometheus alert rules from
`deploy/monitoring/prometheus-alerts.yml`.

Build dashboards from the panel/query set in
`deploy/monitoring/dashboard-queries.md`.

The minimum production dashboard should show:

- readiness by dependency
- total request rate and 5xx ratio
- draw success vs error rate
- notification backlog counts and oldest pending age
- stuck withdrawals by status and age
- current `reward_backend_build_info` release / commit

The minimum production alert set should cover:

- readiness failures
- 5xx spikes
- draw error rate
- withdraw stuck
- notification backlog / dead-letter growth

## Correlation Flow

1. Start from the frontend/admin Sentry event.
2. Read `requestId`, `traceId`, `service`, `release`, and `commit_sha`.
3. Open the backend trace in Tempo / Jaeger / Datadog using `traceId`.
4. Use the trace to inspect HTTP span timing, database spans, and Redis/network
   calls.
5. Pivot to backend logs with the same `requestId` or `traceId`.
6. Confirm the deployed release / commit from Sentry tags or
   `reward_backend_build_info`.

## Auth Notification Delivery

- Durable auth-notification state lives in `notification_deliveries`.
- Every provider attempt is written to `notification_delivery_attempts`.
- `failed` notification rows are the dead-letter queue; admins can replay them
  through `POST /admin/notification-deliveries/{deliveryId}/retry`.
- Use `GET /admin/notification-deliveries` to inspect queue depth, failed items,
  and provider readiness without querying the database directly.
- Delivery logs mask email addresses and phone numbers; do not add raw
  recipients back into logs when extending the system.
