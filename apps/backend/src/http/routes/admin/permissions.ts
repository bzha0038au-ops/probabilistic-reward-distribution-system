import type { AppInstance } from '../types';
import {
  AdminPermissionScopeOverviewSchema,
  AdminPermissionScopeUpdateSchema,
} from '@reward/shared-types/admin';
import { API_ERROR_CODES } from '@reward/shared-types/api';

import {
  ADMIN_PERMISSION_KEYS,
  MANAGED_ADMIN_SCOPE_DEFINITIONS,
} from '../../../modules/admin-permission/definitions';
import {
  listAdminPermissionScopeAssignments,
  syncManagedAdminPermissionScopes,
} from '../../../modules/admin-permission/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { parseSchema } from '../../../shared/validation';
import { withAdminAuditContext } from '../../admin-audit';
import { requireAdminPermission } from '../../guards';
import {
  sendError,
  sendErrorForException,
  sendSuccess,
} from '../../respond';
import { adminRateLimit, enforceAdminLimit, parseIdParam, toObject } from './common';

const buildConfirmationText = (adminId: number) => `APPLY ENGINE SCOPES ${adminId}`;

export async function registerAdminPermissionRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/engine/permissions',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (_request, reply) => {
      try {
        const response = {
          admins: await listAdminPermissionScopeAssignments(),
          scopePool: [...MANAGED_ADMIN_SCOPE_DEFINITIONS],
        };
        const parsed = AdminPermissionScopeOverviewSchema.safeParse(response);
        if (!parsed.success) {
          return sendError(
            reply,
            500,
            'Failed to serialize admin permission scopes.'
          );
        }

        return sendSuccess(reply, parsed.data);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to load admin permission scopes.'
        );
      }
    }
  );

  protectedRoutes.put(
    '/admin/engine/permissions/:adminId',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const adminId = parseIdParam(request.params, 'adminId');
      if (!adminId) {
        return sendError(
          reply,
          400,
          'Invalid admin id.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const parsed = parseSchema(
        AdminPermissionScopeUpdateSchema,
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

      const expectedConfirmationText = buildConfirmationText(adminId);
      if (parsed.data.confirmationText.trim() !== expectedConfirmationText) {
        return sendError(
          reply,
          400,
          'Second confirmation required.',
          [`confirmationText must equal ${expectedConfirmationText}`],
          API_ERROR_CODES.SECOND_CONFIRMATION_REQUIRED
        );
      }

      try {
        const result = await syncManagedAdminPermissionScopes(
          adminId,
          parsed.data.scopeKeys,
          {
            excludeSessionId: request.admin?.sessionId ?? null,
          }
        );

        if (result.addedScopes.length > 0 || result.removedScopes.length > 0) {
          await recordAdminAction(
            withAdminAuditContext(request, {
              adminId: request.admin?.adminId ?? null,
              action: 'engine_permission_scopes_updated',
              targetType: 'admin',
              targetId: adminId,
              metadata: {
                targetAdminEmail: result.admin.email,
                addedScopes: result.addedScopes,
                removedScopes: result.removedScopes,
                managedScopes: result.admin.managedScopes,
                legacyPermissionCount: result.admin.legacyPermissions.length,
              },
            })
          );
        }

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to save admin permission scopes.'
        );
      }
    }
  );
}
