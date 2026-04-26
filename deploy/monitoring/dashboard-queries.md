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

## Release Tracking

- Current deployed release / commit:
  `reward_backend_build_info`
