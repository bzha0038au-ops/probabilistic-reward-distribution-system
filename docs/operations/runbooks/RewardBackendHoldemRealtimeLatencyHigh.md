# RewardBackendHoldemRealtimeLatencyHigh

## Trigger

- Prometheus alert: `RewardBackendHoldemRealtimeLatencyHigh`
- Condition: `reward_backend_realtime_receive_latency_seconds{channel="holdem"}`
  P95 is above 200ms for 10 minutes on a client surface with sustained samples.

## Immediate Checks

1. Confirm the affected surface from the alert label: `web`, `ios`, or `android`.
2. Check the Holdem realtime dashboard panels:
   - publish P95 by event
   - receive P95 by surface
   - receive sample rate by surface
3. Compare `reward_backend_realtime_publish_duration_seconds{channel="holdem"}`
   against `reward_backend_realtime_receive_latency_seconds{channel="holdem"}`
   to separate backend publish delay from downstream delivery/client delay.
4. Inspect recent backend traces for `realtime.publish` spans and any
   `realtime.received` events.

## Likely Causes

- Backend publish fanout slowed down by process pressure or Postgres `NOTIFY`
  delay.
- WebSocket reconnect churn causing clients to resync instead of consuming live
  events.
- Regional network degradation between clients and the backend.
- Client-side render stalls causing receive samples to bunch up.
- Abnormally large Holdem payloads after a table-state or hand-history change.

## Investigation

1. Check `/metrics` for:
   - `histogram_quantile(0.95, sum(rate(reward_backend_realtime_publish_duration_seconds_bucket{channel="holdem"}[10m])) by (le, event))`
   - `histogram_quantile(0.95, sum(rate(reward_backend_realtime_receive_latency_seconds_bucket{channel="holdem"}[10m])) by (le, surface))`
2. Inspect backend logs for websocket disconnect/reconnect spikes:
   - `realtime connection opened`
   - `realtime connection closed`
   - `realtime heartbeat timed out`
3. Check host health and dependency pressure:
   - `/health/ready`
   - CPU saturation
   - Redis/Postgres latency
4. If one event type is isolated, inspect the payload path in
   `apps/backend/src/modules/holdem/realtime.ts` and the corresponding client
   reducer in `packages/user-core/src/holdem-realtime.ts`.

## Mitigation

1. If publish latency is high, reduce backend pressure or roll back the recent
   Holdem/realtime change.
2. If receive latency is high but publish latency is normal, investigate
   network path or client render regressions before touching backend fanout.
3. If the issue is surface-specific, gate the latest web/mobile rollout and
   keep the other surfaces live.
4. If reconnect churn is the driver, temporarily increase operational scrutiny
   on websocket session health before changing timeout constants.

## Exit Criteria

- Holdem receive latency P95 drops below 200ms on the affected surface.
- `realtime.publish` spans no longer show abnormal duration or errors.
- No sustained reconnect spike remains in backend logs.
