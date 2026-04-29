import { eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import {
  userWallets,
  withdrawals,
} from '@reward/database';
import { db, type DbTransaction } from '../../db';
import {
  conflictError,
  persistenceError,
  unprocessableEntityError,
} from '../../shared/errors';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { sendWithdrawalStatusChangedNotification } from '../notification/service';
import {
  appendFinanceReviewMetadata,
  appendFinanceStateMetadata,
  applyDualReviewGate,
  normalizeOptionalString,
} from '../payment/finance-order';
import {
  insertFinanceReview,
  insertPaymentProviderEvent,
  insertPaymentSettlementEvent,
} from '../payment/finance-persistence';
import { applyLedgerMutation } from '../payment/ledger-mutation';
import { preparePaymentOutboundRequest } from '../payment/outbound';
import { assertWithdrawalLedgerMutationStatus } from '../payment/state-machine';
import { assertWalletLedgerInvariant } from '../wallet/invariant-service';
import {
  buildWithdrawalBusinessEventId,
  isManualChannel,
  mergeWithdrawalControl,
  readApprovalsCollected,
  readApprovalsRequired,
  readLatestSettlementReference,
  readLedgerSource,
  readManualChannelRequired,
  selectLockedWithdrawal,
  serializeWithdrawal,
  withReviewDefaults,
  type WithdrawalReviewPayload,
  type WithdrawalRow,
} from './workflow';

type SerializedWithdrawalLike = ReturnType<typeof serializeWithdrawal>;

const readSerializedWithdrawalUserId = (withdrawal: SerializedWithdrawalLike) => {
  if (!withdrawal) {
    return null;
  }

  const serialized = withdrawal as Record<string, unknown>;
  return typeof serialized.userId === 'number'
    ? serialized.userId
    : typeof serialized.user_id === 'number'
      ? serialized.user_id
      : null;
};

const queueWithdrawalStatusNotification = async (
  previousStatus: string,
  withdrawal: SerializedWithdrawalLike,
) => {
  if (!withdrawal || withdrawal.status === previousStatus) {
    return;
  }

  const userId = readSerializedWithdrawalUserId(withdrawal);
  if (!userId) {
    return;
  }

  try {
    await sendWithdrawalStatusChangedNotification({
      userId,
      withdrawalId: withdrawal.id,
      amount: String(withdrawal.amount),
      status: withdrawal.status,
    });
  } catch (error) {
    logger.warning("failed to dispatch withdrawal status notification", {
      err: error,
      withdrawalId: withdrawal.id,
      userId,
      status: withdrawal.status,
    });
  }
};

const updateWithdrawalReviewOnly = async (
  tx: DbTransaction,
  row: WithdrawalRow,
  reviewState: ReturnType<typeof applyDualReviewGate>,
  action:
    | 'withdrawal_approve'
    | 'withdrawal_mark_provider_submitted'
    | 'withdrawal_mark_provider_processing'
    | 'withdrawal_mark_provider_failed'
    | 'withdrawal_pay'
    | 'withdrawal_reject'
    | 'withdrawal_reverse',
) => {
  const metadata = appendFinanceReviewMetadata(reviewState.metadata, {
    action,
    reviewStage: reviewState.reviewStage,
    adminId: reviewState.effectiveReview.adminId,
    operatorNote: reviewState.effectiveReview.operatorNote ?? '',
    settlementReference: reviewState.effectiveReview.settlementReference,
    processingChannel: reviewState.effectiveReview.processingChannel,
  });

  await insertFinanceReview(tx, {
    orderType: 'withdrawal',
    orderId: row.id,
    action,
    reviewStage: reviewState.reviewStage,
    adminId: reviewState.effectiveReview.adminId,
    operatorNote: reviewState.effectiveReview.operatorNote ?? '',
    settlementReference: reviewState.effectiveReview.settlementReference,
    processingChannel: reviewState.effectiveReview.processingChannel,
    metadata: {
      currentRowStatus: row.status,
      approvalsRequired: readApprovalsRequired(row.metadata),
    },
  });

  return metadata;
};

const persistWithdrawalMetadata = async (
  tx: DbTransaction,
  row: WithdrawalRow,
  metadata: Record<string, unknown> | null,
) => {
  const [updated] = await tx
    .update(withdrawals)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(withdrawals.id, row.id))
    .returning();

  return serializeWithdrawal(updated ?? row);
};

const refundWithdrawal = async (
  tx: DbTransaction,
  row: WithdrawalRow,
  payload: {
    review: WithdrawalReviewPayload;
    reviewState: ReturnType<typeof applyDualReviewGate>;
    reviewMetadata: Record<string, unknown>;
    nextStatus: 'rejected' | 'reversed';
  },
) => {
  const { review, reviewState, reviewMetadata, nextStatus } = payload;

  await tx
    .insert(userWallets)
    .values({ userId: row.user_id })
    .onConflictDoNothing();

  const walletResult = await tx.execute(sql`
    SELECT withdrawable_balance, locked_balance
    FROM ${userWallets}
    WHERE ${userWallets.userId} = ${row.user_id}
    FOR UPDATE
  `);

  const wallet = readSqlRows<{
    withdrawable_balance: string | number;
    locked_balance: string | number;
  }>(walletResult)[0];
  if (!wallet) {
    throw persistenceError('Wallet not found.');
  }

  const amount = toDecimal(row.amount ?? 0);
  const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
  const lockedBefore = toDecimal(wallet.locked_balance ?? 0);
  const withdrawableAfter = withdrawableBefore.plus(amount);
  const lockedAfter = Decimal.max(lockedBefore.minus(amount), 0);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, row.user_id));

  await insertPaymentSettlementEvent(tx, {
    orderType: 'withdrawal',
    orderId: row.id,
    userId: row.user_id,
    eventType: nextStatus,
    settlementStatus: nextStatus,
    settlementReference: reviewState.effectiveReview.settlementReference,
    failureReason: reviewState.effectiveReview.operatorNote,
    payload: {
      processingChannel: reviewState.effectiveReview.processingChannel,
    },
  });

  const ledgerEntryType =
    nextStatus === 'reversed'
      ? 'withdraw_reversed_refund'
      : 'withdraw_rejected_refund';
  const metadata = appendFinanceStateMetadata(
    mergeWithdrawalControl(reviewMetadata, {
      approvalState: nextStatus,
    }),
    {
      flow: 'withdrawal',
      status: nextStatus,
      settlementStatus: nextStatus,
      failureReason: reviewState.effectiveReview.operatorNote,
      ledgerEntryType,
    },
  );

  const [updated] = await tx
    .update(withdrawals)
    .set({ status: nextStatus, metadata, updatedAt: new Date() })
    .where(eq(withdrawals.id, row.id))
    .returning();

  assertWithdrawalLedgerMutationStatus(nextStatus);

  const ledgerSource = readLedgerSource(review);
  await applyLedgerMutation(tx, {
    businessEventId: buildWithdrawalBusinessEventId(
      row.id,
      'release_locked_funds',
    ),
    orderType: 'withdrawal',
    orderId: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    mutationType: 'withdraw_release_locked_funds',
    sourceType: ledgerSource.sourceType,
    sourceEventKey: ledgerSource.sourceEventKey,
    amount: toMoneyString(amount),
    currency: row.asset_code,
    entryType: ledgerEntryType,
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: 'withdrawal',
    referenceId: row.id,
    metadata: {
      status: nextStatus,
      processingMode: Reflect.get(metadata, 'processingMode') ?? null,
      settlementReference: reviewState.effectiveReview.settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
    },
  });

  return serializeWithdrawal(updated ?? row);
};

const markWithdrawalProviderFailure = async (
  tx: DbTransaction,
  row: WithdrawalRow,
  reviewState: ReturnType<typeof applyDualReviewGate>,
  reviewMetadata: Record<string, unknown>,
) => {
  await insertPaymentProviderEvent(tx, {
    orderType: 'withdrawal',
    orderId: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    eventType: 'provider_failed',
    providerStatus: 'provider_failed',
    externalReference: reviewState.effectiveReview.settlementReference,
    processingChannel: reviewState.effectiveReview.processingChannel,
    payload: {
      operatorNote: reviewState.effectiveReview.operatorNote,
    },
  });

  await insertPaymentSettlementEvent(tx, {
    orderType: 'withdrawal',
    orderId: row.id,
    userId: row.user_id,
    eventType: 'provider_failed',
    settlementStatus: 'failed',
    settlementReference: reviewState.effectiveReview.settlementReference,
    failureReason: reviewState.effectiveReview.operatorNote,
    payload: {
      processingChannel: reviewState.effectiveReview.processingChannel,
    },
  });
  const metadata = appendFinanceStateMetadata(
    mergeWithdrawalControl(reviewMetadata, {
      approvalState: 'provider_failed',
    }),
    {
      flow: 'withdrawal',
      status: 'provider_failed',
      providerStatus: 'provider_failed',
      settlementStatus: 'failed',
      failureReason: reviewState.effectiveReview.operatorNote,
    },
  );

  const [updated] = await tx
    .update(withdrawals)
    .set({ status: 'provider_failed', metadata, updatedAt: new Date() })
    .where(eq(withdrawals.id, row.id))
    .returning();

  return serializeWithdrawal(updated ?? row);
};

export async function approveWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "requested",
        result: null,
      };
    }
    if (
      row.status === 'approved' ||
      row.status === 'provider_submitted' ||
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (row.status !== 'requested') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const approvalsRequired = readApprovalsRequired(row.metadata);
    if (approvalsRequired > 1 && review.adminId == null) {
      throw conflictError('A second admin approval is required for this withdrawal.');
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_approve',
      targetStatus: 'approved',
      review,
      bypassDualReview: approvalsRequired <= 1,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_approve',
    );

    if (!reviewState.confirmed) {
      const metadata = mergeWithdrawalControl(reviewMetadata, {
        approvalsRequired,
        approvalsCollected: 1,
        approvalState: 'pending_second_approval',
      });

      const [updated] = await tx
        .update(withdrawals)
        .set({
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, row.id))
        .returning();

      return {
        previousStatus: row.status,
        result: serializeWithdrawal(updated ?? row),
      };
    }

    const metadata = appendFinanceStateMetadata(
      mergeWithdrawalControl(reviewMetadata, {
        approvalsRequired,
        approvalsCollected: Math.max(
          readApprovalsCollected(row.metadata),
          approvalsRequired,
        ),
        approvalState: 'approved',
      }),
      {
        flow: 'withdrawal',
        status: 'approved',
        settlementStatus: 'approved',
      },
    );

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'approved', metadata, updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    const serialized = serializeWithdrawal(updated ?? row);
    if (
      serialized &&
      Reflect.get(serialized.metadata ?? {}, 'processingMode') === 'provider' &&
      serialized.providerId !== null
    ) {
      await preparePaymentOutboundRequest(
        {
          orderType: 'withdrawal',
          orderId: serialized.id,
          providerId: serialized.providerId,
          flow: 'withdrawal',
          action: 'create_withdrawal',
          operation: 'create_withdrawal',
          requestPayload: {
            userId: serialized.userId,
            amount: String(serialized.amount),
            payoutMethodId: serialized.payoutMethodId,
          },
        },
        tx,
      );
    }

    return {
      previousStatus: row.status,
      result: serialized,
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function markWithdrawalProviderSubmitted(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "approved",
        result: null,
      };
    }
    if (
      row.status === 'provider_submitted' ||
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (row.status !== 'approved') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_mark_provider_submitted',
      targetStatus: 'provider_submitted',
      review: withReviewDefaults(review, 'withdrawal_provider_submitted'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_mark_provider_submitted',
    );
    await insertPaymentProviderEvent(tx, {
      orderType: 'withdrawal',
      orderId: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      eventType: 'provider_submitted',
      providerStatus: 'provider_submitted',
      externalReference: reviewState.effectiveReview.settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
      payload: {
        operatorNote: reviewState.effectiveReview.operatorNote,
      },
    });
    const metadata = appendFinanceStateMetadata(reviewMetadata, {
      flow: 'withdrawal',
      status: 'provider_submitted',
      providerStatus: 'provider_submitted',
      settlementStatus: 'provider_submitted',
    });

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'provider_submitted', metadata, updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    return {
      previousStatus: row.status,
      result: serializeWithdrawal(updated ?? row),
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function markWithdrawalProviderProcessing(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "approved",
        result: null,
      };
    }
    if (
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (row.status !== 'approved' && row.status !== 'provider_submitted') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_mark_provider_processing',
      targetStatus: 'provider_processing',
      review: withReviewDefaults(review, 'withdrawal_provider_processing'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_mark_provider_processing',
    );
    await insertPaymentProviderEvent(tx, {
      orderType: 'withdrawal',
      orderId: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      eventType: 'provider_processing',
      providerStatus: 'provider_processing',
      externalReference: reviewState.effectiveReview.settlementReference,
      processingChannel: reviewState.effectiveReview.processingChannel,
      payload: {
        operatorNote: reviewState.effectiveReview.operatorNote,
      },
    });
    const metadata = appendFinanceStateMetadata(reviewMetadata, {
      flow: 'withdrawal',
      status: 'provider_processing',
      providerStatus: 'provider_processing',
      settlementStatus: 'provider_processing',
    });

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'provider_processing', metadata, updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    return {
      previousStatus: row.status,
      result: serializeWithdrawal(updated ?? row),
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function rejectWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "requested",
        result: null,
      };
    }
    if (row.status === 'rejected' || row.status === 'paid' || row.status === 'reversed') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (row.status !== 'requested' && row.status !== 'approved') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_reject',
      targetStatus: 'rejected',
      review: withReviewDefaults(review, 'withdrawal_rejected'),
      bypassDualReview: true,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_reject',
    );
    if (!reviewState.confirmed) {
      return {
        previousStatus: row.status,
        result: await persistWithdrawalMetadata(tx, row, reviewMetadata),
      };
    }

    const result = await refundWithdrawal(tx, row, {
      review,
      reviewState,
      reviewMetadata,
      nextStatus: 'rejected',
    });

    await assertWalletLedgerInvariant(tx, row.user_id, {
      service: 'withdraw',
      operation: 'rejectWithdrawal',
    });

    return {
      previousStatus: row.status,
      result,
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function markWithdrawalProviderFailed(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "approved",
        result: null,
      };
    }
    if (row.status === 'provider_failed' || row.status === 'paid' || row.status === 'reversed') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (
      row.status !== 'approved' &&
      row.status !== 'provider_submitted' &&
      row.status !== 'provider_processing'
    ) {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_mark_provider_failed',
      targetStatus: 'provider_failed',
      review: withReviewDefaults(review, 'withdrawal_provider_failed'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_mark_provider_failed',
    );
    if (!reviewState.confirmed) {
      return {
        previousStatus: row.status,
        result: await persistWithdrawalMetadata(tx, row, reviewMetadata),
      };
    }

    return {
      previousStatus: row.status,
      result: await markWithdrawalProviderFailure(
        tx,
        row,
        reviewState,
        reviewMetadata,
      ),
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function payWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "provider_processing",
        result: null,
      };
    }
    if (row.status === 'paid' || row.status === 'rejected' || row.status === 'reversed') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (row.status !== 'provider_processing') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_pay',
      targetStatus: 'paid',
      review: withReviewDefaults(review, 'withdrawal_paid'),
      bypassDualReview: true,
      requireSettlementReference: true,
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_pay',
    );
    if (!reviewState.confirmed) {
      return {
        previousStatus: row.status,
        result: await persistWithdrawalMetadata(tx, row, reviewMetadata),
      };
    }
    const processingChannel = normalizeOptionalString(
      reviewState.effectiveReview.processingChannel,
    );
    if (!processingChannel) {
      throw unprocessableEntityError('Processing channel is required.');
    }
    if (readManualChannelRequired(row.metadata) && !isManualChannel(processingChannel)) {
      throw conflictError('Risk-routed withdrawals must be paid through a manual channel.');
    }

    await tx
      .insert(userWallets)
      .values({ userId: row.user_id })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT locked_balance
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${row.user_id}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{ locked_balance: string | number }>(walletResult)[0];
    if (!wallet) {
      throw persistenceError('Wallet not found.');
    }

    const amount = toDecimal(row.amount ?? 0);
    const lockedBefore = toDecimal(wallet.locked_balance ?? 0);
    if (lockedBefore.lt(amount)) {
      throw conflictError('Locked balance is insufficient.');
    }

    const lockedAfter = lockedBefore.minus(amount);

    await tx
      .update(userWallets)
      .set({
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, row.user_id));

    await insertPaymentSettlementEvent(tx, {
      orderType: 'withdrawal',
      orderId: row.id,
      userId: row.user_id,
      eventType: 'paid',
      settlementStatus: 'paid',
      settlementReference: reviewState.effectiveReview.settlementReference,
      payload: {
        processingChannel,
        sourceSettlementReference:
          readLatestSettlementReference(row.metadata) ??
          reviewState.effectiveReview.settlementReference,
      },
    });

    const metadata = appendFinanceStateMetadata(
      mergeWithdrawalControl(reviewMetadata, {
        approvalState: 'paid',
        manualChannelUsed: processingChannel,
      }),
      {
        flow: 'withdrawal',
        status: 'paid',
        settlementStatus: 'paid',
        ledgerEntryType: 'withdraw_paid',
      },
    );

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'paid', metadata, updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    assertWithdrawalLedgerMutationStatus('paid');

    const ledgerSource = readLedgerSource(review);
    await applyLedgerMutation(tx, {
      businessEventId: buildWithdrawalBusinessEventId(
        row.id,
        'consume_locked_funds',
      ),
      orderType: 'withdrawal',
      orderId: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      mutationType: 'withdraw_consume_locked_funds',
      sourceType: ledgerSource.sourceType,
      sourceEventKey: ledgerSource.sourceEventKey,
      amount: toMoneyString(amount.negated()),
      currency: row.asset_code,
      entryType: 'withdraw_paid',
      balanceBefore: toMoneyString(lockedBefore),
      balanceAfter: toMoneyString(lockedAfter),
      referenceType: 'withdrawal',
      referenceId: row.id,
      metadata: {
        status: 'paid',
        balanceType: 'locked',
        processingMode: Reflect.get(metadata, 'processingMode') ?? null,
        settlementReference: reviewState.effectiveReview.settlementReference,
        processingChannel,
      },
    });

    const result = serializeWithdrawal(updated ?? row);

    await assertWalletLedgerInvariant(tx, row.user_id, {
      service: 'withdraw',
      operation: 'payWithdrawal',
    });

    return {
      previousStatus: row.status,
      result,
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export async function reverseWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {},
) {
  const outcome = await db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) {
      return {
        previousStatus: "requested",
        result: null,
      };
    }
    if (row.status === 'reversed') {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }
    if (
      row.status !== 'requested' &&
      row.status !== 'approved' &&
      row.status !== 'provider_submitted' &&
      row.status !== 'provider_processing' &&
      row.status !== 'provider_failed' &&
      row.status !== 'paid'
    ) {
      return {
        previousStatus: row.status,
        result: serializeWithdrawal(row),
      };
    }

    const reviewState = applyDualReviewGate(row.metadata, {
      action: 'withdrawal_reverse',
      targetStatus: 'reversed',
      review: withReviewDefaults(review, 'withdrawal_reversed'),
      bypassDualReview: true,
      requireSettlementReference: row.status !== 'requested',
    });
    const reviewMetadata = await updateWithdrawalReviewOnly(
      tx,
      row,
      reviewState,
      'withdrawal_reverse',
    );
    if (!reviewState.confirmed) {
      return {
        previousStatus: row.status,
        result: await persistWithdrawalMetadata(tx, row, reviewMetadata),
      };
    }

    const result = await refundWithdrawal(tx, row, {
      review,
      reviewState,
      reviewMetadata,
      nextStatus: 'reversed',
    });

    await assertWalletLedgerInvariant(tx, row.user_id, {
      service: 'withdraw',
      operation: 'reverseWithdrawal',
    });

    return {
      previousStatus: row.status,
      result,
    };
  });

  await queueWithdrawalStatusNotification(
    outcome.previousStatus,
    outcome.result,
  );

  return outcome.result;
}

export const startWithdrawalPayout = markWithdrawalProviderSubmitted;
