import { createHash } from 'node:crypto';

import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  deposits,
  paymentOutboundRequests,
  withdrawals,
} from '@reward/database';
import { and, eq, lte, sql } from '@reward/database/orm';
import { client, db, type DbClient, type DbTransaction } from '../../../db';
import { getConfigView } from '../../../shared/config';
import {
  conflictError,
  notFoundError,
  serviceUnavailableError,
} from '../../../shared/errors';
import { logger } from '../../../shared/logger';
import { recordPaymentOutboundIdempotencyConflict } from '../../../shared/observability';
import { classifyStripeApiFailure } from '../../../shared/stripe-observability';
import { captureMessage } from '../../../shared/telemetry';
import type { PaymentAdapterCreateOrderResult } from '../adapters';
import {
  listActiveProviders,
  resolveRegisteredAdapter,
  type PaymentFlow,
  type PreparedPaymentProvider,
} from '../service';

type DbExecutor = DbClient | DbTransaction;

type PaymentOutboundSendStatus =
  | 'prepared'
  | 'sending'
  | 'sent'
  | 'unknown'
  | 'failed';

type PaymentOutboundRequestRow = typeof paymentOutboundRequests.$inferSelect;

type ClaimedPaymentOutboundRequest = {
  id: number;
  orderType: 'deposit' | 'withdrawal';
  orderId: number;
  providerId: number;
  action: string;
  idempotencyKey: string;
  requestPayload: unknown;
  requestPayloadHash: string;
  sendStatus: PaymentOutboundSendStatus;
  attemptCount: number;
  firstSentAt: Date | null;
  lastSentAt: Date | null;
  nextRetryAt: Date | null;
  lockedAt: Date | null;
  responseHttpStatus: number | null;
  providerOrderId: string | null;
  responsePayload: unknown;
  lastErrorCode: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DepositOrderSnapshot = {
  flow: 'deposit';
  id: number;
  userId: number;
  providerId: number | null;
  amount: string;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
};

type WithdrawalOrderSnapshot = {
  flow: 'withdrawal';
  id: number;
  userId: number;
  providerId: number | null;
  payoutMethodId: number | null;
  amount: string;
  metadata: Record<string, unknown> | null;
};

type PaymentOrderSnapshot = DepositOrderSnapshot | WithdrawalOrderSnapshot;

const config = getConfigView();

let enqueueHook: (() => void) | null = null;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
};

const hashRequestPayload = (payload: unknown) =>
  createHash('sha256').update(stableStringify(payload)).digest('hex');

const loadPreparedProvider = async (dbExecutor: DbExecutor, providerId: number) => {
  const providers = await listActiveProviders(dbExecutor);
  return providers.find((provider) => provider.id === providerId) ?? null;
};

const loadOrderSnapshot = async (
  dbExecutor: DbExecutor,
  orderType: 'deposit' | 'withdrawal',
  orderId: number
): Promise<PaymentOrderSnapshot | null> => {
  if (orderType === 'deposit') {
    const [row] = await dbExecutor
      .select({
        id: deposits.id,
        userId: deposits.userId,
        providerId: deposits.providerId,
        amount: deposits.amount,
        referenceId: deposits.referenceId,
        metadata: deposits.metadata,
      })
      .from(deposits)
      .where(eq(deposits.id, orderId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      flow: 'deposit',
      id: row.id,
      userId: row.userId,
      providerId: row.providerId,
      amount: row.amount,
      referenceId: row.referenceId ?? null,
      metadata: row.metadata ? toRecord(row.metadata) : null,
    };
  }

  const [row] = await dbExecutor
    .select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      providerId: withdrawals.providerId,
      payoutMethodId: withdrawals.payoutMethodId,
      amount: withdrawals.amount,
      metadata: withdrawals.metadata,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, orderId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    flow: 'withdrawal',
    id: row.id,
    userId: row.userId,
    providerId: row.providerId,
    payoutMethodId: row.payoutMethodId ?? null,
    amount: row.amount,
    metadata: row.metadata ? toRecord(row.metadata) : null,
  };
};

const loadExistingOutboundRequest = async (
  dbExecutor: DbExecutor,
  orderType: 'deposit' | 'withdrawal',
  orderId: number,
  action: string
) => {
  const [existing] = await dbExecutor
    .select()
    .from(paymentOutboundRequests)
    .where(
      and(
        eq(paymentOutboundRequests.orderType, orderType),
        eq(paymentOutboundRequests.orderId, orderId),
        eq(paymentOutboundRequests.action, action)
      )
    )
    .limit(1);

  return existing ?? null;
};

const buildSystemSettlementReference = (
  adapterKey: string,
  orderType: 'deposit' | 'withdrawal',
  orderId: number,
  providerOrderId: string | null | undefined
) => providerOrderId ?? `payment-outbound:${adapterKey}:${orderType}:${orderId}`;

const updateDepositProviderResponse = async (params: {
  depositId: number;
  providerOrderId?: string | null;
  redirectUrl?: string | null;
  adapterKey: string;
  rawStatus?: string | null;
}) => {
  const [row] = await db
    .select({
      providerOrderId: deposits.providerOrderId,
      metadata: deposits.metadata,
    })
    .from(deposits)
    .where(eq(deposits.id, params.depositId))
    .limit(1);

  if (!row) {
    return;
  }

  const nextProviderOrderId = params.providerOrderId ?? row.providerOrderId ?? null;
  const metadata = {
    ...toRecord(row.metadata),
    providerOrderId: nextProviderOrderId,
    paymentAdapterKey: params.adapterKey,
    paymentOutboundLastStatus: params.rawStatus ?? null,
    ...(params.redirectUrl ? { paymentRedirectUrl: params.redirectUrl } : {}),
  };

  await db
    .update(deposits)
    .set({
      providerOrderId: nextProviderOrderId,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(deposits.id, params.depositId));
};

const updateWithdrawalProviderResponse = async (params: {
  withdrawalId: number;
  providerOrderId?: string | null;
  adapterKey: string;
  rawStatus?: string | null;
}) => {
  const [row] = await db
    .select({
      providerOrderId: withdrawals.providerOrderId,
      metadata: withdrawals.metadata,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, params.withdrawalId))
    .limit(1);

  if (!row) {
    return;
  }

  const nextProviderOrderId = params.providerOrderId ?? row.providerOrderId ?? null;
  const metadata = {
    ...toRecord(row.metadata),
    providerOrderId: nextProviderOrderId,
    paymentAdapterKey: params.adapterKey,
    paymentOutboundLastStatus: params.rawStatus ?? null,
  };

  await db
    .update(withdrawals)
    .set({
      providerOrderId: nextProviderOrderId,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(withdrawals.id, params.withdrawalId));
};

const syncDepositOrderAfterOutboundSend = async (params: {
  order: DepositOrderSnapshot;
  adapterKey: string;
  result: PaymentAdapterCreateOrderResult;
}) => {
  await updateDepositProviderResponse({
    depositId: params.order.id,
    providerOrderId: params.result.providerOrderId,
    redirectUrl: params.result.redirectUrl ?? null,
    adapterKey: params.adapterKey,
    rawStatus: params.result.rawStatus ?? null,
  });

  const review = {
    adminId: null,
    operatorNote: `payment_outbound:${params.adapterKey}:${params.order.id}`,
    processingChannel: params.adapterKey,
  };

  switch (params.result.status) {
    case 'success':
    case 'paid': {
      const { markDepositProviderSucceeded } = await import('../../top-up');
      await markDepositProviderSucceeded(params.order.id, {
        ...review,
        settlementReference: buildSystemSettlementReference(
          params.adapterKey,
          'deposit',
          params.order.id,
          params.result.providerOrderId
        ),
      });
      return;
    }
    case 'failed':
    case 'rejected': {
      const { markDepositProviderFailed } = await import('../../top-up');
      await markDepositProviderFailed(params.order.id, review);
      return;
    }
    case 'pending':
    case 'processing':
    case 'approved':
    default: {
      const { markDepositProviderPending } = await import('../../top-up');
      await markDepositProviderPending(params.order.id, review);
    }
  }
};

const syncWithdrawalOrderAfterOutboundSend = async (params: {
  order: WithdrawalOrderSnapshot;
  adapterKey: string;
  result: PaymentAdapterCreateOrderResult;
}) => {
  await updateWithdrawalProviderResponse({
    withdrawalId: params.order.id,
    providerOrderId: params.result.providerOrderId,
    adapterKey: params.adapterKey,
    rawStatus: params.result.rawStatus ?? null,
  });

  const review = {
    adminId: null,
    operatorNote: `payment_outbound:${params.adapterKey}:${params.order.id}`,
    processingChannel: params.adapterKey,
    settlementReference: buildSystemSettlementReference(
      params.adapterKey,
      'withdrawal',
      params.order.id,
      params.result.providerOrderId
    ),
  };

  switch (params.result.status) {
    case 'success':
    case 'paid': {
      const { markWithdrawalProviderSubmitted, markWithdrawalProviderProcessing, payWithdrawal } =
        await import('../../withdraw/service');
      await markWithdrawalProviderSubmitted(params.order.id, review);
      await markWithdrawalProviderProcessing(params.order.id, review);
      await payWithdrawal(params.order.id, review);
      return;
    }
    case 'processing': {
      const { markWithdrawalProviderSubmitted, markWithdrawalProviderProcessing } =
        await import('../../withdraw/service');
      await markWithdrawalProviderSubmitted(params.order.id, review);
      await markWithdrawalProviderProcessing(params.order.id, review);
      return;
    }
    case 'failed':
    case 'rejected': {
      const { markWithdrawalProviderFailed } = await import(
        '../../withdraw/service'
      );
      await markWithdrawalProviderFailed(params.order.id, review);
      return;
    }
    case 'pending':
    case 'approved':
    default: {
      const { markWithdrawalProviderSubmitted } = await import(
        '../../withdraw/service'
      );
      await markWithdrawalProviderSubmitted(params.order.id, review);
    }
  }
};

const markOutboundRequestSent = async (
  id: number,
  payload: {
    responseHttpStatus?: number | null;
    providerOrderId?: string | null;
    responsePayload?: Record<string, unknown> | null;
  }
) => {
  await db
    .update(paymentOutboundRequests)
    .set({
      sendStatus: 'sent',
      firstSentAt: sql`coalesce(${paymentOutboundRequests.firstSentAt}, now())`,
      lastSentAt: new Date(),
      nextRetryAt: null,
      lockedAt: null,
      responseHttpStatus: payload.responseHttpStatus ?? null,
      providerOrderId: payload.providerOrderId ?? null,
      responsePayload: payload.responsePayload ?? null,
      lastErrorCode: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(paymentOutboundRequests.id, id));
};

const markOutboundRequestUnknown = async (
  id: number,
  payload: {
    errorCode: string;
    errorMessage: string;
  }
) => {
  await db
    .update(paymentOutboundRequests)
    .set({
      sendStatus: 'unknown',
      firstSentAt: sql`coalesce(${paymentOutboundRequests.firstSentAt}, now())`,
      lastSentAt: new Date(),
      nextRetryAt: new Date(Date.now() + config.paymentOutboundUnknownRetryDelayMs),
      lockedAt: null,
      lastErrorCode: payload.errorCode,
      lastError: payload.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(paymentOutboundRequests.id, id));
};

const markOutboundRequestFailed = async (
  id: number,
  payload: {
    errorCode: string;
    errorMessage: string;
    retryable?: boolean;
  }
) => {
  await db
    .update(paymentOutboundRequests)
    .set({
      sendStatus: payload.retryable ? 'unknown' : 'failed',
      firstSentAt: sql`coalesce(${paymentOutboundRequests.firstSentAt}, now())`,
      lastSentAt: new Date(),
      nextRetryAt: payload.retryable
        ? new Date(Date.now() + config.paymentOutboundUnknownRetryDelayMs)
        : null,
      lockedAt: null,
      lastErrorCode: payload.errorCode,
      lastError: payload.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(paymentOutboundRequests.id, id));
};

const isUnknownDeliveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
};

const dispatchOutboundRequest = async (
  row: ClaimedPaymentOutboundRequest,
  provider: PreparedPaymentProvider,
  order: PaymentOrderSnapshot
) => {
  const adapter = resolveRegisteredAdapter(provider);
  if (!adapter) {
    await markOutboundRequestFailed(row.id, {
      errorCode: 'adapter_not_configured',
      errorMessage: `No adapter is configured for provider ${provider.name}.`,
    });
    return;
  }

  if (!adapter.supportsAutomation) {
    await markOutboundRequestFailed(row.id, {
      errorCode: 'adapter_automation_not_supported',
      errorMessage: `Adapter ${adapter.key} does not support outbound automated execution.`,
    });
    return;
  }

  if (order.flow === 'deposit') {
    const result = await adapter.createDepositOrder({
      providerId: provider.id,
      providerName: provider.name,
      flow: 'deposit',
      config: provider.parsedConfig,
      internalOrderId: order.id,
      userId: order.userId,
      amount: order.amount,
      idempotencyKey: row.idempotencyKey,
      referenceId: order.referenceId,
      metadata: order.metadata,
    });
    await syncDepositOrderAfterOutboundSend({
      order,
      adapterKey: adapter.key,
      result,
    });
    await markOutboundRequestSent(row.id, {
      responseHttpStatus: 200,
      providerOrderId: result.providerOrderId,
      responsePayload: {
        status: result.status,
        rawStatus: result.rawStatus ?? null,
        redirectUrl: result.redirectUrl ?? null,
        metadata: result.metadata ?? null,
      },
    });
    return;
  }

  const result = await adapter.createWithdrawal({
    providerId: provider.id,
    providerName: provider.name,
    flow: 'withdrawal',
    config: provider.parsedConfig,
    internalOrderId: order.id,
    userId: order.userId,
    amount: order.amount,
    idempotencyKey: row.idempotencyKey,
    payoutMethodId: order.payoutMethodId,
    metadata: order.metadata,
  });
  await syncWithdrawalOrderAfterOutboundSend({
    order,
    adapterKey: adapter.key,
    result,
  });
  await markOutboundRequestSent(row.id, {
    responseHttpStatus: 200,
    providerOrderId: result.providerOrderId,
    responsePayload: {
      status: result.status,
      rawStatus: result.rawStatus ?? null,
      redirectUrl: result.redirectUrl ?? null,
      metadata: result.metadata ?? null,
    },
  });
};

const claimDuePaymentOutboundRequests = async (limit: number) => {
  const rows = await client<ClaimedPaymentOutboundRequest[]>`
    with due as (
      select id
      from payment_outbound_requests
      where send_status in ('prepared', 'unknown')
        and (
          next_retry_at is null
          or next_retry_at <= now()
        )
      order by created_at asc, id asc
      limit ${limit}
      for update skip locked
    )
    update payment_outbound_requests as r
    set send_status = 'sending',
        attempt_count = r.attempt_count + 1,
        locked_at = now(),
        updated_at = now()
    from due
    where r.id = due.id
    returning
      r.id,
      r.order_type as "orderType",
      r.order_id as "orderId",
      r.provider_id as "providerId",
      r.action,
      r.idempotency_key as "idempotencyKey",
      r.request_payload as "requestPayload",
      r.request_payload_hash as "requestPayloadHash",
      r.send_status as "sendStatus",
      r.attempt_count as "attemptCount",
      r.first_sent_at as "firstSentAt",
      r.last_sent_at as "lastSentAt",
      r.next_retry_at as "nextRetryAt",
      r.locked_at as "lockedAt",
      r.response_http_status as "responseHttpStatus",
      r.provider_order_id as "providerOrderId",
      r.response_payload as "responsePayload",
      r.last_error_code as "lastErrorCode",
      r.last_error as "lastError",
      r.created_at as "createdAt",
      r.updated_at as "updatedAt"
  `;

  return rows;
};

export async function preparePaymentOutboundRequest(input: {
  orderType: 'deposit' | 'withdrawal';
  orderId: number;
  providerId: number;
  flow: PaymentFlow;
  action: string;
  operation: string;
  requestPayload: Record<string, unknown>;
}, dbExecutor: DbExecutor = db) {
  const provider = await loadPreparedProvider(dbExecutor, input.providerId);
  if (!provider) {
    throw notFoundError(`Active payment provider ${input.providerId} was not found.`, {
      code: API_ERROR_CODES.ACTIVE_PAYMENT_PROVIDER_NOT_FOUND,
    });
  }

  const adapter = resolveRegisteredAdapter(provider);
  if (!adapter) {
    throw serviceUnavailableError(
      `Payment provider ${provider.name} does not have a configured adapter.`
    );
  }

  const idempotencyKey = adapter.buildIdempotencyKey({
    flow: input.flow,
    internalOrderId: input.orderId,
    providerId: input.providerId,
    operation: input.operation,
  });
  const requestPayload = JSON.parse(
    JSON.stringify(input.requestPayload)
  ) as Record<string, unknown>;
  const requestPayloadHash = hashRequestPayload(requestPayload);
  const now = new Date();

  const [created] = await dbExecutor
    .insert(paymentOutboundRequests)
    .values({
      orderType: input.orderType,
      orderId: input.orderId,
      providerId: input.providerId,
      action: input.action,
      idempotencyKey,
      requestPayload,
      requestPayloadHash,
      sendStatus: 'prepared',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    enqueueHook?.();
    return created;
  }

  const existing = await loadExistingOutboundRequest(
    dbExecutor,
    input.orderType,
    input.orderId,
    input.action
  );
  if (!existing) {
    recordPaymentOutboundIdempotencyConflict({
      provider: provider.name,
      action: input.action,
      reason: 'dedupe_resolution_failed',
    });
    captureMessage('Payment outbound idempotency conflict could not be resolved.', {
      level: 'warning',
      tags: {
        alert_priority: 'high',
        payment_provider: provider.name,
        payment_action: input.action,
      },
      extra: {
        orderType: input.orderType,
        orderId: input.orderId,
        providerId: input.providerId,
      },
    });
    throw conflictError('Outbound request idempotency conflict could not be resolved.', {
      code: API_ERROR_CODES.OUTBOUND_REQUEST_IDEMPOTENCY_CONFLICT_UNRESOLVED,
    });
  }

  if (existing.requestPayloadHash !== requestPayloadHash) {
    recordPaymentOutboundIdempotencyConflict({
      provider: provider.name,
      action: input.action,
      reason: 'payload_mismatch',
    });
    captureMessage('Payment outbound idempotency key was reused with a different payload.', {
      level: 'warning',
      tags: {
        alert_priority: 'high',
        payment_provider: provider.name,
        payment_action: input.action,
      },
      extra: {
        orderType: input.orderType,
        orderId: input.orderId,
        providerId: input.providerId,
        outboundRequestId: existing.id,
      },
    });
    throw conflictError(
      `Outbound request ${existing.id} reused the same idempotency key with a different request payload.`,
      {
        code: API_ERROR_CODES.OUTBOUND_REQUEST_PAYLOAD_MISMATCH,
      }
    );
  }

  if (existing.sendStatus === 'failed') {
    await dbExecutor
      .update(paymentOutboundRequests)
      .set({
        sendStatus: 'prepared',
        nextRetryAt: null,
        lastErrorCode: null,
        lastError: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(paymentOutboundRequests.id, existing.id));
    enqueueHook?.();
    return {
      ...existing,
      sendStatus: 'prepared',
    } satisfies PaymentOutboundRequestRow;
  }

  if (existing.sendStatus === 'unknown' || existing.sendStatus === 'prepared') {
    enqueueHook?.();
  }

  return existing;
}

export async function recoverStuckPaymentOutboundRequests() {
  const cutoff = new Date(Date.now() - config.paymentOutboundLockTimeoutMs);
  const recovered = await db
    .update(paymentOutboundRequests)
    .set({
      sendStatus: 'unknown',
      nextRetryAt: new Date(Date.now() + config.paymentOutboundUnknownRetryDelayMs),
      lockedAt: null,
      lastErrorCode: 'stale_send_lock',
      lastError: 'Recovered from stale outbound send lock.',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentOutboundRequests.sendStatus, 'sending'),
        lte(paymentOutboundRequests.lockedAt, cutoff)
      )
    )
    .returning({ id: paymentOutboundRequests.id });

  if (recovered.length > 0) {
    logger.warning('recovered stale payment outbound request locks', {
      count: recovered.length,
    });
  }

  return recovered.length;
}

export async function processPendingPaymentOutboundRequests(
  limit = config.paymentOutboundBatchSize
) {
  const claimed = await claimDuePaymentOutboundRequests(limit);

  for (const row of claimed) {
    try {
      const provider = await loadPreparedProvider(db, row.providerId);
      if (!provider) {
        await markOutboundRequestFailed(row.id, {
          errorCode: 'provider_not_found',
          errorMessage: `Active payment provider ${row.providerId} was not found.`,
        });
        continue;
      }

      const order = await loadOrderSnapshot(db, row.orderType, row.orderId);
      if (!order) {
        await markOutboundRequestFailed(row.id, {
          errorCode: 'order_not_found',
          errorMessage: `Payment order ${row.orderType}:${row.orderId} was not found.`,
        });
        continue;
      }

      await dispatchOutboundRequest(row, provider, order);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Outbound payment request failed.';
      const stripeFailure = classifyStripeApiFailure(error);

      if (
        stripeFailure.reason === 'rate_limit' ||
        stripeFailure.reason === 'server_error'
      ) {
        await markOutboundRequestFailed(row.id, {
          errorCode: `stripe_${stripeFailure.reason}`,
          errorMessage: message,
          retryable: true,
        });
      } else if (stripeFailure.reason === 'client_error') {
        await markOutboundRequestFailed(row.id, {
          errorCode: 'stripe_client_error',
          errorMessage: message,
        });
      } else if (isUnknownDeliveryError(error)) {
        await markOutboundRequestUnknown(row.id, {
          errorCode: 'delivery_unknown',
          errorMessage: message,
        });
      } else {
        await markOutboundRequestFailed(row.id, {
          errorCode: 'send_failed',
          errorMessage: message,
        });
      }
      logger.error('payment outbound request processing failed', {
        outboundRequestId: row.id,
        providerId: row.providerId,
        orderType: row.orderType,
        orderId: row.orderId,
        err: error,
      });
    }
  }

  return claimed.length;
}

export const registerPaymentOutboundEnqueueHook = (hook: (() => void) | null) => {
  enqueueHook = hook;
};
