import type { AppInstance } from '../types';
import {
  AdminUserAssociationQuerySchema,
  AdminUserSearchQuerySchema,
  FreezeCreateSchema,
  FreezeReleaseBodySchema,
} from '@reward/shared-types/admin';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import { UserFreezeScopeSchema } from '@reward/shared-types/risk';
import { z } from 'zod';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { recordAdminAction } from '../../../modules/admin/audit';
import {
  forceLogoutUserByAdmin,
  getAdminUserAssociations,
  getAdminUserDetail,
  searchUsersForAdmin,
  triggerUserPasswordResetByAdmin,
} from '../../../modules/user/admin-user-service';
import {
  ensureUserFreeze,
  releaseUserFreeze,
} from '../../../modules/risk/service';
import { withAdminAuditContext } from '../../admin-audit';
import { requireAdminPermission } from '../../guards';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from './common';
import { parseSchema } from '../../../shared/validation';

const UserScopeReleaseSchema = FreezeReleaseBodySchema.extend({
  scope: UserFreezeScopeSchema,
});

const EmptyActionSchema = z.object({});

export async function registerAdminUserRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/users',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(
        AdminUserSearchQuerySchema,
        toObject(request.query)
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const result = await searchUsersForAdmin(
        parsed.data.query,
        parsed.data.limit ?? 20
      );
      return sendSuccess(reply, result);
    }
  );

  protectedRoutes.get(
    '/admin/users/:userId',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const detail = await getAdminUserDetail(userId);
      if (!detail) {
        return sendError(
          reply,
          404,
          'User not found.',
          undefined,
          API_ERROR_CODES.USER_NOT_FOUND
        );
      }

      return sendSuccess(reply, detail);
    }
  );

  protectedRoutes.get(
    '/admin/users/:userId/associations',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const parsed = parseSchema(
        AdminUserAssociationQuerySchema,
        toObject(request.query)
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const graph = await getAdminUserAssociations(userId, parsed.data);
      if (!graph) {
        return sendError(
          reply,
          404,
          'User not found.',
          undefined,
          API_ERROR_CODES.USER_NOT_FOUND
        );
      }

      return sendSuccess(reply, graph);
    }
  );

  protectedRoutes.post(
    '/admin/users/:userId/freeze',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const parsed = parseSchema(
        FreezeCreateSchema.omit({ userId: true }),
        toObject(request.body)
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const record = await ensureUserFreeze({
        userId,
        category: parsed.data.category,
        reason: parsed.data.reason,
        scope: parsed.data.scope,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'user_scope_freeze',
          targetType: 'user',
          targetId: userId,
          metadata: {
            category: parsed.data.category,
            reason: parsed.data.reason,
            scope: parsed.data.scope,
          },
        })
      );

      return sendSuccess(reply, record, 201);
    }
  );

  protectedRoutes.post(
    '/admin/users/:userId/unfreeze',
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
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const parsed = parseSchema(UserScopeReleaseSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const released = await releaseUserFreeze({
        userId,
        scope: parsed.data.scope,
      });
      if (!released) {
        return sendError(
          reply,
          404,
          'Freeze record not found.',
          undefined,
          API_ERROR_CODES.FREEZE_RECORD_NOT_FOUND
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'user_scope_unfreeze',
          targetType: 'user',
          targetId: userId,
          metadata: {
            scope: parsed.data.scope,
            reason: parsed.data.reason?.trim() || null,
          },
        })
      );

      return sendSuccess(reply, released);
    }
  );

  protectedRoutes.post(
    '/admin/users/:userId/force-logout',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const parsed = parseSchema(EmptyActionSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const revoked = await forceLogoutUserByAdmin(userId);
      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'user_force_logout',
          targetType: 'user',
          targetId: userId,
          metadata: {
            revokedCount: revoked.length,
          },
        })
      );

      return sendSuccess(reply, {
        userId,
        revokedCount: revoked.length,
      });
    }
  );

  protectedRoutes.post(
    '/admin/users/:userId/reset-password',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const userId = parseIdParam(request.params, 'userId');
      if (!userId) {
        return sendError(
          reply,
          400,
          'Invalid user id.',
          undefined,
          API_ERROR_CODES.INVALID_USER_ID
        );
      }

      const parsed = parseSchema(EmptyActionSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      try {
        const result = await triggerUserPasswordResetByAdmin(userId);
        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: 'user_password_reset_requested',
            targetType: 'user',
            targetId: userId,
            metadata: {
              email: result.email,
              expiresAt: result.expiresAt.toISOString(),
            },
          })
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to queue password reset.'
        );
      }
    }
  );
}
