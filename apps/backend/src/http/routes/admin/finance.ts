import type { AppInstance } from '../types';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { recordAdminAction } from '../../../modules/admin/audit';
import { approveDeposit, failDeposit, listDeposits } from '../../../modules/top-up/service';
import {
  approveWithdrawal,
  listWithdrawalsAdmin,
  payWithdrawal,
  rejectWithdrawal,
} from '../../../modules/withdraw/service';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  parseLimitFromQuery,
} from './common';

export async function registerAdminFinanceRoutes(protectedRoutes: AppInstance) {
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
    '/admin/deposits/:depositId/approve',
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
        const updated = await approveDeposit(depositId);
        if (!updated) {
          return sendError(reply, 404, 'Deposit not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'deposit_approve',
          targetType: 'deposit',
          targetId: depositId,
          ip: request.ip,
        });
        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Deposit approval failed.';
        return sendError(reply, 422, message);
      }
    }
  );

  protectedRoutes.patch(
    '/admin/deposits/:depositId/fail',
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

      const updated = await failDeposit(depositId);
      if (!updated) {
        return sendError(reply, 404, 'Deposit not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.adminId ?? null,
        action: 'deposit_fail',
        targetType: 'deposit',
        targetId: depositId,
        ip: request.ip,
      });

      return sendSuccess(reply, updated);
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

      const updated = await approveWithdrawal(withdrawalId);
      if (!updated) {
        return sendError(reply, 404, 'Withdrawal not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.adminId ?? null,
        action: 'withdrawal_approve',
        targetType: 'withdrawal',
        targetId: withdrawalId,
        ip: request.ip,
      });

      return sendSuccess(reply, updated);
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
        const updated = await rejectWithdrawal(withdrawalId);
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_reject',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
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
        const updated = await payWithdrawal(withdrawalId);
        if (!updated) {
          return sendError(reply, 404, 'Withdrawal not found.');
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'withdrawal_pay',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          ip: request.ip,
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Withdrawal payout failed.';
        return sendError(reply, 422, message);
      }
    }
  );
}
