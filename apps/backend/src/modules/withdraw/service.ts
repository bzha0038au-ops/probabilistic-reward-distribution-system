import { and, desc, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import {
  authSessions,
  cryptoWithdrawAddresses,
  fiatPayoutMethods,
  payoutMethods,
  userWallets,
  withdrawals,
} from '@reward/database';
import { db, type DbTransaction } from '../../db';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import {
  appendFinanceReviewMetadata,
  appendFinanceStateMetadata,
  applyDualReviewGate,
  normalizeOptionalString,
  type WithdrawalStatus,
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
import { assertWithdrawalLedgerMutationStatus } from '../payment/state-machine';
import {
  getPaymentCapabilitySummary,
  resolvePaymentProcessingContext,
  withPaymentProcessingMetadata,
} from '../payment/service';
import { recordSuspiciousActivity } from '../risk/service';
import {
  getAntiAbuseConfig,
  getConfigDecimal,
  getPaymentConfig,
  getWithdrawalRiskConfig,
} from '../system/service';

const MAX_WITHDRAW_PER_DAY_KEY = 'anti_abuse.max_withdraw_per_day';

type WithdrawalRow = {
  id: number;
  user_id: number;
  provider_id: number | null;
  payout_method_id: number | null;
  amount: string | number;
  channel_type: string;
  asset_type: string;
  asset_code: string | null;
  network: string | null;
  status: WithdrawalStatus;
  metadata: unknown;
};

type PayoutMethodRecord = {
  id: number;
  userId: number;
  methodType: string;
  channelType: string;
  assetType: string;
  assetCode: string | null;
  network: string | null;
  status: string;
  displayName: string | null;
  cardholderName: string;
  bankName: string | null;
  brand: string | null;
  last4: string | null;
  cryptoAddress: string | null;
  chain: string | null;
  token: string | null;
};

type WithdrawalRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
};

type WithdrawalRiskSignal =
  | 'new_card_first_withdrawal'
  | 'shared_ip_cluster'
  | 'shared_device_cluster'
  | 'shared_payout_destination_cluster';

type WithdrawalReviewPayload = FinanceReviewPayload & {
  sourceType?: LedgerMutationSourceType;
  sourceEventKey?: string | null;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      return toRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readNumeric = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeLookup = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? '';

const normalizeManualChannel = (value: string | null | undefined) =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_') ?? '';

const withReviewDefaults = (
  review: WithdrawalReviewPayload,
  fallbackNote: string
): WithdrawalReviewPayload => ({
  ...review,
  operatorNote: normalizeOptionalString(review.operatorNote) ?? fallbackNote,
});

const readLedgerSource = (review: WithdrawalReviewPayload) => ({
  sourceType:
    review.sourceType ?? (review.adminId === null || review.adminId === undefined
      ? 'system'
      : 'manual_review'),
  sourceEventKey: normalizeOptionalString(review.sourceEventKey),
});

const buildWithdrawalBusinessEventId = (
  withdrawalId: number,
  action: 'lock_funds' | 'release_locked_funds' | 'consume_locked_funds'
) => `withdrawal:${withdrawalId}:${action}`;

const isManualChannel = (value: string | null | undefined) => {
  const normalized = normalizeManualChannel(value);
  if (normalized === '') {
    return false;
  }

  return (
    normalized.includes('manual') ||
    normalized.includes('offline') ||
    normalized.includes('human')
  );
};

const serializeWithdrawal = <
  T extends typeof withdrawals.$inferSelect | WithdrawalRow | null,
>(
  withdrawal: T
) => {
  if (!withdrawal) {
    return withdrawal;
  }

  const payoutMethodId =
    'payoutMethodId' in withdrawal
      ? withdrawal.payoutMethodId
      : withdrawal.payout_method_id;

  return {
    ...withdrawal,
    payoutMethodId,
    metadata:
      Reflect.get(withdrawal, 'metadata') == null
        ? null
        : toRecord(Reflect.get(withdrawal, 'metadata')),
    bankCardId: payoutMethodId ?? null,
  };
};

const readWithdrawalControl = (
  metadata: unknown
) => toRecord(Reflect.get(toRecord(metadata), 'withdrawalControl'));

const mergeWithdrawalControl = (
  metadata: unknown,
  updates: Record<string, unknown>
) => {
  const nextMetadata = toRecord(metadata);
  const currentControl = readWithdrawalControl(nextMetadata);

  return {
    ...nextMetadata,
    withdrawalControl: {
      ...currentControl,
      ...updates,
    },
  };
};

const readApprovalsRequired = (metadata: unknown) => {
  const value = readNumeric(Reflect.get(readWithdrawalControl(metadata), 'approvalsRequired'));
  return value && value > 1 ? Math.trunc(value) : 1;
};

const readApprovalsCollected = (metadata: unknown) => {
  const value = readNumeric(
    Reflect.get(readWithdrawalControl(metadata), 'approvalsCollected')
  );
  return value && value > 0 ? Math.trunc(value) : 0;
};

const readManualChannelRequired = (
  metadata: unknown
) => Reflect.get(readWithdrawalControl(metadata), 'manualChannelRequired') === true;

const readLatestSettlementReference = (metadata: unknown) =>
  normalizeOptionalString(
    Reflect.get(
      toRecord(Reflect.get(toRecord(metadata), 'financeReviewLatest')),
      'settlementReference'
    ) as string | null | undefined
  );

const countRows = (result: unknown) => {
  const rows = readSqlRows<{ total: string | number }>(result);
  return Number(rows[0]?.total ?? 0);
};

const selectLockedWithdrawal = async (tx: DbTransaction, withdrawalId: number) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      user_id,
      provider_id,
      payout_method_id,
      amount,
      channel_type,
      asset_type,
      asset_code,
      network,
      status,
      metadata
    FROM ${withdrawals}
    WHERE ${withdrawals.id} = ${withdrawalId}
    FOR UPDATE
  `);

  return readSqlRows<WithdrawalRow>(result)[0] ?? null;
};

const selectOwnedPayoutMethod = async (
  tx: DbTransaction,
  userId: number,
  payoutMethodId: number | null | undefined
) => {
  if (!payoutMethodId) {
    return null;
  }

  const [row] = await tx
    .select({
      id: payoutMethods.id,
      userId: payoutMethods.userId,
      methodType: payoutMethods.methodType,
      channelType: payoutMethods.channelType,
      assetType: payoutMethods.assetType,
      assetCode: payoutMethods.assetCode,
      network: payoutMethods.network,
      status: payoutMethods.status,
      displayName: payoutMethods.displayName,
      accountName: fiatPayoutMethods.accountName,
      bankName: fiatPayoutMethods.bankName,
      brand: fiatPayoutMethods.brand,
      accountLast4: fiatPayoutMethods.accountLast4,
      address: cryptoWithdrawAddresses.address,
      chain: cryptoWithdrawAddresses.chain,
      token: cryptoWithdrawAddresses.token,
    })
    .from(payoutMethods)
    .leftJoin(
      fiatPayoutMethods,
      eq(fiatPayoutMethods.payoutMethodId, payoutMethods.id)
    )
    .leftJoin(
      cryptoWithdrawAddresses,
      eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethods.id)
    )
    .where(
      and(
        eq(payoutMethods.id, payoutMethodId),
        eq(payoutMethods.userId, userId)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Payout method not found.');
  }
  if (row.status !== 'active') {
    throw new Error('Payout method is not active.');
  }

  return {
    id: row.id,
    userId: row.userId,
    methodType: row.methodType,
    channelType: row.channelType,
    assetType: row.assetType,
    assetCode: row.assetCode,
    network: row.network,
    status: row.status,
    displayName: row.displayName,
    cardholderName: row.accountName ?? row.displayName ?? 'Bank account',
    bankName: row.bankName ?? null,
    brand: row.brand ?? null,
    last4: row.accountLast4 ?? null,
    cryptoAddress: row.address ?? null,
    chain: row.chain ?? null,
    token: row.token ?? null,
  } satisfies PayoutMethodRecord;
};

const evaluateWithdrawalControls = async (
  tx: DbTransaction,
  payload: {
    userId: number;
    amount: Decimal;
    payoutMethod: PayoutMethodRecord | null;
    requestContext: WithdrawalRequestContext;
  }
) => {
  const config = await getWithdrawalRiskConfig(tx);
  const riskSignals: WithdrawalRiskSignal[] = [];
  const suspiciousSignals: WithdrawalRiskSignal[] = [];
  const secondApprovalThreshold = config.largeAmountSecondApprovalThreshold;
  const sharedIpThreshold = Number(config.sharedIpUserThreshold);
  const sharedDeviceThreshold = Number(config.sharedDeviceUserThreshold);
  const sharedPayoutThreshold = Number(config.sharedPayoutUserThreshold);

  let sharedIpUserCount = 0;
  let sharedDeviceUserCount = 0;
  let sharedPayoutUserCount = 0;
  let newCardFirstWithdrawal = false;

  if (
    payload.payoutMethod &&
    payload.payoutMethod.methodType === 'bank_account' &&
    config.newCardFirstWithdrawalReviewEnabled
  ) {
    const result = await tx.execute(sql`
      SELECT count(*)::int AS total
      FROM ${withdrawals}
      WHERE ${withdrawals.userId} = ${payload.userId}
        AND ${withdrawals.payoutMethodId} = ${payload.payoutMethod.id}
        AND ${withdrawals.status} = 'paid'
    `);

    newCardFirstWithdrawal = countRows(result) === 0;
    if (newCardFirstWithdrawal) {
      riskSignals.push('new_card_first_withdrawal');
    }
  }

  const requestIp = normalizeOptionalString(payload.requestContext.ip);
  const requestUserAgent = normalizeOptionalString(payload.requestContext.userAgent);

  if (requestIp && sharedIpThreshold > 1) {
    const result = await tx.execute(sql`
      SELECT count(DISTINCT ${authSessions.userId})::int AS total
      FROM ${authSessions}
      WHERE ${authSessions.subjectRole} = 'user'
        AND ${authSessions.ip} = ${requestIp}
    `);

    sharedIpUserCount = countRows(result);
    if (sharedIpUserCount >= sharedIpThreshold) {
      riskSignals.push('shared_ip_cluster');
      suspiciousSignals.push('shared_ip_cluster');
    }
  }

  if (requestIp && requestUserAgent && sharedDeviceThreshold > 1) {
    const result = await tx.execute(sql`
      SELECT count(DISTINCT ${authSessions.userId})::int AS total
      FROM ${authSessions}
      WHERE ${authSessions.subjectRole} = 'user'
        AND ${authSessions.ip} = ${requestIp}
        AND ${authSessions.userAgent} = ${requestUserAgent}
    `);

    sharedDeviceUserCount = countRows(result);
    if (sharedDeviceUserCount >= sharedDeviceThreshold) {
      riskSignals.push('shared_device_cluster');
      suspiciousSignals.push('shared_device_cluster');
    }
  }

  if (
    payload.payoutMethod &&
    payload.payoutMethod.methodType === 'bank_account' &&
    payload.payoutMethod.last4 &&
    sharedPayoutThreshold > 1
  ) {
    const holder = normalizeLookup(payload.payoutMethod.cardholderName);
    const bank = normalizeLookup(payload.payoutMethod.bankName);
    const brand = normalizeLookup(payload.payoutMethod.brand);
    const last4 = payload.payoutMethod.last4;

    const result = await tx.execute(sql`
      SELECT count(DISTINCT ${payoutMethods.userId})::int AS total
      FROM ${payoutMethods}
      INNER JOIN ${fiatPayoutMethods}
        ON ${fiatPayoutMethods.payoutMethodId} = ${payoutMethods.id}
      WHERE ${payoutMethods.methodType} = 'bank_account'
        AND lower(${fiatPayoutMethods.accountName}) = ${holder}
        AND coalesce(lower(${fiatPayoutMethods.bankName}), '') = ${bank}
        AND coalesce(lower(${fiatPayoutMethods.brand}), '') = ${brand}
        AND coalesce(${fiatPayoutMethods.accountLast4}, '') = ${last4}
    `);

    sharedPayoutUserCount = countRows(result);
    if (sharedPayoutUserCount >= sharedPayoutThreshold) {
      riskSignals.push('shared_payout_destination_cluster');
      suspiciousSignals.push('shared_payout_destination_cluster');
    }
  }

  if (
    payload.payoutMethod &&
    payload.payoutMethod.methodType === 'crypto_address' &&
    payload.payoutMethod.cryptoAddress &&
    sharedPayoutThreshold > 1
  ) {
    const address = normalizeLookup(payload.payoutMethod.cryptoAddress);

    const result = await tx.execute(sql`
      SELECT count(DISTINCT ${payoutMethods.userId})::int AS total
      FROM ${payoutMethods}
      INNER JOIN ${cryptoWithdrawAddresses}
        ON ${cryptoWithdrawAddresses.payoutMethodId} = ${payoutMethods.id}
      WHERE ${payoutMethods.methodType} = 'crypto_address'
        AND lower(${cryptoWithdrawAddresses.address}) = ${address}
    `);

    sharedPayoutUserCount = countRows(result);
    if (sharedPayoutUserCount >= sharedPayoutThreshold) {
      riskSignals.push('shared_payout_destination_cluster');
      suspiciousSignals.push('shared_payout_destination_cluster');
    }
  }

  const approvalsRequired =
    secondApprovalThreshold.gt(0) && payload.amount.gte(secondApprovalThreshold) ? 2 : 1;
  const manualChannelRequired = riskSignals.length > 0;

  return {
    suspiciousSignals,
    metadata: {
      approvalsRequired,
      approvalsCollected: 0,
      approvalState:
        approvalsRequired > 1 ? 'pending_first_approval' : 'pending_single_approval',
      largeAmountSecondApprovalRequired: approvalsRequired > 1,
      secondApprovalThreshold:
        secondApprovalThreshold.gt(0) ? toMoneyString(secondApprovalThreshold) : null,
      manualChannelRequired,
      manualChannelReason: manualChannelRequired ? 'risk_signal_triggered' : null,
      riskSignals,
      newCardFirstWithdrawal,
      sharedIpUserCount,
      sharedDeviceUserCount,
      sharedPayoutUserCount,
      payoutMethodSnapshot: payload.payoutMethod
        ? {
            id: payload.payoutMethod.id,
            cardholderName: payload.payoutMethod.cardholderName,
            bankName: payload.payoutMethod.bankName,
            brand: payload.payoutMethod.brand,
            last4: payload.payoutMethod.last4,
            status: payload.payoutMethod.status,
            channelType: payload.payoutMethod.channelType,
            assetType: payload.payoutMethod.assetType,
            assetCode: payload.payoutMethod.assetCode,
            network: payload.payoutMethod.network,
          }
        : null,
      requestContext: {
        ip: requestIp,
        userAgent: requestUserAgent,
        sessionId: normalizeOptionalString(payload.requestContext.sessionId),
      },
    },
  };
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
    | 'withdrawal_reverse'
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
  metadata: Record<string, unknown> | null
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
  }
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
    throw new Error('Wallet not found.');
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
    nextStatus === 'reversed' ? 'withdraw_reversed_refund' : 'withdraw_rejected_refund';
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
    }
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
      'release_locked_funds'
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
  reviewMetadata: Record<string, unknown>
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
    }
  );

  const [updated] = await tx
    .update(withdrawals)
    .set({ status: 'provider_failed', metadata, updatedAt: new Date() })
    .where(eq(withdrawals.id, row.id))
    .returning();

  return serializeWithdrawal(updated ?? row);
};

export async function listWithdrawals(userId: number, limit = 50) {
  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.id))
    .limit(limit);

  return rows.map((row) => serializeWithdrawal(row));
}

export async function listWithdrawalsAdmin(limit = 50) {
  const rows = await db
    .select()
    .from(withdrawals)
    .orderBy(desc(withdrawals.id))
    .limit(limit);

  return rows.map((row) => serializeWithdrawal(row));
}

export async function createWithdrawal(payload: {
  userId: number;
  amount: string;
  payoutMethodId?: number | null;
  bankCardId?: number | null;
  metadata?: Record<string, unknown> | null;
  requestContext?: WithdrawalRequestContext;
}) {
  return db.transaction(async (tx) => {
    const paymentConfig = await getPaymentConfig(tx);
    if (!paymentConfig.withdrawEnabled) {
      throw new Error('Withdrawals are currently disabled.');
    }

    await tx
      .insert(userWallets)
      .values({ userId: payload.userId })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT withdrawable_balance, locked_balance, wagered_amount
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${payload.userId}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      withdrawable_balance: string | number;
      locked_balance: string | number;
      wagered_amount: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(payload.amount);
    const minAllowed = paymentConfig.minWithdrawAmount;
    const maxAllowed = paymentConfig.maxWithdrawAmount;
    const antiAbuse = await getAntiAbuseConfig(tx);

    if (amount.lte(0)) {
      throw new Error('Amount must be greater than 0.');
    }
    if (minAllowed.gt(0) && amount.lt(minAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_below_min',
          metadata: { amount: toMoneyString(amount), min: toMoneyString(minAllowed) },
        },
        tx
      );
      throw new Error('Amount below minimum withdrawal.');
    }
    if (maxAllowed.gt(0) && amount.gt(maxAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_above_max',
          metadata: { amount: toMoneyString(amount), max: toMoneyString(maxAllowed) },
        },
        tx
      );
      throw new Error('Amount exceeds maximum withdrawal.');
    }

    const maxPerDay = await getConfigDecimal(tx, MAX_WITHDRAW_PER_DAY_KEY, 0);
    if (maxPerDay.gt(0)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ total = 0 }] = await tx
        .select({
          total: sql<number>`coalesce(sum(${withdrawals.amount}), 0)`,
        })
        .from(withdrawals)
        .where(
          sql`${withdrawals.userId} = ${payload.userId} AND ${withdrawals.createdAt} >= ${startOfDay}`
        );

      const totalToday = toDecimal(total ?? 0);
      if (totalToday.plus(amount).gt(maxPerDay)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: 'withdraw_daily_limit',
            metadata: {
              amount: toMoneyString(amount),
              totalToday: toMoneyString(totalToday),
              maxPerDay: toMoneyString(maxPerDay),
            },
          },
          tx
        );
        throw new Error('Daily withdrawal limit exceeded.');
      }
    }

    if (antiAbuse.minWagerBeforeWithdraw.gt(0)) {
      const wageredBefore = toDecimal(wallet.wagered_amount ?? 0);
      if (wageredBefore.lt(antiAbuse.minWagerBeforeWithdraw)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: 'withdraw_min_wager',
            metadata: {
              wagered: toMoneyString(wageredBefore),
              required: toMoneyString(antiAbuse.minWagerBeforeWithdraw),
            },
          },
          tx
        );
        throw new Error('Minimum wager requirement not met.');
      }
    }

    const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
    if (withdrawableBefore.lt(amount)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_insufficient_funds',
          metadata: {
            amount: toMoneyString(amount),
            withdrawable: toMoneyString(withdrawableBefore),
          },
        },
        tx
      );
      throw new Error('Insufficient withdrawable balance.');
    }

    const payoutMethod = await selectOwnedPayoutMethod(
      tx,
      payload.userId,
      payload.payoutMethodId ?? payload.bankCardId
    );
    const controls = await evaluateWithdrawalControls(tx, {
      userId: payload.userId,
      amount,
      payoutMethod,
      requestContext: payload.requestContext ?? {},
    });

    const withdrawableAfter = withdrawableBefore.minus(amount);
    const lockedAfter = toDecimal(wallet.locked_balance ?? 0).plus(amount);
    const processing = await resolvePaymentProcessingContext(tx, 'withdrawal', {
      userId: payload.userId,
      amount: toMoneyString(amount),
      channelType: payoutMethod?.channelType ?? null,
      assetType: payoutMethod?.assetType ?? null,
      assetCode: payoutMethod?.assetCode ?? null,
      network: payoutMethod?.network ?? null,
      metadata: payload.metadata ?? null,
    });
    const capability = getPaymentCapabilitySummary();
    const forcedManual = controls.metadata.manualChannelRequired;
    const paymentMetadata = withPaymentProcessingMetadata(payload.metadata, {
      flow: 'withdrawal',
      processingMode: forcedManual ? 'manual' : processing.mode,
      manualFallbackRequired: forcedManual ? true : processing.manualFallbackRequired,
      manualFallbackReason: forcedManual
        ? 'risk_manual_review_required'
        : processing.manualFallbackReason,
      paymentProviderId: processing.providerId,
      paymentOperatingMode: capability.operatingMode,
      paymentAutomationRequested: capability.automatedExecutionEnabled,
      paymentAutomationReady: capability.automatedExecutionReady,
      paymentAdapterKey: processing.adapterKey,
      paymentAdapterRegistered: processing.adapterRegistered,
    });
    const metadata = appendFinanceStateMetadata(
      mergeWithdrawalControl(paymentMetadata, controls.metadata),
      {
        flow: 'withdrawal',
        status: 'requested',
        providerStatus: null,
        settlementStatus: null,
        ledgerEntryType: 'withdraw_request',
      }
    );

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, payload.userId));

    const [created] = await tx
      .insert(withdrawals)
      .values({
        userId: payload.userId,
        providerId: processing.providerId,
        payoutMethodId: payoutMethod?.id ?? null,
        amount: toMoneyString(amount),
        channelType: payoutMethod?.channelType ?? 'fiat',
        assetType: payoutMethod?.assetType ?? 'fiat',
        assetCode: payoutMethod?.assetCode ?? null,
        network: payoutMethod?.network ?? null,
        status: 'requested',
        metadata,
      })
      .returning();

    assertWithdrawalLedgerMutationStatus('requested');

    if (created) {
      await applyLedgerMutation(tx, {
        businessEventId: buildWithdrawalBusinessEventId(created.id, 'lock_funds'),
        orderType: 'withdrawal',
        orderId: created.id,
        userId: payload.userId,
        providerId: processing.providerId,
        mutationType: 'withdraw_lock_funds',
        sourceType: 'order_request',
        sourceEventKey: null,
        amount: toMoneyString(amount.negated()),
        currency: payoutMethod?.assetCode ?? null,
        entryType: 'withdraw_request',
        balanceBefore: toMoneyString(withdrawableBefore),
        balanceAfter: toMoneyString(withdrawableAfter),
        referenceType: 'withdrawal',
        referenceId: created.id,
        metadata: {
          status: 'requested',
          riskSignals: controls.metadata.riskSignals,
          manualChannelRequired: controls.metadata.manualChannelRequired,
        },
      });
    }

    if (controls.suspiciousSignals.length > 0) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: 'withdraw_risk_cluster',
          metadata: {
            signals: controls.suspiciousSignals,
            sharedIpUserCount: controls.metadata.sharedIpUserCount,
            sharedDeviceUserCount: controls.metadata.sharedDeviceUserCount,
            sharedPayoutUserCount: controls.metadata.sharedPayoutUserCount,
            payoutMethodId: payoutMethod?.id ?? null,
          },
          score: controls.suspiciousSignals.length,
        },
        tx
      );
    }

    return serializeWithdrawal(created ?? null);
  });
}

export async function approveWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (
      row.status === 'approved' ||
      row.status === 'provider_submitted' ||
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return serializeWithdrawal(row);
    }
    if (row.status !== 'requested') {
      return serializeWithdrawal(row);
    }

    const approvalsRequired = readApprovalsRequired(row.metadata);
    if (approvalsRequired > 1 && review.adminId == null) {
      throw new Error('A second admin approval is required for this withdrawal.');
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
      'withdrawal_approve'
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

      return serializeWithdrawal(updated ?? row);
    }

    const metadata = appendFinanceStateMetadata(
      mergeWithdrawalControl(reviewMetadata, {
        approvalsRequired,
        approvalsCollected: Math.max(readApprovalsCollected(row.metadata), approvalsRequired),
        approvalState: 'approved',
      }),
      {
        flow: 'withdrawal',
        status: 'approved',
        settlementStatus: 'approved',
      }
    );

    const [updated] = await tx
      .update(withdrawals)
      .set({ status: 'approved', metadata, updatedAt: new Date() })
      .where(eq(withdrawals.id, row.id))
      .returning();

    return serializeWithdrawal(updated ?? row);
  });
}

export async function markWithdrawalProviderSubmitted(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (
      row.status === 'provider_submitted' ||
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return serializeWithdrawal(row);
    }
    if (row.status !== 'approved') {
      return serializeWithdrawal(row);
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
      'withdrawal_mark_provider_submitted'
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

    return serializeWithdrawal(updated ?? row);
  });
}

export async function markWithdrawalProviderProcessing(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (
      row.status === 'provider_processing' ||
      row.status === 'paid' ||
      row.status === 'rejected' ||
      row.status === 'provider_failed' ||
      row.status === 'reversed'
    ) {
      return serializeWithdrawal(row);
    }
    if (row.status !== 'approved' && row.status !== 'provider_submitted') {
      return serializeWithdrawal(row);
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
      'withdrawal_mark_provider_processing'
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

    return serializeWithdrawal(updated ?? row);
  });
}

export async function rejectWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (row.status === 'rejected' || row.status === 'paid' || row.status === 'reversed') {
      return serializeWithdrawal(row);
    }
    if (row.status !== 'requested' && row.status !== 'approved') {
      return serializeWithdrawal(row);
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
      'withdrawal_reject'
    );
    if (!reviewState.confirmed) {
      return persistWithdrawalMetadata(tx, row, reviewMetadata);
    }

    return refundWithdrawal(
      tx,
      row,
      {
        review,
        reviewState,
        reviewMetadata,
        nextStatus: 'rejected',
      }
    );
  });
}

export async function markWithdrawalProviderFailed(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (row.status === 'provider_failed' || row.status === 'paid' || row.status === 'reversed') {
      return serializeWithdrawal(row);
    }
    if (
      row.status !== 'approved' &&
      row.status !== 'provider_submitted' &&
      row.status !== 'provider_processing'
    ) {
      return serializeWithdrawal(row);
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
      'withdrawal_mark_provider_failed'
    );
    if (!reviewState.confirmed) {
      return persistWithdrawalMetadata(tx, row, reviewMetadata);
    }

    return markWithdrawalProviderFailure(tx, row, reviewState, reviewMetadata);
  });
}

export async function payWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (row.status === 'paid' || row.status === 'rejected' || row.status === 'reversed') {
      return serializeWithdrawal(row);
    }
    if (row.status !== 'provider_processing') {
      return serializeWithdrawal(row);
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
      'withdrawal_pay'
    );
    if (!reviewState.confirmed) {
      return persistWithdrawalMetadata(tx, row, reviewMetadata);
    }
    const processingChannel = normalizeOptionalString(
      reviewState.effectiveReview.processingChannel
    );
    if (!processingChannel) {
      throw new Error('Processing channel is required.');
    }
    if (readManualChannelRequired(row.metadata) && !isManualChannel(processingChannel)) {
      throw new Error('Risk-routed withdrawals must be paid through a manual channel.');
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
      throw new Error('Wallet not found.');
    }

    const amount = toDecimal(row.amount ?? 0);
    const lockedBefore = toDecimal(wallet.locked_balance ?? 0);
    if (lockedBefore.lt(amount)) {
      throw new Error('Locked balance is insufficient.');
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
      }
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
        'consume_locked_funds'
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

    return serializeWithdrawal(updated ?? row);
  });
}

export async function reverseWithdrawal(
  withdrawalId: number,
  review: WithdrawalReviewPayload = {}
) {
  return db.transaction(async (tx) => {
    const row = await selectLockedWithdrawal(tx, withdrawalId);
    if (!row) return null;
    if (row.status === 'reversed') {
      return serializeWithdrawal(row);
    }
    if (
      row.status !== 'requested' &&
      row.status !== 'approved' &&
      row.status !== 'provider_submitted' &&
      row.status !== 'provider_processing' &&
      row.status !== 'provider_failed' &&
      row.status !== 'paid'
    ) {
      return serializeWithdrawal(row);
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
      'withdrawal_reverse'
    );
    if (!reviewState.confirmed) {
      return persistWithdrawalMetadata(tx, row, reviewMetadata);
    }

    return refundWithdrawal(
      tx,
      row,
      {
        review,
        reviewState,
        reviewMetadata,
        nextStatus: 'reversed',
      }
    );
  });
}

export const startWithdrawalPayout = markWithdrawalProviderSubmitted;
