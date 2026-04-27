import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  QUICK_EIGHT_BOARD_SIZE,
  QUICK_EIGHT_CONFIG,
  QUICK_EIGHT_DRAW_COUNT,
  QUICK_EIGHT_MAX_STAKE,
  QUICK_EIGHT_MIN_STAKE,
  QUICK_EIGHT_PAYOUT_TABLE,
  type QuickEightRound,
  type QuickEightRoundStatus,
} from "@reward/shared-types/quick-eight";
import { quickEightRounds, userWallets, users } from "@reward/database";

import { db, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  internalInvariantError,
  notFoundError,
  persistenceError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { parseSchema } from "../../shared/validation";
import { readSqlRows } from "../../shared/sql-result";
import { ensureFairnessSeed } from "../fairness/service";
import {
  applyTransactionalGamePayoutCredit,
  applyTransactionalGameStakeDebit,
  assertTransactionalGamePoolCoverage,
  loadTransactionalGamePoolSnapshot,
} from "../shared/transactional-game-runner";

const QUICK_EIGHT_REFERENCE_TYPE = "quick_eight";

const QuickEightUserRowSchema = z.object({
  id: z.number().int().positive(),
  withdrawable_balance: z.union([z.string(), z.number()]),
  wagered_amount: z.union([z.string(), z.number()]),
});

const QuickEightUserRowsSchema = z.array(QuickEightUserRowSchema);

type QuickEightUserRow = z.infer<typeof QuickEightUserRowSchema>;

const payoutMultiplierByHits = QUICK_EIGHT_PAYOUT_TABLE.reduce<
  Map<number, ReturnType<typeof toDecimal>>
>((map, rule) => {
  map.set(Number(rule.hits), toDecimal(rule.multiplier));
  return map;
}, new Map<number, ReturnType<typeof toDecimal>>());

const minStakeAmount = toDecimal(QUICK_EIGHT_MIN_STAKE);
const maxStakeAmount = toDecimal(QUICK_EIGHT_MAX_STAKE);
const maxMultiplier = QUICK_EIGHT_PAYOUT_TABLE.reduce((max, rule) => {
  const value = toDecimal(rule.multiplier);
  return value.gt(max) ? value : max;
}, toDecimal(0));

const resolveClientNonce = (value?: string | null) => {
  const rawNonce = value ? String(value).trim() : "";
  if (!rawNonce) {
    return {
      clientNonce: randomBytes(16).toString("hex"),
      nonceSource: "server" as const,
    };
  }

  return {
    clientNonce: rawNonce,
    nonceSource: "client" as const,
  };
};

const normalizeNumbers = (numbers: number[]) =>
  [...numbers].sort((a, b) => a - b);

const parseSqlRows = <T>(
  schema: z.ZodType<T[]>,
  result: unknown,
  errorMessage: string,
) => {
  const parsed = parseSchema(schema, readSqlRows<T>(result));
  if (!parsed.isValid) {
    throw internalInvariantError(errorMessage);
  }
  return parsed.data;
};

const loadLockedQuickEightUser = async (
  tx: DbTransaction,
  userId: number,
): Promise<QuickEightUserRow | null> => {
  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();

  const result = await tx.execute(sql`
    SELECT u.id,
           w.withdrawable_balance,
           w.wagered_amount
    FROM ${users} u
    JOIN ${userWallets} w ON w.user_id = u.id
    WHERE u.id = ${userId}
    FOR UPDATE
  `);

  const rows = parseSqlRows(
    QuickEightUserRowsSchema,
    result,
    "Invalid quick eight user snapshot.",
  );
  return rows[0] ?? null;
};

const resolveStakeAmount = (value: string) => {
  let stakeAmount;
  try {
    stakeAmount = toDecimal(value);
  } catch {
    throw badRequestError("Invalid stake amount.");
  }

  if (
    !stakeAmount.isFinite() ||
    stakeAmount.lte(0) ||
    stakeAmount.decimalPlaces() > 2
  ) {
    throw badRequestError("Invalid stake amount.");
  }

  return stakeAmount;
};

export const resolveQuickEightMultiplier = (hitCount: number) =>
  payoutMultiplierByHits.get(hitCount) ?? toDecimal(0);

export const drawQuickEightNumbers = (params: {
  seed: string;
  userId: number;
  clientNonce: string;
}) => {
  const { seed, userId, clientNonce } = params;
  const availableNumbers = Array.from(
    { length: QUICK_EIGHT_BOARD_SIZE },
    (_, index) => index + 1,
  );
  const drawnNumbers: number[] = [];
  const digests: string[] = [];

  for (let step = 0; step < QUICK_EIGHT_DRAW_COUNT; step += 1) {
    const digest = createHash("sha256")
      .update(`${seed}:${userId}:${clientNonce}:${step}`)
      .digest();
    const rawDigest = digest.toString("hex");
    const nextIndex = digest.readUInt32BE(0) % availableNumbers.length;
    const [picked] = availableNumbers.splice(nextIndex, 1);
    if (picked === undefined) {
      throw internalInvariantError("Failed to draw quick eight number.");
    }
    digests.push(rawDigest);
    drawnNumbers.push(picked);
  }

  return {
    drawnNumbers: drawnNumbers.sort((a, b) => a - b),
    rngDigest: createHash("sha256").update(digests.join(":")).digest("hex"),
  };
};

export type PlayQuickEightOptions = {
  numbers: number[];
  stakeAmount: string;
  clientNonce?: string | null;
};

export async function playQuickEightInTransaction(
  tx: DbTransaction,
  userId: number,
  options: PlayQuickEightOptions,
): Promise<QuickEightRound> {
  const user = await loadLockedQuickEightUser(tx, userId);
  if (!user) {
    throw notFoundError("User not found.");
  }

  const stakeAmount = resolveStakeAmount(options.stakeAmount);
  if (stakeAmount.lt(minStakeAmount) || stakeAmount.gt(maxStakeAmount)) {
    throw conflictError("Stake amount is outside the allowed range.", {
      code: API_ERROR_CODES.STAKE_AMOUNT_OUT_OF_RANGE,
    });
  }

  const selectedNumbers = normalizeNumbers(options.numbers);
  const { clientNonce, nonceSource } = resolveClientNonce(options.clientNonce);
  const [fairnessSeed, poolSnapshot] = await Promise.all([
    ensureFairnessSeed(tx),
    loadTransactionalGamePoolSnapshot(tx),
  ]);

  const walletBefore = toDecimal(user.withdrawable_balance ?? 0);
  if (walletBefore.lt(stakeAmount)) {
    throw conflictError("Insufficient balance.", {
      code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
    });
  }

  const maximumPossiblePayout = stakeAmount.mul(maxMultiplier);
  assertTransactionalGamePoolCoverage(poolSnapshot, {
    additionalStake: stakeAmount,
    maximumPayout: maximumPossiblePayout,
  });

  const { drawnNumbers, rngDigest } = drawQuickEightNumbers({
    seed: fairnessSeed.seed,
    userId,
    clientNonce,
  });
  const drawnNumbersSet = new Set(drawnNumbers);
  const matchedNumbers = selectedNumbers.filter((number) =>
    drawnNumbersSet.has(number),
  );
  const hitCount = matchedNumbers.length;
  const multiplier = resolveQuickEightMultiplier(hitCount);
  const payoutAmount = stakeAmount.mul(multiplier);
  const status: QuickEightRoundStatus = payoutAmount.gt(0) ? "won" : "lost";

  const poolBalanceAfter = poolSnapshot.poolBalance
    .plus(stakeAmount)
    .minus(payoutAmount);
  const fairness = {
    epoch: fairnessSeed.epoch,
    epochSeconds: fairnessSeed.epochSeconds,
    commitHash: fairnessSeed.commitHash,
    clientNonce,
    nonceSource,
    rngDigest,
    algorithm:
      "sha256(seed:userId:clientNonce:step)%remaining -> 20 unique numbers sorted asc",
  };

  const [round] = await tx
    .insert(quickEightRounds)
    .values({
      userId,
      selectedNumbers,
      drawnNumbers,
      matchedNumbers,
      hitCount,
      multiplier: toMoneyString(multiplier),
      stakeAmount: toMoneyString(stakeAmount),
      payoutAmount: toMoneyString(payoutAmount),
      status,
      metadata: {
        fairness,
        poolBalanceBefore: toMoneyString(poolSnapshot.poolBalance),
        poolBalanceAfter: toMoneyString(poolBalanceAfter),
        poolMinReserve: toMoneyString(poolSnapshot.minimumReserve),
        payoutTable: QUICK_EIGHT_CONFIG.payoutTable,
      },
    })
    .returning();

  if (!round) {
    throw persistenceError("Failed to persist quick eight round.");
  }

  const wageredBefore = toDecimal(user.wagered_amount ?? 0);

  const { walletAfter: walletAfterStake } =
    await applyTransactionalGameStakeDebit({
      tx,
      userId,
      reference: {
        type: QUICK_EIGHT_REFERENCE_TYPE,
        id: round.id,
      },
      walletBefore,
      wageredBefore,
      stakeAmount,
      entryType: "quick_eight_stake",
      ledgerMetadata: {
        hitCount,
        selectedNumbers,
      },
      houseMetadata: { userId, hitCount },
    });

  if (payoutAmount.gt(0)) {
    await applyTransactionalGamePayoutCredit({
      tx,
      userId,
      reference: {
        type: QUICK_EIGHT_REFERENCE_TYPE,
        id: round.id,
      },
      walletBefore: walletAfterStake,
      payoutAmount,
      entryType: "quick_eight_payout",
      ledgerMetadata: {
        hitCount,
        matchedNumbers,
        multiplier: toMoneyString(multiplier),
      },
      houseMetadata: {
        userId,
        hitCount,
        multiplier: toMoneyString(multiplier),
      },
    });
  }

  return {
    id: round.id,
    userId,
    selectedNumbers,
    drawnNumbers,
    matchedNumbers,
    hitCount,
    multiplier: toMoneyString(multiplier),
    stakeAmount: toMoneyString(stakeAmount),
    payoutAmount: toMoneyString(payoutAmount),
    status,
    fairness,
    createdAt: round.createdAt,
  };
}

export async function playQuickEight(
  userId: number,
  options: PlayQuickEightOptions,
) {
  return db.transaction((tx) =>
    playQuickEightInTransaction(tx, userId, options),
  );
}
