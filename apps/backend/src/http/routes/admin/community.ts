import type { AppInstance } from '../types';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  CommunityModerationListQuerySchema,
  ModerateCommunityPostRequestSchema,
  ModerateCommunityThreadRequestSchema,
} from '@reward/shared-types/community';

import { recordAdminAction } from '../../../modules/admin/audit';
import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import {
  listCommunityModerationActions,
  moderateCommunityPost,
  moderateCommunityThread,
  serializeCommunityModerationRecord,
  serializeCommunityPost,
  serializeCommunityThread,
} from '../../../modules/community/service';
import { parseSchema } from '../../../shared/validation';
import { withAdminAuditContext } from '../../admin-audit';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import { parsePositiveInt, toObject } from '../../utils';

export async function registerAdminCommunityRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/community/moderation-actions',
    {
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        CommunityModerationListQuerySchema,
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

      const limit = parsed.data.limit ?? 50;
      const page = parsed.data.page ?? 1;
      const rows = await listCommunityModerationActions({ limit, page });
      const hasNext = rows.length > limit;
      const items = hasNext ? rows.slice(0, limit) : rows;

      return sendSuccess(reply, {
        items: items.map(serializeCommunityModerationRecord),
        page,
        limit,
        hasNext,
      });
    }
  );

  protectedRoutes.post(
    '/admin/community/threads/:threadId/moderate',
    {
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
      ],
    },
    async (request, reply) => {
      const threadId = parsePositiveInt(request.params, 'threadId');
      if (!threadId) {
        return sendError(
          reply,
          400,
          'Invalid community thread id.',
          undefined,
          API_ERROR_CODES.INVALID_COMMUNITY_THREAD_ID
        );
      }

      const parsed = parseSchema(
        ModerateCommunityThreadRequestSchema,
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

      const result = await moderateCommunityThread({
        adminId: request.admin?.adminId ?? null,
        threadId,
        action: parsed.data.action,
        reason: parsed.data.reason ?? null,
      });
      if (!result) {
        return sendError(
          reply,
          404,
          'Community thread not found.',
          undefined,
          API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'community_thread_moderated',
          targetType: 'community_thread',
          targetId: threadId,
          metadata: {
            moderationAction: parsed.data.action,
            reason: parsed.data.reason ?? null,
          },
        })
      );

      return sendSuccess(reply, {
        thread: serializeCommunityThread(result.thread),
        moderation: serializeCommunityModerationRecord(result.moderation),
      });
    }
  );

  protectedRoutes.post(
    '/admin/community/posts/:postId/moderate',
    {
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
      ],
    },
    async (request, reply) => {
      const postId = parsePositiveInt(request.params, 'postId');
      if (!postId) {
        return sendError(
          reply,
          400,
          'Invalid community post id.',
          undefined,
          API_ERROR_CODES.INVALID_COMMUNITY_POST_ID
        );
      }

      const parsed = parseSchema(
        ModerateCommunityPostRequestSchema,
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

      const result = await moderateCommunityPost({
        adminId: request.admin?.adminId ?? null,
        postId,
        action: parsed.data.action,
        reason: parsed.data.reason ?? null,
      });
      if (!result) {
        return sendError(
          reply,
          404,
          'Community post not found.',
          undefined,
          API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: 'community_post_moderated',
          targetType: 'community_post',
          targetId: postId,
          metadata: {
            moderationAction: parsed.data.action,
            reason: parsed.data.reason ?? null,
          },
        })
      );

      return sendSuccess(reply, {
        post: serializeCommunityPost(result.post),
        moderation: serializeCommunityModerationRecord(result.moderation),
      });
    }
  );
}
