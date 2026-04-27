import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { fiatPayoutMethods, payoutMethods } from '@reward/database';
import { persistenceError } from '../../shared/errors';

type PayoutMethodJoinRow =
  | {
      payoutMethod: typeof payoutMethods.$inferSelect;
      fiatPayoutMethod: typeof fiatPayoutMethods.$inferSelect | null;
    }
  | {
      payout_methods: typeof payoutMethods.$inferSelect;
      fiat_payout_methods: typeof fiatPayoutMethods.$inferSelect | null;
    };

const mapPayoutMethodToBankCard = (row: PayoutMethodJoinRow) => {
  const payoutMethod =
    'payoutMethod' in row ? row.payoutMethod : row.payout_methods;
  const fiatPayoutMethod =
    'fiatPayoutMethod' in row ? row.fiatPayoutMethod : row.fiat_payout_methods;

  return {
    id: payoutMethod.id,
    userId: payoutMethod.userId,
    payoutMethodId: payoutMethod.id,
    methodType: payoutMethod.methodType,
    channelType: payoutMethod.channelType,
    assetType: payoutMethod.assetType,
    assetCode: payoutMethod.assetCode,
    network: payoutMethod.network,
    cardholderName:
      fiatPayoutMethod?.accountName ??
      payoutMethod.displayName ??
      'Bank account',
    bankName: fiatPayoutMethod?.bankName ?? null,
    brand: fiatPayoutMethod?.brand ?? null,
    last4: fiatPayoutMethod?.accountLast4 ?? null,
    isDefault: payoutMethod.isDefault,
    status: payoutMethod.status,
    metadata: payoutMethod.metadata,
    createdAt: payoutMethod.createdAt,
    updatedAt: payoutMethod.updatedAt,
  };
};

export async function listBankCards(userId: number) {
  const rows = await db
    .select({
      payoutMethod: payoutMethods,
      fiatPayoutMethod: fiatPayoutMethods,
    })
    .from(payoutMethods)
    .leftJoin(
      fiatPayoutMethods,
      eq(fiatPayoutMethods.payoutMethodId, payoutMethods.id)
    )
    .where(
      and(
        eq(payoutMethods.userId, userId),
        eq(payoutMethods.methodType, 'bank_account')
      )
    )
    .orderBy(desc(payoutMethods.id));

  return rows.map(mapPayoutMethodToBankCard);
}

export async function createBankCard(payload: {
  userId: number;
  cardholderName: string;
  bankName?: string | null;
  brand?: string | null;
  last4?: string | null;
  isDefault?: boolean;
}) {
  return db.transaction(async (tx) => {
    const shouldBeDefault =
      Boolean(payload.isDefault) ||
      (
        await tx
          .select({ id: payoutMethods.id })
          .from(payoutMethods)
          .where(
            and(
              eq(payoutMethods.userId, payload.userId),
              eq(payoutMethods.methodType, 'bank_account')
            )
          )
          .limit(1)
      ).length === 0;

    if (shouldBeDefault) {
      await tx
        .update(payoutMethods)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(payoutMethods.userId, payload.userId));
    }

    const [method] = await tx
      .insert(payoutMethods)
      .values({
        userId: payload.userId,
        methodType: 'bank_account',
        channelType: 'fiat',
        assetType: 'fiat',
        displayName: payload.cardholderName,
        isDefault: shouldBeDefault,
        status: 'active',
      })
      .returning();

    if (!method) {
      throw persistenceError('Failed to create payout method.');
    }

    await tx.insert(fiatPayoutMethods).values({
      payoutMethodId: method.id,
      accountName: payload.cardholderName,
      bankName: payload.bankName ?? null,
      brand: payload.brand ?? null,
      accountLast4: payload.last4 ?? null,
      accountNoMasked: payload.last4 ? `****${payload.last4}` : null,
    });

    return {
      id: method.id,
      userId: method.userId,
      payoutMethodId: method.id,
      methodType: method.methodType,
      channelType: method.channelType,
      assetType: method.assetType,
      assetCode: method.assetCode,
      network: method.network,
      cardholderName: payload.cardholderName,
      bankName: payload.bankName ?? null,
      brand: payload.brand ?? null,
      last4: payload.last4 ?? null,
      isDefault: method.isDefault,
      status: method.status,
      metadata: method.metadata,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    };
  });
}

export async function setDefaultBankCard(userId: number, bankCardId: number) {
  return db.transaction(async (tx) => {
    await tx
      .update(payoutMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(payoutMethods.userId, userId));

    const [updatedMethod] = await tx
      .update(payoutMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(payoutMethods.id, bankCardId),
          eq(payoutMethods.userId, userId),
          eq(payoutMethods.methodType, 'bank_account')
        )
      )
      .returning();

    if (!updatedMethod) {
      return null;
    }

    const [detail] = await tx
      .select()
      .from(fiatPayoutMethods)
      .where(eq(fiatPayoutMethods.payoutMethodId, updatedMethod.id))
      .limit(1);

    return mapPayoutMethodToBankCard({
      payoutMethod: updatedMethod,
      fiatPayoutMethod: detail ?? null,
    });
  });
}
