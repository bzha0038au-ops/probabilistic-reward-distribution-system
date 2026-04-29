# ADR 0002: Prize Engine Selection Strategies

## Status

Accepted - backfilled on 2026-04-29

## Decision Summary

Keep selection strategy as an explicit per-project contract, default to
`weighted_gacha` for compatibility, and implement `epsilon_greedy`,
`softmax`, and `thompson` as first-class runtime strategies with explicit
fairness metadata.

## Context

Prize-engine projects persist `strategy` plus open-ended `strategyParams`.
Future rewrites need the current compatibility rules, not just the enum values.

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
- `epsilon_greedy` is a history-aware strategy:
  - `epsilon` defaults to `0.1` when invalid
  - exploit chooses the highest empirical mean reward
  - explore chooses uniformly across prizes plus the miss arm
- `softmax` is a temperature-controlled weighted selector:
  - `temperature` defaults to `1` when invalid
  - candidate probabilities are derived from exponentiated exploit scores
  - fairness metadata records the selected arm probability and temperature
- `thompson` uses deterministic posterior sampling over normalized reward
  history:
  - `priorAlpha`, `priorBeta`, and `priorStrength` default to `1`, `1`, and `2`
  - candidate posteriors are normalized against the current reward-score ceiling
  - fairness metadata records posterior config and the selected sample score
- Behavior multipliers and risk decay are overlays on top of the selected
  strategy; they are not separate strategy names.

## Consequences

- A rewrite must preserve stored strategy names and their current meaning.
- Contract, admin configuration, and runtime support must remain aligned.
- `strategyParams` stays open-ended because the selector already reads more than
  one concern from it, including temperature, posterior priors, and risk-decay
  tuning keys.

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
