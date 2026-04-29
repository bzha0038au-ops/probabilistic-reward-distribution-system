# Hand History Archival Strategy

## Status

This document defines the target archive and replay policy for hand-history data.
It is intentionally explicit because the current implementation is still hot-DB
only:

- Hold'em replay reads `hand_histories` plus full `round_events` and
  `table_events`
- Blackjack and Quick Eight replay read `round_events`
- No archive manifest or cold-storage fetch path exists yet

The goal is to stop `round_events` from growing without bound while preserving
operator-grade replay, dispute investigation, and compliance evidence.

## Problem

`round_events` is append-only and grows with every settled round. For Hold'em,
`table_events` grows with the same shape. Keeping all replay detail in hot
PostgreSQL forever is the wrong cost and operations profile:

- recent replays need low latency
- old rounds are rarely accessed but must remain recoverable
- admin and compliance investigations still need authoritative evidence
- retention rules vary by jurisdiction and can outlive the normal product UX

## Decision Summary

1. Archive only terminal rounds.
2. Keep recent rounds hot in PostgreSQL for `90` days from `settled_at`.
3. After the hot window, move verbose replay payloads to S3 and keep a metadata
   index in PostgreSQL.
4. Use a `7`-year default retention baseline from settlement or case closure,
   whichever is later, unless a jurisdiction requires longer retention.
5. Admin/support replay must read `hot first`, then `cold` on miss.
6. Consumer replay can remain hot-only until the product explicitly accepts
   slower cold fetches for self-serve users.
7. Rounds under dispute, chargeback review, AML review, fraud investigation, or
   legal hold must not be deleted when the normal clock expires.

## Why 90 Days Hot

`90` days is the default hot-storage window because it covers the operationally
common cases without forcing the primary database to retain years of detailed
event logs:

- most player replay traffic is near the date of play
- normal support investigations usually happen shortly after settlement
- the long-tail compliance need is evidence retention, not sub-100 ms query
  latency

If real support data shows that older rounds are frequently replayed, increase
the hot window to `180` days. The archive contract below does not change.

## Why 7 Years Cold

There is no single universal retention number for this product class. The safe
engineering policy is:

- choose a global baseline that covers the strictest common regime we expect
- allow per-jurisdiction overrides upward
- let legal/compliance own the final mapping before launch

The default baseline in this repo is `7` years because it covers common AML and
audit retention expectations and is stricter than the `5`-year minima that show
up in several financial and gambling guidance sources.

Examples that informed this default, current as of `2026-04-29`:

- AUSTRAC says AML/CTF records are usually kept for `7` years and must be
  sufficient to reconstruct individual transactions:
  [AUSTRAC record keeping overview](https://www.austrac.gov.au/industry-and-business/obligations-and-guidance/your-amlctf-program/develop-your-amlctf-programs/record-keeping/record-keeping-overview)
- UK Gambling Commission AML guidance says customer identification,
  verification, and supporting records are retained for `5` years after the
  business relationship ends:
  [UKGC retention period](https://www.gamblingcommission.gov.uk/guidance/the-prevention-of-money-laundering-and-combating-the-financing-of-terrorism/prevention-of-ml-and-combating-the-financing-of-terrorism-part-7-8-retention-period)
- FinCEN MSB SAR guidance says filed forms and supporting documentation are
  retained for `5` years:
  [FinCEN MSB SAR retention](https://www.fincen.gov/money-services-business-msb-suspicious-activity-reporting)
- UKGC RTS 11 requires peer-to-peer systems to retain records of relevant
  activities to support investigations at bet/action level:
  [UKGC RTS 11](https://www.gamblingcommission.gov.uk/standards/remote-gambling-and-software-technical-standards/rts-11-limiting-collusion-and-cheating)

This is not legal advice. Compliance counsel still needs to confirm the actual
record class, jurisdiction, and deletion clock for each deployment.

## What Moves To Cold Storage

The archive unit is one settled round, not individual rows.

Archive together:

- all `round_events` for the round
- all `table_events` tied to the round, when the game type uses them
- the replay reconstruction inputs needed to rebuild the exact admin view
- the evidence-bundle inputs needed for disputes and audits

Do not archive:

- active rounds
- timed-out rounds that are still being compensated or reconciled
- anything on dispute, fraud, AML, chargeback, or legal hold

## Hot Metadata That Stays In PostgreSQL

Cold storage should remove the large event streams, not the ability to search
for a round. PostgreSQL must keep a searchable metadata catalog.

Keep or add enough metadata to answer:

- what round is this
- who participated
- which game/table produced it
- when did it start and settle
- what is its archive status
- where is the cold object
- what checksum proves object integrity
- when does retention expire
- whether a hold blocks deletion

Recommended manifest table:

`round_event_archives`

- `round_type`
- `round_entity_id`
- `hand_history_id` nullable
- `storage_backend` (`s3`)
- `storage_bucket`
- `storage_key`
- `storage_region`
- `storage_class`
- `schema_version`
- `compression`
- `payload_sha256`
- `event_count`
- `table_event_count`
- `archived_at`
- `retention_expires_at`
- `hold_reason` nullable
- `last_cold_read_at` nullable
- `last_cold_read_status` nullable

Indexes:

- unique on `round_type, round_entity_id`
- lookup on `hand_history_id`
- lookup on `retention_expires_at`
- lookup on `hold_reason`

## S3 Object Contract

Use one object per round. Do not scatter a single round across many keys.

Suggested key layout:

```text
s3://<bucket>/hand-history/year=YYYY/month=MM/day=DD/round-type=<type>/round-id=<type>:<id>.json.gz
```

Suggested payload envelope:

```json
{
  "schemaVersion": "round_history_archive_v1",
  "roundId": "holdem:12345",
  "roundType": "holdem",
  "roundEntityId": 12345,
  "archivedAt": "2026-04-29T00:00:00.000Z",
  "historySummary": {},
  "roundEvents": [],
  "tableEvents": [],
  "evidenceBundle": null
}
```

Rules:

- store canonical operator-grade data, not user-redacted payloads
- compress with `gzip`
- encrypt with SSE-KMS
- enable bucket versioning
- prefer immediately retrievable storage classes such as `STANDARD_IA` or
  `INTELLIGENT_TIERING`; do not use Glacier classes for the primary replay path
  if admin replay must be synchronous

If the business later wants Glacier for older evidence, make it a second-stage
transition after an explicit async restore workflow exists.

## Archive Workflow

Run a dedicated archive worker on a schedule.

Selection rules:

- round is terminal
- `settled_at < now() - interval '90 days'`
- no active hold
- no pending compensation/reconciliation work
- not already archived

Worker steps:

1. Load the round inside a repeatable transaction or other stable snapshot.
2. Build one archive payload for the round.
3. Write the compressed payload to S3.
4. Verify checksum and object existence.
5. Upsert the manifest row in PostgreSQL.
6. Delete `round_events` and `table_events` for the round only after manifest
   commit succeeds.
7. Emit metrics and audit logs with row counts and storage key.

The worker must be idempotent. Retrying after a partial failure must not create
duplicate manifests or delete hot rows before object verification completes.

## Replay Read Path

Privileged replay surfaces such as admin/support/dispute tooling must use this
order:

1. Parse `roundId`
2. Look for the hot rows in PostgreSQL
3. If present, build replay from hot data and return `source=hot`
4. If hot rows are missing, read the manifest
5. Fetch the S3 object, rebuild the same response contract, and return
   `source=cold`
6. Optionally cache the cold payload in Redis or local memory for a short TTL

Important constraints:

- the service layer still owns redaction and response shaping
- cold objects are authoritative operator evidence, not direct user payloads
- a cold miss is an incident if a manifest exists but the object is unreadable

## Admin Replay Contract

Admin replay is the primary consumer of cold data.

Requirements:

- hot/cold source must be visible in logs and response metadata
- cold replay latency budget should be seconds, not minutes
- replay screens must tolerate a short loading state on cold fetch
- evidence export should prefer the same archive object rather than rebuilding
  from multiple sources

Consumer replay does not need to adopt cold fallback by default. That keeps old
personal gameplay data off the normal self-serve path unless product and legal
teams explicitly want it.

## Deletion Policy

Delete only when all of the following are true:

- retention clock has expired
- no dispute, fraud, AML, chargeback, or legal hold exists
- no open regulatory or court request references the round
- deletion is allowed by the deployment jurisdiction

Deletion should remove:

- the S3 object
- the PostgreSQL manifest row
- any derived cache entries

The deletion worker must emit an audit trail with round count, date range, and
operator or automation identity.

## Observability

Add metrics before rollout:

- archive worker backlog size
- rounds archived per run
- archive write failures
- checksum verification failures
- admin replay hot-hit rate
- admin replay cold-hit rate
- cold fetch latency
- manifest-without-object incidents

Alert if:

- archive backlog exceeds `7` days beyond policy
- cold fetch failures are non-zero
- manifest/object integrity mismatches occur

## Rollout Plan

1. Add the archive manifest table and metrics.
2. Add the archive worker and dry-run mode.
3. Add admin replay hot-first/cold-fallback reads.
4. Backfill old settled rounds into S3.
5. Enable hot-row deletion only after replay parity is verified.
6. Add retention-expiry deletion after legal signoff.
