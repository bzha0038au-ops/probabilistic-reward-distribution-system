import type { AppInstance } from '../types';
import { PrizeCreateSchema, PrizeUpdateSchema } from '@reward/shared-types';

import {
  createPrize,
  listPrizes,
  softDeletePrize,
  togglePrize,
  updatePrize,
} from '../../../modules/admin/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { parseSchema } from '../../../shared/validation';
import { sendError, sendSuccess } from '../../respond';
import { adminRateLimit, enforceAdminLimit, parseIdParam, toObject } from './common';

export async function registerAdminPrizeRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get('/admin/prizes', async (_request, reply) => {
    const prizes = await listPrizes();
    return sendSuccess(reply, prizes);
  });

  protectedRoutes.post(
    '/admin/prizes',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const parsed = parseSchema(PrizeCreateSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const payload = parsed.data;
      const created = await createPrize({
        name: payload.name,
        stock: Number(payload.stock ?? 0),
        weight: Number(payload.weight ?? 1),
        poolThreshold: String(payload.poolThreshold ?? '0'),
        userPoolThreshold: String(payload.userPoolThreshold ?? '0'),
        rewardAmount: String(payload.rewardAmount ?? '0'),
        payoutBudget: String(payload.payoutBudget ?? '0'),
        payoutPeriodDays: Number(payload.payoutPeriodDays ?? 1),
        isActive: Boolean(payload.isActive ?? true),
      });

      await recordAdminAction({
        adminId: request.admin?.userId ?? null,
        action: 'prize_create',
        targetType: 'prize',
        targetId: created?.id ?? null,
        metadata: { ...payload },
        ip: request.ip,
      });

      return sendSuccess(reply, created, 201);
    }
  );

  protectedRoutes.patch(
    '/admin/prizes/:prizeId',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const prizeId = parseIdParam(request.params, 'prizeId');
      if (!prizeId) {
        return sendError(reply, 400, 'Invalid prize id.');
      }

      const parsed = parseSchema(PrizeUpdateSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const payload = parsed.data;
      const updated = await updatePrize(prizeId, {
        name: payload.name,
        stock:
          payload.stock !== undefined ? Number(payload.stock) : undefined,
        weight:
          payload.weight !== undefined ? Number(payload.weight) : undefined,
        poolThreshold:
          payload.poolThreshold !== undefined
            ? String(payload.poolThreshold)
            : undefined,
        userPoolThreshold:
          payload.userPoolThreshold !== undefined
            ? String(payload.userPoolThreshold)
            : undefined,
        rewardAmount:
          payload.rewardAmount !== undefined
            ? String(payload.rewardAmount)
            : undefined,
        payoutBudget:
          payload.payoutBudget !== undefined
            ? String(payload.payoutBudget)
            : undefined,
        payoutPeriodDays:
          payload.payoutPeriodDays !== undefined
            ? Number(payload.payoutPeriodDays)
            : undefined,
        isActive: payload.isActive,
      });

      if (!updated) {
        return sendError(reply, 404, 'Prize not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.userId ?? null,
        action: 'prize_update',
        targetType: 'prize',
        targetId: prizeId,
        metadata: { ...payload },
        ip: request.ip,
      });

      return sendSuccess(reply, updated);
    }
  );

  protectedRoutes.patch(
    '/admin/prizes/:prizeId/toggle',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const prizeId = parseIdParam(request.params, 'prizeId');
      if (!prizeId) {
        return sendError(reply, 400, 'Invalid prize id.');
      }

      const updated = await togglePrize(prizeId);
      if (!updated) {
        return sendError(reply, 404, 'Prize not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.userId ?? null,
        action: 'prize_toggle',
        targetType: 'prize',
        targetId: prizeId,
        metadata: { isActive: updated.isActive },
        ip: request.ip,
      });

      return sendSuccess(reply, updated);
    }
  );

  protectedRoutes.delete(
    '/admin/prizes/:prizeId',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const prizeId = parseIdParam(request.params, 'prizeId');
      if (!prizeId) {
        return sendError(reply, 400, 'Invalid prize id.');
      }

      const deleted = await softDeletePrize(prizeId);
      if (!deleted) {
        return sendError(reply, 404, 'Prize not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.userId ?? null,
        action: 'prize_delete',
        targetType: 'prize',
        targetId: prizeId,
        ip: request.ip,
      });

      return sendSuccess(reply, deleted);
    }
  );
}
