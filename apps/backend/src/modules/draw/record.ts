import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { drawRecords, users } from '@reward/database';
import { type DbTransaction } from '../../db';
import { applyPrizePoolDelta } from '../house/service';
import { toMoneyString } from '../../shared/money';
import { buildDrawRecordMetadata } from './metadata';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  DrawStatus,
  DrawUserRow,
  FairnessSeed,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

export const applyHouseDrawEntries = async (params: {
  tx: DbTransaction;
  userId: number;
  drawCost: Decimal;
  rewardAmount: Decimal;
  prizeId: number | null;
}) => {
  const { tx, userId, drawCost, rewardAmount, prizeId } = params;

  await applyPrizePoolDelta(tx, drawCost, {
    entryType: 'draw_cost',
    referenceType: 'draw',
    metadata: { userId },
  });

  if (rewardAmount.gt(0)) {
    await applyPrizePoolDelta(tx, rewardAmount.negated(), {
      entryType: 'draw_reward',
      referenceType: 'prize',
      referenceId: prizeId ?? null,
      metadata: { userId },
    });
  }
};

export const updateUserDrawState = async (params: {
  tx: DbTransaction;
  user: DrawUserRow;
  status: DrawStatus;
  pityStreakBefore: number;
  now: Date;
}) => {
  const { tx, user, status, pityStreakBefore, now } = params;
  const didWin = status === 'won';
  const pityStreakAfter = didWin ? 0 : pityStreakBefore + 1;
  const userUpdates: Record<string, unknown> = {
    pityStreak: pityStreakAfter,
    lastDrawAt: now,
    updatedAt: now,
  };
  if (didWin) {
    userUpdates.lastWinAt = now;
  }

  await tx.update(users).set(userUpdates).where(eq(users.id, user.id));
  return pityStreakAfter;
};

export const createDrawRecord = async (params: {
  tx: DbTransaction;
  userId: number;
  drawState: DebitedDrawState;
  selectionState: PreparedDrawSelection;
  outcome: ResolvedDrawOutcome;
  fairnessSeed: FairnessSeed;
  clientNonce: string;
  nonceSource: 'client' | 'server';
  probabilityControl: DrawConfigBundle['probabilityControl'];
  payoutControl: DrawConfigBundle['payoutControl'];
  poolSystem: DrawConfigBundle['poolSystem'];
  pityStreakAfter: number;
}) => {
  const {
    tx,
    userId,
    drawState,
    selectionState,
    outcome,
    fairnessSeed,
    clientNonce,
    nonceSource,
    probabilityControl,
    payoutControl,
    poolSystem,
    pityStreakAfter,
  } = params;
  const { metadata, updatedPoolBalance } = buildDrawRecordMetadata({
    drawState,
    selectionState,
    outcome,
    fairnessSeed,
    clientNonce,
    nonceSource,
    probabilityControl,
    payoutControl,
    poolSystem,
    pityStreakAfter,
  });

  const [record] = await tx
    .insert(drawRecords)
    .values({
      userId,
      prizeId: outcome.prizeId,
      drawCost: toMoneyString(drawState.drawCost),
      rewardAmount: toMoneyString(outcome.rewardAmount),
      status: outcome.status,
      metadata,
    })
    .returning();

  return {
    record,
    updatedPoolBalance,
  };
};
