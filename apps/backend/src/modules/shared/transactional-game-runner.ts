import { ledgerEntries, userWallets } from "@reward/database";
import { eq } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import type { DbTransaction } from "../../db";
import { conflictError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { applyPrizePoolDelta, getPrizePoolBalance } from "../house/service";
import { getPoolSystemConfig } from "../system/service";

type MoneyAmount = ReturnType<typeof toDecimal>;

type TransactionalGameReference = {
  type: string;
  id: number | null;
};

export type TransactionalGamePoolSnapshot = {
  poolBalance: MoneyAmount;
  minimumReserve: MoneyAmount;
};

const toPoolReferenceParams = (reference: TransactionalGameReference) => ({
  referenceType: reference.type,
  referenceId: reference.id,
});

export const loadTransactionalGamePoolSnapshot = async (
  tx: DbTransaction,
): Promise<TransactionalGamePoolSnapshot> => {
  const [poolSystem, poolBalance] = await Promise.all([
    getPoolSystemConfig(tx),
    getPrizePoolBalance(tx, true),
  ]);

  return {
    poolBalance,
    minimumReserve: toDecimal(poolSystem.minReserve ?? 0),
  };
};

export const assertTransactionalGamePoolCoverage = (
  snapshot: TransactionalGamePoolSnapshot,
  params: {
    additionalStake?: MoneyAmount;
    maximumPayout: MoneyAmount;
  },
) => {
  const availablePoolAfterStake = snapshot.poolBalance
    .plus(params.additionalStake ?? 0)
    .minus(snapshot.minimumReserve);

  if (availablePoolAfterStake.lt(params.maximumPayout)) {
    throw conflictError("Prize pool reserve is too low for this stake.", {
      code: API_ERROR_CODES.PRIZE_POOL_RESERVE_TOO_LOW_FOR_STAKE,
    });
  }

  return {
    availablePoolAfterStake,
  };
};

export const applyTransactionalGameStakeDebit = async (params: {
  tx: DbTransaction;
  userId: number;
  reference: TransactionalGameReference;
  walletBefore: MoneyAmount;
  wageredBefore: MoneyAmount;
  stakeAmount: MoneyAmount;
  entryType: string;
  ledgerMetadata?: Record<string, unknown> | null;
  houseMetadata?: Record<string, unknown> | null;
}) => {
  const {
    tx,
    userId,
    reference,
    walletBefore,
    wageredBefore,
    stakeAmount,
    entryType,
    ledgerMetadata,
    houseMetadata,
  } = params;
  const walletAfter = walletBefore.minus(stakeAmount);
  const wageredAfter = wageredBefore.plus(stakeAmount);

  if (walletAfter.lt(0)) {
    throw conflictError("Insufficient balance.", {
      code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
    });
  }

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(walletAfter),
      wageredAmount: toMoneyString(wageredAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, userId));

  await tx.insert(ledgerEntries).values({
    userId,
    entryType,
    amount: toMoneyString(stakeAmount.negated()),
    balanceBefore: toMoneyString(walletBefore),
    balanceAfter: toMoneyString(walletAfter),
    referenceType: reference.type,
    referenceId: reference.id,
    metadata: ledgerMetadata ?? null,
  });

  await applyPrizePoolDelta(tx, stakeAmount, {
    entryType,
    ...toPoolReferenceParams(reference),
    metadata: houseMetadata ?? null,
  });

  return { walletAfter, wageredAfter };
};

export const applyTransactionalGamePayoutCredit = async (params: {
  tx: DbTransaction;
  userId: number;
  reference: TransactionalGameReference;
  walletBefore: MoneyAmount;
  payoutAmount: MoneyAmount;
  entryType: string;
  ledgerMetadata?: Record<string, unknown> | null;
  houseMetadata?: Record<string, unknown> | null;
}) => {
  const {
    tx,
    userId,
    reference,
    walletBefore,
    payoutAmount,
    entryType,
    ledgerMetadata,
    houseMetadata,
  } = params;

  if (payoutAmount.lte(0)) {
    return walletBefore;
  }

  const walletAfter = walletBefore.plus(payoutAmount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(walletAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, userId));

  await tx.insert(ledgerEntries).values({
    userId,
    entryType,
    amount: toMoneyString(payoutAmount),
    balanceBefore: toMoneyString(walletBefore),
    balanceAfter: toMoneyString(walletAfter),
    referenceType: reference.type,
    referenceId: reference.id,
    metadata: ledgerMetadata ?? null,
  });

  await applyPrizePoolDelta(tx, payoutAmount.negated(), {
    entryType,
    ...toPoolReferenceParams(reference),
    metadata: houseMetadata ?? null,
  });

  return walletAfter;
};
