import type { AppInstance } from "../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  ForumBulkDeletePostsSchema,
  ForumModerationOverviewSchema,
  ForumModerationQuerySchema,
  ForumMuteUserSchema,
  ForumReleaseMuteSchema,
} from "@reward/shared-types/forum";

import { recordAdminAction } from "../../../modules/admin/audit";
import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import {
  bulkDeleteReportedPosts,
  getForumModerationOverview,
  muteForumUser,
  releaseForumMute,
} from "../../../modules/forum/moderation-service";
import { parseSchema } from "../../../shared/validation";
import { withAdminAuditContext } from "../../admin-audit";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import { adminRateLimit, enforceAdminLimit, toObject } from "./common";

export async function registerAdminForumRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/forum/moderation/overview",
    {
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(ForumModerationQuerySchema, toObject(request.query));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const overview = await getForumModerationOverview({
        limit: parsed.data.limit,
        muteLimit: parsed.data.muteLimit,
      });
      const normalized = ForumModerationOverviewSchema.parse(overview);
      return sendSuccess(reply, normalized);
    },
  );

  protectedRoutes.post(
    "/admin/forum/moderation/posts/bulk-delete",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(ForumBulkDeletePostsSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const result = await bulkDeleteReportedPosts({
          adminId: request.admin?.adminId ?? null,
          postIds: parsed.data.postIds,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "forum_posts_bulk_deleted",
            targetType: "community_post",
            targetId: result.deletedPostIds[0] ?? null,
            metadata: {
              postIds: result.deletedPostIds,
              resolvedReportCount: result.resolvedReportCount,
              reason: parsed.data.reason,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to delete reported posts.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/forum/moderation/mutes",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(ForumMuteUserSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const record = await muteForumUser(parsed.data);
      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "forum_user_muted",
          targetType: "user",
          targetId: parsed.data.userId,
          metadata: {
            freezeRecordId: record?.id ?? null,
            reason: parsed.data.reason,
            scope: "gameplay_lock",
          },
        }),
      );

      return sendSuccess(reply, record, 201);
    },
  );

  protectedRoutes.post(
    "/admin/forum/moderation/mutes/release",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE),
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(ForumReleaseMuteSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const released = await releaseForumMute({
        freezeRecordId: parsed.data.freezeRecordId,
      });

      if (!released) {
        return sendError(
          reply,
          404,
          "Freeze record not found.",
          undefined,
          API_ERROR_CODES.FREEZE_RECORD_NOT_FOUND,
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "forum_user_mute_released",
          targetType: "user",
          targetId: released.userId,
          metadata: {
            freezeRecordId: released.id,
            reason: parsed.data.reason?.trim() || null,
            scope: released.scope,
          },
        }),
      );

      return sendSuccess(reply, released);
    },
  );
}
