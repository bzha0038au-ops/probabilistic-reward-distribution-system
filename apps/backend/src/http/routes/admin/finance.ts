import type { AppInstance } from '../types';
import { API_ERROR_CODES } from '@reward/shared-types/api';

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
} from '../../../modules/payment/reconciliation';
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
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  parseLimitFromQuery,
  readStringValue,
  toObject,
} from './common';
import { withAdminAuditContext } from '../../admin-audit';
import {
  buildFinanceAuditMetadata,
  parseCryptoReviewPayload,
  parseFinanceReviewPayload,
  parseOptionalIntegerField,
  requireOperatorNote,
  requireProcessingChannel,
  requireSettlementReference,
} from './finance-support';

const sendPaymentProviderNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(
    reply,
    404,
    'Payment provider not found.',
    undefined,
    API_ERROR_CODES.PAYMENT_PROVIDER_NOT_FOUND
  );

const sendInvalidDepositId = (reply: Parameters<typeof sendError>[0]) =>
  sendError(
    reply,
    400,
    'Invalid deposit id.',
    undefined,
    API_ERROR_CODES.INVALID_DEPOSIT_ID
  );

const sendDepositNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(
    reply,
    404,
    'Deposit not found.',
    undefined,
    API_ERROR_CODES.DEPOSIT_NOT_FOUND
  );

const sendInvalidWithdrawalId = (reply: Parameters<typeof sendError>[0]) =>
  sendError(
    reply,
    400,
    'Invalid withdrawal id.',
    undefined,
    API_ERROR_CODES.INVALID_WITHDRAWAL_ID
  );

const sendWithdrawalNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(
    reply,
    404,
    'Withdrawal not found.',
    undefined,
    API_ERROR_CODES.WITHDRAWAL_NOT_FOUND
  );

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

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'crypto_deposit_channel_create',
          targetType: 'crypto_deposit_channel',
          targetId: created.id,
          metadata: {
            providerId: created.providerId,
            chain: created.chain,
            network: created.network,
            token: created.token,
            isActive: created.isActive,
          },
        }));

        return sendSuccess(reply, created, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to create crypto deposit channel.'
        );
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
          return sendPaymentProviderNotFound(reply);
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
        return sendErrorForException(reply, error, 'Reconciliation run failed.');
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await markDepositProviderPending(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_pending',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));
        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(reply, error, 'Deposit provider handoff failed.');
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await markDepositProviderSucceeded(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_succeeded',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Deposit provider success update failed.'
        );
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await creditDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_credit',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(reply, error, 'Deposit credit failed.');
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await failDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_mark_provider_failed',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Deposit failure update failed.'
        );
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await reverseDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_reverse',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(reply, error, 'Deposit reversal failed.');
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        const updated = await confirmCryptoDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_crypto_confirm',
          targetType: 'deposit',
          targetId: depositId,
          metadata: {
            ...buildFinanceAuditMetadata(updated, review, request),
            confirmations: review.confirmations,
          },
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Crypto deposit confirmation failed.'
        );
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
        return sendInvalidDepositId(reply);
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await rejectCryptoDeposit(depositId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendDepositNotFound(reply);
        }

        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_crypto_reject',
          targetType: 'deposit',
          targetId: depositId,
          metadata: buildFinanceAuditMetadata(updated, review, request),
        }));

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Crypto deposit rejection failed.'
        );
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
        return sendInvalidWithdrawalId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await approveWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(reply, error, 'Withdrawal approval failed.');
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
        return sendInvalidWithdrawalId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await rejectWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(reply, error, 'Withdrawal rejection failed.');
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
        return sendInvalidWithdrawalId(reply);
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
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(
          reply,
          error,
          'Withdrawal provider submission failed.'
        );
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
        return sendInvalidWithdrawalId(reply);
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
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(
          reply,
          error,
          'Withdrawal provider processing update failed.'
        );
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
        return sendInvalidWithdrawalId(reply);
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
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(
          reply,
          error,
          'Withdrawal provider failure update failed.'
        );
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
        return sendInvalidWithdrawalId(reply);
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
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(reply, error, 'Withdrawal payout failed.');
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
        return sendInvalidWithdrawalId(reply);
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        requireOperatorNote(review);
        const updated = await reverseWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(reply, error, 'Withdrawal reversal failed.');
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
        return sendInvalidWithdrawalId(reply);
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireSettlementReference(review);
        const updated = await submitCryptoWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(
          reply,
          error,
          'Crypto withdrawal submission failed.'
        );
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
        return sendInvalidWithdrawalId(reply);
      }

      try {
        const review = parseCryptoReviewPayload(request.body);
        requireSettlementReference(review);
        const updated = await confirmCryptoWithdrawal(withdrawalId, {
          adminId: request.admin?.adminId ?? null,
          ...review,
        });
        if (!updated) {
          return sendWithdrawalNotFound(reply);
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
        return sendErrorForException(
          reply,
          error,
          'Crypto withdrawal confirmation failed.'
        );
      }
    }
  );
}
