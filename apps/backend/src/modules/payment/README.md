# Payment Module

## Scope

The payment module owns payment provider routing, finance state transitions,
review metadata, webhook/reconciliation helpers, and the persistence shape for
deposits, withdrawals, payout methods, and provider events.

## Source Of Truth

- Shared status enums and cross-app record models: `apps/shared-types/src/finance.ts`
- Database schema: `apps/database/src/modules/finance.ts`
- Routing and provider capability decisions: `service.ts`
- Review/state helpers: `finance-order.ts`, `state-machine.ts`
- User-facing money movement entrypoints: `../top-up/service.ts`,
  `../withdraw/service.ts`, `../bank-card/service.ts`

## Review Notes

- New finance statuses or review actions must land in
  `apps/shared-types/src/finance.ts` first, then flow into the database and
  services from there.
- Keep compiled output out of `src/`; generated artifacts belong in `dist/`
  only.
- Do not reintroduce parallel finance table definitions outside
  `apps/database/src/modules/finance.ts`.
