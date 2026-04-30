import { ledgerEntries } from "../../database/src/index";
import { eq } from "../../database/src/orm";

import type { DbClient } from "../../backend/src/db";
import { toDecimal, toMoneyString } from "../../backend/src/shared/money";

export const MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE = "mobile_maestro_seed";

export type WalletLedgerSeedParams = {
  userId: number;
  withdrawableBalance: string;
  bonusBalance: string;
  lockedBalance: string;
  wageredAmount: string;
};

type WalletLedgerEntryInsert = {
  userId: number;
  entryType:
    | "deposit_credit"
    | "withdraw_request"
    | "draw_cost"
    | "gamification_reward";
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string;
  metadata: {
    reason: string;
    seedBalanceType: "withdrawable" | "locked" | "wagered" | "bonus";
  };
};

export const buildWalletLedgerSeedEntries = (params: WalletLedgerSeedParams) => {
  const withdrawableBalance = toDecimal(params.withdrawableBalance);
  const bonusBalance = toDecimal(params.bonusBalance);
  const lockedBalance = toDecimal(params.lockedBalance);
  const wageredAmount = toDecimal(params.wageredAmount);

  if (
    withdrawableBalance.lt(0) ||
    bonusBalance.lt(0) ||
    lockedBalance.lt(0) ||
    wageredAmount.lt(0)
  ) {
    throw new Error("Wallet ledger seed only supports non-negative balances.");
  }

  const entries: WalletLedgerEntryInsert[] = [];
  let withdrawableCursor = toDecimal(0);
  const fundingAmount = withdrawableBalance.plus(lockedBalance).plus(wageredAmount);

  if (fundingAmount.gt(0)) {
    entries.push({
      userId: params.userId,
      entryType: "deposit_credit",
      amount: toMoneyString(fundingAmount),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.plus(fundingAmount)),
      referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
      metadata: {
        reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        seedBalanceType: "withdrawable",
      },
    });
    withdrawableCursor = withdrawableCursor.plus(fundingAmount);
  }

  if (lockedBalance.gt(0)) {
    entries.push({
      userId: params.userId,
      entryType: "withdraw_request",
      amount: toMoneyString(lockedBalance.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(lockedBalance)),
      referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
      metadata: {
        reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        seedBalanceType: "locked",
      },
    });
    withdrawableCursor = withdrawableCursor.minus(lockedBalance);
  }

  if (wageredAmount.gt(0)) {
    entries.push({
      userId: params.userId,
      entryType: "draw_cost",
      amount: toMoneyString(wageredAmount.negated()),
      balanceBefore: toMoneyString(withdrawableCursor),
      balanceAfter: toMoneyString(withdrawableCursor.minus(wageredAmount)),
      referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
      metadata: {
        reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        seedBalanceType: "wagered",
      },
    });
    withdrawableCursor = withdrawableCursor.minus(wageredAmount);
  }

  if (bonusBalance.gt(0)) {
    entries.push({
      userId: params.userId,
      entryType: "gamification_reward",
      amount: toMoneyString(bonusBalance),
      balanceBefore: "0.00",
      balanceAfter: toMoneyString(bonusBalance),
      referenceType: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
      metadata: {
        reason: MOBILE_MAESTRO_LEDGER_REFERENCE_TYPE,
        seedBalanceType: "bonus",
      },
    });
  }

  return entries;
};

export async function reseedWalletLedger(
  database: DbClient,
  params: WalletLedgerSeedParams,
) {
  await database.delete(ledgerEntries).where(eq(ledgerEntries.userId, params.userId));

  const entries = buildWalletLedgerSeedEntries(params);
  if (entries.length === 0) {
    return;
  }

  await database.insert(ledgerEntries).values(entries);
}
