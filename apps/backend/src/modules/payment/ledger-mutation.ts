import {
  ledgerEntries,
  ledgerMutationEvents,
} from '@reward/database';
import type { DbTransaction } from '../../db';

export type LedgerMutationSourceType =
  | 'order_request'
  | 'provider_callback'
  | 'reconciliation'
  | 'manual_review'
  | 'system';

export async function applyLedgerMutation(
  tx: DbTransaction,
  input: {
    businessEventId: string;
    orderType: 'deposit' | 'withdrawal';
    orderId: number;
    userId: number | null;
    providerId: number | null;
    mutationType: string;
    sourceType: LedgerMutationSourceType;
    sourceEventKey?: string | null;
    amount: string;
    currency?: string | null;
    entryType: string;
    balanceBefore: string;
    balanceAfter: string;
    referenceType: 'deposit' | 'withdrawal';
    referenceId: number;
    metadata?: Record<string, unknown> | null;
  }
) {
  const [mutationEvent] = await tx
    .insert(ledgerMutationEvents)
    .values({
      businessEventId: input.businessEventId,
      orderType: input.orderType,
      orderId: input.orderId,
      userId: input.userId,
      providerId: input.providerId,
      mutationType: input.mutationType,
      sourceType: input.sourceType,
      sourceEventKey: input.sourceEventKey ?? null,
      amount: input.amount,
      currency: input.currency ?? null,
      metadata: input.metadata ?? null,
    })
    .onConflictDoNothing()
    .returning({
      id: ledgerMutationEvents.id,
    });

  if (!mutationEvent) {
    return {
      duplicate: true as const,
      ledgerMutationEventId: null,
    };
  }

  await tx.insert(ledgerEntries).values({
    userId: input.userId,
    entryType: input.entryType,
    amount: input.amount,
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceAfter,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    ledgerMutationEventId: mutationEvent.id,
    metadata: input.metadata ?? null,
  });

  return {
    duplicate: false as const,
    ledgerMutationEventId: mutationEvent.id,
  };
}
