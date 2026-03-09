import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { topUps } from '@reward/database';

export async function listTopUps(userId: number, limit = 50) {
  return db
    .select()
    .from(topUps)
    .where(eq(topUps.userId, userId))
    .orderBy(desc(topUps.id))
    .limit(limit);
}

export async function createTopUp(payload: {
  userId: number;
  amount: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [created] = await db
    .insert(topUps)
    .values({
      userId: payload.userId,
      amount: payload.amount,
      status: 'pending',
      referenceId: payload.referenceId ?? null,
      metadata: payload.metadata ?? null,
    })
    .returning();

  return created;
}
