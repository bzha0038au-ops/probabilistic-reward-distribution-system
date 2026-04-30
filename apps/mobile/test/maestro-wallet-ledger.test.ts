import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWalletLedgerSeedEntries,
  MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
} from "../scripts/wallet-ledger-seed";

test("buildWalletLedgerSeedEntries mirrors wallet balances with invariant-safe entries", () => {
  const entries = buildWalletLedgerSeedEntries({
    userId: 42,
    withdrawableBalance: "500.00",
    bonusBalance: "25.00",
    lockedBalance: "20.00",
    wageredAmount: "10.00",
  });

  assert.deepEqual(
    entries.map((entry) => ({
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      balanceBefore: entry.balanceBefore,
      entryType: entry.entryType,
      metadata: entry.metadata,
      referenceType: entry.referenceType,
      userId: entry.userId,
    })),
    [
      {
        amount: "530.00",
        balanceAfter: "530.00",
        balanceBefore: "0.00",
        entryType: "deposit_credit",
        metadata: {
          reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
          seedBalanceType: "withdrawable",
        },
        referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        userId: 42,
      },
      {
        amount: "-20.00",
        balanceAfter: "510.00",
        balanceBefore: "530.00",
        entryType: "withdraw_request",
        metadata: {
          reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
          seedBalanceType: "locked",
        },
        referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        userId: 42,
      },
      {
        amount: "-10.00",
        balanceAfter: "500.00",
        balanceBefore: "510.00",
        entryType: "draw_cost",
        metadata: {
          reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
          seedBalanceType: "wagered",
        },
        referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        userId: 42,
      },
      {
        amount: "25.00",
        balanceAfter: "25.00",
        balanceBefore: "0.00",
        entryType: "gamification_reward",
        metadata: {
          reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
          seedBalanceType: "bonus",
        },
        referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        userId: 42,
      },
    ],
  );
});

test("buildWalletLedgerSeedEntries skips zero-value balances", () => {
  const entries = buildWalletLedgerSeedEntries({
    userId: 7,
    withdrawableBalance: "0.00",
    bonusBalance: "0.00",
    lockedBalance: "0.00",
    wageredAmount: "0.00",
  });

  assert.equal(entries.length, 0);
});
