# ADR 0001: Engine Vs Product Split

## Status

Accepted - backfilled on 2026-04-29

## Decision Summary

Treat the consumer reward product and the SaaS prize engine as two separate
products that happen to share one backend data plane. Shared primitives are
allowed, but product semantics, auth, SDKs, and route framing stay separate.

## Context

This repo now serves four surfaces from one monorepo and one backend:

- C-side consumer surfaces: `apps/frontend` and `apps/mobile`
- B-side operational surfaces: `apps/saas-portal` and parts of `apps/admin`
- Shared backend: `apps/backend`

Without a written boundary, rewrites tend to collapse B-side engine work into
"just another user feature" or leak consumer auth and UI assumptions into
partner APIs.

## Decision

- C-side user flows use user-session auth and first-party helpers such as
  `@reward/user-core`.
- B-side prize-engine flows use project API keys and the partner-facing
  `@reward/prize-engine-sdk`.
- `/v1/engine/*` is a product boundary, not a thin alias for consumer routes.
- Shared internals such as ledgering, fairness, risk controls, observability,
  and balance policy may be reused behind the boundary.
- App-local adapters still own runtime-specific auth lookup, BFF proxying,
  telemetry, cache policy, and retries.

## Consequences

- New shared code should be extracted below the product boundary or into
  `apps/shared-types`; do not merge the two public surfaces into one client.
- B-side APIs must keep server-to-server assumptions and must not depend on
  browser-safe secret delivery.
- Consumer roadmap items should not be reframed as SaaS engine primitives
  unless the change is explicitly about shared engine infrastructure.

## Current Source Of Truth

- Boundary summary: `AGENTS.md`
- Package rules: `packages/README.md`
- Partner SDK surface: `packages/prize-engine-sdk`
- First-party user surface: `packages/user-core`
