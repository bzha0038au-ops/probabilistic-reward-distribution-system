# Draw Module

## Scope

The draw module owns prize selection, wallet debits and rewards, fairness
metadata, and draw record persistence.

## Source Of Truth

- Shared contract and response schema: `apps/shared-types/src/draw.ts`
- Database schema: `apps/database/src/modules/prize.ts`
- Runtime orchestration: `execute-draw.ts`
- Public service entrypoint: `service.ts`

## Review Notes

- Keep draw status values aligned with `@reward/shared-types`.
- `draw_records.metadata` is the canonical place for fairness and payout-control
  trace data written during execution.
- Avoid adding alternate draw status unions inside helpers or tests; import the
  shared type instead.
