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

## Security Event Stream

The backend now normalizes security-sensitive activity into a single
`security_events` stream in Postgres and mirrors it to configurable sinks.

Current upstream sources include:

- admin actions
- auth successes / failures / anomalies
- AML hits and AML review decisions
- wallet reconciliation alerts and status changes

Sink configuration:

- `SECURITY_EVENT_SINKS=log` writes structured `securityEvent` JSON to stdout.
  This is the preferred path when Datadog Logs, Vector, Fluent Bit, or another
  collector already tails container logs.
- `SECURITY_EVENT_SINKS=log,webhook` also POSTs normalized events to
  `SECURITY_EVENT_WEBHOOK_URL` for a self-hosted sink.
- `SECURITY_EVENT_SINKS=log,elasticsearch` also indexes normalized events into
  `SECURITY_EVENT_ELASTICSEARCH_URL` /
  `SECURITY_EVENT_ELASTICSEARCH_INDEX`.

Built-in correlation alerts currently emit back into the same stream as
`category=correlation_alert`:

- `admin_failed_then_success_same_ip`
- `admin_break_glass_after_failures_same_ip`
- `aml_hit_and_wallet_drift_same_user`

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
- `reward_backend_gift_sent_total`
- `reward_backend_gift_energy_exhausted_total`
- `reward_backend_iap_purchase_verified_total`
- `reward_backend_iap_purchase_fulfillment_failed_total`
- `reward_backend_gift_pack_delivered_total`
- `reward_backend_economy_ledger_write_failed_total`
- `reward_backend_store_purchase_orders_total`
- `reward_backend_realtime_publish_duration_seconds`
- `reward_backend_realtime_receive_latency_seconds`
- `reward_backend_auth_notification_deliveries`
- `reward_backend_auth_notification_oldest_pending_age_seconds`
- `reward_backend_aml_review_hits_total`
- `reward_backend_aml_review_oldest_pending_age_seconds`
- `reward_backend_withdrawals_stuck_total`
- `reward_backend_withdrawals_oldest_stuck_age_seconds`
- `reward_backend_payment_webhook_signature_verifications_total`
- `reward_backend_payment_webhook_events_total`
- `reward_backend_payment_webhook_oldest_pending_age_seconds`
- `reward_backend_payment_reconciliation_open_issues_total`
- `reward_backend_payment_reconciliation_oldest_open_issue_age_seconds`
- `reward_backend_payment_outbound_requests_total`
- `reward_backend_payment_outbound_oldest_retry_age_seconds`
- `reward_backend_payment_outbound_idempotency_conflicts_total`
- `reward_backend_saas_billing_runs_total`
- `reward_backend_saas_webhook_events_total`
- `reward_backend_saas_webhook_oldest_ready_age_seconds`
- `reward_backend_saas_webhook_retry_exhausted_total`
- `reward_backend_db_partition_horizon_months_expected`
- `reward_backend_db_partition_horizon_months_available`
- `reward_backend_db_partition_horizon_months_missing`
- `reward_backend_saas_distribution_snapshot_draws_total`
- `reward_backend_saas_distribution_snapshot_tracked_draws_total`
- `reward_backend_saas_distribution_snapshot_tracking_coverage_ratio`
- `reward_backend_saas_distribution_snapshot_actual_payout_sum`
- `reward_backend_saas_distribution_snapshot_expected_payout_sum`
- `reward_backend_saas_distribution_snapshot_payout_deviation_amount`
- `reward_backend_saas_distribution_snapshot_payout_deviation_ratio`
- `reward_backend_saas_distribution_snapshot_max_bucket_deviation_ratio`
- `reward_backend_saas_distribution_snapshot_actual_bucket_total`
- `reward_backend_saas_distribution_snapshot_expected_bucket_total`
- `reward_backend_saas_distribution_snapshot_breach`
- `reward_backend_stripe_api_requests_total`
- `reward_backend_stripe_api_failures_total`

`/metrics` refreshes dependency probes, notification backlog state, stuck
withdrawal gauges, and payment / SaaS queue gauges before rendering.

## Dashboards And Alerts

Provision Prometheus alert rules from
`deploy/monitoring/prometheus-alerts.yml`.

Build dashboards from the panel/query set in
`deploy/monitoring/dashboard-queries.md`.

The minimum production dashboard should show:

- readiness by dependency
- total request rate and 5xx ratio
- draw success vs error rate
- gift send volume, gift-energy exhaustion, and gift-lock driven anomaly spikes
- IAP verified vs fulfillment-failed counts by store channel / delivery type
- store purchase order backlog by status and delivery type
- gift-pack deliveries split by purchase vs restore mode
- Holdem realtime publish P95 and client receive P95 by surface
- notification backlog counts and oldest pending age
- AML pending-hit queue depth and oldest pending age
- stuck withdrawals by status and age
- payment webhook signature volume / failure ratio
- payment reconciliation manual-review queue depth and oldest issue age
- outbound payment queue state and idempotency conflicts
- Stripe rate-limit / 5xx failures and retry backlog
- failed SaaS billing runs and retry-exhausted SaaS webhooks
- missing active current-plus-future monthly partitions for managed append-only tables
- SaaS payout-distribution snapshot draw counts, EV drift, bucket drift, and breach state by project/window
- PostgreSQL data volume usage, Redis maxmemory usage, and registry storage usage
- current `reward_backend_build_info` release / commit

The minimum production alert set should cover:

- readiness failures
- 5xx spikes
- draw error rate
- IAP verification failure spikes
- verified-but-unfulfilled store purchase backlog
- gift pack restore/replay deliveries
- gifting activity spikes
- Holdem realtime receive latency P95 above 200ms
- withdraw stuck
- notification backlog / dead-letter growth
- AML pending hits breaching SLA
- payment webhook signature failure spikes
- reconciliation manual-review queue growth
- outbound idempotency conflicts
- Stripe rate-limit / 5xx degradation
- failed SaaS billing runs and retry-exhausted SaaS webhooks
- partition rotation misses across managed append-only tables
- SaaS payout-distribution breach windows
- PostgreSQL data volume thresholds at 70% / 85% / 95%
- Redis memory thresholds at 70% / 85% / 95%
- PostgreSQL dependency-down and Redis dependency-down alerts from backend readiness
- host filesystem usage, read-only remount, and inode-pressure alerts
- Registry storage threshold at 80%

## Payment Runtime Thresholds

These thresholds are the repo's minimum operational defaults for payment runtime
alerts. They are alert thresholds, not customer-facing SLAs.

- Webhook signature verification spike:
  more than 20 failed verifications for a provider in 10 minutes, with a
  failure ratio above 20%.
- Reconciliation diff queue growth:
  more than 10 open manual-review reconciliation issues for a provider for
  15 minutes, or any such issue staying open for more than 30 minutes.
- Outbound idempotency conflict:
  any conflicting idempotency-key reuse within 15 minutes pages the on-call
  after a 5-minute hold period.
- Stripe API degradation:
  more than 2 Stripe `rate_limit` or `server_error` failures in 10 minutes, or
  any outbound queue entries stuck with `stripe_rate_limit` or
  `stripe_server_error` for 10 minutes.
- SaaS billing collection risk:
  any `reward_backend_saas_billing_runs_total{status="failed"}` sample
  persisting for 15 minutes, or any
  `reward_backend_saas_webhook_retry_exhausted_total` sample above 0 for
  15 minutes.
- SaaS webhook retry exhaustion threshold:
  `reward_backend_saas_webhook_retry_exhausted_total` counts failed webhook
  rows whose `attempts` are at least 8.
- Holdem realtime latency:
  `reward_backend_realtime_receive_latency_seconds{channel="holdem"}` pages
  when the 10-minute P95 stays above 200ms for 10 minutes on any client
  surface with a meaningful sample stream.

## Holdem Realtime Baseline

Holdem realtime latency is tracked at three points:

- `realtime.publish.start` / `realtime.publish.end` are emitted from the backend
  transport layer and recorded inside OpenTelemetry spans named
  `realtime.publish`.
- Web and mobile Holdem clients batch `realtime.received` samples and post them
  back through the authenticated user API so the backend can attach those
  samples to the active request span and Prometheus histograms.
- The baseline latency metric is
  `reward_backend_realtime_receive_latency_seconds{channel="holdem"}` with a
  target of sub-100ms and an alert threshold of P95 > 200ms over 10 minutes.

Client receive latency is based on the server event `sentAt` timestamp and the
client receive wall clock. That makes it suitable for baselining and alerting,
but badly skewed client clocks can still create noisy outliers.
- SaaS payout-distribution breach:
  any `reward_backend_saas_distribution_snapshot_breach` series above 0 for
  15 minutes raises a ticket, keyed by `project_slug`, rolling `window`, and
  `reason`.

## Capacity Thresholds

These thresholds are the repo's minimum operational defaults for infra capacity
alerts.

- PostgreSQL data volume:
  ticket at 70% sustained usage for 15 minutes, page at 85% for 10 minutes,
  and page plus AI-agent auto-expansion attempt at 95% for 5 minutes.
- Redis memory:
  ticket at 70% of configured `maxmemory` for 15 minutes, page at 85% for
  10 minutes, and page at 95% for 5 minutes.
- Container image registry storage:
  ticket the Telegram ops chat at 80% sustained usage for 15 minutes so old
  rollback images are not garbage-collected under pressure.
- Host filesystem:
  page at 85% sustained usage for root / Docker / proxy-log filesystems,
  page immediately on read-only remount, and page at 85% inode usage.

These alerts assume `node_exporter` is scraping Docker volume mountpoints and
registry storage paths, and that `redis_exporter` exposes
`redis_memory_used_bytes` plus `redis_memory_max_bytes`.

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
