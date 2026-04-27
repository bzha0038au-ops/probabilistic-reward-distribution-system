import { and, desc, eq, isNotNull, isNull, lte, ne, sql } from '@reward/database/orm';

import { db } from '../../db';
import { drawRecords, ledgerEntries, prizes } from '@reward/database';
import { getPoolBalance } from '../system/service';
import { toMoneyString } from '../../shared/money';
import { invalidateProbabilityPool } from '../draw/pool-cache';

export async function listPrizes() {
  return db
    .select()
    .from(prizes)
    .where(isNull(prizes.deletedAt))
    .orderBy(desc(prizes.id));
}

export async function createPrize(payload: {
  name: string;
  stock: number;
  weight: number;
  poolThreshold: string;
  userPoolThreshold: string;
  rewardAmount: string;
  payoutBudget: string;
  payoutPeriodDays: number;
  isActive: boolean;
}) {
  const [created] = await db
    .insert(prizes)
    .values(payload)
    .returning();

  await invalidateProbabilityPool();
  return created;
}

export async function updatePrize(
  id: number,
  payload: Partial<{
    name: string;
    stock: number;
    weight: number;
    poolThreshold: string;
    userPoolThreshold: string;
    rewardAmount: string;
    payoutBudget: string;
    payoutPeriodDays: number;
    isActive: boolean;
  }>
) {
  const [updated] = await db
    .update(prizes)
    .set({
      ...payload,
      updatedAt: new Date(),
    })
    .where(and(eq(prizes.id, id), isNull(prizes.deletedAt)))
    .returning();

  if (updated) {
    await invalidateProbabilityPool();
  }
  return updated;
}

export async function togglePrize(id: number) {
  const [current] = await db
    .select({ isActive: prizes.isActive })
    .from(prizes)
    .where(and(eq(prizes.id, id), isNull(prizes.deletedAt)))
    .limit(1);

  if (!current) return null;

  const [updated] = await db
    .update(prizes)
    .set({ isActive: !current.isActive, updatedAt: new Date() })
    .where(and(eq(prizes.id, id), isNull(prizes.deletedAt)))
    .returning();

  if (updated) {
    await invalidateProbabilityPool();
  }
  return updated;
}

export async function softDeletePrize(id: number) {
  const [deleted] = await db
    .update(prizes)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(and(eq(prizes.id, id), isNull(prizes.deletedAt)))
    .returning();

  if (deleted) {
    await invalidateProbabilityPool();
  }
  return deleted;
}

export async function getAnalyticsSummary() {
  const [
    [{ total = 0 }],
    [{ won = 0 }],
    [{ miss = 0 }],
    distribution,
    topSpenders,
    poolBalance,
  ] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(drawRecords),
    db
      .select({ won: sql<number>`count(*)` })
      .from(drawRecords)
      .where(eq(drawRecords.status, 'won')),
    db
      .select({ miss: sql<number>`count(*)` })
      .from(drawRecords)
      .where(and(isNotNull(drawRecords.status), ne(drawRecords.status, 'won'))),
    db
      .select({
        prizeId: drawRecords.prizeId,
        total: sql<number>`count(*)`,
      })
      .from(drawRecords)
      .where(isNotNull(drawRecords.prizeId))
      .groupBy(drawRecords.prizeId)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        userId: ledgerEntries.userId,
        spent: sql<number>`abs(sum(${ledgerEntries.amount}))`,
      })
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.entryType, 'draw_cost'), isNotNull(ledgerEntries.userId))
      )
      .groupBy(ledgerEntries.userId)
      .orderBy(desc(sql`abs(sum(${ledgerEntries.amount}))`))
      .limit(20),
    getPoolBalance(db),
  ]);

  return {
    totalDrawCount: Number(total ?? 0),
    wonCount: Number(won ?? 0),
    missCount: Number(miss ?? 0),
    winRate: total ? Number(won) / Number(total) : 0,
    distribution,
    systemPoolBalance: toMoneyString(poolBalance),
    topSpenders,
  };
}

export async function getPublicStats(options: {
  cutoff: Date;
  includePoolBalance: boolean;
}) {
  const [
    [{ total = 0 }],
    [{ won = 0 }],
    [{ miss = 0 }],
    distribution,
    poolBalance,
  ] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(drawRecords)
      .where(lte(drawRecords.createdAt, options.cutoff)),
    db
      .select({ won: sql<number>`count(*)` })
      .from(drawRecords)
      .where(
        and(eq(drawRecords.status, 'won'), lte(drawRecords.createdAt, options.cutoff))
      ),
    db
      .select({ miss: sql<number>`count(*)` })
      .from(drawRecords)
      .where(
        and(
          isNotNull(drawRecords.status),
          ne(drawRecords.status, 'won'),
          lte(drawRecords.createdAt, options.cutoff)
        )
      ),
    db
      .select({
        prizeId: drawRecords.prizeId,
        total: sql<number>`count(*)`,
      })
      .from(drawRecords)
      .where(
        and(isNotNull(drawRecords.prizeId), lte(drawRecords.createdAt, options.cutoff))
      )
      .groupBy(drawRecords.prizeId)
      .orderBy(desc(sql`count(*)`)),
    options.includePoolBalance ? getPoolBalance(db) : Promise.resolve(null),
  ]);

  return {
    totalDrawCount: Number(total ?? 0),
    wonCount: Number(won ?? 0),
    missCount: Number(miss ?? 0),
    winRate: total ? Number(won) / Number(total) : 0,
    distribution,
    systemPoolBalance: poolBalance ? toMoneyString(poolBalance) : null,
  };
}
