import { and, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import {
  authSessions,
  deviceFingerprints,
  cryptoWithdrawAddresses,
  fiatPayoutMethods,
  payoutMethods,
  withdrawals,
} from '@reward/database';

import type { DbTransaction } from '../../db';
import { conflictError, notFoundError } from '../../shared/errors';
import { toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import {
  normalizeOptionalString,
  type FinanceReviewPayload,
  type WithdrawalStatus,
} from '../payment/finance-order';
import type { LedgerMutationSourceType } from '../payment/ledger-mutation';
import { getWithdrawalRiskConfig } from '../system/service';

export const MAX_WITHDRAW_PER_DAY_KEY = 'anti_abuse.max_withdraw_per_day';

export type WithdrawalRow = {
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

export type PayoutMethodRecord = {
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

export type WithdrawalRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  deviceFingerprint?: string | null;
};

type WithdrawalRiskSignal =
  | 'new_card_first_withdrawal'
  | 'shared_ip_cluster'
  | 'shared_device_cluster'
  | 'shared_payout_destination_cluster';

export type WithdrawalReviewPayload = FinanceReviewPayload & {
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

export const withReviewDefaults = (
  review: WithdrawalReviewPayload,
  fallbackNote: string
): WithdrawalReviewPayload => ({
  ...review,
  operatorNote: normalizeOptionalString(review.operatorNote) ?? fallbackNote,
});

export const readLedgerSource = (review: WithdrawalReviewPayload) => ({
  sourceType:
    review.sourceType ?? (review.adminId === null || review.adminId === undefined
      ? 'system'
      : 'manual_review'),
  sourceEventKey: normalizeOptionalString(review.sourceEventKey),
});

export const buildWithdrawalBusinessEventId = (
  withdrawalId: number,
  action: 'lock_funds' | 'release_locked_funds' | 'consume_locked_funds'
) => `withdrawal:${withdrawalId}:${action}`;

export const isManualChannel = (value: string | null | undefined) => {
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

export const serializeWithdrawal = <
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

export const mergeWithdrawalControl = (
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

export const readApprovalsRequired = (metadata: unknown) => {
  const value = readNumeric(Reflect.get(readWithdrawalControl(metadata), 'approvalsRequired'));
  return value && value > 1 ? Math.trunc(value) : 1;
};

export const readApprovalsCollected = (metadata: unknown) => {
  const value = readNumeric(
    Reflect.get(readWithdrawalControl(metadata), 'approvalsCollected')
  );
  return value && value > 0 ? Math.trunc(value) : 0;
};

export const readManualChannelRequired = (
  metadata: unknown
) => Reflect.get(readWithdrawalControl(metadata), 'manualChannelRequired') === true;

export const readLatestSettlementReference = (metadata: unknown) =>
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

export const selectLockedWithdrawal = async (
  tx: DbTransaction,
  withdrawalId: number
) => {
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

export const selectOwnedPayoutMethod = async (
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
    throw notFoundError('Payout method not found.');
  }
  if (row.status !== 'active') {
    throw conflictError('Payout method is not active.');
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

export const evaluateWithdrawalControls = async (
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
  const requestDeviceFingerprint = normalizeOptionalString(
    payload.requestContext.deviceFingerprint,
  );

  if (requestIp && sharedIpThreshold > 1) {
    let result = await tx.execute(sql`
      SELECT count(DISTINCT ${deviceFingerprints.userId})::int AS total
      FROM ${deviceFingerprints}
      WHERE ${deviceFingerprints.ip} = ${requestIp}
    `);

    sharedIpUserCount = countRows(result);
    if (sharedIpUserCount === 0) {
      result = await tx.execute(sql`
        SELECT count(DISTINCT ${authSessions.userId})::int AS total
        FROM ${authSessions}
        WHERE ${authSessions.subjectRole} = 'user'
          AND ${authSessions.ip} = ${requestIp}
      `);
      sharedIpUserCount = countRows(result);
    }
    if (sharedIpUserCount >= sharedIpThreshold) {
      riskSignals.push('shared_ip_cluster');
      suspiciousSignals.push('shared_ip_cluster');
    }
  }

  if (sharedDeviceThreshold > 1) {
    let result = null;
    if (requestDeviceFingerprint) {
      result = await tx.execute(sql`
        SELECT count(DISTINCT ${deviceFingerprints.userId})::int AS total
        FROM ${deviceFingerprints}
        WHERE ${deviceFingerprints.fingerprint} = ${requestDeviceFingerprint}
      `);
      sharedDeviceUserCount = countRows(result);
    }

    if (sharedDeviceUserCount === 0 && requestIp && requestUserAgent) {
      result = await tx.execute(sql`
        SELECT count(DISTINCT ${authSessions.userId})::int AS total
        FROM ${authSessions}
        WHERE ${authSessions.subjectRole} = 'user'
          AND ${authSessions.ip} = ${requestIp}
          AND ${authSessions.userAgent} = ${requestUserAgent}
      `);
      sharedDeviceUserCount = countRows(result);
    }

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
        deviceFingerprint: requestDeviceFingerprint,
      },
    },
  };
};
