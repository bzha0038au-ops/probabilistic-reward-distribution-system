import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { and, eq, lte, sql } from '@reward/database/orm';

import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  paymentProviders,
  paymentWebhookEvents,
} from '@reward/database';
import { client, db } from '../../../db';
import { getConfigView } from '../../../shared/config';
import { conflictError, unprocessableEntityError } from '../../../shared/errors';
import { logger } from '../../../shared/logger';
import { recordPaymentWebhookSignatureVerification } from '../../../shared/observability';
import { captureException } from '../../../shared/telemetry';
import {
  resolvePaymentProviderWebhookSecret,
  verifyStripeWebhookSignature,
} from '../adapters/stripe';

const DEPOSIT_FLOW_ALIASES = new Set([
  'deposit',
  'deposits',
  'topup',
  'top_up',
  'top-up',
  'cash_in',
  'fiat_in',
]);

const WITHDRAWAL_FLOW_ALIASES = new Set([
  'withdraw',
  'withdrawal',
  'withdrawals',
  'payout',
  'cash_out',
  'fiat_out',
]);

const DEPOSIT_SUCCESS_STATUSES = new Set([
  'success',
  'succeeded',
  'paid',
  'completed',
  'settled',
  'credited',
]);

const DEPOSIT_PENDING_STATUSES = new Set([
  'pending',
  'processing',
  'authorized',
  'submitted',
]);

const DEPOSIT_FAILED_STATUSES = new Set([
  'failed',
  'fail',
  'rejected',
  'declined',
  'cancelled',
  'canceled',
  'expired',
  'reversed',
]);

const WITHDRAWAL_APPROVED_STATUSES = new Set(['approved', 'authorized', 'accepted']);
const WITHDRAWAL_PROCESSING_STATUSES = new Set(['processing', 'submitted', 'in_progress']);
const WITHDRAWAL_PAID_STATUSES = new Set([
  'paid',
  'success',
  'succeeded',
  'completed',
  'settled',
]);
const WITHDRAWAL_REJECTED_STATUSES = new Set([
  'failed',
  'fail',
  'rejected',
  'declined',
  'cancelled',
  'canceled',
  'reversed',
]);

export type PaymentWebhookIdentity = {
  eventId: string;
  providerEventId: string | null;
  providerTradeId: string | null;
  providerOrderId: string | null;
  eventType: string | null;
  dedupeKey: string;
  payloadHash: string;
  orderType: 'deposit' | 'withdrawal' | null;
  orderId: number | null;
  derivedEventId: boolean;
};

export type WebhookTransition =
  | {
      decision: 'process';
      orderType: 'deposit' | 'withdrawal';
      orderId: number;
      action:
        | 'deposit_mark_provider_pending'
        | 'deposit_mark_provider_succeeded'
        | 'deposit_mark_provider_failed'
        | 'withdrawal_mark_provider_submitted'
        | 'withdrawal_mark_provider_processing'
        | 'withdrawal_pay'
        | 'withdrawal_mark_provider_failed';
      providerStatus: string;
      settlementReference: string | null;
      processingChannel: string | null;
      eventType: string | null;
    }
  | {
      decision: 'ignore';
      reason: string;
      eventType: string | null;
      providerStatus: string | null;
      orderType: 'deposit' | 'withdrawal' | null;
      orderId: number | null;
    };

export const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readPositiveInt = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
};

export const getHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  name: string
) => {
  const value = headers[name];
  if (Array.isArray(value)) {
    return readString(value[0]);
  }
  return readString(value);
};

export const timingSafeHexCompare = (
  expectedHex: string,
  provided: string
) => {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(provided, 'hex');

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
};

export const normalizeSignatureCandidate = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^sha256=/i.test(trimmed)) {
    return trimmed.slice('sha256='.length).trim();
  }
  return trimmed;
};

export const safeParseJson = (payloadRaw: string) => {
  try {
    return JSON.parse(payloadRaw) as unknown;
  } catch {
    return null;
  }
};

export const toJsonValue = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as unknown;
};

const readFirstString = (
  sources: Record<string, unknown>[],
  keys: string[]
) => {
  for (const source of sources) {
    for (const key of keys) {
      const value = readString(Reflect.get(source, key));
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const readFirstPositiveInt = (
  sources: Record<string, unknown>[],
  keys: string[]
) => {
  for (const source of sources) {
    for (const key of keys) {
      const value = readPositiveInt(Reflect.get(source, key));
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const inferOrderTypeFromEventType = (eventType: string | null) => {
  const normalized = normalizeToken(eventType ?? '');
  if (normalized.includes('deposit')) {
    return 'deposit' as const;
  }
  if (normalized.includes('withdraw')) {
    return 'withdrawal' as const;
  }
  if (normalized.includes('payout')) {
    return 'withdrawal' as const;
  }
  return null;
};

const buildPayloadSources = (payloadJson: unknown) => {
  const root = toRecord(payloadJson);
  const data = toRecord(Reflect.get(root, 'data'));
  const rootObject = toRecord(Reflect.get(root, 'object'));
  const dataObject = toRecord(Reflect.get(data, 'object'));
  const rootMetadata = toRecord(Reflect.get(root, 'metadata'));
  const dataMetadata = toRecord(Reflect.get(data, 'metadata'));
  const rootObjectMetadata = toRecord(Reflect.get(rootObject, 'metadata'));
  const dataObjectMetadata = toRecord(Reflect.get(dataObject, 'metadata'));

  return {
    root,
    data,
    rootObject,
    dataObject,
    sources: [
      dataObjectMetadata,
      dataObject,
      dataMetadata,
      data,
      rootObjectMetadata,
      rootObject,
      rootMetadata,
      root,
    ],
  };
};

const inferProviderStatusFromEventType = (eventType: string | null) => {
  if (!eventType) {
    return null;
  }

  const normalized = normalizeToken(eventType);
  const segments = normalized.split('_').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return segments[segments.length - 1] ?? null;
};

const normalizeOrderType = (value: string | null, eventType: string | null) => {
  const normalized = normalizeToken(value ?? '');
  if (DEPOSIT_FLOW_ALIASES.has(normalized)) {
    return 'deposit' as const;
  }
  if (WITHDRAWAL_FLOW_ALIASES.has(normalized)) {
    return 'withdrawal' as const;
  }
  return inferOrderTypeFromEventType(eventType);
};

export const readPaymentWebhookEventId = (payloadJson: unknown) => {
  const { root, data, dataObject, sources } = buildPayloadSources(payloadJson);

  return (
    readString(Reflect.get(root, 'eventId')) ??
    readString(Reflect.get(root, 'id')) ??
    readString(Reflect.get(data, 'eventId')) ??
    readString(Reflect.get(data, 'id')) ??
    readString(Reflect.get(dataObject, 'eventId')) ??
    readString(Reflect.get(dataObject, 'id')) ??
    readFirstString(sources, ['providerEventId'])
  );
};

export const derivePaymentWebhookIdentity = (
  provider: string,
  payloadJson: unknown,
  payloadRaw: string,
  inputEventId?: string | null
): PaymentWebhookIdentity => {
  const { rootObject, dataObject, sources } = buildPayloadSources(payloadJson);

  const providerEventId = readString(inputEventId) ?? readPaymentWebhookEventId(payloadJson);
  const eventType = readFirstString(sources, ['eventType', 'type']);
  const providerTradeId = readFirstString(sources, [
    'providerTradeId',
    'tradeId',
    'tradeNo',
    'transactionId',
    'settlementReference',
  ]);
  const providerOrderId =
    readFirstString([dataObject, rootObject], [
      'providerOrderId',
      'providerReference',
      'merchantOrderNo',
      'outTradeNo',
      'clientReference',
      'client_reference_id',
      'id',
    ]) ??
    readFirstString(sources, [
      'providerOrderId',
      'providerReference',
      'merchantOrderNo',
      'outTradeNo',
      'clientReference',
      'client_reference_id',
    ]);
  const orderType = normalizeOrderType(
    readFirstString(sources, ['referenceType', 'orderType', 'flow', 'kind']),
    eventType
  );
  const orderId = readFirstPositiveInt(sources, ['referenceId', 'orderId', 'paymentId']);
  const payloadHash = createHash('sha256')
    .update(`${provider}\n${payloadRaw}`)
    .digest('hex');
  const eventId = providerEventId ?? `payload-sha256:${payloadHash}`;
  const dedupeKey = providerEventId
    ? `event:${providerEventId}`
    : providerTradeId
      ? eventType
        ? `trade:${providerTradeId}:${normalizeToken(eventType)}`
        : `trade:${providerTradeId}`
      : `payload:${payloadHash}`;

  return {
    eventId,
    providerEventId,
    providerTradeId,
    providerOrderId,
    eventType,
    dedupeKey,
    payloadHash,
    orderType,
    orderId,
    derivedEventId: providerEventId === null,
  };
};

export const derivePaymentWebhookTransition = (
  payloadJson: unknown,
  provider: string
): WebhookTransition => {
  const { sources } = buildPayloadSources(payloadJson);

  const eventType = readFirstString(sources, ['eventType', 'type']);
  const orderType = normalizeOrderType(
    readFirstString(sources, ['referenceType', 'orderType', 'flow', 'kind']),
    eventType
  );
  const providerStatus =
    normalizeToken(
      readFirstString(sources, [
        'targetStatus',
        'paymentStatus',
        'payment_status',
        'status',
        'orderStatus',
      ]) ??
        inferProviderStatusFromEventType(eventType) ??
        ''
    ) || null;
  const orderId = readFirstPositiveInt(sources, ['referenceId', 'orderId', 'paymentId']);
  const settlementReference = readFirstString(sources, [
    'settlementReference',
    'providerReference',
    'transactionId',
    'tradeNo',
  ]);
  const processingChannel =
    readFirstString(sources, ['processingChannel', 'channel']) ?? provider;

  if (!orderType || !orderId) {
    return {
      decision: 'ignore',
      reason: 'missing_order_reference',
      eventType,
      providerStatus,
      orderType,
      orderId,
    };
  }

  if (!providerStatus) {
    return {
      decision: 'ignore',
      reason: 'missing_provider_status',
      eventType,
      providerStatus,
      orderType,
      orderId,
    };
  }

  if (orderType === 'deposit') {
    if (DEPOSIT_PENDING_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'deposit_mark_provider_pending',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }

    if (DEPOSIT_SUCCESS_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'deposit_mark_provider_succeeded',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }

    if (DEPOSIT_FAILED_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'deposit_mark_provider_failed',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }
  }

  if (orderType === 'withdrawal') {
    if (WITHDRAWAL_APPROVED_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'withdrawal_mark_provider_submitted',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }

    if (WITHDRAWAL_PROCESSING_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'withdrawal_mark_provider_processing',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }

    if (WITHDRAWAL_PAID_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'withdrawal_pay',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }

    if (WITHDRAWAL_REJECTED_STATUSES.has(providerStatus)) {
      return {
        decision: 'process',
        orderType,
        orderId,
        action: 'withdrawal_mark_provider_failed',
        providerStatus,
        settlementReference,
        processingChannel,
        eventType,
      };
    }
  }

  return {
    decision: 'ignore',
    reason: 'status_not_actionable',
    eventType,
    providerStatus,
    orderType,
    orderId,
  };
};

export const readPaymentWebhookSignatureFromHeaders = (
  headers: Record<string, string | string[] | undefined>
) =>
  getHeaderValue(headers, 'x-payment-signature') ??
  getHeaderValue(headers, 'payment-signature') ??
  getHeaderValue(headers, 'x-signature') ??
  getHeaderValue(headers, 'stripe-signature');

export const readPaymentWebhookEventIdFromHeaders = (
  headers: Record<string, string | string[] | undefined>
) =>
  getHeaderValue(headers, 'x-payment-event-id') ??
  getHeaderValue(headers, 'payment-event-id') ??
  getHeaderValue(headers, 'x-event-id');

export type PaymentWebhookSignatureStatus = 'verified' | 'failed' | 'skipped';
export type PaymentWebhookProcessingStatus =
  | 'pending'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed';

type PaymentWebhookEventRow = typeof paymentWebhookEvents.$inferSelect;

type ClaimedPaymentWebhookEvent = {
  id: number;
  provider: string;
  eventId: string;
  dedupeKey: string;
  providerEventId: string | null;
  providerTradeId: string | null;
  providerOrderId: string | null;
  eventType: string | null;
  orderType: 'deposit' | 'withdrawal' | null;
  orderId: number | null;
  signature: string | null;
  signatureStatus: PaymentWebhookSignatureStatus;
  payloadRaw: string;
  payloadJson: unknown;
  receivedAt: Date;
  lastReceivedAt: Date;
  receiveCount: number;
  processingStatus: PaymentWebhookProcessingStatus;
  processingAttempts: number;
  processingResult: Record<string, unknown> | null;
  processingError: string | null;
  processingLockedAt: Date | null;
  processedAt: Date | null;
  updatedAt: Date;
};

type QueuedPaymentWebhookEvent = {
  event: PaymentWebhookEventRow;
  duplicate: boolean;
  requeued: boolean;
  derivedEventId: boolean;
};

type SignatureVerificationResult = {
  providerId: number | null;
  signatureStatus: PaymentWebhookSignatureStatus;
  reason: string | null;
};

const finalizeSignatureVerification = (
  provider: string,
  result: SignatureVerificationResult
) => {
  recordPaymentWebhookSignatureVerification({
    provider,
    status: result.signatureStatus,
    reason: result.reason,
  });
  return result;
};

const config = getConfigView();

let enqueueHook: (() => void) | null = null;

const selectExistingEvent = async (provider: string, dedupeKey: string) => {
  const [existing] = await db
    .select()
    .from(paymentWebhookEvents)
    .where(
      and(
        eq(paymentWebhookEvents.provider, provider),
        eq(paymentWebhookEvents.dedupeKey, dedupeKey)
      )
    )
    .limit(1);

  return existing ?? null;
};

const finalizePaymentWebhookEvent = async (
  id: number,
  status: Extract<PaymentWebhookProcessingStatus, 'processed' | 'ignored' | 'failed'>,
  payload: {
    result?: Record<string, unknown> | null;
    error?: string | null;
  }
) => {
  await db
    .update(paymentWebhookEvents)
    .set({
      processingStatus: status,
      processingResult: payload.result ?? null,
      processingError: payload.error ?? null,
      processingLockedAt: null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paymentWebhookEvents.id, id));
};

const claimPendingPaymentWebhookEvents = async (limit: number) => {
  const rows = await client<ClaimedPaymentWebhookEvent[]>`
    with due as (
      select id
      from payment_webhook_events
      where processing_status = 'pending'
      order by last_received_at asc, id asc
      limit ${limit}
      for update skip locked
    )
    update payment_webhook_events as e
    set processing_status = 'processing',
        processing_attempts = e.processing_attempts + 1,
        processing_locked_at = now(),
        processing_error = null,
        updated_at = now()
    from due
    where e.id = due.id
    returning
      e.id,
      e.provider,
      e.event_id as "eventId",
      e.dedupe_key as "dedupeKey",
      e.provider_event_id as "providerEventId",
      e.provider_trade_id as "providerTradeId",
      e.provider_order_id as "providerOrderId",
      e.event_type as "eventType",
      e.order_type as "orderType",
      e.order_id as "orderId",
      e.signature,
      e.signature_status as "signatureStatus",
      e.payload_raw as "payloadRaw",
      e.payload_json as "payloadJson",
      e.received_at as "receivedAt",
      e.last_received_at as "lastReceivedAt",
      e.receive_count as "receiveCount",
      e.processing_status as "processingStatus",
      e.processing_attempts as "processingAttempts",
      e.processing_result as "processingResult",
      e.processing_error as "processingError",
      e.processing_locked_at as "processingLockedAt",
      e.processed_at as "processedAt",
      e.updated_at as "updatedAt"
  `;

  return rows;
};

const consumePaymentWebhookEvent = async (event: ClaimedPaymentWebhookEvent) => {
  if (event.signatureStatus !== 'verified') {
    return {
      status: 'ignored' as const,
      result: {
        reason:
          event.signatureStatus === 'skipped'
            ? 'signature_verification_skipped'
            : 'signature_verification_failed',
        signatureStatus: event.signatureStatus,
      },
    };
  }

  const payloadJson =
    typeof event.payloadJson === 'string'
      ? safeParseJson(event.payloadJson) ?? safeParseJson(event.payloadRaw)
      : event.payloadJson ?? safeParseJson(event.payloadRaw);
  if (payloadJson === null) {
    throw unprocessableEntityError('Webhook payload is not valid JSON.', {
      code: API_ERROR_CODES.WEBHOOK_PAYLOAD_INVALID_JSON,
    });
  }

  const transition = derivePaymentWebhookTransition(payloadJson, event.provider);
  if (transition.decision === 'ignore') {
    return {
      status: 'ignored' as const,
      result: {
        reason: transition.reason,
        eventType: transition.eventType,
        providerStatus: transition.providerStatus,
        orderType: transition.orderType,
        orderId: transition.orderId,
      },
    };
  }

  const settlementReferenceRequired =
    transition.action === 'deposit_mark_provider_succeeded' ||
    transition.action === 'withdrawal_mark_provider_submitted' ||
    transition.action === 'withdrawal_mark_provider_processing' ||
    transition.action === 'withdrawal_pay';
  const settlementReference =
    transition.settlementReference ??
    (settlementReferenceRequired
      ? event.eventId ?? `${event.provider}:${event.dedupeKey}`
      : null);

  const review = {
    adminId: null,
    operatorNote: `payment_webhook:${event.provider}:${event.dedupeKey}`,
    settlementReference,
    processingChannel: transition.processingChannel,
    sourceType: 'provider_callback' as const,
    sourceEventKey: `${event.provider}:${event.dedupeKey}`,
  };

  let updated: { status?: string | null } | null = null;

  switch (transition.action) {
    case 'deposit_mark_provider_pending': {
      const { markDepositProviderPending } = await import('../../top-up');
      updated = await markDepositProviderPending(transition.orderId, review);
      break;
    }
    case 'deposit_mark_provider_succeeded': {
      const { markDepositProviderPending, markDepositProviderSucceeded } = await import(
        '../../top-up'
      );
      await markDepositProviderPending(transition.orderId, review);
      updated = await markDepositProviderSucceeded(transition.orderId, review);
      break;
    }
    case 'deposit_mark_provider_failed': {
      const { markDepositProviderFailed } = await import('../../top-up');
      updated = await markDepositProviderFailed(transition.orderId, review);
      break;
    }
    case 'withdrawal_mark_provider_submitted': {
      const { markWithdrawalProviderSubmitted } = await import(
        '../../withdraw/service'
      );
      updated = await markWithdrawalProviderSubmitted(transition.orderId, review);
      break;
    }
    case 'withdrawal_mark_provider_processing': {
      const { markWithdrawalProviderProcessing } = await import(
        '../../withdraw/service'
      );
      updated = await markWithdrawalProviderProcessing(transition.orderId, review);
      break;
    }
    case 'withdrawal_pay': {
      const { payWithdrawal } = await import('../../withdraw/service');
      updated = await payWithdrawal(transition.orderId, review);
      break;
    }
    case 'withdrawal_mark_provider_failed': {
      const { markWithdrawalProviderFailed } = await import(
        '../../withdraw/service'
      );
      updated = await markWithdrawalProviderFailed(transition.orderId, review);
      break;
    }
  }

  if (!updated) {
    return {
      status: 'ignored' as const,
      result: {
        reason: 'order_not_found',
        eventType: transition.eventType,
        providerStatus: transition.providerStatus,
        orderType: transition.orderType,
        orderId: transition.orderId,
        action: transition.action,
      },
    };
  }

  return {
    status: 'processed' as const,
    result: {
      action: transition.action,
      eventType: transition.eventType,
      providerStatus: transition.providerStatus,
      orderType: transition.orderType,
      orderId: transition.orderId,
      settlementReference,
      processingChannel: transition.processingChannel,
      finalOrderStatus:
        typeof Reflect.get(updated, 'status') === 'string'
          ? Reflect.get(updated, 'status')
          : null,
    },
  };
};

export async function verifyPaymentWebhookSignature(input: {
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  signature: string | null;
  payloadRaw: string;
}): Promise<SignatureVerificationResult> {
  const [provider] = await db
    .select({
      id: paymentProviders.id,
      name: paymentProviders.name,
      config: paymentProviders.config,
    })
    .from(paymentProviders)
    .where(
      and(
        eq(paymentProviders.name, input.provider),
        eq(paymentProviders.isActive, true)
      )
    )
    .limit(1);

  if (!provider) {
    return finalizeSignatureVerification(input.provider, {
      providerId: null,
      signatureStatus: 'failed',
      reason: 'provider_not_found',
    });
  }

  const providerConfig = toRecord(provider.config);
  const secret = resolvePaymentProviderWebhookSecret(
    provider.name,
    providerConfig
  );
  if (!secret) {
    return finalizeSignatureVerification(provider.name, {
      providerId: provider.id,
      signatureStatus: 'skipped',
      reason: 'webhook_secret_not_configured',
    });
  }

  const normalizedSignature = input.signature
    ? normalizeSignatureCandidate(input.signature)
    : null;
  if (!normalizedSignature) {
    return finalizeSignatureVerification(provider.name, {
      providerId: provider.id,
      signatureStatus: 'failed',
      reason: 'signature_missing',
    });
  }

  const configuredAdapter = normalizeToken(
    readString(Reflect.get(providerConfig, 'adapter')) ?? provider.name
  );
  const stripeSignature = getHeaderValue(input.headers, 'stripe-signature');

  if (configuredAdapter === 'stripe' && stripeSignature) {
    try {
      verifyStripeWebhookSignature({
        payloadRaw: input.payloadRaw,
        signature: stripeSignature,
        secret,
      });
      return finalizeSignatureVerification(provider.name, {
        providerId: provider.id,
        signatureStatus: 'verified',
        reason: null,
      });
    } catch {
      return finalizeSignatureVerification(provider.name, {
        providerId: provider.id,
        signatureStatus: 'failed',
        reason: 'signature_mismatch',
      });
    }
  }

  const expected = createHmac('sha256', secret).update(input.payloadRaw).digest('hex');
  const verified =
    /^[a-f0-9]+$/i.test(normalizedSignature) &&
    timingSafeHexCompare(expected, normalizedSignature);

  return finalizeSignatureVerification(provider.name, {
    providerId: provider.id,
    signatureStatus: verified ? 'verified' : 'failed',
    reason: verified ? null : 'signature_mismatch',
  });
}

export async function queuePaymentWebhookEvent(input: {
  provider: string;
  eventId?: string | null;
  signature: string | null;
  signatureStatus: PaymentWebhookSignatureStatus;
  payloadRaw: string;
  payloadJson: unknown;
}) {
  const provider = input.provider.trim();
  const identity = derivePaymentWebhookIdentity(
    provider,
    input.payloadJson,
    input.payloadRaw,
    input.eventId
  );
  const now = new Date();
  const insertRow: typeof paymentWebhookEvents.$inferInsert = {
    provider,
    eventId: identity.eventId,
    providerEventId: identity.providerEventId,
    providerTradeId: identity.providerTradeId,
    providerOrderId: identity.providerOrderId,
    eventType: identity.eventType,
    dedupeKey: identity.dedupeKey,
    signature: input.signature,
    signatureStatus: input.signatureStatus,
    payloadRaw: input.payloadRaw,
    payloadJson: toJsonValue(input.payloadJson),
    payloadHash: identity.payloadHash,
    orderType: identity.orderType,
    orderId: identity.orderId,
    receivedAt: now,
    lastReceivedAt: now,
    receiveCount: 1,
    processingStatus: 'pending',
    processingAttempts: 0,
    processingResult: null,
    processingError: null,
    processingLockedAt: null,
    processedAt: null,
    updatedAt: now,
  };

  const [created] = await db
    .insert(paymentWebhookEvents)
    .values(insertRow)
    .onConflictDoNothing()
    .returning();

  if (created) {
    logger.info('payment webhook event queued', {
      webhookEventId: created.id,
      provider,
      eventId: identity.eventId,
      dedupeKey: identity.dedupeKey,
      signatureStatus: input.signatureStatus,
    });
    enqueueHook?.();
    return {
      event: created,
      duplicate: false,
      requeued: false,
      derivedEventId: identity.derivedEventId,
    } satisfies QueuedPaymentWebhookEvent;
  }

  const existing = await selectExistingEvent(provider, identity.dedupeKey);
  if (!existing) {
    throw conflictError('Webhook event dedupe conflict could not be resolved.', {
      code: API_ERROR_CODES.WEBHOOK_EVENT_DEDUPE_CONFLICT_UNRESOLVED,
    });
  }

  const shouldRequeue =
    existing.processingStatus === 'failed' ||
    (existing.signatureStatus !== 'verified' && input.signatureStatus === 'verified');

  const [updated] = await db
    .update(paymentWebhookEvents)
    .set({
      eventId: identity.eventId,
      providerEventId: identity.providerEventId,
      providerTradeId: identity.providerTradeId,
      providerOrderId: identity.providerOrderId,
      eventType: identity.eventType,
      dedupeKey: identity.dedupeKey,
      signature: input.signature,
      signatureStatus: input.signatureStatus,
      payloadRaw: input.payloadRaw,
      payloadJson: toJsonValue(input.payloadJson),
      payloadHash: identity.payloadHash,
      orderType: identity.orderType,
      orderId: identity.orderId,
      lastReceivedAt: now,
      receiveCount: sql`${paymentWebhookEvents.receiveCount} + 1`,
      processingStatus: shouldRequeue ? 'pending' : existing.processingStatus,
      processingResult: shouldRequeue ? null : existing.processingResult,
      processingError: shouldRequeue ? null : existing.processingError,
      processingLockedAt: shouldRequeue ? null : existing.processingLockedAt,
      processedAt: shouldRequeue ? null : existing.processedAt,
      updatedAt: now,
    })
    .where(eq(paymentWebhookEvents.id, existing.id))
    .returning();

  if (shouldRequeue) {
    logger.info('payment webhook event requeued from duplicate delivery', {
      webhookEventId: existing.id,
      provider,
      eventId: identity.eventId,
      dedupeKey: identity.dedupeKey,
    });
    enqueueHook?.();
  }

  return {
    event: updated ?? existing,
    duplicate: true,
    requeued: shouldRequeue,
    derivedEventId: identity.derivedEventId,
  } satisfies QueuedPaymentWebhookEvent;
}

export async function recoverStuckPaymentWebhookEvents() {
  const cutoff = new Date(Date.now() - config.paymentWebhookLockTimeoutMs);
  const recovered = await db
    .update(paymentWebhookEvents)
    .set({
      processingStatus: 'pending',
      processingLockedAt: null,
      processingError: 'Recovered from stale processing lock.',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentWebhookEvents.processingStatus, 'processing'),
        lte(paymentWebhookEvents.processingLockedAt, cutoff)
      )
    )
    .returning({ id: paymentWebhookEvents.id });

  if (recovered.length > 0) {
    logger.warning('recovered stale payment webhook event locks', {
      count: recovered.length,
    });
  }

  return recovered.length;
}

export async function processPendingPaymentWebhookEvents(
  limit = config.paymentWebhookBatchSize
) {
  const claimed = await claimPendingPaymentWebhookEvents(limit);

  for (const event of claimed) {
    try {
      const outcome = await consumePaymentWebhookEvent(event);
      await finalizePaymentWebhookEvent(event.id, outcome.status, {
        result: outcome.result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Payment webhook processing failed.';
      await finalizePaymentWebhookEvent(event.id, 'failed', {
        error: message,
        result: {
          reason: 'processing_error',
        },
      });
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'payment_webhook_worker',
          payment_provider: event.provider,
        },
        extra: {
          webhookEventId: event.id,
          providerEventId: event.eventId,
        },
      });
      logger.error('payment webhook event processing failed', {
        webhookEventId: event.id,
        provider: event.provider,
        eventId: event.eventId,
        err: error,
      });
    }
  }

  return claimed.length;
}

export const registerPaymentWebhookEnqueueHook = (hook: (() => void) | null) => {
  enqueueHook = hook;
};
