# ADR 0003: Prize Engine Envelope Layers

## Status

Accepted - backfilled on 2026-04-29

## Decision Summary

Keep prize-engine "envelope" as layered controls instead of one merged limit:

- tenant risk envelope as the long-lived operator ceiling
- requested risk envelope as a caller-supplied narrowing overlay
- reward envelope as stateful tenant/project window enforcement
- group/agent constraint envelopes as scoped mute-only guards

## Context

The codebase already uses "envelope" for multiple related but distinct control
systems. Those layers run at different times, store state in different places,
and have different failure modes. If a rewrite flattens them into one generic
"limit check", it will lose real behavior.

## Decision

- Tenant `riskEnvelope` is the operator-owned hard ceiling on daily budget,
  max single payout, variance cap, and emergency stop.
- Request payload `riskEnvelope` may only narrow tenant caps; it never widens
  them.
- Stored `reward envelope` rows are runtime counters keyed by tenant/project and
  window (`minute`, `hour`, `day`), each with `budgetCap`,
  `expectedPayoutPerCall`, `varianceCap`, and `onCapHitStrategy`.
- Reward envelopes are evaluated twice:
  - preflight, against expected payout
  - post-selection, against actual selected reward
- Reward envelope outcomes have two operational behaviors:
  - `reject`: fail the request with `REWARD_ENVELOPE_LIMIT_EXCEEDED`
  - `mute`: convert the result to a zero-reward miss while still returning
    envelope metadata
- Group and agent constraint envelopes are separate scoped controls derived
  from project metadata and optional request overlays. They emit the same
  trigger shape but operate as mute-only runtime guards.
- Trigger metadata is part of the response and audit trail; it is not an
  internal-only concern.

## Consequences

- Future rewrites must keep the difference between static ceilings and
  stateful window counters.
- Two-phase reward-envelope evaluation is required to preserve both budget-cap
  and post-selection variance behavior.
- Constraint envelopes and reward envelopes can both contribute triggers to one
  result, so they must not be modeled as mutually exclusive paths.

## Current Source Of Truth

- Public envelope schemas:
  `apps/shared-types/src/saas.ts`
- Tenant/project record normalization:
  `apps/backend/src/modules/saas/records.ts`
- Requested risk-envelope clipping:
  `apps/backend/src/modules/saas/prize-engine-service.ts`
- Stateful reward envelope evaluation and Redis window cache:
  `apps/backend/src/modules/saas/reward-envelope.ts`
- Group/agent scoped constraint envelopes:
  `apps/backend/src/modules/saas/prize-engine-constraints.ts`
- Unit coverage:
  `apps/backend/src/modules/saas/reward-envelope.test.ts`
- Integration coverage:
  `apps/backend/src/integration/backend.prize-engine.integration.test.ts`
