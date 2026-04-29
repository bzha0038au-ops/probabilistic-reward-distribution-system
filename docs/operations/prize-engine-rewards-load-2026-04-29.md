# Prize Engine `/v1/engine/rewards` Load Results (2026-04-29)

## Scope

Target route: `POST /v1/engine/rewards`

Goals:

- capture real latency under load: `P50 / P95 / P99`
- capture failure modes instead of only happy-path throughput
- validate envelope-cap fallback still returns `mute` + zero reward under stress

Harness:

- entrypoint: `pnpm test:load:prize-engine`
- data plane: ephemeral Postgres via `tests/support/test-harness.ts`
- backend surface: `apps/backend/src/prize-engine-load-server.ts`
- load driver: `tests/load/prize-engine-smoke.ts`
- steady-state mode: reusable `agent/player` rows are pre-seeded in Postgres, then measured requests reuse stable actor IDs with fresh `idempotencyKey` values so the overload runs measure the hot path instead of one-time actor creation
- note: overload numbers below were rerun after fixing teardown so timed-out client disconnects no longer end with route-level `CONNECTION_CLOSED` noise or a child-process `postgres` null-socket crash

## Commands Used

Sanity smoke before overload:

```bash
env \
  LOAD_SINGLE_TENANT_QPS=20 \
  LOAD_MULTI_TENANT_QPS=40 \
  LOAD_CAP_FALLBACK_QPS=20 \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_SINGLE_TENANT_CONNECTIONS=32 \
  LOAD_MULTI_TENANT_CONNECTIONS=64 \
  LOAD_CAP_FALLBACK_CONNECTIONS=32 \
  LOAD_MULTI_TENANT_PROJECTS=4 \
  pnpm test:load:prize-engine
```

Overload measurements:

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=1 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=2 \
  LOAD_POST_RUN_DRAIN_SECONDS=1 \
  pnpm test:load:prize-engine
```

```bash
env \
  LOAD_SCENARIO_IDS=multi_tenant_5k_qps \
  LOAD_DURATION_SECONDS=1 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=2 \
  LOAD_POST_RUN_DRAIN_SECONDS=1 \
  LOAD_MULTI_TENANT_PROJECTS=20 \
  pnpm test:load:prize-engine
```

```bash
env \
  LOAD_SCENARIO_IDS=envelope_cap_mute_fallback \
  LOAD_DURATION_SECONDS=1 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=2 \
  LOAD_POST_RUN_DRAIN_SECONDS=1 \
  pnpm test:load:prize-engine
```

## Sanity Smoke

These runs prove the harness and semantics are correct before overload:

| Scenario | Target | Connections | Success QPS | P50 | P95 | P99 | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| single tenant payout | 20 QPS | 32 | 20.20 | 15.81 ms | 17.20 ms | 18.16 ms | all 60 requests persisted as payout |
| multi-tenant payout | 40 QPS | 64 | 40.13 | 12.09 ms | 12.98 ms | 19.13 ms | all 120 requests persisted as payout |
| envelope cap fallback | 20 QPS | 32 | 20.20 | 15.97 ms | 17.90 ms | 19.42 ms | all 60 requests persisted as `mute` + zero reward |

## Overload Results

Definitions used below:

- `sent`: requests scheduled by the load driver during the 1 second load window
- `completed`: requests that actually started and reached a terminal client outcome
- `success`: HTTP `2xx` plus response envelope `ok=true`
- `dropped`: request never dispatched before the 1 second load window closed
- `timeouts`: request dispatched, but client-side timeout hit before a full response
- `persisted rows`: rows written to `saas_draw_records` after the scenario baseline

| Scenario | Offered Target | Actor Pool | Conns | Sent | Completed | Success | Success QPS | Completed QPS | Dropped | Timeouts | P50 | P95 | P99 | Persisted Rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `single_tenant_1k_qps` | 1000 QPS | 192 | 96 | 1000 | 96 | 0 | 0.00 | 45.93 | 904 | 96 | 2000.66 ms | 2002.02 ms | 2003.07 ms | 0 |
| `multi_tenant_5k_qps` | 5000 QPS | 520 | 256 | 5000 | 256 | 0 | 0.00 | 124.88 | 4744 | 256 | 2002.06 ms | 2006.26 ms | 2007.66 ms | 0 |
| `envelope_cap_mute_fallback` | 1000 QPS | 192 | 96 | 1000 | 96 | 0 | 0.00 | 45.93 | 904 | 96 | 2000.87 ms | 2001.80 ms | 2004.17 ms | 0 |

## Interpreting The Numbers

- The latency distribution still collapses against the timeout wall in all three overload runs. This remains the strongest signal that the route saturates long before the offered `1k / 5k` target.
- These numbers are now closer to real steady-state behavior because the measured window no longer pays the one-time `ensureProjectAgent` / `ensureProjectPlayer` creation cost.
- Successful throughput is effectively zero under these overload windows: `0.00 QPS` in all three reruns.
- Completed terminal outcomes still plateau far below offered load even before counting dropped requests: about `45.93 QPS` for single-tenant, `124.88 QPS` for multi-tenant, and `45.93 QPS` for cap-fallback.
- `multi_tenant_5k_qps` still does better than single-tenant, but remains orders of magnitude below the offered target and still produces zero successful completions within the `2s` timeout budget.

Inference from source plus the observed plateau:

- The hot path is still dominated by a small database pool (`apps/backend/src/db.ts` uses `max: 10`) plus a long multi-table transaction in `apps/backend/src/modules/saas/prize-engine-service.ts`.
- This rerun already includes two safe hotspot cuts: project locking now happens at settlement instead of transaction entry, and `agent/group` advisory locks are only taken when the corresponding constraint limits are active.
- Even after those cuts, the remaining `FOR UPDATE` sections on tenant risk envelope, player, prize, and settlement-phase project state still collapse into the timeout wall before any successful response survives.

## Failure Modes Observed

- Client-side timeout dominates overload. Once the route is saturated, the first wave of in-flight requests spends almost the entire budget near or beyond the `2s` ceiling.
- Client-side dispatch deadline drops dominate the remainder. The load driver cannot even start most of the offered requests inside the `1s` load window once the connection budget is exhausted.
- Under the steady-state rerun, overload no longer leaves partial survivors in `saas_draw_records`; all three scenarios finished with `0` persisted rows beyond the preflight baseline.
- The harness now exits cleanly after overload. Timed-out client disconnects no longer surface route-level `CONNECTION_CLOSED` logging, and the backend child no longer ends with the earlier `postgres` null-socket teardown crash.

## Envelope Cap Fallback Result

The fallback behavior still validates correctly in preflight:

- the preflight response returned `rewardAmount = 0.00`
- the preflight response returned `status = miss`
- the preflight response returned `envelope.mode = mute`

Under the overload rerun itself, the route produced `0` persisted rows. That means the system saturated before any fallback-path write completed, but it also did not produce any positive payout or cap-rule violation.

## Recommended Follow-Up

- Treat the current reward path as overload-unsafe for the offered `1k / 5k` targets even on the steady-state hot path.
- The next hotspot to split is tenant-level locking and synchronous in-transaction usage-event persistence; the safe project-lock deferral and conditional scope-lock change were not enough on their own.
- If business validation requires observing cap-fallback writes under stress, rerun with a longer client timeout window. At the current `1s` load window plus `2s` timeout budget, overload saturates before any write survives.
