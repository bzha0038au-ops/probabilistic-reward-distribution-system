import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { withdrawals } from '@reward/database';

export async function listWithdrawals(userId: number, limit = 50) {
  return db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.id))
    .limit(limit);
}

export async function createWithdrawal(payload: {
  userId: number;
  amount: string;
  bankCardId?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [created] = await db
    .insert(withdrawals)
    .values({
      userId: payload.userId,
      amount: payload.amount,
      status: 'pending',
      bankCardId: payload.bankCardId ?? null,
      metadata: payload.metadata ?? null,
    })
    .returning();

  return created;
}
