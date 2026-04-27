import { API_ERROR_CODES } from '@reward/shared-types/api';
import { unprocessableEntityError } from '../../../shared/errors';
import { resolveRequestUserAgent } from '../../admin-audit';
import { readStringValue, toObject } from './common';

export type FinanceReviewPayload = {
  operatorNote: string | null;
  settlementReference: string | null;
  processingChannel: string | null;
};

export type CryptoReviewPayload = FinanceReviewPayload & {
  confirmations: number | null;
  actualAmount: string | null;
  fee: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  sentAt: string | null;
};

type FinanceAuditRequest = {
  admin?: { sessionId?: string | null } | null;
  adminStepUp?: unknown;
  headers?: Record<string, unknown>;
};

const normalizeOptionalField = (
  value: string | undefined,
  maxLength: number,
  label: string
) => {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw unprocessableEntityError(`${label} is too long.`, {
      code: API_ERROR_CODES.FIELD_TOO_LONG,
    });
  }
  return trimmed;
};

export const parseFinanceReviewPayload = (body: unknown): FinanceReviewPayload => {
  const source = toObject(body);

  return {
    operatorNote: normalizeOptionalField(
      readStringValue(source, 'operatorNote'),
      500,
      'Operator note'
    ),
    settlementReference: normalizeOptionalField(
      readStringValue(source, 'settlementReference'),
      128,
      'Settlement reference'
    ),
    processingChannel: normalizeOptionalField(
      readStringValue(source, 'processingChannel'),
      64,
      'Processing channel'
    ),
  };
};

export const parseOptionalIntegerField = (
  source: unknown,
  key: string,
  label: string
) => {
  const raw = readStringValue(source, key);
  if (raw === undefined) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw unprocessableEntityError(`${label} must be a non-negative integer.`, {
      code: API_ERROR_CODES.FIELD_MUST_BE_NON_NEGATIVE_INTEGER,
    });
  }

  return Math.trunc(parsed);
};

const parseOptionalNumericField = (
  source: unknown,
  key: string,
  label: string
) => {
  const raw = readStringValue(source, key);
  if (raw === undefined) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw unprocessableEntityError(`${label} is invalid.`, {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }

  return raw;
};

export const parseCryptoReviewPayload = (body: unknown): CryptoReviewPayload => {
  const source = toObject(body);
  const financeReview = parseFinanceReviewPayload(body);

  return {
    ...financeReview,
    confirmations: parseOptionalIntegerField(
      source,
      'confirmations',
      'Confirmations'
    ),
    actualAmount: parseOptionalNumericField(source, 'actualAmount', 'Actual amount'),
    fee: parseOptionalNumericField(source, 'fee', 'Fee'),
    fromAddress: normalizeOptionalField(
      readStringValue(source, 'fromAddress'),
      191,
      'From address'
    ),
    toAddress: normalizeOptionalField(
      readStringValue(source, 'toAddress'),
      191,
      'To address'
    ),
    sentAt: normalizeOptionalField(readStringValue(source, 'sentAt'), 64, 'Sent time'),
  };
};

export const requireOperatorNote = (
  review: FinanceReviewPayload,
  label = 'Operator note'
) => {
  if (review.operatorNote) {
    return review.operatorNote;
  }

  throw unprocessableEntityError(`${label} is required.`, {
    code: API_ERROR_CODES.OPERATOR_NOTE_REQUIRED,
  });
};

export const requireSettlementReference = (review: FinanceReviewPayload) => {
  if (review.settlementReference) {
    return review.settlementReference;
  }

  throw unprocessableEntityError('Settlement reference is required.', {
    code: API_ERROR_CODES.SETTLEMENT_REFERENCE_REQUIRED,
  });
};

export const requireProcessingChannel = (review: FinanceReviewPayload) => {
  if (review.processingChannel) {
    return review.processingChannel;
  }

  throw unprocessableEntityError('Processing channel is required.', {
    code: API_ERROR_CODES.PROCESSING_CHANNEL_REQUIRED,
  });
};

const toRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const buildFinanceAuditMetadata = (
  record: unknown,
  review: FinanceReviewPayload,
  request: FinanceAuditRequest
) => {
  const recordValue =
    typeof record === 'object' && record !== null && !Array.isArray(record)
      ? record
      : null;
  const metadata = toRecord(recordValue ? Reflect.get(recordValue, 'metadata') : null);
  const withdrawalControl = toRecord(Reflect.get(metadata, 'withdrawalControl'));
  const financeReviewLatest = toRecord(Reflect.get(metadata, 'financeReviewLatest'));
  const stepUp = toRecord(request.adminStepUp);

  return {
    operatorNote: review.operatorNote,
    settlementReference: review.settlementReference,
    processingChannel: review.processingChannel,
    userVisibleStatus:
      typeof Reflect.get(metadata, 'userVisibleStatus') === 'string'
        ? Reflect.get(metadata, 'userVisibleStatus')
        : null,
    providerStatus:
      typeof Reflect.get(metadata, 'providerStatus') === 'string'
        ? Reflect.get(metadata, 'providerStatus')
        : null,
    settlementStatus:
      typeof Reflect.get(metadata, 'settlementStatus') === 'string'
        ? Reflect.get(metadata, 'settlementStatus')
        : null,
    ledgerState:
      typeof Reflect.get(metadata, 'ledgerState') === 'string'
        ? Reflect.get(metadata, 'ledgerState')
        : null,
    failureReason:
      typeof Reflect.get(metadata, 'failureReason') === 'string'
        ? Reflect.get(metadata, 'failureReason')
        : null,
    processingMode:
      typeof Reflect.get(metadata, 'processingMode') === 'string'
        ? Reflect.get(metadata, 'processingMode')
        : null,
    manualFallbackRequired: Reflect.get(metadata, 'manualFallbackRequired') === true,
    manualFallbackReason:
      typeof Reflect.get(metadata, 'manualFallbackReason') === 'string'
        ? Reflect.get(metadata, 'manualFallbackReason')
        : null,
    riskSignals: Array.isArray(Reflect.get(withdrawalControl, 'riskSignals'))
      ? Reflect.get(withdrawalControl, 'riskSignals')
      : [],
    approvalsRequired:
      typeof Reflect.get(withdrawalControl, 'approvalsRequired') === 'number'
        ? Reflect.get(withdrawalControl, 'approvalsRequired')
        : null,
    approvalState:
      typeof Reflect.get(withdrawalControl, 'approvalState') === 'string'
        ? Reflect.get(withdrawalControl, 'approvalState')
        : null,
    reviewStage:
      typeof Reflect.get(financeReviewLatest, 'reviewStage') === 'string'
        ? Reflect.get(financeReviewLatest, 'reviewStage')
        : null,
    adminSessionId: request.admin?.sessionId ?? null,
    adminUserAgent: request.headers
      ? resolveRequestUserAgent({ headers: request.headers }) ?? null
      : null,
    stepUpVerified: stepUp.verified === true,
    stepUpMethod: typeof stepUp.method === 'string' ? stepUp.method : null,
    stepUpVerifiedAt:
      typeof stepUp.verifiedAt === 'string' ? stepUp.verifiedAt : null,
  };
};
