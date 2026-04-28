# Package Boundaries

This directory holds reusable clients that sit between app code and backend APIs.
Packages exist to preserve stable boundaries, not to hide app-specific transport
or authentication behavior.

## TL;DR

| Surface | Primary audience | Owns | Must not own |
| --- | --- | --- | --- |
| `@reward/user-core` | First-party user surfaces | Shared user API routes, typed request helpers, platform helpers, pure fairness utilities | Web BFF policy, cookie/session storage, retries, admin or SaaS APIs |
| `@reward/prize-engine-sdk` | External B2B customers and trusted server-to-server callers | Typed `/v1/engine/*` access with project API key auth | End-user auth, locale, browser-secret delivery, tenant admin APIs |
| App-local adapters / direct `fetch` | A single app or runtime | Environment-specific auth lookup, telemetry, proxying, cache policy, retries | Re-defining shared contracts that already belong in a package |

## Package Roles

### `@reward/user-core`

Use `@reward/user-core` for first-party end-user product flows.

It owns:

- User-facing route constants such as `/auth/user/*`, `/wallet`, `/rewards`,
  `/draw`, `/blackjack`, `/quick-eight`, and fairness endpoints.
- A thin typed request layer that accepts `baseUrl`, `fetchImpl`, `getLocale`,
  and `getAuthToken` from the caller.
- Pure utilities that are safe in both browser and native runtimes, such as
  fairness verification helpers.

It does not own:

- Cookie or secure-storage session retrieval.
- Next.js BFF allow-lists, proxy routing, or server-only token forwarding.
- Telemetry, retry/backoff policy, or cache invalidation strategy.
- Admin, finance-ops, tenant-management, or SaaS prize-engine APIs.

Lifecycle:

- Internal workspace package.
- Refactors are allowed in lockstep with this monorepo.
- No public semver guarantee outside this repository.

### `@reward/prize-engine-sdk`

Use `@reward/prize-engine-sdk` for the SaaS prize engine boundary.

It owns:

- Typed access to `/v1/engine/*`.
- Project API key auth wiring through `getApiKey` or request overrides.
- Partner-specific header injection through `getHeaders`.
- Prize-engine concepts such as overview, fairness commit/reveal,
  behavior-driven rewards, and player ledger queries.
- The canonical reward route `POST /v1/engine/rewards`, with
  `POST /v1/engine/draws` retained only as a legacy gacha transition surface.

It does not own:

- End-user bearer/session auth.
- Locale propagation.
- Admin SaaS management routes such as tenant, billing, invite, or API-key
  issuance workflows.
- Browser-safe secret delivery. This package assumes a trusted runtime.

Lifecycle:

- Public-facing SDK once published outside the monorepo.
- Must follow semver, changelog, and migration-note discipline.
- Breaking route/auth/error-shape changes require an explicit major-version
  release plan.

Server-only rule:

- Do not ship `@reward/prize-engine-sdk` into an untrusted browser bundle while
  it depends on long-lived project API keys.
- If a browser-safe B2B embed or widget is needed later, create a separate
  browser-oriented client instead of weakening this boundary.

### App-Local Adapters And Direct `fetch`

Examples today:

- `apps/frontend/lib/api/*`
- Admin-only route callers
- Backend integration code and one-off internal callers

These adapters own runtime-specific behavior:

- Reading auth material from Auth.js cookies, mobile secure storage, server
  sessions, or secret managers.
- BFF and proxy routing.
- Observability, metrics, and user-facing error capture.
- Retry/backoff, caching, and endpoint allow-lists.

Direct `fetch` is acceptable when:

- The endpoint is internal-only and belongs to one app.
- The flow is framework-specific and would become less clear if generalized.
- The package boundary is still being proven out.

Preferred rule:

- If an endpoint is already part of `@reward/user-core` or
  `@reward/prize-engine-sdk`, app code should wrap that package rather than
  re-modeling the route contract locally.

## Cross-Cutting Rules

| Concern | Owner |
| --- | --- |
| Request/response schemas | `@reward/shared-types` |
| Credential acquisition | App-local adapter |
| Credential attachment to headers | The owning package request helper |
| Shared API envelope parsing | The owning package request helper |
| Telemetry and UI error capture | App-local adapter |
| Retry/backoff policy | App-local adapter, opt-in only |

Retry rule:

- Shared packages should not auto-retry by default.
- Many prize and wallet operations are state-changing.
- Automatic retries belong only in app-local adapters, and then only for
  explicitly safe or idempotent calls.

Dependency rule:

- `@reward/user-core` and `@reward/prize-engine-sdk` must not depend on each
  other.
- If both packages keep needing the same low-level transport primitive later,
  extract a third internal helper package. Do not make the public SDK sit on
  top of the internal user client.

## Decision Checklist

Use `@reward/user-core` when:

- The caller is a first-party web or mobile user surface.
- The auth model is user session or user bearer token.
- The API being called is part of the product user journey.

Use `@reward/prize-engine-sdk` when:

- The caller is a B2B integrator or trusted backend.
- The auth model is a project API key.
- The API being called is under `/v1/engine/*`.

Use an app-local adapter or direct `fetch` when:

- The flow is framework-specific, internal-only, or server-side orchestration.
- You need proxying, cookie-based auth lookup, telemetry, or retry policy that
  should not leak into a shared package.

## Current State And Target State

Current state:

- `apps/mobile` already consumes `@reward/user-core`.
- `apps/frontend` still has local user-API transport helpers in
  `apps/frontend/lib/api/user.ts` plus BFF adapters in `apps/frontend/lib/api/*`.
- `@reward/prize-engine-sdk` is new and currently isolated, which is good.

Target state:

- Keep app-specific transport behavior in app-local adapters.
- Keep reusable user-facing route and envelope behavior in `@reward/user-core`.
- Keep partner-facing prize-engine access in `@reward/prize-engine-sdk`.
- Avoid a single "do everything" client package. The auth model and lifecycle
  are intentionally different.
