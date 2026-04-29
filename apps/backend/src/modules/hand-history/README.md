# Hand History Module

## Scope

The hand-history module owns canonical round replay reconstruction, per-user
payload redaction, evidence-bundle export, and append-only round event
persistence used by Hold'em, Blackjack, and Quick Eight.

## Source Of Truth

- Shared contract and replay schemas:
  `apps/shared-types/src/hand-history.ts`
- Event persistence:
  `apps/database/src/modules/round-events.ts`,
  `apps/database/src/modules/hand-history.ts`,
  `apps/database/src/modules/table-events.ts`
- Public service entrypoints:
  `service.ts`, `evidence-bundle.ts`, `round-id.ts`
- Archive and retention strategy:
  [`docs/hand-history-archival.md`](../../../../../docs/hand-history-archival.md)

## Current Behavior

- Hold'em replay reads a hot PostgreSQL path:
  `hand_histories` + `round_events` + `table_events`
- Blackjack and Quick Eight replay read `round_events`
- All replay and evidence-bundle reads are currently hot-only

## Archive Boundary

- Archive only terminal rounds
- `round_events` and `table_events` are the primary cold-storage targets
- Privileged replay surfaces must eventually read `hot first`, then `cold`
  using the archive manifest
- Consumer-facing responses must continue to flow through service-layer
  redaction even when the source data comes from cold storage

## Review Notes

- Do not assume hot PostgreSQL rows remain the long-term source of truth for
  replay payloads once the archive manifest lands
- Keep round-level archive writes idempotent; never delete hot rows before the
  cold object and checksum are verified
- Treat archived payloads as operator evidence, not direct user response bodies
