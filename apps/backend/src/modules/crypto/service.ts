import Decimal from 'decimal.js';
import { and, desc, eq } from '@reward/database/orm';

import {
  cryptoChainTransactions,
  cryptoDepositChannels,
  cryptoReviewEvents,
  cryptoWithdrawAddresses,
  deposits,
  payoutMethods,
  withdrawals,
} from '@reward/database';
import { db, type DbTransaction } from '../../db';
import {
  conflictError,
  notFoundError,
  persistenceError,
  serviceUnavailableError,
  unprocessableEntityError,
} from '../../shared/errors';
import { toDecimal, toMoneyString } from '../../shared/money';
import {
  appendFinanceStateMetadata,
  normalizeOptionalString,
} from '../payment/finance-order';
import {
  getPaymentCapabilitySummary,
  resolvePaymentProcessingContext,
  withPaymentProcessingMetadata,
} from '../payment/service';
import { getPaymentConfig } from '../system/service';
import {
  creditDeposit,
  failDeposit,
  markDepositProviderPending,
  markDepositProviderSucceeded,
} from '../top-up';
import { screenUserFirstDeposit } from '../aml';
import {
  createWithdrawal,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
} from '../withdraw/service';

type CryptoWithdrawAddressRecord = typeof cryptoWithdrawAddresses.$inferSelect;
type DepositRecord = typeof deposits.$inferSelect;
type WithdrawalRecord = typeof withdrawals.$inferSelect;
type RecordLike = Record<string, unknown> | null;

export type ParsedTokenAmount = {
  decimal: Decimal;
  walletAmount: string;
  preciseAmount: string;
};

export type CryptoReviewPayload = {
  adminId?: number | null;
  operatorNote?: string | null;
  processingChannel?: string | null;
  settlementReference?: string | null;
  confirmations?: number | null;
  actualAmount?: string | number | null;
  fee?: string | number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  sentAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

const MANUAL_CRYPTO_CHANNEL = 'manual_crypto';

export const toRecord = (value: unknown): RecordLike => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

export const mergeMetadata = (
  existing: unknown,
  key: string,
  updates: Record<string, unknown>
) => ({
  ...(toRecord(existing) ?? {}),
  [key]: {
    ...(toRecord(Reflect.get(toRecord(existing) ?? {}, key)) ?? {}),
    ...updates,
  },
});

export const requireString = (
  value: string | null | undefined,
  label: string,
  maxLength: number
) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw unprocessableEntityError(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw unprocessableEntityError(`${label} is too long.`);
  }
  return normalized;
};

export const optionalString = (
  value: string | null | undefined,
  maxLength: number
) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw unprocessableEntityError('Field is too long.');
  }
  return normalized;
};

export const parseTokenAmount = (
  value: string | number,
  label: string
): ParsedTokenAmount => {
  let decimal: Decimal;
  try {
    decimal = toDecimal(value);
  } catch {
    throw unprocessableEntityError(`${label} is invalid.`);
  }

  if (!decimal.isFinite() || decimal.lte(0)) {
    throw unprocessableEntityError(`${label} must be greater than 0.`);
  }

  const decimalPlaces = decimal.decimalPlaces();
  if (decimalPlaces !== null && decimalPlaces > 18) {
    throw unprocessableEntityError(`${label} supports at most 18 decimal places.`);
  }

  return {
    decimal,
    walletAmount: toMoneyString(decimal),
    preciseAmount: decimal.toFixed(decimalPlaces ?? 0),
  };
};

export const parseOptionalPositiveInteger = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw unprocessableEntityError('Confirmations must be a non-negative integer.');
  }
  return Math.trunc(parsed);
};

export const toDateValue = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw unprocessableEntityError('Sent time is invalid.');
  }
  return parsed;
};

export const serializeDeposit = (deposit: DepositRecord | null) =>
  deposit
    ? {
        ...deposit,
        metadata: toRecord(deposit.metadata),
      }
    : null;

export const serializeWithdrawal = (withdrawal: WithdrawalRecord | null) =>
  withdrawal
    ? {
        ...withdrawal,
        payoutMethodId: withdrawal.payoutMethodId,
        bankCardId: withdrawal.payoutMethodId ?? null,
        metadata: toRecord(withdrawal.metadata),
      }
    : null;

export const mapCryptoWithdrawAddressView = (
  payoutMethod: typeof payoutMethods.$inferSelect,
  address: CryptoWithdrawAddressRecord
) => ({
  id: payoutMethod.id,
  payoutMethodId: payoutMethod.id,
  userId: payoutMethod.userId,
  methodType: payoutMethod.methodType,
  channelType: payoutMethod.channelType,
  assetType: payoutMethod.assetType,
  assetCode: payoutMethod.assetCode,
  network: payoutMethod.network,
  displayName: payoutMethod.displayName,
  isDefault: payoutMethod.isDefault,
  status: payoutMethod.status,
  metadata: toRecord(payoutMethod.metadata),
  chain: address.chain,
  token: address.token,
  address: address.address,
  label: address.label,
  createdAt: payoutMethod.createdAt,
  updatedAt: payoutMethod.updatedAt,
});

export const readCryptoChannelId = (metadata: unknown) => {
  const cryptoMetadata = toRecord(Reflect.get(toRecord(metadata) ?? {}, 'crypto'));
  const value = Reflect.get(cryptoMetadata ?? {}, 'channelId');
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const readCryptoProcessingChannel = (
  value: string | null | undefined
) => optionalString(value, 64) ?? MANUAL_CRYPTO_CHANNEL;

export const readSettlementReference = (
  review: CryptoReviewPayload,
  fallbackTxHash: string | null
) => optionalString(review.settlementReference, 128) ?? fallbackTxHash;

export const readExactAmount = (
  review: CryptoReviewPayload,
  fallbackAmount: string | number
) => {
  if (review.actualAmount === null || review.actualAmount === undefined) {
    return parseTokenAmount(String(fallbackAmount), 'Actual amount');
  }

  return parseTokenAmount(review.actualAmount, 'Actual amount');
};

const getDepositById = async (depositId: number) => {
  const [deposit] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);

  return serializeDeposit(deposit ?? null);
};

const getWithdrawalById = async (withdrawalId: number) => {
  const [withdrawal] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawalId))
    .limit(1);

  return serializeWithdrawal(withdrawal ?? null);
};

const getCryptoDepositChannelById = async (
  tx: DbTransaction,
  channelId: number,
  activeOnly: boolean
) => {
  const [channel] = await tx
    .select()
    .from(cryptoDepositChannels)
    .where(
      activeOnly
        ? and(
            eq(cryptoDepositChannels.id, channelId),
            eq(cryptoDepositChannels.isActive, true)
          )
        : eq(cryptoDepositChannels.id, channelId)
    )
    .limit(1);

  return channel ?? null;
};

const getCryptoTransactionByHash = async (tx: DbTransaction, txHash: string) => {
  const [transaction] = await tx
    .select()
    .from(cryptoChainTransactions)
    .where(eq(cryptoChainTransactions.txHash, txHash))
    .limit(1);

  return transaction ?? null;
};

const getCryptoDepositTransaction = async (tx: DbTransaction, depositId: number) => {
  const [transaction] = await tx
    .select()
    .from(cryptoChainTransactions)
    .where(eq(cryptoChainTransactions.consumedByDepositId, depositId))
    .limit(1);

  return transaction ?? null;
};

const getCryptoWithdrawalTransaction = async (
  tx: DbTransaction,
  withdrawalId: number
) => {
  const [transaction] = await tx
    .select()
    .from(cryptoChainTransactions)
    .where(eq(cryptoChainTransactions.consumedByWithdrawalId, withdrawalId))
    .limit(1);

  return transaction ?? null;
};

const updateCryptoTransaction = async (
  tx: DbTransaction,
  transactionId: number,
  values: Partial<typeof cryptoChainTransactions.$inferInsert>
) => {
  const [updated] = await tx
    .update(cryptoChainTransactions)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(cryptoChainTransactions.id, transactionId))
    .returning();

  return updated ?? null;
};

const insertCryptoReviewEvent = async (
  tx: DbTransaction,
  payload: {
    targetType: 'deposit' | 'withdrawal' | 'deposit_channel';
    targetId: number;
    action: string;
    reviewerAdminId?: number | null;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) =>
  tx.insert(cryptoReviewEvents).values({
    targetType: payload.targetType,
    targetId: payload.targetId,
    action: payload.action,
    reviewerAdminId: payload.reviewerAdminId ?? null,
    note: payload.note ?? null,
    metadata: payload.metadata ?? null,
  });

const updateWithdrawalSubmittedTxHash = async (
  tx: DbTransaction,
  withdrawalId: number,
  txHash: string
) => {
  await tx
    .update(withdrawals)
    .set({ submittedTxHash: txHash, updatedAt: new Date() })
    .where(eq(withdrawals.id, withdrawalId));
};

export async function listCryptoDepositChannels(activeOnly = true) {
  const query = db
    .select()
    .from(cryptoDepositChannels)
    .orderBy(desc(cryptoDepositChannels.id));

  const rows = activeOnly
    ? await query.where(eq(cryptoDepositChannels.isActive, true))
    : await query;

  return rows;
}

export async function createCryptoDepositChannel(payload: {
  providerId?: number | null;
  chain: string;
  network: string;
  token: string;
  receiveAddress: string;
  qrCodeUrl?: string | null;
  memoRequired?: boolean;
  memoValue?: string | null;
  minConfirmations?: number | null;
  isActive?: boolean;
}) {
  const [created] = await db
    .insert(cryptoDepositChannels)
    .values({
      providerId: payload.providerId ?? null,
      chain: requireString(payload.chain, 'Chain', 64),
      network: requireString(payload.network, 'Network', 64),
      token: requireString(payload.token, 'Token', 64).toUpperCase(),
      receiveAddress: requireString(payload.receiveAddress, 'Receive address', 191),
      qrCodeUrl: optionalString(payload.qrCodeUrl, 2048),
      memoRequired: payload.memoRequired === true,
      memoValue: optionalString(payload.memoValue, 191),
      minConfirmations: payload.minConfirmations && payload.minConfirmations > 0
        ? Math.trunc(payload.minConfirmations)
        : 1,
      isActive: payload.isActive ?? true,
    })
    .returning();

  if (!created) {
    throw persistenceError('Failed to create crypto deposit channel.');
  }

  await db.transaction(async (tx) => {
    await insertCryptoReviewEvent(tx, {
      targetType: 'deposit_channel',
      targetId: created.id,
      action: 'deposit_channel_created',
      metadata: {
        chain: created.chain,
        network: created.network,
        token: created.token,
      },
    });
  });

  return created;
}

export async function listCryptoWithdrawAddresses(userId: number) {
  const rows = await db
    .select({
      payoutMethod: payoutMethods,
      address: cryptoWithdrawAddresses,
    })
    .from(payoutMethods)
    .innerJoin(
      cryptoWithdrawAddresses,
      eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethods.id)
    )
    .where(
      and(
        eq(payoutMethods.userId, userId),
        eq(payoutMethods.methodType, 'crypto_address')
      )
    )
    .orderBy(desc(payoutMethods.id));

  return rows.map((row) => mapCryptoWithdrawAddressView(row.payoutMethod, row.address));
}

export async function createCryptoWithdrawAddress(payload: {
  userId: number;
  chain: string;
  network: string;
  token: string;
  address: string;
  label?: string | null;
  isDefault?: boolean;
  metadata?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: payoutMethods.id })
      .from(payoutMethods)
      .where(
        and(
          eq(payoutMethods.userId, payload.userId),
          eq(payoutMethods.methodType, 'crypto_address')
        )
      )
      .limit(1);

    const shouldBeDefault = Boolean(payload.isDefault) || existing.length === 0;
    if (shouldBeDefault) {
      await tx
        .update(payoutMethods)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(payoutMethods.userId, payload.userId),
            eq(payoutMethods.methodType, 'crypto_address')
          )
        );
    }

    const normalizedChain = requireString(payload.chain, 'Chain', 64);
    const normalizedNetwork = requireString(payload.network, 'Network', 64);
    const normalizedToken = requireString(payload.token, 'Token', 64).toUpperCase();
    const normalizedAddress = requireString(payload.address, 'Address', 191);
    const label = optionalString(payload.label, 120);

    const [payoutMethod] = await tx
      .insert(payoutMethods)
      .values({
        userId: payload.userId,
        methodType: 'crypto_address',
        channelType: 'crypto',
        assetType: 'token',
        assetCode: normalizedToken,
        network: normalizedNetwork,
        displayName: label ?? `${normalizedToken} ${normalizedAddress.slice(0, 10)}...`,
        isDefault: shouldBeDefault,
        status: 'active',
        metadata: mergeMetadata(payload.metadata, 'crypto', {
          chain: normalizedChain,
          network: normalizedNetwork,
          token: normalizedToken,
          address: normalizedAddress,
        }),
      })
      .returning();

    if (!payoutMethod) {
      throw persistenceError('Failed to create crypto payout method.');
    }

    const [address] = await tx
      .insert(cryptoWithdrawAddresses)
      .values({
        payoutMethodId: payoutMethod.id,
        chain: normalizedChain,
        network: normalizedNetwork,
        token: normalizedToken,
        address: normalizedAddress,
        label,
      })
      .returning();

    if (!address) {
      throw persistenceError('Failed to create crypto withdrawal address.');
    }

    return mapCryptoWithdrawAddressView(payoutMethod, address);
  });
}

export async function setDefaultCryptoWithdrawAddress(
  userId: number,
  payoutMethodId: number
) {
  return db.transaction(async (tx) => {
    await tx
      .update(payoutMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(payoutMethods.userId, userId),
          eq(payoutMethods.methodType, 'crypto_address')
        )
      );

    const [payoutMethod] = await tx
      .update(payoutMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(payoutMethods.id, payoutMethodId),
          eq(payoutMethods.userId, userId),
          eq(payoutMethods.methodType, 'crypto_address')
        )
      )
      .returning();

    if (!payoutMethod) {
      return null;
    }

    const [address] = await tx
      .select()
      .from(cryptoWithdrawAddresses)
      .where(eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethod.id))
      .limit(1);

    if (!address) {
      throw persistenceError('Crypto withdrawal address not found.');
    }

    return mapCryptoWithdrawAddressView(payoutMethod, address);
  });
}

export async function createCryptoDeposit(payload: {
  userId: number;
  channelId: number;
  amountClaimed: string | number;
  txHash: string;
  fromAddress?: string | null;
  screenshotUrl?: string | null;
  memo?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await screenUserFirstDeposit(payload.userId, payload.metadata ?? null);

  return db.transaction(async (tx) => {
    const paymentConfig = await getPaymentConfig(tx);
    if (!paymentConfig.depositEnabled) {
      throw serviceUnavailableError('Deposits are currently disabled.');
    }

    const channel = await getCryptoDepositChannelById(tx, payload.channelId, true);
    if (!channel) {
      throw notFoundError('Crypto deposit channel not found.');
    }

    const txHash = requireString(payload.txHash, 'Transaction hash', 191);
    const existingDepositTx = await tx
      .select({
        id: deposits.id,
      })
      .from(deposits)
      .where(eq(deposits.submittedTxHash, txHash))
      .limit(1);

    if (existingDepositTx.length > 0) {
      throw conflictError('Transaction hash has already been claimed.');
    }

    const existingChainTx = await getCryptoTransactionByHash(tx, txHash);
    if (
      existingChainTx &&
      (existingChainTx.consumedByDepositId !== null ||
        existingChainTx.consumedByWithdrawalId !== null)
    ) {
      throw conflictError('Transaction hash has already been claimed.');
    }

    const amount = parseTokenAmount(payload.amountClaimed, 'Claimed amount');
    const capability = getPaymentCapabilitySummary();
    const processing = await resolvePaymentProcessingContext(tx, 'deposit', {
      userId: payload.userId,
      amount: amount.walletAmount,
      channelType: 'crypto',
      assetType: 'token',
      assetCode: channel.token,
      network: channel.network,
      metadata: payload.metadata ?? null,
    });
    const processingMetadata = withPaymentProcessingMetadata(payload.metadata ?? null, {
      flow: 'deposit',
      processingMode: processing.mode,
      manualFallbackRequired: processing.manualFallbackRequired,
      manualFallbackReason: processing.manualFallbackReason,
      paymentProviderId: channel.providerId ?? processing.providerId,
      paymentOperatingMode: capability.operatingMode,
      paymentAutomationRequested: capability.automatedExecutionRequested,
      paymentAutomationReady: capability.automatedExecutionReady,
      paymentAdapterKey: processing.adapterKey,
      paymentAdapterRegistered: processing.adapterRegistered,
    });
    const metadata = appendFinanceStateMetadata(
      mergeMetadata(processingMetadata, 'crypto', {
        direction: 'deposit',
        reviewState: 'submitted',
        channelId: channel.id,
        chain: channel.chain,
        network: channel.network,
        token: channel.token,
        receiveAddress: channel.receiveAddress,
        memoRequired: channel.memoRequired,
        memoValue: channel.memoValue,
        txHash,
        fromAddress: optionalString(payload.fromAddress, 191),
        amountClaimed: amount.preciseAmount,
        screenshotUrl: optionalString(payload.screenshotUrl, 2048),
        memo: optionalString(payload.memo, 191),
      }),
      {
        flow: 'deposit',
        status: 'requested',
        providerStatus: null,
        settlementStatus: null,
      }
    );

    const [deposit] = await tx
      .insert(deposits)
      .values({
        userId: payload.userId,
        providerId: channel.providerId ?? processing.providerId,
        amount: amount.walletAmount,
        channelType: 'crypto',
        assetType: 'token',
        assetCode: channel.token,
        network: channel.network,
        status: 'requested',
        submittedTxHash: txHash,
        metadata,
      })
      .returning();

    if (!deposit) {
      throw persistenceError('Failed to create crypto deposit.');
    }

    if (existingChainTx) {
      await updateCryptoTransaction(tx, existingChainTx.id, {
        direction: 'deposit',
        chain: channel.chain,
        network: channel.network,
        token: channel.token,
        fromAddress: optionalString(payload.fromAddress, 191),
        toAddress: channel.receiveAddress,
        amount: amount.preciseAmount,
        confirmations: existingChainTx.confirmations ?? 0,
        consumedByDepositId: deposit.id,
        consumedByWithdrawalId: null,
        rawPayload: {
          ...(toRecord(existingChainTx.rawPayload) ?? {}),
          claim: {
            screenshotUrl: optionalString(payload.screenshotUrl, 2048),
            memo: optionalString(payload.memo, 191),
            submittedAt: new Date().toISOString(),
          },
        },
      });
    } else {
      await tx.insert(cryptoChainTransactions).values({
        txHash,
        direction: 'deposit',
        chain: channel.chain,
        network: channel.network,
        token: channel.token,
        fromAddress: optionalString(payload.fromAddress, 191),
        toAddress: channel.receiveAddress,
        amount: amount.preciseAmount,
        confirmations: 0,
        rawPayload: {
          claim: {
            screenshotUrl: optionalString(payload.screenshotUrl, 2048),
            memo: optionalString(payload.memo, 191),
            submittedAt: new Date().toISOString(),
          },
        },
        consumedByDepositId: deposit.id,
      });
    }

    await insertCryptoReviewEvent(tx, {
      targetType: 'deposit',
      targetId: deposit.id,
      action: 'deposit_submitted',
      metadata: {
        txHash,
        channelId: channel.id,
        amountClaimed: amount.preciseAmount,
      },
    });

    return serializeDeposit(deposit);
  });
}

export async function createCryptoWithdrawal(payload: {
  userId: number;
  amount: string;
  payoutMethodId: number;
  metadata?: Record<string, unknown> | null;
  requestContext?: {
    ip?: string | null;
    userAgent?: string | null;
    sessionId?: string | null;
  };
}) {
  return createWithdrawal({
    userId: payload.userId,
    amount: payload.amount,
    payoutMethodId: payload.payoutMethodId,
    metadata: payload.metadata,
    requestContext: payload.requestContext,
  });
}

export async function confirmCryptoDeposit(
  depositId: number,
  review: CryptoReviewPayload = {}
) {
  const deposit = await getDepositById(depositId);
  if (!deposit) {
    return null;
  }
  if (deposit.channelType !== 'crypto') {
    throw conflictError('Deposit is not a crypto deposit.');
  }

  const processingChannel = readCryptoProcessingChannel(review.processingChannel);
  const txHashFallback = optionalString(deposit.submittedTxHash, 191);
  const settlementReference = readSettlementReference(review, txHashFallback);
  if (!settlementReference) {
    throw unprocessableEntityError('Transaction hash is required.');
  }

  await db.transaction(async (tx) => {
    const transaction =
      (await getCryptoDepositTransaction(tx, depositId)) ??
      (await getCryptoTransactionByHash(tx, settlementReference));

    if (!transaction) {
      throw notFoundError('Crypto chain transaction not found.');
    }

    const channelId = readCryptoChannelId(deposit.metadata);
    let minConfirmations = 1;
    if (channelId) {
      const channel = await getCryptoDepositChannelById(tx, channelId, false);
      minConfirmations = channel?.minConfirmations ?? 1;
    }

    const confirmations =
      parseOptionalPositiveInteger(review.confirmations) ?? transaction.confirmations ?? 0;
    if (confirmations < minConfirmations) {
      throw conflictError(
        `At least ${minConfirmations} confirmations are required before crediting this deposit.`
      );
    }

    await updateCryptoTransaction(tx, transaction.id, {
      txHash: settlementReference,
      confirmations,
      fromAddress: optionalString(review.fromAddress, 191) ?? transaction.fromAddress,
      toAddress: optionalString(review.toAddress, 191) ?? transaction.toAddress,
      rawPayload: {
        ...(toRecord(transaction.rawPayload) ?? {}),
        review: {
          action: 'deposit_confirmed',
          reviewerAdminId: review.adminId ?? null,
          confirmedAt: new Date().toISOString(),
          operatorNote: optionalString(review.operatorNote, 500),
          processingChannel,
        },
      },
    });

    await insertCryptoReviewEvent(tx, {
      targetType: 'deposit',
      targetId: depositId,
      action: 'deposit_confirmed_onchain',
      reviewerAdminId: review.adminId ?? null,
      note: optionalString(review.operatorNote, 500),
      metadata: {
        txHash: settlementReference,
        confirmations,
        processingChannel,
      },
    });
  });

  let current = await markDepositProviderPending(depositId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_deposit_under_review',
    processingChannel,
  });
  if (!current) {
    return null;
  }

  current = await markDepositProviderSucceeded(depositId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_deposit_confirmed_onchain',
    processingChannel,
    settlementReference,
  });
  if (!current) {
    return null;
  }

  current = await creditDeposit(depositId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_deposit_credited',
    processingChannel,
    settlementReference,
  });

  return current;
}

export async function rejectCryptoDeposit(
  depositId: number,
  review: CryptoReviewPayload = {}
) {
  const deposit = await getDepositById(depositId);
  if (!deposit) {
    return null;
  }
  if (deposit.channelType !== 'crypto') {
    throw conflictError('Deposit is not a crypto deposit.');
  }

  const processingChannel = readCryptoProcessingChannel(review.processingChannel);
  const operatorNote = requireString(review.operatorNote, 'Operator note', 500);

  await db.transaction(async (tx) => {
    const transaction = await getCryptoDepositTransaction(tx, depositId);
    if (transaction) {
      await updateCryptoTransaction(tx, transaction.id, {
        rawPayload: {
          ...(toRecord(transaction.rawPayload) ?? {}),
          review: {
            action: 'deposit_rejected',
            reviewerAdminId: review.adminId ?? null,
            rejectedAt: new Date().toISOString(),
            operatorNote,
            processingChannel,
          },
        },
      });
    }

    await insertCryptoReviewEvent(tx, {
      targetType: 'deposit',
      targetId: depositId,
      action: 'deposit_rejected',
      reviewerAdminId: review.adminId ?? null,
      note: operatorNote,
      metadata: {
        txHash: optionalString(deposit.submittedTxHash, 191),
        processingChannel,
      },
    });
  });

  return failDeposit(depositId, {
    adminId: review.adminId ?? null,
    operatorNote,
    processingChannel,
  });
}

export async function submitCryptoWithdrawal(
  withdrawalId: number,
  review: CryptoReviewPayload = {}
) {
  const withdrawal = await getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return null;
  }
  if (withdrawal.channelType !== 'crypto') {
    throw conflictError('Withdrawal is not a crypto withdrawal.');
  }

  const processingChannel = readCryptoProcessingChannel(review.processingChannel);
  const txHash = readSettlementReference(
    review,
    optionalString(withdrawal.submittedTxHash, 191)
  );
  if (!txHash) {
    throw unprocessableEntityError('Transaction hash is required.');
  }

  await db.transaction(async (tx) => {
    const exactAmount = readExactAmount(review, withdrawal.amount);
    const [address] = await tx
      .select({
        chain: cryptoWithdrawAddresses.chain,
        network: cryptoWithdrawAddresses.network,
        token: cryptoWithdrawAddresses.token,
        address: cryptoWithdrawAddresses.address,
      })
      .from(cryptoWithdrawAddresses)
      .innerJoin(
        payoutMethods,
        eq(payoutMethods.id, cryptoWithdrawAddresses.payoutMethodId)
      )
      .where(eq(cryptoWithdrawAddresses.payoutMethodId, withdrawal.payoutMethodId ?? 0))
      .limit(1);

    if (!address) {
      throw notFoundError('Crypto withdrawal address not found.');
    }

    const existing = await getCryptoTransactionByHash(tx, txHash);
    const rawPayload = {
      ...(toRecord(existing?.rawPayload) ?? {}),
      submission: {
        action: 'withdrawal_submitted',
        reviewerAdminId: review.adminId ?? null,
        operatorNote: optionalString(review.operatorNote, 500),
        processingChannel,
        sentAt: toDateValue(review.sentAt)?.toISOString() ?? new Date().toISOString(),
        fee:
          review.fee === null || review.fee === undefined
            ? null
            : String(review.fee),
      },
    };

    if (existing) {
      if (
        existing.consumedByWithdrawalId !== null &&
        existing.consumedByWithdrawalId !== withdrawalId
      ) {
        throw conflictError('Transaction hash has already been assigned to another withdrawal.');
      }
      await updateCryptoTransaction(tx, existing.id, {
        direction: 'withdrawal',
        chain: address.chain,
        network: address.network,
        token: address.token,
        fromAddress: optionalString(review.fromAddress, 191) ?? existing.fromAddress,
        toAddress: optionalString(review.toAddress, 191) ?? address.address,
        amount: exactAmount.preciseAmount,
        confirmations: parseOptionalPositiveInteger(review.confirmations) ?? 0,
        consumedByWithdrawalId: withdrawalId,
        rawPayload,
      });
    } else {
      await tx.insert(cryptoChainTransactions).values({
        txHash,
        direction: 'withdrawal',
        chain: address.chain,
        network: address.network,
        token: address.token,
        fromAddress: optionalString(review.fromAddress, 191),
        toAddress: optionalString(review.toAddress, 191) ?? address.address,
        amount: exactAmount.preciseAmount,
        confirmations: parseOptionalPositiveInteger(review.confirmations) ?? 0,
        rawPayload,
        consumedByWithdrawalId: withdrawalId,
      });
    }

    await updateWithdrawalSubmittedTxHash(tx, withdrawalId, txHash);

    await insertCryptoReviewEvent(tx, {
      targetType: 'withdrawal',
      targetId: withdrawalId,
      action: 'withdrawal_submitted_onchain',
      reviewerAdminId: review.adminId ?? null,
      note: optionalString(review.operatorNote, 500),
      metadata: {
        txHash,
        processingChannel,
      },
    });
  });

  return markWithdrawalProviderSubmitted(withdrawalId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_withdrawal_submitted',
    processingChannel,
    settlementReference: txHash,
  });
}

export async function confirmCryptoWithdrawal(
  withdrawalId: number,
  review: CryptoReviewPayload = {}
) {
  const withdrawal = await getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return null;
  }
  if (withdrawal.channelType !== 'crypto') {
    throw conflictError('Withdrawal is not a crypto withdrawal.');
  }

  const processingChannel = readCryptoProcessingChannel(review.processingChannel);
  const txHash = readSettlementReference(
    review,
    optionalString(withdrawal.submittedTxHash, 191)
  );
  if (!txHash) {
    throw unprocessableEntityError('Transaction hash is required.');
  }

  const confirmations = parseOptionalPositiveInteger(review.confirmations);
  if (confirmations === null || confirmations < 1) {
    throw unprocessableEntityError('At least 1 confirmation is required.');
  }

  await db.transaction(async (tx) => {
    const transaction =
      (await getCryptoWithdrawalTransaction(tx, withdrawalId)) ??
      (await getCryptoTransactionByHash(tx, txHash));

    if (!transaction) {
      throw notFoundError('Crypto chain transaction not found.');
    }

    await updateCryptoTransaction(tx, transaction.id, {
      txHash,
      confirmations,
      rawPayload: {
        ...(toRecord(transaction.rawPayload) ?? {}),
        confirmation: {
          action: 'withdrawal_confirmed',
          reviewerAdminId: review.adminId ?? null,
          confirmedAt: new Date().toISOString(),
          operatorNote: optionalString(review.operatorNote, 500),
          processingChannel,
        },
      },
    });

    await updateWithdrawalSubmittedTxHash(tx, withdrawalId, txHash);

    await insertCryptoReviewEvent(tx, {
      targetType: 'withdrawal',
      targetId: withdrawalId,
      action: 'withdrawal_confirmed_onchain',
      reviewerAdminId: review.adminId ?? null,
      note: optionalString(review.operatorNote, 500),
      metadata: {
        txHash,
        confirmations,
        processingChannel,
      },
    });
  });

  let current = await markWithdrawalProviderSubmitted(withdrawalId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_withdrawal_submitted',
    processingChannel,
    settlementReference: txHash,
  });
  if (!current) {
    return null;
  }

  current = await markWithdrawalProviderProcessing(withdrawalId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_withdrawal_confirming',
    processingChannel,
    settlementReference: txHash,
  });
  if (!current) {
    return null;
  }

  current = await payWithdrawal(withdrawalId, {
    adminId: review.adminId ?? null,
    operatorNote:
      optionalString(review.operatorNote, 500) ?? 'crypto_withdrawal_paid',
    processingChannel,
    settlementReference: txHash,
  });

  return current;
}
