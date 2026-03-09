import type { FastifyInstance } from 'fastify';

import {
  listPrizes,
  createPrize,
  updatePrize,
  togglePrize,
  softDeletePrize,
  getAnalyticsSummary,
} from '../../modules/admin/service';
import { requireAdmin } from '../guards';
import { sendError, sendSuccess } from '../respond';
import { validatePrizeCreate, validatePrizeUpdate } from '../validators';

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin/prizes', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const prizes = await listPrizes();
    return sendSuccess(reply, prizes);
  });

  app.post('/admin/prizes', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const payload = request.body as {
      name?: string;
      stock?: number;
      weight?: number;
      poolThreshold?: string;
      rewardAmount?: string;
      isActive?: boolean;
    };
    const validation = validatePrizeCreate(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const created = await createPrize({
      name: String(payload.name ?? ''),
      stock: Number(payload.stock ?? 0),
      weight: Number(payload.weight ?? 1),
      poolThreshold: String(payload.poolThreshold ?? '0'),
      rewardAmount: String(payload.rewardAmount ?? '0'),
      isActive: Boolean(payload.isActive ?? true),
    });

    return sendSuccess(reply, created, 201);
  });

  app.patch('/admin/prizes/:prizeId', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const { prizeId } = request.params as { prizeId: string };
    const parsedPrizeId = Number(prizeId);
    if (!Number.isFinite(parsedPrizeId) || parsedPrizeId <= 0) {
      return sendError(reply, 400, 'Invalid prize id.');
    }

    const payload = request.body as {
      name?: string;
      stock?: number;
      weight?: number;
      poolThreshold?: string;
      rewardAmount?: string;
      isActive?: boolean;
    };
    const validation = validatePrizeUpdate(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const updated = await updatePrize(parsedPrizeId, {
      name: payload.name,
      stock: payload.stock,
      weight: payload.weight,
      poolThreshold: payload.poolThreshold,
      rewardAmount: payload.rewardAmount,
      isActive: payload.isActive,
    });

    if (!updated) {
      return sendError(reply, 404, 'Prize not found.');
    }

    return sendSuccess(reply, updated);
  });

  app.patch('/admin/prizes/:prizeId/toggle', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const { prizeId } = request.params as { prizeId: string };
    const parsedPrizeId = Number(prizeId);
    if (!Number.isFinite(parsedPrizeId) || parsedPrizeId <= 0) {
      return sendError(reply, 400, 'Invalid prize id.');
    }

    const updated = await togglePrize(parsedPrizeId);

    if (!updated) {
      return sendError(reply, 404, 'Prize not found.');
    }

    return sendSuccess(reply, updated);
  });

  app.delete('/admin/prizes/:prizeId', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const { prizeId } = request.params as { prizeId: string };
    const parsedPrizeId = Number(prizeId);
    if (!Number.isFinite(parsedPrizeId) || parsedPrizeId <= 0) {
      return sendError(reply, 400, 'Invalid prize id.');
    }

    const deleted = await softDeletePrize(parsedPrizeId);

    if (!deleted) {
      return sendError(reply, 404, 'Prize not found.');
    }

    return sendSuccess(reply, deleted);
  });

  app.get('/admin/analytics/summary', async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const summary = await getAnalyticsSummary();
    return sendSuccess(reply, summary);
  });
}
