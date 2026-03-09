import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { db } from '../../db';
import { drawRecords, prizes, transactions } from '@reward/database';
import { getPoolBalance } from '../system/service';

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
  rewardAmount: string;
  isActive: boolean;
}) {
  const [created] = await db
    .insert(prizes)
    .values(payload)
    .returning();

  return created;
}

export async function updatePrize(
  id: number,
  payload: Partial<{
    name: string;
    stock: number;
    weight: number;
    poolThreshold: string;
    rewardAmount: string;
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

  return updated;
}

export async function softDeletePrize(id: number) {
  const [deleted] = await db
    .update(prizes)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(and(eq(prizes.id, id), isNull(prizes.deletedAt)))
    .returning();

  return deleted;
}

export async function getAnalyticsSummary() {
  const [{ total = 0 }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(drawRecords);

  const [{ won = 0 }] = await db
    .select({ won: sql<number>`count(*)` })
    .from(drawRecords)
    .where(eq(drawRecords.status, 'won'));

  const [{ miss = 0 }] = await db
    .select({ miss: sql<number>`count(*)` })
    .from(drawRecords)
    .where(and(isNotNull(drawRecords.status), ne(drawRecords.status, 'won')));

  const distribution = await db
    .select({
      prizeId: drawRecords.prizeId,
      total: sql<number>`count(*)`,
    })
    .from(drawRecords)
    .where(isNotNull(drawRecords.prizeId))
    .groupBy(drawRecords.prizeId)
    .orderBy(desc(sql`count(*)`));

  const topSpenders = await db
    .select({
      userId: transactions.userId,
      spent: sql<number>`abs(sum(${transactions.amount}))`,
    })
    .from(transactions)
    .where(eq(transactions.type, 'debit_draw'))
    .groupBy(transactions.userId)
    .orderBy(desc(sql`abs(sum(${transactions.amount}))`))
    .limit(20);

  return {
    totalDrawCount: Number(total ?? 0),
    wonCount: Number(won ?? 0),
    missCount: Number(miss ?? 0),
    winRate: total ? Number(won) / Number(total) : 0,
    distribution,
    systemPoolBalance: await getPoolBalance(db, 0),
    topSpenders,
  };
}
