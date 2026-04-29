import type { AppInstance } from '../types';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import { AssetCodeSchema } from '@reward/shared-types/economy';
import { z } from 'zod';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { recordAdminAction } from '../../../modules/admin/audit';
import {
  createAdminEconomyAdjustment,
  getAdminEconomyOrderDetail,
  getAdminEconomyOverview,
  replayAdminEconomyOrder,
  reverseAdminEconomyOrder,
} from '../../../modules/economy/admin-service';
import { withAdminAuditContext } from '../../admin-audit';
import { requireAdminPermission } from '../../guards';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import { parseSchema } from '../../../shared/validation';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from './common';

const EconomyAdjustmentSchema = z.object({
  userId: z.number().int().positive(),
  assetCode: AssetCodeSchema,
  amount: z.string().trim().min(1).max(32),
  direction: z.enum(['credit', 'debit']),
  reason: z.string().trim().min(1).max(255),
});

const EconomyOrderReverseSchema = z.object({
  targetStatus: z.union([z.literal('refunded'), z.literal('revoked')]),
  reason: z.string().trim().min(1).max(255),
});

export async function registerAdminEconomyRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/economy/overview',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (_request, reply) => {
      const overview = await getAdminEconomyOverview();
      return sendSuccess(reply, overview);
    },
  );

  protectedRoutes.get(
    '/admin/economy/orders/:orderId',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const orderId = parseIdParam(request.params, 'orderId');
      if (!orderId) {
        return sendError(
          reply,
          400,
          'Invalid store purchase order id.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        return sendSuccess(reply, await getAdminEconomyOrderDetail(orderId));
      } catch (error) {
        return sendErrorForException(reply, error, 'Failed to load economy order.');
      }
    },
  );

  protectedRoutes.post(
    '/admin/economy/orders/:orderId/replay-fulfillment',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const orderId = parseIdParam(request.params, 'orderId');
      if (!orderId) {
        return sendError(
          reply,
          400,
          'Invalid store purchase order id.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const result = await replayAdminEconomyOrder({
          orderId,
          adminId: request.admin?.adminId ?? null,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: 'economy_order_replay_fulfillment',
            targetType: 'store_purchase_order',
            targetId: orderId,
            metadata: {
              status: result.order.status,
              deliveryType: result.product.deliveryType,
              storeChannel: result.product.storeChannel,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to replay store purchase fulfillment.',
        );
      }
    },
  );

  protectedRoutes.post(
    '/admin/economy/orders/:orderId/reverse',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const orderId = parseIdParam(request.params, 'orderId');
      if (!orderId) {
        return sendError(
          reply,
          400,
          'Invalid store purchase order id.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(EconomyOrderReverseSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const result = await reverseAdminEconomyOrder({
          orderId,
          targetStatus: parsed.data.targetStatus,
          reason: parsed.data.reason,
          adminId: request.admin?.adminId ?? null,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: 'economy_order_reverse',
            targetType: 'store_purchase_order',
            targetId: orderId,
            metadata: {
              targetStatus: parsed.data.targetStatus,
              reason: parsed.data.reason,
              storeChannel: result.order.storeChannel,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(reply, error, 'Failed to reverse store purchase order.');
      }
    },
  );

  protectedRoutes.post(
    '/admin/economy/adjustments',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(EconomyAdjustmentSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const result = await createAdminEconomyAdjustment({
          userId: parsed.data.userId,
          assetCode: parsed.data.assetCode,
          amount: parsed.data.amount,
          direction: parsed.data.direction,
          reason: parsed.data.reason,
          adminId: request.admin?.adminId ?? null,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: 'economy_manual_adjustment',
            targetType: 'user',
            targetId: parsed.data.userId,
            metadata: {
              assetCode: parsed.data.assetCode,
              amount: parsed.data.amount,
              direction: parsed.data.direction,
              reason: parsed.data.reason,
            },
          }),
        );

        return sendSuccess(reply, result, 201);
      } catch (error) {
        return sendErrorForException(reply, error, 'Failed to create economy adjustment.');
      }
    },
  );
}
