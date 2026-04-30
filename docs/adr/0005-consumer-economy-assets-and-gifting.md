# ADR 0005: Consumer Economy Assets And Gifting

## Status

Proposed

## Decision Summary

Freeze the consumer social-economy model around two non-cash assets:

- `B luck` is an earned-only, non-withdrawable, non-redeemable, giftable
  in-product asset.
- `IAP voucher` is a purchase-only, non-giftable store asset.
- `IAP gift pack` is a direct-to-recipient purchase flow and must not route
  through a sender-owned transferable balance.

Web is a consume-only surface for this economy in this phase. Web may display
balances and spend eligible balances, but it does not execute direct purchase
or top-up flows for these assets.

## Context

The repo already contains legacy wallet semantics in `user_wallets`,
`ledger_entries`, and draw/bonus workflows that predate the new social gifting
and store purchase model.

Without a written boundary, it is too easy to:

- reconnect `B luck` to cash-out, redemption, or real-money gameplay,
- leak legacy names such as `transfer`, `wallet transfer`, `coin`, or
  `cashout` into the new product surface,
- let each gameplay or purchase flow invent its own asset bookkeeping,
- or treat Web, iOS, and Android purchase policy inconsistently.

## Decision

- Product and code naming for this feature family must use `gift`, `send gift`,
  and `B luck`.
- Do not use `transfer`, `wallet transfer`, `coin`, or `cashout` for the new
  social-economy surface.
- `B luck` may only be earned, spent inside the product, or sent as a gift.
- `B luck` must not be withdrawable, redeemable into cash or coupons, or wired
  into existing real-money finance rails.
- `IAP voucher` may only be created by verified iOS/Android store purchases.
- `IAP voucher` must not be giftable.
- `IAP gift pack` is a direct purchase-to-recipient fulfillment flow. It must
  not mint a sender-owned liquid balance first.
- Web is consume-only for this economy in this phase. Native store purchase
  flows remain the source of truth for purchasable assets.
- New consumer economy primitives must live in dedicated economy tables and a
  dedicated backend module. New product semantics must not be added to
  `user_wallets`.
- `user_wallets` and `ledger_entries` remain legacy compatibility surfaces for
  existing finance/gameplay flows until those flows are explicitly migrated.

## Legacy Compatibility Rule

- This ADR does not migrate legacy `bonus_balance` into `B luck`.
- New draw rewards must credit `B_LUCK` through the economy ledger rather than
  `user_wallets.bonus_balance`.
- Draw play-mode deferred payouts (for example deferred-double and snowball)
  must withhold and release against `B_LUCK`, not legacy `bonus_balance`.
- Casual holdem buy-ins, in-table locked stack settlement, cash-out, and
  holdem play-mode deferred withholding/release must use `B_LUCK` asset
  balances, not legacy `bonus_balance` or `locked_balance`.
- Bonus auto release and admin manual bonus release are retired legacy flows
  and must not be reconnected to `B luck`.
- `/wallet` may continue to expose a deprecated compatibility balance for old
  consumers, but new clients must read assetized balances from the new economy
  response shape.
- `/transactions` and legacy finance wallet reads remain legacy until the
  dedicated `GET /economy/ledger` rollout lands.

## Consequences

- New store, gifting, and earned-balance work must integrate through the
  economy module rather than ad hoc SQL in feature modules.
- New UI copy across Web, iOS, Android, and admin must remove any suggestion
  that `B luck` has cash value.
- Existing gameplay and finance flows are not automatically safe for the new
  economy. They require explicit migration work.

## Implementation Checkpoint

Checkpoint date: `2026-04-30`

- Batch 1 is complete in-repo: rules are frozen, shared economy contracts are
  live, dedicated economy tables exist, and the core economy service owns
  assetized balance mutations plus ledger writes.
- Batch 2 is complete in-repo: `/wallet`, `GET /economy/ledger`,
  `GET /gift-energy`, `GET /gifts`, and `POST /gifts` are live, with the
  legacy wallet response still preserved as a compatibility surface.
- Web account surfaces now treat the wallet as an economy-only container:
  legacy browser top-up, withdrawal, bank-card, and crypto payout routes are
  no longer exposed through the consumer web BFF, and the wallet route reads
  assetized balances as its primary display source.
- Batch 3 is implementation-complete in-repo but not yet fully validated
  against live store sandboxes.

### Batch 3 Done In Repo

- Backend IAP catalog, verification, fulfillment, replay protection, refund
  reversal, revoke handling, and notification intake are implemented.
- Mobile native IAP wiring for iOS and Android is implemented.
- Local development database must include migration
  `0100_economy_foundation`.
- Local development catalog can be seeded with test voucher rows using:
  `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/reward_local sh scripts/run-tsx.sh apps/backend/scripts/seed-iap-products.ts`

### Batch 3 Deferred Validation

- Create matching real SKUs in App Store Connect for:
  `reward.ios.voucher.small`, `reward.ios.voucher.medium`,
  `reward.ios.voucher.large`.
- Create matching real SKUs in Play Console for:
  `reward.android.voucher.small`, `reward.android.voucher.medium`,
  `reward.android.voucher.large`.
- Run an iOS Sandbox Apple Account purchase flow end-to-end:
  native purchase -> backend verify -> `IAP_VOUCHER` fulfillment.
- Run an Android test-account purchase flow end-to-end:
  native purchase -> backend verify -> `IAP_VOUCHER` fulfillment.
- Validate refund and revoke paths against real store sandbox signals, not only
  local integration fixtures.

## Current Source Of Truth

- Consumer product boundary summary: `AGENTS.md`
- Package boundary rules: `packages/README.md`
- Legacy wallet/read model: `apps/backend/src/modules/wallet/service.ts`
- Legacy bonus/draw coupling: `apps/backend/src/modules/draw/execute-draw.ts`
- New shared consumer-economy contract: `apps/shared-types/src/economy.ts`
- New database primitives: `apps/database/src/modules/economy.ts`
