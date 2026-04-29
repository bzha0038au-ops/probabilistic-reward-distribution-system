# ADR 0002: Prize Engine Selection Strategies

## Status

Accepted - backfilled on 2026-04-29

## Decision Summary

Keep selection strategy as an explicit per-project contract, default to
`weighted_gacha` for compatibility, implement `epsilon_greedy` as the only
history-aware strategy today, and reserve `softmax` / `thompson` names without
silently emulating them.

## Context

Prize-engine projects persist `strategy` plus open-ended `strategyParams`.
Several strategy names already exist in contracts and admin flows, but only a
subset is implemented in the backend selector. Future rewrites need the current
compatibility rules, not just the enum values.

## Decision

- Supported contract names remain:
  - `weighted_gacha`
  - `epsilon_greedy`
  - `softmax`
  - `thompson`
- The default strategy is `weighted_gacha`.
- Unknown or malformed stored values normalize back to `weighted_gacha` rather
  than inventing a new fallback.
- `weighted_gacha` preserves draw-style compatibility:
  - only positive-weight prizes participate
  - `missWeight` is a first-class arm
  - randomness is derived from fairness seed and nonce metadata
- `epsilon_greedy` is the only implemented history-aware strategy:
  - `epsilon` defaults to `0.1` when invalid
  - exploit chooses the highest empirical mean reward
  - explore chooses uniformly across prizes plus the miss arm
- `softmax` and `thompson` remain reserved names in the contract but must fail
  fast until a real implementation exists.
- Behavior multipliers and risk decay are overlays on top of the selected
  strategy; they are not separate strategy names.

## Consequences

- A rewrite must preserve stored strategy names and their current meaning.
- Contract support is intentionally broader than runtime support; future work
  can fill in reserved strategies without renaming existing values.
- `strategyParams` stays open-ended because the selector already reads more than
  one concern from it, including `epsilon` and risk-decay tuning keys.

## Current Source Of Truth

- Strategy enums and response metadata:
  `apps/shared-types/src/saas.ts`
- Defaults and normalization:
  `apps/backend/src/modules/saas/prize-engine-domain.ts`
- Selector implementation:
  `apps/backend/src/modules/saas/prize-engine-selection.ts`
- Unit coverage:
  `apps/backend/src/modules/saas/prize-engine-selection.test.ts`
- Integration coverage:
  `apps/backend/src/integration/backend.prize-engine.integration.test.ts`
