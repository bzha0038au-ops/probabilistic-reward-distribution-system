# ADR 0004: User Freeze Taxonomy

## Status

Accepted - backfilled on 2026-04-29

## Decision Summary

Model user freezes as scoped records with separate category, reason, and scope
axes. Do not collapse freeze state into one boolean or assume reason and scope
mean the same thing.

## Context

Freezes now come from several domains: auth abuse, AML, KYC, withdrawals,
community moderation, and manual admin action. Those producers need different
owners and audit meaning, while routes and realtime guards need a stable
"what is blocked right now" answer.

## Decision

- Freeze records keep distinct axes:
  - `category`: ownership / governance bucket
  - `reason`: why the freeze exists
  - `scope`: what behavior is blocked
  - `status` plus metadata and release history
- First-class scopes are:
  - `account_lock`
  - `withdrawal_lock`
  - `gameplay_lock`
  - `topup_lock`
- A user may have multiple active freezes at once, but only one active record
  per scope; creating another freeze for the same scope updates the active row
  instead of stacking duplicates.
- `account_lock` is stronger than a guard check alone: it also revokes active
  user and admin sessions immediately.
- Producers map into the shared taxonomy instead of inventing local lock types:
  - KYC pending states map to tier-based gameplay or withdrawal freezes
  - AML review and escalation use account-scoped freezes
  - withdrawal abuse signals use `withdrawal_lock`
  - forum moderation uses `category=community` plus `scope=gameplay_lock`
- Route guards and realtime auth enforce scope-specific freezes separately.
- `topup_lock` is part of the taxonomy even though it currently has fewer
  producers than the other scopes.

## Consequences

- Rewrites must preserve the independent scope axis; a single `isFrozen` flag is
  insufficient.
- Admin UX, API contracts, and background jobs can share one taxonomy instead of
  maintaining parallel lock vocabularies.
- New producers should attach to the shared taxonomy before adding new columns
  or domain-local freeze tables.

## Current Source Of Truth

- Shared enums:
  `apps/shared-types/src/risk.ts`
- Admin request/response contracts:
  `apps/shared-types/src/admin.ts`
- Core freeze lifecycle and scope uniqueness:
  `apps/backend/src/modules/risk/service.ts`
- Scope enforcement:
  `apps/backend/src/http/guards.ts`
- User-route guard usage:
  `apps/backend/src/http/routes/user.ts`
- KYC mapping:
  `apps/backend/src/modules/kyc/service.ts`
- Withdrawal anti-abuse producers:
  `apps/backend/src/modules/withdraw/service.ts`
- Community moderation producer:
  `apps/backend/src/modules/forum/moderation-service.ts`
