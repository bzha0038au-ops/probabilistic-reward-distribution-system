# Prize Engine `/v1/engine/rewards` Load Results (Updated 2026-04-30)

## Scope

Target route: `POST /v1/engine/rewards`

Current optimization pass focused on the single-tenant hot path first:

- shrink transaction work that sits inside settlement
- delay `FOR UPDATE` acquisition on `prize` until after envelope and billing mute decisions
- remove the extra `FOR UPDATE` read on `player` and settle with `UPDATE ... RETURNING`
- replace settlement-time `project` and `prize` pre-lock reads with conditional atomic updates and miss fallback
- move non-settlement side effects post-commit (`saas_usage_events`, outbound webhook enqueue, group-correlation insert, tenant onboarding finalize)
- move draw-record snapshot patching post-commit so settlement does not do a second `saas_draw_records` update
- raise the backend `postgres-js` pool from the old hardcoded `max: 10` to configurable defaults centered on `DB_POOL_MAX=30`
- add `saas_draw_records` indexes for hot replay and observability access paths

The scenario ids still carry the historical `1k/5k` names. Actual offered load is controlled by the `LOAD_*_QPS` env vars below.

## Harness

- entrypoint: `pnpm test:load:prize-engine`
- data plane: ephemeral Postgres via `tests/support/test-harness.ts`
- backend surface: `apps/backend/src/prize-engine-load-server.ts`
- load driver: `tests/load/prize-engine-smoke.ts`
- backend pool config used for all runs below:
  - `DB_POOL_MAX=30`
  - `DB_POOL_IDLE_TIMEOUT_SECONDS=20`
  - `DB_POOL_CONNECT_TIMEOUT_SECONDS=30`
  - `DB_POOL_MAX_LIFETIME_SECONDS=1800`

## Commands Used

Single-tenant 100 / 120 QPS:

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_SINGLE_TENANT_QPS=100 \
  LOAD_SINGLE_TENANT_CONNECTIONS=64 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_SINGLE_TENANT_QPS=120 \
  LOAD_SINGLE_TENANT_CONNECTIONS=80 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

Single-tenant 150 / 180 / 240 QPS:

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_SINGLE_TENANT_QPS=150 \
  LOAD_SINGLE_TENANT_CONNECTIONS=96 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_SINGLE_TENANT_QPS=180 \
  LOAD_SINGLE_TENANT_CONNECTIONS=112 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

```bash
env \
  LOAD_SCENARIO_IDS=single_tenant_1k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_SINGLE_TENANT_QPS=240 \
  LOAD_SINGLE_TENANT_CONNECTIONS=144 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

Multi-tenant 120 QPS:

```bash
env \
  LOAD_SCENARIO_IDS=multi_tenant_5k_qps \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_MULTI_TENANT_PROJECTS=6 \
  LOAD_MULTI_TENANT_QPS=120 \
  LOAD_MULTI_TENANT_CONNECTIONS=96 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

Envelope-cap mute fallback 120 QPS:

```bash
env \
  LOAD_SCENARIO_IDS=envelope_cap_mute_fallback \
  LOAD_DURATION_SECONDS=3 \
  LOAD_WARMUP_SECONDS=1 \
  LOAD_REQUEST_TIMEOUT_SECONDS=5 \
  LOAD_POST_RUN_DRAIN_SECONDS=5 \
  LOAD_CAP_FALLBACK_QPS=120 \
  LOAD_CAP_FALLBACK_CONNECTIONS=80 \
  DB_POOL_MAX=30 \
  pnpm test:load:prize-engine
```

## Baseline Results

### Single-Tenant Hot Path

| Scenario | Offered QPS | Connections | Success | Dropped | Timeouts | P50 | P95 | P99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| single tenant | 100 | 64 | 300 / 300 | 0 | 0 | 9.97 ms | 13.33 ms | 16.41 ms | stable |
| single tenant | 120 | 80 | 360 / 360 | 0 | 0 | 10.99 ms | 14.13 ms | 17.22 ms | stable |
| single tenant | 150 | 96 | 450 / 450 | 0 | 0 | 26.06 ms | 263.52 ms | 469.37 ms | no failures, but high-latency knee |
| single tenant | 180 | 112 | 540 / 540 | 0 | 0 | 14.53 ms | 325.30 ms | 508.34 ms | no failures, but sustained tail inflation |
| single tenant | 240 | 144 | 702 / 720 | 18 | 0 | 305.87 ms | 806.34 ms | 823.01 ms | dispatch-limited, beyond practical steady-state |

### Multi-Tenant Comparison

| Scenario | Offered QPS | Projects | Connections | Success | Dropped | Timeouts | P50 | P95 | P99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| multi tenant | 120 | 6 | 96 | 360 / 360 | 0 | 0 | 6.88 ms | 9.67 ms | 12.35 ms | stable |

### Zero-Reward Fast Path

| Scenario | Offered QPS | Connections | Success | Dropped | Timeouts | P50 | P95 | P99 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| envelope cap mute fallback | 120 | 80 | 360 / 360 | 0 | 0 | 11.01 ms | 13.60 ms | 16.62 ms | stable after skipping no-op project balance writes |

## What Changed Versus The Previous Hot Path

- Stable single-tenant throughput moved again:
  - prior stable ceiling after the first pass: about `90 QPS`
  - current clean baseline after atomic settlement updates: `120 QPS`
- The single-tenant saturation knee moved materially upward:
  - `100 QPS` and `120 QPS` are now clean
  - `150-180 QPS` do not fail, but tail latency inflates into the `~260-500ms` range
  - `240 QPS` is where dispatch-side backlog finally starts showing up
- Multi-tenant distribution is clearly no longer the first bottleneck:
  - `120 QPS` across `6` projects stays clean with `P95 9.67ms`
  - the same optimization pass also improved the `mute` fast path by removing no-op project-balance writes when both `drawCost` and `rewardAmount` are zero

## Interpretation

- The current first bottleneck is still the single-tenant settlement hotspot, not tenant isolation.
- The remaining pressure is concentrated on the rows every settled reward must still serialize through:
  - `saas_projects` pool balance
  - the selected `saas_project_prizes` row when the prize mix is narrow
  - `saas_players` for repeated player writes
- Raising the backend pool from `10` to `30` was necessary, but the bigger gain came from changing the settlement write shape:
  - no explicit `FOR UPDATE` read on `player`
  - no explicit `FOR UPDATE` read on `project`
  - no explicit `FOR UPDATE` read on `prize`
  - no second synchronous `saas_draw_records` update for snapshots
- The route now behaves more like a bounded write pipeline and less like a long, lock-heavy critical section.

## Recommended Next Pass

- Keep working the single-tenant hotspot before spending time on broader multi-tenant isolation mechanics.
- The next practical step is to turn the new latency knee into explicit admission control:
  - keep a `120 QPS` class as the current safe single-tenant baseline
  - treat `150-180 QPS` as the zone where project-scoped queueing or concurrency caps become worth enforcing
  - widen prize-row fan-out for tenants whose traffic concentrates on a single prize row
- After any queueing/admission-control change, rerun the same ladder at `120 / 150 / 180 / 240` for single-tenant and `120 / 150` for multi-tenant so the comparison stays apples-to-apples.

## 2026-04-30 Follow-Up

- The admission-control pass is now wired into the prize-engine write routes:
  - single-tenant admission control is enforced before reward or draw settlement begins
  - project-scoped concurrency caps and bounded queueing now sit in front of `/v1/engine/rewards` and `/v1/engine/draws`
- Runtime knobs are metadata-driven so ops can tune hot tenants without a schema change:
  - tenant metadata: `prizeEngineAdmission.maxConcurrent` (or `prize_engine_admission.max_concurrent`)
  - project metadata: `prizeEngineExecution.maxConcurrency`, `queueDepth`, `queueWaitMs` (snake_case variants also accepted)
- Rejected writes now return `429` plus `Retry-After` with one of:
  - `TENANT_ADMISSION_CONTROL_LIMIT_EXCEEDED`
  - `PROJECT_CONCURRENCY_LIMIT_EXCEEDED`
  - `PROJECT_QUEUE_DEPTH_EXCEEDED`
  - `PROJECT_QUEUE_WAIT_TIMEOUT`
- Successful queued writes emit `X-Prize-Engine-Queue-Wait-Ms` so load tests and clients can distinguish clean wins from queued admissions.
- Hot prize-row fan-out remains an operator playbook, not a new schema primitive:
  - if one prize row dominates settled wins, split it into multiple identical rows
  - keep reward amount and presentation aligned across the copies
  - divide the original row's total weight and stock across those copies so the catalog EV stays unchanged while row-level write pressure spreads out
- The load ladder rerun is still required after tuning these controls; this section records implementation status, not a new benchmark.

## Test Harness Note

On degraded runs that intentionally push requests into client timeouts, the local Node 25 plus `postgres-js` harness can emit a shutdown-time `socket.write` null-reference after the JSON summary is already printed. Treat that as a teardown artifact of the local load harness, not as route-level settlement corruption. The successful runs above completed cleanly and persisted the expected `saas_draw_records`.
