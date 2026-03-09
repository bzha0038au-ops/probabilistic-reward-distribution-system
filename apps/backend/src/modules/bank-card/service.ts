import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { bankCards } from '@reward/database';

export async function listBankCards(userId: number) {
  return db
    .select()
    .from(bankCards)
    .where(eq(bankCards.userId, userId))
    .orderBy(desc(bankCards.id));
}

export async function createBankCard(payload: {
  userId: number;
  cardholderName: string;
  bankName?: string | null;
  brand?: string | null;
  last4?: string | null;
  isDefault?: boolean;
}) {
  const [created] = await db
    .insert(bankCards)
    .values({
      userId: payload.userId,
      cardholderName: payload.cardholderName,
      bankName: payload.bankName ?? null,
      brand: payload.brand ?? null,
      last4: payload.last4 ?? null,
      isDefault: Boolean(payload.isDefault),
    })
    .returning();

  return created;
}

export async function setDefaultBankCard(userId: number, bankCardId: number) {
  await db
    .update(bankCards)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(bankCards.userId, userId));

  const [updated] = await db
    .update(bankCards)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(and(eq(bankCards.id, bankCardId), eq(bankCards.userId, userId)))
    .returning();

  return updated;
}
