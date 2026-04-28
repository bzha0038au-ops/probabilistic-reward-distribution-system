# Prediction Market V2 ADR: LMSR Trading Market

## Status

Proposed - 2026-04-28

## Decision Summary

Prediction market v2 should move from the current pooled pari-mutuel stake model to an LMSR-based trading market with explicit shares, holdings, trades, and price snapshots.

The design keeps `prediction_markets` as the top-level market registry, but it does not overload `prediction_positions` with new semantics. V1 and v2 should coexist:

- V1 (`mechanism = pari_mutuel`) keeps the current `prediction_positions` flow and settlement path.
- V2 (`mechanism = lmsr`) adds new market-state, outcome, holding, trade, snapshot, and redemption tables.
- V2 cash leaves and enters the user wallet at trade time. It does not use `user_wallets.locked_balance`.
- V2 settlement pays winning shares at a fixed `payout_per_share`, instead of redistributing a pooled pot.

This is intentionally a "tradable shares + continuous pricing" step toward a Polymarket-like product. It is not a central limit order book.

## Current V1 Baseline

The current module is a pari-mutuel pool:

- Schema: `apps/database/src/modules/prediction-market.ts`
- Service: `apps/backend/src/modules/prediction-market/service.ts`
- Settlement helper: `apps/backend/src/modules/prediction-market/settlement.ts`
- Integration coverage: `apps/backend/src/integration/backend.prediction-market.integration.test.ts`

Current behavior:

- `prediction_markets` stores market metadata plus `total_pool_amount` and `winning_pool_amount`.
- `prediction_positions` stores one immutable stake row per user action.
- Entering a market debits `withdrawable_balance` and moves value into `locked_balance`.
- Resolution redistributes the pooled stake to winning positions.
- Losers are already economically settled once they place the stake.

That model works for "bet into a pot and wait for resolution". It does not model "hold inventory, trade in and out, and observe continuous prices".

## Goals

- Support tradable YES/NO or multi-outcome shares before resolution.
- Support continuous LMSR pricing with bounded market-maker loss.
- Represent immutable executions separately from mutable user inventory.
- Keep user-wallet, market-state, and house-risk accounting auditable.
- Preserve v1 behavior and history without rewriting old records into fake v2 trades.

## Non-Goals

- No order book, maker/taker matching, or resting limit orders in v2.
- No margin, leverage, shorting, or cross-market portfolio netting.
- No attempt to migrate existing v1 stake rows into synthetic LMSR trade history.

## Why Not Evolve The Current Pari-Mutuel Schema In Place?

The current schema is not just "missing a few columns". It encodes a different financial model.

### 1. `prediction_positions` conflates stake intent, inventory, and final entitlement

In v1, one row means:

- the user paid cash,
- the stake is locked until the event ends,
- the row itself is the unit of final settlement.

In v2, those concerns split apart:

- `trade` is the immutable execution event,
- `holding` is the mutable remaining inventory,
- `redemption` is the immutable settlement event after resolution.

Trying to stretch `prediction_positions` into partial sells, partial remaining inventory, average cost, realized PnL, and redemption state would make the table semantically ambiguous and hard to audit.

### 2. V1 aggregates are pool-based, while v2 aggregates are state-based

`total_pool_amount` and `winning_pool_amount` are enough for pari-mutuel settlement. LMSR needs continuously changing state:

- outstanding shares per outcome,
- current price vector,
- liquidity parameter `b`,
- exact cash collected,
- exact liability,
- fee accrual,
- market-state versioning.

Those are not minor extensions to the pool model. They are a different state machine.

### 3. `locked_balance` is the wrong wallet model for tradable inventory

V1 uses `locked_balance` because the user's stake stays at risk until the outcome is known.

V2 should not lock the principal:

- a buy spends cash immediately and creates inventory,
- a sell destroys inventory and returns cash immediately,
- only the remaining shares stay economically at risk.

Reusing `locked_balance` would create confusing wallet semantics and misleading ledger history.

### 4. Pari-mutuel settlement is peer-to-peer redistribution; LMSR settlement is fixed-payout redemption

V1 resolves by redistributing a user-funded pot to winners.

V2 resolves by redeeming the winning shares at a fixed payout per share, typically `1.00`, against an LMSR market-maker reserve with bounded loss:

- losers do not fund winners directly at resolution time,
- the market maker is the counterparty,
- fees and bounded-loss subsidy become first-class accounting concerns.

### 5. JSONB outcomes are acceptable for v1 metadata but a bad concurrency surface for v2 pricing state

Updating hot trading state inside `prediction_markets.outcomes` would create row contention and fragile partial-update logic. V2 needs row-based outcome state with deterministic locking order.

## Decision

V2 uses a parallel schema under the same market registry.

### Shared market registry

`prediction_markets` remains the canonical top-level market record, but it should be extended with:

- `mechanism`: `pari_mutuel | lmsr`
- `schema_version`: `1 | 2`
- `quote_currency`: default `USD`
- `payout_per_share`: default `1.00`

`prediction_markets.outcomes` remains as an immutable display snapshot and backward-compatible API cache. It is not the hot source of truth for LMSR pricing.

### New v2 tables

#### `prediction_market_outcomes`

One row per outcome.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial/bigserial` | PK |
| `market_id` | FK | `prediction_markets.id` |
| `outcome_key` | `varchar(64)` | Stable API key |
| `label` | `varchar(80)` | Display label |
| `sort_index` | `integer` | Stable outcome order |
| `net_shares_outstanding` | `numeric(24, 8)` | Sum of open shares held by users |
| `last_price` | `numeric(18, 8)` | Current LMSR spot price in `[0, 1]` |
| `resolved_payout_per_share` | `numeric(18, 8)` nullable | `1` for winner, `0` otherwise |
| `metadata` | `jsonb` nullable | Optional display / oracle hints |
| `created_at`, `updated_at` | timestamptz |  |

Rationale:

- row-based locking is safer than mutating a JSON array inside `prediction_markets`,
- reporting and snapshots should join against normalized outcome rows,
- `net_shares_outstanding` becomes the fast path for liability checks.

#### `prediction_market_lmsr_states`

Exactly one row per LMSR market.

| Column | Type | Notes |
| --- | --- | --- |
| `market_id` | FK/PK | `prediction_markets.id` |
| `state_version` | `bigint` | Monotonic version for optimistic concurrency |
| `liquidity_b` | `numeric(24, 8)` | LMSR liquidity parameter |
| `trading_fee_bps` | `integer` | Fee charged on each trade |
| `seed_subsidy_exact` | `numeric(24, 8)` | House-funded bounded-loss subsidy |
| `cash_balance_exact` | `numeric(24, 8)` | Exact market cash, including subsidy and fee dust |
| `theoretical_cost_exact` | `numeric(24, 8)` | Current `C(q)` value for invariant checks |
| `fee_accrued_exact` | `numeric(24, 8)` | Exact fee retained by the market |
| `rounding_reserve_exact` | `numeric(24, 8)` | Exact dust created by cent rounding |
| `max_outstanding_payout_exact` | `numeric(24, 8)` | `max(outcome.net_shares_outstanding) * payout_per_share` |
| `last_trade_id` | FK nullable | Last committed trade |
| `created_at`, `updated_at` | timestamptz |  |

`cash_balance_exact` is a market-local reserve ledger. It starts at `seed_subsidy_exact`.

#### `prediction_market_holdings`

Mutable per-user inventory, one row per user and outcome.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial/bigserial` | PK |
| `market_id` | FK |  |
| `user_id` | FK |  |
| `outcome_id` | FK |  |
| `shares_balance` | `numeric(24, 8)` | Current open inventory |
| `open_cost_basis_exact` | `numeric(24, 8)` | Exact cost basis of remaining shares |
| `realized_pnl_exact` | `numeric(24, 8)` | Exact realized trade PnL before resolution |
| `bought_shares_total` | `numeric(24, 8)` | Lifetime purchased shares |
| `sold_shares_total` | `numeric(24, 8)` | Lifetime sold shares |
| `redeemed_shares_total` | `numeric(24, 8)` | Lifetime redeemed shares |
| `settlement_status` | enum | `open`, `resolved`, `redeemed`, `expired`, `cancel_refunded` |
| `last_trade_id` | FK nullable | Latest trade affecting this row |
| `created_at`, `updated_at` | timestamptz |  |

Holdings are mutable caches for fast reads and operational checks. The immutable source of truth is still the trade and redemption event stream.

#### `prediction_market_trades`

Immutable execution log, one row per committed LMSR fill.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `market_id` | FK |  |
| `user_id` | FK |  |
| `outcome_id` | FK |  |
| `side` | enum | `buy`, `sell` |
| `request_mode` | enum | `cash_amount`, `share_amount` |
| `requested_amount_exact` | `numeric(24, 8)` | Raw client intent |
| `shares_delta_exact` | `numeric(24, 8)` | Positive for buy, negative for sell from user view |
| `lmsr_cash_amount_exact` | `numeric(24, 8)` | Cost-function delta before fee |
| `fee_amount_exact` | `numeric(24, 8)` | Exact fee |
| `wallet_settled_amount` | `numeric(14, 2)` | Signed amount posted to `ledger_entries` |
| `rounding_adjustment_exact` | `numeric(24, 8)` | Difference between exact math and wallet cents |
| `average_price_exact` | `numeric(18, 8)` | `lmsr_cash_amount_exact / abs(shares_delta_exact)` |
| `state_version_before` | `bigint` |  |
| `state_version_after` | `bigint` |  |
| `idempotency_key` | `varchar(191)` | Unique per user and market |
| `metadata` | `jsonb` nullable | Slippage settings, client source, quote reference |
| `created_at` | timestamptz |  |

#### `prediction_market_price_snapshots`

Immutable market-state snapshots for charts, audits, and replay.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `market_id` | FK |  |
| `state_version` | `bigint` | Snapshot of the committed LMSR state |
| `trigger_type` | enum | `trade`, `resolution`, `cancel`, `admin_adjustment` |
| `trigger_ref_id` | bigint nullable | Trade or settlement row |
| `prices` | `jsonb` | Outcome price vector |
| `net_shares` | `jsonb` | Outcome outstanding shares |
| `cash_balance_exact` | `numeric(24, 8)` | Market-local reserve after the change |
| `max_outstanding_payout_exact` | `numeric(24, 8)` | Liability snapshot |
| `created_at` | timestamptz |  |

Every committed trade should create one snapshot in v2. Rollups and candles can be derived later.

#### `prediction_market_settlements`

One market-level resolution record.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `market_id` | FK unique |  |
| `winning_outcome_id` | FK nullable | Null when cancelled |
| `status` | enum | `pending_redemption`, `processing`, `completed`, `cancelled` |
| `oracle_source` | `varchar(64)` | Resolution source |
| `oracle_external_ref` | `varchar(128)` nullable | External decision ref |
| `oracle_payload_hash` | `varchar(191)` nullable | Integrity reference |
| `resolved_at` | timestamptz |  |
| `completed_at` | timestamptz nullable |  |
| `metadata` | `jsonb` nullable | Admin notes, cancel reason, refund policy |

#### `prediction_market_redemptions`

Immutable per-user settlement events. This allows scalable, batched resolution without a single giant admin transaction.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `settlement_id` | FK |  |
| `market_id` | FK |  |
| `user_id` | FK |  |
| `outcome_id` | FK nullable | Winner for redemption, null for cancel refund |
| `redemption_type` | enum | `winner_payout`, `cancel_refund` |
| `shares_exact` | `numeric(24, 8)` | Shares redeemed or refunded |
| `exact_payout_amount` | `numeric(24, 8)` | Exact calculation before wallet rounding |
| `wallet_settled_amount` | `numeric(14, 2)` | Credited amount posted to `ledger_entries` |
| `rounding_adjustment_exact` | `numeric(24, 8)` | Residual rounding delta |
| `ledger_entry_id` | FK nullable | User-facing money ledger row |
| `status` | enum | `pending`, `completed` |
| `created_at`, `processed_at` | timestamptz |  |

## LMSR Pricing Model

V2 uses the shifted LMSR cost function:

`C(q) = b * ln(sum(exp(q_i / b))) - b * ln(n)`

Where:

- `q_i` is net shares outstanding for outcome `i`
- `b` is the liquidity parameter
- `n` is outcome count

Spot price:

`p_i(q) = exp(q_i / b) / sum(exp(q_j / b))`

Trade math:

- Buy `delta` shares of outcome `i`: `cost = C(q + delta * e_i) - C(q)`
- Sell `delta` shares of outcome `i`: `gross_proceeds = C(q) - C(q - delta * e_i)`

Loss bound:

- Maximum market-maker loss before fees is `b * ln(n) * payout_per_share`
- `seed_subsidy_exact` should be at least that amount

Calibration rule:

- If product wants a maximum seeded loss `L`, choose `b = L / ln(n)` when `payout_per_share = 1`

## Precision And Rounding

User wallet balances stay at the repo-wide money precision of two decimals. LMSR internals need finer precision.

Rules:

- Shares, exact prices, exact cash, and exact liabilities use `numeric(24, 8)`.
- `ledger_entries` and `user_wallets` remain cent-based.
- Buy wallet debit rounds up to cents.
- Sell wallet credit rounds down to cents.
- Resolution and cancel payouts use deterministic largest-remainder allocation across the market so the cent-level total is stable and auditable.
- The exact difference between internal math and wallet cents is stored as `rounding_adjustment_exact` on trade or redemption rows and accumulated into `rounding_reserve_exact`.

This prevents free arbitrage from rounding while preserving the current wallet storage model.

## Core Invariants

V2 should enforce these invariants in code and reconciliation:

- `prediction_markets.mechanism = 'lmsr'` implies no new rows are written to `prediction_positions`.
- `sum(holdings.shares_balance by outcome) = prediction_market_outcomes.net_shares_outstanding`.
- `prediction_market_lmsr_states.cash_balance_exact >= max_outstanding_payout_exact` while the market is tradable or locked.
- `state_version` increments exactly once per committed trade.
- A user may not sell more shares than `holdings.shares_balance`.
- `prediction_market_trades` and `prediction_market_redemptions` are immutable.
- User wallet deltas for LMSR entries affect `withdrawable_balance` only. They do not mutate `locked_balance`.

## Trade Flow

### Quote flow

Quotes are read-only and stateless:

1. Load market, outcomes, and LMSR state.
2. Compute price vector and projected fill.
3. Return:
   - expected shares out or cash out,
   - fee,
   - average fill price,
   - price before and after,
   - `state_version`,
   - slippage guard rails.

The client must send either:

- buy with `cash_amount`, or
- sell with `share_amount`

V2 may support the inverse modes later, but those are not required for the initial design.

### Buy execution

Canonical critical section: `executePredictionTrade(userId, marketId, side='buy')`

1. Lock `prediction_markets` row.
2. Lock `prediction_market_lmsr_states` row.
3. Lock all `prediction_market_outcomes` rows for the market in `sort_index` order.
4. Lock `user_wallets` row.
5. Lock or create the relevant `prediction_market_holdings` row.
6. Recompute the quote from locked state.
7. Validate market status, KYC, user limits, and slippage.
8. Debit `withdrawable_balance` by the rounded wallet amount.
9. Increase outcome `net_shares_outstanding`.
10. Upsert holding inventory and exact cost basis.
11. Update LMSR state, trade row, and price snapshot.
12. Write one user `ledger_entries` row.

User cash semantics:

- Money leaves the wallet immediately.
- No `locked_balance` mutation occurs.
- Inventory risk is carried by the holding row.

### Sell execution

Canonical critical section: `executePredictionTrade(userId, marketId, side='sell')`

1. Lock the same rows in the same order as buy.
2. Verify `holdings.shares_balance >= shares_to_sell`.
3. Recompute LMSR gross proceeds from locked state.
4. Validate slippage.
5. Credit `withdrawable_balance` by the rounded wallet amount.
6. Decrease outcome `net_shares_outstanding`.
7. Reduce holding inventory and cost basis proportionally.
8. Update realized PnL in holding state.
9. Update LMSR state, trade row, and price snapshot.
10. Write one user `ledger_entries` row.

## Settlement Semantics

### Market resolution

Resolution is a small transaction. It should not attempt to credit every holder inline.

Resolution steps:

1. Lock market, LMSR state, and outcomes.
2. Verify the market is locked, unresolved, and has a valid winning outcome.
3. Insert `prediction_market_settlements`.
4. Mark the winning outcome with `resolved_payout_per_share = 1` and all others `0`.
5. Mark market status as `resolved`.
6. Create a final `prediction_market_price_snapshots` row with terminal prices.

### Redemption

Redemption is batched and idempotent:

1. A worker reads unresolved holdings for the winning outcome.
2. For each user, lock wallet plus holding row.
3. Compute exact payout = `shares_balance * payout_per_share`.
4. Apply cent rounding using the market-level largest-remainder policy.
5. Credit `withdrawable_balance`.
6. Insert `prediction_market_redemptions`.
7. Write user `ledger_entries`.
8. Zero the redeemed holding and mark it `redeemed`.
9. Decrease `cash_balance_exact` by the exact payout.

Losing holdings:

- receive no wallet credit at resolution,
- move to `expired`,
- are already economically settled because the buy cost was paid earlier.

### Cancellation

Cancellation is exceptional and should be modeled explicitly, not hidden under the same payout status as v1.

Policy:

- If a market is cancelled before the first trade, it simply closes.
- If a market is cancelled after trading begins, a cancel settlement run computes user refunds from the immutable trade stream, with holdings used as an acceleration cache.
- Default refund target is the remaining open economic exposure, not "current mark price".

This is one more reason not to overload `prediction_positions`.

## User Ledger Impact

V2 introduces new user ledger entry types:

| Entry type | Wallet effect | Meaning |
| --- | --- | --- |
| `prediction_market_buy` | Withdrawable debit | Rounded cash charged for a buy, fee included in metadata |
| `prediction_market_sell` | Withdrawable credit | Rounded cash returned for a sell, fee included in metadata |
| `prediction_market_redeem` | Withdrawable credit | Winning-share payout after resolution |
| `prediction_market_cancel_refund` | Withdrawable credit | Cancel refund of open exposure |

Ledger metadata should include:

- `marketId`
- `outcomeKey`
- `tradeId` or `redemptionId`
- `sharesExact`
- `lmsrCashAmountExact`
- `feeAmountExact`
- `roundingAdjustmentExact`
- `stateVersion`

Wallet invariant impact:

- `apps/backend/src/modules/wallet/invariant-service.ts` will need to recognize these new entry types.
- All of them should map to `withdrawable_balance` only.
- None of them should imply `locked_balance` or `wagered_amount`.

## House And Reserve Accounting Impact

V1 prediction markets are effectively peer-to-peer at settlement time. V2 introduces a real market-maker reserve.

### Market-local reserve

`prediction_market_lmsr_states.cash_balance_exact` is the market-local reserve ledger.

It changes on:

- house seed subsidy,
- buys,
- sells,
- winner redemptions,
- cancel refunds,
- final market close-out.

### Global house account

Global `house_account.house_bankroll` should only move at well-defined boundaries:

1. Market open: seed `seed_subsidy_exact` into the market-local reserve.
2. Optional fee sweep: move realized surplus from the market-local reserve into `house_bankroll` only if post-sweep collateral remains above `max_outstanding_payout_exact`.
3. Market close: sweep remaining market-local cash back into `house_bankroll`.

This keeps v2 reserve math isolated from draw `prize_pool_balance` semantics.

Recommended new house transaction types:

- `prediction_market_seed_subsidy`
- `prediction_market_fee_sweep`
- `prediction_market_close_pnl`

### Cash movement matrix

| Event | User wallet | Market-local reserve (`cash_balance_exact`) | Global `house_bankroll` |
| --- | --- | --- | --- |
| Market seed | none | increase by `seed_subsidy_exact` | decrease by `seed_subsidy_exact` |
| Buy | debit `prediction_market_buy` | increase by exact trade cash and fee | none |
| Sell | credit `prediction_market_sell` | decrease by exact net cash outflow | none |
| Winner redemption | credit `prediction_market_redeem` | decrease by exact payout | none |
| Cancel refund | credit `prediction_market_cancel_refund` | decrease by exact refund | none |
| Fee sweep | none | decrease by swept amount | increase by swept amount |
| Final close-out | none | decrease by remaining residual cash | increase by residual close-out PnL |

## API And Contract Compatibility

### Read compatibility

`GET /markets` and `GET /markets/:marketId` should remain the top-level discovery routes, but the response model should become mechanism-aware:

- v1 returns `outcomePools` and `userPositions`
- v2 returns `outcomePrices`, `userHoldings`, `lastTradePrice`, and `stateVersion`

Do not force the same `position` shape to pretend it means both a pooled stake and a tradable share inventory.

### Write compatibility

Keep the current v1 route for legacy markets:

- `POST /markets/:marketId/positions`

Add new v2 routes:

- `POST /markets/:marketId/quotes`
- `POST /markets/:marketId/trades`
- `POST /markets/:marketId/redemptions` if redemptions are user-initiated

Admin market creation should accept `mechanism`, with `pari_mutuel` remaining the legacy default until v2 is feature-flagged on.

## V1 To V2 Migration Strategy

### Compatibility rule

V1 and v2 coexist. Existing markets are not rewritten.

### Concrete migration path

1. Extend `prediction_markets.mechanism` and add `schema_version`.
2. Add the new v2 tables in parallel.
3. Keep `prediction_positions` read-write only for `pari_mutuel`.
4. Make user and admin read APIs mechanism-aware.
5. Launch v2 market creation behind a feature flag.
6. Let all in-flight v1 markets resolve on the current code path.
7. Stop creating new v1 markets once v2 is validated.
8. Keep v1 history queryable forever; do not backfill it into synthetic trades.

### Why not migrate open v1 markets into LMSR?

Because there is no honest way to infer the missing trade history:

- a v1 stake knows only final stake amount and outcome choice,
- it does not encode execution price,
- it does not encode state version,
- it does not encode partial exits or cost basis,
- it does not encode bounded-loss subsidy assumptions.

If the business wants the "same question" under v2, create a new LMSR market instance with a new slug or round key. Do not mutate an active v1 pool into a different financial contract.

## Risk And Control Points

### Financial controls

- Per-market `seed_subsidy_exact` must be pre-funded before open.
- Per-trade max notional and per-user max position should be enforced.
- Trading fee must be explicit and queryable from trade metadata.
- Post-trade invariant `cash_balance_exact >= max_outstanding_payout_exact` must be checked in-transaction.

### Product and market-integrity controls

- Require `expected_state_version` and slippage fields on trade execution.
- Halt trading at a configurable time before oracle resolution.
- Maintain admin-only resolution with audit trail and oracle payload hash.
- Support manual market halt if oracle integrity or abuse signals fail.

### Abuse and compliance controls

- Reuse existing KYC gating from finance gameplay flows.
- Add per-market wash-trading and self-pumping alerts from trade history.
- Add rate limits and idempotency keys to all v2 trade writes.
- Feed v2 trade events into reconciliation and anomaly monitoring.

### Operational controls

- Keep one deterministic row-lock order for all buy and sell transactions.
- Reconcile holdings, outcomes, trade cash, redemptions, and wallet ledger daily.
- Treat snapshots and trades as immutable append-only audit surfaces.

## Consequences

Positive:

- V2 gets a real tradable market model instead of a stretched betting schema.
- User wallet semantics stay clear: spend cash for inventory, redeem cash for winners.
- Price history, slippage checks, and exposure controls become straightforward.
- V1 compatibility stays intact.

Trade-offs:

- More tables and more exact-decimal math than v1.
- Resolution becomes a two-step process: declare winner, then redeem holders.
- Wallet invariant and admin reporting need explicit v2 extensions.

## Recommended Next Step

If this ADR is accepted, the implementation should start with the contract and schema boundary, not the UI:

1. Extend the mechanism enum and create the new v2 persistence tables.
2. Add read models for outcomes, holdings, trades, and snapshots.
3. Implement quote and trade execution under one explicit service-level critical section.
4. Add batched redemption and reconciliation before exposing v2 writes to end users.
