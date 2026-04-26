import { desc, eq, sql } from '@reward/database/orm';

import { deposits, userWallets } from '@reward/database';
import { db, type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import {
  appendFinanceReviewMetadata,
  appendFinanceStateMetadata,
  applyDualReviewGate,
  normalizeOptionalString,
  type FinanceReviewPayload,
} from '../payment/finance-order';
import {
  insertFinanceReview,
  insertPaymentProviderEvent,
  insertPaymentSettlementEvent,
} from '../payment/finance-persistence';
import {
  applyLedgerMutation,
  type LedgerMutationSourceType,
} from '../payment/ledger-mutation';
import {
  appendDepositStateTransition,
  assertDepositLedgerMutationStatus,
  parseDepositStatus,
  type DepositStatus,
} from '../payment/state-machine';
import {
  getPaymentCapabilitySummary,
  resolvePaymentProcessingContext,
  withPaymentProcessingMetadata,
} from '../payment/service';
import { getPaymentConfig } from '../system/service';

type DepositRecord = typeof deposits.$inferSelect;
type DepositMetadata = Record<string, unknown> | null;

type LockedDepositRow = {
  id: number;
  userId: number;
  providerId: number | null;
  amount: string;
  status: DepositStatus;
  metadata: DepositMetadata;
};

type DepositRowLike = LockedDepositRow | (DepositRecord & { status: DepositStatus; metadata: DepositMetadata });

type DepositReview = FinanceReviewPayload & {
  sourceType?: LedgerMutationSourceType;
  sourceEventKey?: string | null;
};

const toDepositMetadata = (value: unknown): DepositMetadata => {
  if (typeof value === 'string') {
    try {
      return toDepositMetadata(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const normalizeDepositRecord = (row: DepositRecord | null | undefined) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    status: parseDepositStatus(row.status),
    metadata: toDepositMetadata(row.metadata),
  };
};

const normalizeDepositRow = (row: {
  id: number;
  userId: number;
  providerId: number | null;
  amount: string | number;
  status: string;
  metadata: unknown;
}): LockedDepositRow => ({
  id: row.id,
  userId: row.userId,
  providerId: row.providerId,
  amount: String(row.amount ?? '0'),
  status: parseDepositStatus(row.status),
  metadata: toDepositMetadata(row.metadata),
});

const withReviewDefaults = (
  review: DepositReview,
  fallbackNote: string
): DepositReview => ({
  ...review,
  operatorNote: normalizeOptionalString(review.operatorNote) ?? fallbackNote,
});

const readLedgerSource = (review: DepositReview) => ({
  sourceType:
    review.sourceType ??
    (review.adminId === null || review.adminId === undefined
      ? 'system'
      : 'manual_review'),
  sourceEventKey: normalizeOptionalString(review.sourceEventKey),
});

const buildDepositBusinessEventId = (
  depositId: number,
  action: 'credit_wallet' | 'reverse_wallet'
) => `deposit:${depositId}:${action}`;

const readLatestSettlementReference = (metadata: DepositMetadata) =>
  normalizeOptionalString(
    Reflect.get(
      (Reflect.get(metadata ?? {}, 'financeReviewLatest') as Record<string, unknown> | null) ??
        {},
      'settlementReference'
    ) as string | null | undefined
  );

const getDepositById = async (tx: DbTransaction, depositId: number) => {
  const [deposit] = await tx
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);

  return normalizeDepositRecord(deposit);
};

const lockDepositById = async (tx: DbTransaction, depositId: number) => {
  const result = await tx.execute(sql`
    SELECT id, user_id, provider_id, amount, status, metadata
    FROM ${deposits}
    WHERE ${deposits.id} = ${depositId}
    FOR UPDATE
  `);

  const row = readSqlRows<{
    id: number;
    user_id: number;
    provider_id: number | null;
    amount: string | number;
    status: string;
    metadata: unknown;
  }>(result)[0];

  if (!row) {
    return null;
  }

  return normalizeDepositRow({
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    amount: row.amount,
    status: row.status,
    metadata: row.metadata,
  });
};

const persistDepositMetadata = async (
  tx: DbTransaction,
  deposit: DepositRowLike,
  metadata: DepositMetadata
) => {
  const [updated] = await tx
    .update(deposits)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(deposits.id, deposit.id))
    .returning();

  return normalizeDepositRecord(updated) ?? deposit;
};

const updateDepositStatus = async (
  tx: DbTransaction,
  deposit: DepositRowLike,
  status: DepositStatus,
  metadata: DepositMetadata
) => {
  const [updated] = await tx
    .update(deposits)
    .set({ status, metadata, updatedAt: new Date() })
    .where(eq(deposits.id, deposit.id))
    .returning();

  const normalized = normalizeDepositRecord(updated);
  if (!normalized) {
    throw new Error('Deposit not found.');
  }

  return normalized;
};

const appendDepositWorkflowMetadata = (
  existing: DepositMetadata,
  params: {
    fromStatus: DepositStatus | null;
    toStatus: DepositStatus;
    actor: 'user' | 'admin' | 'provider' | 'system';
    event: string;
    note?: string | null;
    providerStatus?: string | null;
    settlementStatus?: string | null;
    failureReason?: string | null;
    ledgerEntryType?: string | null;
  }
) => {
  const stateMetadata =
    params.fromStatus === null
      ? appendDepositStateTransition(existing, {
          from: null,
          to: params.toStatus,
          actor: params.actor,
          event: params.event,
          note: params.note,
        })
      : appendDepositStateTransition(existing, {
          from: params.fromStatus,
          to: params.toStatus,
          actor: params.actor,
          event: params.event,
          note: params.note,
        });

  return appendFinanceStateMetadata(stateMetadata, {
    flow: 'deposit',
    status: params.toStatus,
    providerStatus: params.providerStatus ?? null,
    settlementStatus: params.settlementStatus ?? null,
    failureReason: params.failureReason,
    ledgerEntryType: params.ledgerEntryType ?? null,
  });
};

const transitionDepositStatus = async (
  tx: DbTransaction,
  deposit: DepositRowLike,
  toStatus: DepositStatus,
  params: {
    actor: 'user' | 'admin' | 'provider' | 'system';
    event: string;
    note?: string | null;
    metadata?: DepositMetadata;
    providerStatus?: string | null;
    settlementStatus?: string | null;
    failureReason?: string | null;
    ledgerEntryType?: string | null;
  }
) => {
  const sourceMetadata = params.metadata ?? deposit.metadata;
  const fromStatus = deposit.status;

  if (fromStatus === toStatus) {
    const current = await getDepositById(tx, deposit.id);
    return current ?? deposit;
  }

  const metadata = appendDepositWorkflowMetadata(sourceMetadata, {
    fromStatus,
    toStatus,
    actor: params.actor,
    event: params.event,
    note: params.note,
    providerStatus: params.providerStatus,
    settlementStatus: params.settlementStatus,
    failureReason: params.failureReason,
    ledgerEntryType: params.ledgerEntryType,
  });

  return updateDepositStatus(tx, deposit, toStatus, metadata);
};

const updateDepositReviewOnly = async (
  tx: DbTransaction,
  row: DepositRowLike,
  reviewState: ReturnType<typeof applyDualReviewGate>,
  action:
    | 'deposit_mark_provider_pending'
    | 'deposit_mark_provider_succeeded'
    | 'deposit_credit'
    | 'deposit_mark_provider_failed'
    | 'deposit_reverse'
) => {
  const metadata = appendFinanceReviewMetadata(reviewState.metadata, {
    action,
    reviewStage: reviewState.reviewStage,
    adminId: reviewState.effectiveReview.adminId,
    operatorNote: reviewState.effectiveReview.operatorNote,
    settlementReference: reviewState.effectiveReview.settlementReference,
    processingChannel: reviewState.effectiveReview.processingChannel,
  });

  await insertFinanceReview(tx, {
    orderType: 'deposit',
    orderId: row.id,
    action,
    reviewStage: reviewState.reviewStage,
    adminId: reviewState.effectiveReview.adminId,
    operatorNote: reviewState.effectiveReview.operatorNote,
    settlementReference: reviewState.effectiveReview.settlementReference,
    processingChannel: reviewState.effectiveReview.processingChannel,
    metadata: {
      currentRowStatus: row.status,
      providerId: row.providerId,
    },
  });

  return metadata;
};

const recordDepositReviewAttempt = async (
  tx: DbTransaction,
  row: DepositRowLike,
  reviewState: ReturnType<typeof applyDualReviewGate>,
  action:
    | 'deposit_mark_provider_pending'
    | 'deposit_mark_provider_succeeded'
    | 'deposit_credit'
    | 'deposit_mark_provider_failed'
    | 'deposit_reverse'
) => {
  const metadata = await updateDepositReviewOnly(tx, row, reviewState, action);
  if (!reviewState.confirmed) {
    await persistDepositMetadata(tx, row, metadata);
    return null;
  }

  return metadata;
};

const creditDepositRecord = async (
  tx: DbTransaction,
  deposit: DepositRowLike,
  review: DepositReview
) => {
  if (deposit.status === 'credited') {
    const current = await getDepositById(tx, deposit.id);
    return current ?? deposit;
  }
  if (deposit.status !== 'provider_succeeded') {
    return deposit;
  }

  const reviewState = applyDualReviewGate(deposit.metadata, {
    action: 'deposit_credit',
    targetStatus: 'credited',
    review: withReviewDefaults(review, 'deposit_credit'),
    bypassDualReview: true,
  });
  const reviewMetadata = await recordDepositReviewAttempt(
    tx,
    deposit,
    reviewState,
    'deposit_credit'
  );
  if (!reviewMetadata) {
    return getDepositById(tx, deposit.id);
  }

  await tx
    .insert(userWallets)
    .values({ userId: deposit.userId })
    .onConflictDoNothing();

  const walletResult = await tx.execute(sql`
    SELECT withdrawable_balance
    FROM ${userWallets}
    WHERE ${userWallets.userId} = ${deposit.userId}
    FOR UPDATE
  `);

  const wallet = readSqlRows<{ withdrawable_balance: string | number }>(walletResult)[0];
  if (!wallet) {
    throw new Error('Wallet not found.');
  }

  assertDepositLedgerMutationStatus('credited');

  const amount = toDecimal(deposit.amount ?? 0);
  const before = toDecimal(wallet.withdrawable_balance ?? 0);
  const after = before.plus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(after),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, deposit.userId));

  await insertPaymentSettlementEvent(tx, {
    orderType: 'deposit',
    orderId: deposit.id,
    userId: deposit.userId,
    eventType: 'credited',
    settlementStatus: 'credited',
    settlementReference: null,
    payload: {
      sourceSettlementReference:
        readLatestSettlementReference(deposit.metadata) ??
        reviewState.effectiveReview.settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
    },
  });

  const updated = await transitionDepositStatus(tx, deposit, 'credited', {
    actor: 'admin',
    event: 'deposit_credited',
    note: reviewState.effectiveReview.operatorNote,
    metadata: reviewMetadata,
    providerStatus: 'provider_succeeded',
    settlementStatus: 'credited',
    ledgerEntryType: 'deposit_credit',
  });

  const ledgerSource = readLedgerSource(review);
  await applyLedgerMutation(tx, {
    businessEventId: buildDepositBusinessEventId(deposit.id, 'credit_wallet'),
    orderType: 'deposit',
    orderId: deposit.id,
    userId: deposit.userId,
    providerId: deposit.providerId,
    mutationType: 'deposit_credit_wallet',
    sourceType: ledgerSource.sourceType,
    sourceEventKey: ledgerSource.sourceEventKey,
    amount: toMoneyString(amount),
    currency: null,
    entryType: 'deposit_credit',
    balanceBefore: toMoneyString(before),
    balanceAfter: toMoneyString(after),
    referenceType: 'deposit',
    referenceId: deposit.id,
    metadata: {
      status: 'credited',
      processingMode: Reflect.get(updated.metadata ?? {}, 'processingMode') ?? null,
      settlementReference:
        readLatestSettlementReference(deposit.metadata) ??
        reviewState.effectiveReview.settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
    },
  });

  return updated;
};

export async function listTopUps(userId: number, limit = 50) {
  return db
    .select()
    .from(deposits)
    .where(eq(deposits.userId, userId))
    .orderBy(desc(deposits.id))
    .limit(limit);
}

export async function listDeposits(limit = 50) {
  return db.select().from(deposits).orderBy(desc(deposits.id)).limit(limit);
}

export async function createTopUp(payload: {
  userId: number;
  amount: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const paymentConfig = await getPaymentConfig(db);
  if (!paymentConfig.depositEnabled) {
    throw new Error('Deposits are currently disabled.');
  }

  const amount = toDecimal(payload.amount);
  if (amount.lte(0)) {
    throw new Error('Amount must be greater than 0.');
  }
  if (paymentConfig.minDepositAmount.gt(0) && amount.lt(paymentConfig.minDepositAmount)) {
    throw new Error('Amount below minimum deposit.');
  }
  if (paymentConfig.maxDepositAmount.gt(0) && amount.gt(paymentConfig.maxDepositAmount)) {
    throw new Error('Amount exceeds maximum deposit.');
  }

  const processing = await resolvePaymentProcessingContext(db, 'deposit', {
    userId: payload.userId,
    amount: toMoneyString(amount),
    metadata: payload.metadata ?? null,
  });
  const capability = getPaymentCapabilitySummary();
  const metadata = appendFinanceStateMetadata(
    appendDepositWorkflowMetadata(
      withPaymentProcessingMetadata(payload.metadata, {
        flow: 'deposit',
        processingMode: processing.mode,
        manualFallbackRequired: processing.manualFallbackRequired,
        manualFallbackReason: processing.manualFallbackReason,
        paymentProviderId: processing.providerId,
        paymentOperatingMode: capability.operatingMode,
        paymentAutomationRequested: capability.automatedExecutionEnabled,
        paymentAutomationReady: capability.automatedExecutionReady,
        paymentAdapterKey: processing.adapterKey,
        paymentAdapterRegistered: processing.adapterRegistered,
      }),
      {
        fromStatus: null,
        toStatus: 'requested',
        actor: 'user',
        event: 'deposit_requested',
        providerStatus: null,
        settlementStatus: null,
      }
    ),
    {
      flow: 'deposit',
      status: 'requested',
      providerStatus: null,
      settlementStatus: null,
    }
  );

  const [created] = await db
    .insert(deposits)
    .values({
      userId: payload.userId,
      providerId: processing.providerId,
      amount: toMoneyString(amount),
      status: 'requested',
      referenceId: payload.referenceId ?? null,
      metadata,
    })
    .returning();

  return normalizeDepositRecord(created);
}

export async function markDepositProviderPending(
  depositId: number,
  review: DepositReview = {}
) {
  return db.transaction(async (tx) => {
    const deposit = await lockDepositById(tx, depositId);
    if (!deposit) return null;
    if (deposit.status === 'provider_pending') {
      return getDepositById(tx, deposit.id);
    }
    if (deposit.status !== 'requested') {
      return deposit;
    }

    const reviewState = applyDualReviewGate(deposit.metadata, {
      action: 'deposit_mark_provider_pending',
      targetStatus: 'provider_pending',
      review: withReviewDefaults(review, 'deposit_provider_pending'),
      bypassDualReview: true,
    });
    const reviewMetadata = await recordDepositReviewAttempt(
      tx,
      deposit,
      reviewState,
      'deposit_mark_provider_pending'
    );
    if (!reviewMetadata) {
      return getDepositById(tx, deposit.id);
    }

    await insertPaymentProviderEvent(tx, {
      orderType: 'deposit',
      orderId: deposit.id,
      userId: deposit.userId,
      providerId: deposit.providerId,
      eventType: 'provider_pending',
      providerStatus: 'provider_pending',
      processingChannel: reviewState.effectiveReview.processingChannel,
      payload: {
        operatorNote: reviewState.effectiveReview.operatorNote,
      },
    });

    return transitionDepositStatus(tx, deposit, 'provider_pending', {
      actor: 'admin',
      event: 'deposit_provider_pending',
      note: reviewState.effectiveReview.operatorNote,
      metadata: reviewMetadata,
      providerStatus: 'provider_pending',
      settlementStatus: null,
    });
  });
}

export async function markDepositProviderSucceeded(
  depositId: number,
  review: DepositReview = {}
) {
  return db.transaction(async (tx) => {
    const deposit = await lockDepositById(tx, depositId);
    if (!deposit) return null;
    if (deposit.status === 'provider_succeeded') {
      return getDepositById(tx, deposit.id);
    }
    if (
      deposit.status !== 'requested' &&
      deposit.status !== 'provider_pending' &&
      deposit.status !== 'provider_failed'
    ) {
      return deposit;
    }

    const reviewState = applyDualReviewGate(deposit.metadata, {
      action: 'deposit_mark_provider_succeeded',
      targetStatus: 'provider_succeeded',
      review: withReviewDefaults(review, 'deposit_provider_succeeded'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await recordDepositReviewAttempt(
      tx,
      deposit,
      reviewState,
      'deposit_mark_provider_succeeded'
    );
    if (!reviewMetadata) {
      return getDepositById(tx, deposit.id);
    }

    const settlementReference =
      reviewState.effectiveReview.settlementReference ??
      readLatestSettlementReference(reviewMetadata);

    await insertPaymentProviderEvent(tx, {
      orderType: 'deposit',
      orderId: deposit.id,
      userId: deposit.userId,
      providerId: deposit.providerId,
      eventType: 'provider_succeeded',
      providerStatus: 'provider_succeeded',
      externalReference: settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
      payload: {
        operatorNote: reviewState.effectiveReview.operatorNote,
      },
    });

    await insertPaymentSettlementEvent(tx, {
      orderType: 'deposit',
      orderId: deposit.id,
      userId: deposit.userId,
      eventType: 'settled',
      settlementStatus: 'settled',
      settlementReference,
      payload: {
        providerStatus: 'provider_succeeded',
        processingChannel: reviewState.effectiveReview.processingChannel,
      },
    });

    return transitionDepositStatus(tx, deposit, 'provider_succeeded', {
      actor: 'admin',
      event: 'deposit_provider_succeeded',
      note: reviewState.effectiveReview.operatorNote,
      metadata: reviewMetadata,
      providerStatus: 'provider_succeeded',
      settlementStatus: 'settled',
    });
  });
}

export async function creditDeposit(depositId: number, review: DepositReview = {}) {
  return db.transaction(async (tx) => {
    const deposit = await lockDepositById(tx, depositId);
    if (!deposit) return null;

    return creditDepositRecord(tx, deposit, review);
  });
}

export async function failDeposit(depositId: number, review: DepositReview = {}) {
  return db.transaction(async (tx) => {
    const deposit = await lockDepositById(tx, depositId);
    if (!deposit) return null;
    if (deposit.status === 'provider_failed') {
      return getDepositById(tx, deposit.id);
    }
    if (deposit.status !== 'requested' && deposit.status !== 'provider_pending') {
      return deposit;
    }

    const reviewState = applyDualReviewGate(deposit.metadata, {
      action: 'deposit_mark_provider_failed',
      targetStatus: 'provider_failed',
      review: withReviewDefaults(review, 'deposit_provider_failed'),
      bypassDualReview: true,
    });
    const reviewMetadata = await recordDepositReviewAttempt(
      tx,
      deposit,
      reviewState,
      'deposit_mark_provider_failed'
    );
    if (!reviewMetadata) {
      return getDepositById(tx, deposit.id);
    }

    const settlementReference =
      reviewState.effectiveReview.settlementReference ??
      readLatestSettlementReference(reviewMetadata);

    if (deposit.status === 'provider_pending') {
      await insertPaymentProviderEvent(tx, {
        orderType: 'deposit',
        orderId: deposit.id,
        userId: deposit.userId,
        providerId: deposit.providerId,
        eventType: 'provider_failed',
        providerStatus: 'provider_failed',
        externalReference: settlementReference,
        processingChannel: reviewState.effectiveReview.processingChannel,
        payload: {
          operatorNote: reviewState.effectiveReview.operatorNote,
        },
      });
    }

    await insertPaymentSettlementEvent(tx, {
      orderType: 'deposit',
      orderId: deposit.id,
      userId: deposit.userId,
      eventType: 'failed',
      settlementStatus: 'failed',
      settlementReference,
      failureReason: reviewState.effectiveReview.operatorNote,
      payload: {
        providerStatus: deposit.status === 'provider_pending' ? 'provider_failed' : null,
        processingChannel: reviewState.effectiveReview.processingChannel,
      },
    });

    return transitionDepositStatus(tx, deposit, 'provider_failed', {
      actor: 'admin',
      event: 'deposit_provider_failed',
      note: reviewState.effectiveReview.operatorNote,
      metadata: reviewMetadata,
      providerStatus: deposit.status === 'provider_pending' ? 'provider_failed' : null,
      settlementStatus: 'failed',
      failureReason: reviewState.effectiveReview.operatorNote,
    });
  });
}

export async function reverseDeposit(depositId: number, review: DepositReview = {}) {
  return db.transaction(async (tx) => {
    const deposit = await lockDepositById(tx, depositId);
    if (!deposit) return null;
    if (deposit.status === 'reversed') {
      return getDepositById(tx, deposit.id);
    }
    if (
      deposit.status !== 'provider_pending' &&
      deposit.status !== 'provider_succeeded' &&
      deposit.status !== 'credited'
    ) {
      return deposit;
    }

    const reviewState = applyDualReviewGate(deposit.metadata, {
      action: 'deposit_reverse',
      targetStatus: 'reversed',
      review: withReviewDefaults(review, 'deposit_reversed'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await recordDepositReviewAttempt(
      tx,
      deposit,
      reviewState,
      'deposit_reverse'
    );
    if (!reviewMetadata) {
      return getDepositById(tx, deposit.id);
    }

    const settlementReference =
      reviewState.effectiveReview.settlementReference ??
      readLatestSettlementReference(reviewMetadata);

    await insertPaymentSettlementEvent(tx, {
      orderType: 'deposit',
      orderId: deposit.id,
      userId: deposit.userId,
      eventType: 'reversed',
      settlementStatus: 'reversed',
      settlementReference,
      failureReason: reviewState.effectiveReview.operatorNote,
      payload: {
        processingChannel: reviewState.effectiveReview.processingChannel,
      },
    });

    if (deposit.status === 'credited') {
      await tx
        .insert(userWallets)
        .values({ userId: deposit.userId })
        .onConflictDoNothing();

      const walletResult = await tx.execute(sql`
        SELECT withdrawable_balance
        FROM ${userWallets}
        WHERE ${userWallets.userId} = ${deposit.userId}
        FOR UPDATE
      `);

      const wallet = readSqlRows<{ withdrawable_balance: string | number }>(walletResult)[0];
      if (!wallet) {
        throw new Error('Wallet not found.');
      }

      const amount = toDecimal(deposit.amount ?? 0);
      const before = toDecimal(wallet.withdrawable_balance ?? 0);
      if (before.lt(amount)) {
        throw new Error('Withdrawable balance is insufficient to reverse the deposit.');
      }

      const after = before.minus(amount);

      await tx
        .update(userWallets)
        .set({
          withdrawableBalance: toMoneyString(after),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, deposit.userId));

      assertDepositLedgerMutationStatus('reversed');

      const updated = await transitionDepositStatus(tx, deposit, 'reversed', {
        actor: 'admin',
        event: 'deposit_reversed',
        note: reviewState.effectiveReview.operatorNote,
        metadata: reviewMetadata,
        providerStatus: 'provider_succeeded',
        settlementStatus: 'reversed',
        failureReason: reviewState.effectiveReview.operatorNote,
        ledgerEntryType: 'deposit_reversed',
      });

      const ledgerSource = readLedgerSource(review);
      await applyLedgerMutation(tx, {
        businessEventId: buildDepositBusinessEventId(deposit.id, 'reverse_wallet'),
        orderType: 'deposit',
        orderId: deposit.id,
        userId: deposit.userId,
        providerId: deposit.providerId,
        mutationType: 'deposit_reverse_wallet',
        sourceType: ledgerSource.sourceType,
        sourceEventKey: ledgerSource.sourceEventKey,
        amount: toMoneyString(amount.negated()),
        currency: null,
        entryType: 'deposit_reversed',
        balanceBefore: toMoneyString(before),
        balanceAfter: toMoneyString(after),
        referenceType: 'deposit',
        referenceId: deposit.id,
        metadata: {
          status: 'reversed',
          processingMode: Reflect.get(updated.metadata ?? {}, 'processingMode') ?? null,
          settlementReference,
          processingChannel: reviewState.effectiveReview.processingChannel,
        },
      });

      return updated;
    }

    return transitionDepositStatus(tx, deposit, 'reversed', {
      actor: 'admin',
      event: 'deposit_reversed',
      note: reviewState.effectiveReview.operatorNote,
      metadata: reviewMetadata,
      providerStatus:
        deposit.status === 'provider_pending' ? 'provider_pending' : 'provider_succeeded',
      settlementStatus: 'reversed',
      failureReason: reviewState.effectiveReview.operatorNote,
    });
  });
}

export async function approveDeposit(depositId: number, review: DepositReview = {}) {
  let deposit = await markDepositProviderPending(depositId, {
    ...review,
    adminId: null,
    operatorNote:
      review.operatorNote ?? 'System approval moved the deposit to provider pending.',
  });
  if (!deposit) {
    return null;
  }

  if (deposit.status === 'requested') {
    return deposit;
  }
  if (deposit.status !== 'provider_pending') {
    return deposit;
  }

  deposit = await markDepositProviderSucceeded(depositId, {
    ...review,
    adminId: null,
    operatorNote:
      review.operatorNote ?? 'System approval marked the deposit as settled.',
    settlementReference:
      review.settlementReference ??
      `system-deposit-settle-${depositId}-${Date.now()}`,
  });
  if (!deposit || deposit.status === 'provider_pending' || deposit.status === 'provider_failed') {
    return deposit;
  }
  if (deposit.status !== 'provider_succeeded') {
    return deposit;
  }

  return creditDeposit(depositId, {
    ...review,
    adminId: null,
    operatorNote: review.operatorNote ?? 'System approval credited the deposit.',
  });
}

export const settleDeposit = markDepositProviderSucceeded;
export const markDepositProviderFailed = failDeposit;
