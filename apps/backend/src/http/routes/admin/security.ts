import type { AppInstance } from '../types';
import { FreezeCreateSchema, FreezeRecordQuerySchema, FreezeReleaseBodySchema } from '@reward/shared-types';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { ensureUserFreeze, listFrozenUsers, releaseUserFreeze } from '../../../modules/risk/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { parseSchema } from '../../../shared/validation';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from './common';

export async function registerAdminSecurityRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/freeze-records',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(FreezeRecordQuerySchema, toObject(request.query));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const query = parsed.data;
      const limit = query.limit ?? 50;
      const page = query.page ?? 1;
      const offset = (page - 1) * limit;
      const sort = query.sort ?? 'desc';
      const records = await listFrozenUsers(limit + 1, offset, sort);
      const hasNext = records.length > limit;
      const items = hasNext ? records.slice(0, limit) : records;

      return sendSuccess(reply, { items, page, limit, hasNext });
    }
  );

  protectedRoutes.post(
    '/admin/freeze-records/:userId/release',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(reply, 400, 'Invalid user id.');
      }

      const parsed = parseSchema(FreezeReleaseBodySchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const released = await releaseUserFreeze({ userId });
      if (!released) {
        return sendError(reply, 404, 'Freeze record not found.');
      }

      await recordAdminAction({
        adminId: request.admin?.adminId ?? null,
        action: 'freeze_release',
        targetType: 'user',
        targetId: userId,
        metadata: {
          previousReason: released.reason ?? null,
          reason: parsed.data.reason?.trim() || null,
        },
        ip: request.ip,
      });

      return sendSuccess(reply, released);
    }
  );

  protectedRoutes.post(
    '/admin/freeze-records',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(FreezeCreateSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const payload = parsed.data;
      const record = await ensureUserFreeze({
        userId: payload.userId,
        reason: payload.reason ?? null,
      });

      await recordAdminAction({
        adminId: request.admin?.adminId ?? null,
        action: 'freeze_create',
        targetType: 'user',
        targetId: payload.userId,
        metadata: { reason: payload.reason ?? null },
        ip: request.ip,
      });

      return sendSuccess(reply, record, 201);
    }
  );
}
