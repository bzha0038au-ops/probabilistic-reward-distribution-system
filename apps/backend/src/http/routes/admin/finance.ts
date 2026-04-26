import type { AppInstance } from '../types';

import { db } from '../../../db';
import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { recordAdminAction } from '../../../modules/admin/audit';
import {
  confirmCryptoDeposit,
  confirmCryptoWithdrawal,
  createCryptoDepositChannel,
  listCryptoDepositChannels,
  rejectCryptoDeposit,
  submitCryptoWithdrawal,
} from '../../../modules/crypto';
import { getPaymentCapabilityOverview } from '../../../modules/payment/service';
import {
  listPaymentReconciliationIssues,
  listPaymentReconciliationRuns,
  runPaymentReconciliationCycle,
} from '../../../modules/payment/reconciliation-service';
import {
  creditDeposit,
  failDeposit,
  listDeposits,
  markDepositProviderPending,
  markDepositProviderSucceeded,
  reverseDeposit,
} from '../../../modules/top-up';
import {
  approveWithdrawal,
  listWithdrawalsAdmin,
  markWithdrawalProviderFailed,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
  rejectWithdrawal,
  reverseWithdrawal,
} from '../../../modules/withdraw/service';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  parseLimitFromQuery,
  readStringValue,
  toObject,
} from './common';

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
    throw new Error(`${label} is too long.`);
  }
  return trimmed;
};

const parseFinanceReviewPayload = (body: unknown) => {
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

const parseOptionalIntegerField = (
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
    throw new Error(`${label} must be a non-negative integer.`);
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
    throw new Error(`${label} is invalid.`);
  }

  return raw;
};

const parseCryptoReviewPayload = (body: unknown) => {
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

const requireOperatorNote = (
  review: ReturnType<typeof parseFinanceReviewPayload>,
  label = 'Operator note'
) => {
  if (review.operatorNote) {
    return review.operatorNote;
  }

  throw new Error(`${label} is required.`);
};

const requireSettlementReference = (
  review: ReturnType<typeof parseFinanceReviewPayload>
) => {
  if (review.settlementReference) {
    return review.settlementReference;
  }

  throw new Error('Settlement reference is required.');
};

const requireProcessingChannel = (
  review: ReturnType<typeof parseFinanceReviewPayload>
) => {
  if (review.processingChannel) {
    return review.processingChannel;
  }

  throw new Error('Processing channel is required.');
};

const toRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const buildFinanceAuditMetadata = (
  record: unknown,
  review: ReturnType<typeof parseFinanceReviewPayload>,
  request: { admin?: { sessionId: string }; adminStepUp?: unknown }
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
    stepUpVerified: stepUp.verified === true,
    stepUpMethod:
      typeof stepUp.method === 'string' ? stepUp.method : null,
    stepUpVerifiedAt:
      typeof stepUp.verifiedAt === 'string' ? stepUp.verifiedAt : null,
  };
};

export async function registerAdminFinanceRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/payment-capabilities',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (_request, reply) => {
      const overview = await getPaymentCapabilityOverview(db);
      return sendSuccess(reply, overview);
    }
  );

  protectedRoutes.get(
    '/admin/crypto-deposit-channels',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (_request, reply) => {
      const channels = await listCryptoDepositChannels(false);
      return sendSuccess(reply, channels);
    }
  );

  protectedRoutes.post(
    '/admin/crypto-deposit-channels',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const source = toObject(request.body);
      const providerId = parseIdParam(source, 'providerId');
      const chain = readStringValue(source, 'chain') ?? '';
      const network = readStringValue(source, 'network') ?? '';
      const token = readStringValue(source, 'token') ?? '';
      const receiveAddress = readStringValue(source, 'receiveAddress') ?? '';
      const qrCodeUrl = readStringValue(source, 'qrCodeUrl') ?? null;
      const memoRequired = Reflect.get(source, 'memoRequired') === true;
      const memoValue = readStringValue(source, 'memoValue') ?? null;
      const minConfirmations = parseOptionalIntegerField(
        source,
        'minConfirmations',
        'Min confirmations'
      );
      const isActive =
        Reflect.get(source, 'isActive') === false ? false : true;

      try {
        const created = await createCryptoDepositChannel({
          providerId,
          chain,
          network,
          token,
          receiveAddress,
          qrCodeUrl,
          memoRequired,
          memoValue,
          minConfirmations,
          isActive,
        });

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'crypto_deposit_channel_create',
          targetType: 'crypto_deposit_channel',
          targetId: created.id,
          ip: request.ip,
          metadata: {
            providerId: created.providerId,
            chain: created.chain,
            network: created.network,
            token: created.token,
            isActive: created.isActive,
          },
        });

        return sendSuccess(reply, created, 201);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to create crypto deposit channel.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.get(
    '/admin/reconciliation/runs',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const limit = parseLimitFromQuery(request.query);
      const runs = await listPaymentReconciliationRuns(limit);
      return sendSuccess(reply, runs);
    }
  );

  protectedRoutes.get(
    '/admin/reconciliation/issues',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const limit = parseLimitFromQuery(request.query);
      const issues = await listPaymentReconciliationIssues(limit);
      return sendSuccess(reply, issues);
    }
  );

  protectedRoutes.post(
    '/admin/reconciliation/run',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const providerId = parseIdParam(request.body, 'providerId');

      try {
        const result = await runPaymentReconciliationCycle({
          providerId,
          trigger: 'manual',
        });

        if (providerId && result.providerCount === 0) {
          return sendError(reply, 404, 'Payment provider not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'finance_reconciliation_run',
          targetType: providerId ? 'payment_provider' : 'payment_reconciliation',
          targetId: providerId ?? null,
          ip: request.ip,
          metadata: {
            providerId: providerId ?? null,
            providerCount: result.providerCount,
          },
        });

        return sendSuccess(reply, result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Reconciliation run failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.get(
    '/admin/deposits',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const limit = parseLimitFromQuery(request.query);
      const deposits = await listDeposits(limit);
      return sendSuccess(reply, deposits);
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/provider-pending',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await markDepositProviderPending(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_pending',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });
        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Deposit provider handoff failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/provider-succeeded',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await markDepositProviderSucceeded(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_succeeded',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Deposit provider success update failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/credit',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await creditDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_credit',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Deposit credit failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/provider-fail',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await failDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_failed',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Deposit failure update failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/reverse',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await reverseDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_reverse',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Deposit reversal failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/crypto-confirm',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        const updated = await confirmCryptoDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_crypto_confirm',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: {
            ...buildFinanceAuditMetadata(updated, review, request),
            confirmations: review.confirmations,
          },
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Crypto deposit confirmation failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/crypto-reject',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const depositId = parseIdParam(request.params, 'depositId');
      if (!depositId) {
        return sendError(reply, 400, 'Invalid deposit id.');
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await rejectCryptoDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_crypto_reject',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Crypto deposit rejection failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.get(
    '/admin/withdrawals',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const limit = parseLimitFromQuery(request.query);
      const withdrawals = await listWithdrawalsAdmin(limit);
      return sendSuccess(reply, withdrawals);
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/approve',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(
          ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL
        ),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await approveWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_approve',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Withdrawal approval failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/reject',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(
          ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL
        ),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await rejectWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_reject',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Withdrawal rejection failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/provider-submit',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        requireSettlementReference(review);
        const updated = await markWithdrawalProviderSubmitted(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_mark_provider_submitted',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Withdrawal provider submission failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/provider-processing',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        requireSettlementReference(review);
        const updated = await markWithdrawalProviderProcessing(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_mark_provider_processing',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Withdrawal provider processing update failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/provider-fail',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        requireSettlementReference(review);
        const updated = await markWithdrawalProviderFailed(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_mark_provider_failed',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Withdrawal provider failure update failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/pay',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        requireProcessingChannel(review);
        requireSettlementReference(review);
        const updated = await payWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_pay',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Withdrawal payout failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/reverse',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await reverseWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_reverse',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Withdrawal reversal failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/crypto-submit',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireSettlementReference(review);
        const updated = await submitCryptoWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_crypto_submit',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: {
            ...buildFinanceAuditMetadata(updated, review, request),
            confirmations: review.confirmations,
          },
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Crypto withdrawal submission failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/withdrawals/:withdrawalId/crypto-confirm',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const withdrawalId = parseIdParam(request.params, 'withdrawalId');
      if (!withdrawalId) {
        return sendError(reply, 400, 'Invalid withdrawal id.');
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireSettlementReference(review);
        const updated = await confirmCryptoWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_crypto_confirm',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
          metadata: {
            ...buildFinanceAuditMetadata(updated, review, request),
            confirmations: review.confirmations,
          },
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Crypto withdrawal confirmation failed.';
        return sendError(reply, 422, message);
      }
    }
  );
}
