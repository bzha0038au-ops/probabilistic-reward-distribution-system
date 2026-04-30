# Dashboard Queries

Use these PromQL queries to build the minimum production dashboard.

## Readiness

- Required dependencies down:
  `max(reward_backend_dependency_status{required="true",status="down"}) by (dependency)`
- Optional dependencies down:
  `max(reward_backend_dependency_status{required="false",status="down"}) by (dependency)`

## Traffic And 5xx

- Request rate:
  `sum(rate(reward_backend_http_requests_total[5m]))`
- 5xx rate:
  `sum(rate(reward_backend_http_requests_total{status_code=~"5.."}[5m]))`
- 5xx ratio:
  `sum(rate(reward_backend_http_requests_total{status_code=~"5.."}[5m])) / clamp_min(sum(rate(reward_backend_http_requests_total[5m])), 1)`
- P95 latency:
  `histogram_quantile(0.95, sum(rate(reward_backend_http_request_duration_seconds_bucket[5m])) by (le, route))`

## Draw Errors

- Draw success rate:
  `sum(rate(reward_backend_draw_requests_total{outcome="success"}[10m]))`
- Draw error rate:
  `sum(rate(reward_backend_draw_requests_total{outcome="error"}[10m]))`
- Draw error ratio:
  `sum(rate(reward_backend_draw_requests_total{outcome="error"}[10m])) / clamp_min(sum(rate(reward_backend_draw_requests_total[10m])), 1)`

## Holdem Realtime

- Publish latency P95 by event:
  `histogram_quantile(0.95, sum(rate(reward_backend_realtime_publish_duration_seconds_bucket{channel="holdem"}[10m])) by (le, event))`
- Client receive latency P95 by surface:
  `histogram_quantile(0.95, sum(rate(reward_backend_realtime_receive_latency_seconds_bucket{channel="holdem"}[10m])) by (le, surface))`
- Client receive sample rate by surface:
  `sum(rate(reward_backend_realtime_receive_latency_seconds_count{channel="holdem"}[10m])) by (surface)`

## Withdraw Stuck

- Stuck withdrawals by status:
  `sum(reward_backend_withdrawals_stuck_total) by (status)`
- Oldest stuck withdrawal age:
  `max(reward_backend_withdrawals_oldest_stuck_age_seconds) by (status)`

## Notification Backlog

- Delivery backlog by status:
  `sum(reward_backend_auth_notification_deliveries) by (status)`
- Oldest pending notification age:
  `reward_backend_auth_notification_oldest_pending_age_seconds`

## Payment Webhooks

- Signature verification volume by provider and status:
  `sum(increase(reward_backend_payment_webhook_signature_verifications_total[10m])) by (provider, status)`
- Signature failure ratio by provider:
  `sum(increase(reward_backend_payment_webhook_signature_verifications_total{status="failed"}[10m])) by (provider) / clamp_min(sum(increase(reward_backend_payment_webhook_signature_verifications_total[10m])) by (provider), 1)`
- Webhook queue by provider, processing status, and signature status:
  `sum(reward_backend_payment_webhook_events_total) by (provider, processing_status, signature_status)`
- Oldest pending webhook age by provider:
  `max(reward_backend_payment_webhook_oldest_pending_age_seconds) by (provider)`

## Reconciliation

- Open manual-review reconciliation issues by provider:
  `sum(reward_backend_payment_reconciliation_open_issues_total{requires_manual_review="true"}) by (provider)`
- Oldest open manual-review reconciliation issue age by provider:
  `max(reward_backend_payment_reconciliation_oldest_open_issue_age_seconds{requires_manual_review="true"}) by (provider)`

## Payment Outbound

- Outbound requests by send status and error code:
  `sum(reward_backend_payment_outbound_requests_total) by (send_status, error_code)`
- Oldest retry / operator-attention age by error code:
  `max(reward_backend_payment_outbound_oldest_retry_age_seconds) by (error_code)`
- Outbound idempotency conflicts over 15 minutes:
  `sum(increase(reward_backend_payment_outbound_idempotency_conflicts_total[15m])) by (provider, action, reason)`

## Stripe Automation

- Stripe API rate-limit and 5xx failures over 10 minutes:
  `sum(increase(reward_backend_stripe_api_failures_total{reason=~"rate_limit|server_error"}[10m])) by (surface, operation, reason)`
- Outbound requests currently blocked by Stripe rate-limit or 5xx conditions:
  `sum(reward_backend_payment_outbound_requests_total{send_status=~"unknown|failed",error_code=~"stripe_rate_limit|stripe_server_error"}) by (error_code)`

## SaaS Billing

- Failed SaaS billing runs:
  `sum(reward_backend_saas_billing_runs_total{status="failed"})`
- SaaS webhook backlog by status:
  `sum(reward_backend_saas_webhook_events_total) by (status)`
- Oldest SaaS webhook ready-to-retry age:
  `reward_backend_saas_webhook_oldest_ready_age_seconds`
- Retry-exhausted SaaS webhooks:
  `reward_backend_saas_webhook_retry_exhausted_total`

## Partition Maintenance

- Expected current-plus-future monthly partitions by parent table:
  `reward_backend_db_partition_horizon_months_expected`
- Available current-plus-future monthly partitions by parent table:
  `reward_backend_db_partition_horizon_months_available`
- Missing current-plus-future monthly partitions by parent table:
  `reward_backend_db_partition_horizon_months_missing`

## Release Tracking

- Current deployed release / commit:
  `reward_backend_build_info`

## Capacity

- PostgreSQL data volume usage ratio:
  `max by (instance, mountpoint) (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs|nsfs|fuse.lxcfs",mountpoint=~".*(reward[_-]postgres[_-]data|reward_ops_src_pgdata|pgdata).*"} / clamp_min(node_filesystem_size_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs|nsfs|fuse.lxcfs",mountpoint=~".*(reward[_-]postgres[_-]data|reward_ops_src_pgdata|pgdata).*"}, 1)))`
- Redis memory usage ratio:
  `max by (instance) ((redis_memory_used_bytes / clamp_min(redis_memory_max_bytes, 1)) and (redis_memory_max_bytes > 0))`
- Registry storage usage ratio:
  `max by (instance, mountpoint) (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs|nsfs|fuse.lxcfs",mountpoint=~".*(registry|harbor).*"} / clamp_min(node_filesystem_size_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs|nsfs|fuse.lxcfs",mountpoint=~".*(registry|harbor).*"}, 1)))`
