import type { AppInstance } from "../types";
import {
  AdminDataDeletionQueueSchema,
  ReviewDataDeletionRequestSchema,
} from "@reward/shared-types/data-rights";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  approveAndCompleteDataDeletionRequest,
  listDataDeletionRequestsForAdmin,
  rejectDataDeletionRequest,
} from "../../../modules/data-rights/service";
import { withAdminAuditContext } from "../../admin-audit";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import { parseSchema } from "../../../shared/validation";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "./common";

export async function registerAdminDataRightsRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    "/admin/legal/data-deletion-requests",
    {
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)],
    },
    async (_request, reply) => {
      const queue = await listDataDeletionRequestsForAdmin();
      return sendSuccess(reply, AdminDataDeletionQueueSchema.parse(queue));
    },
  );

  protectedRoutes.post(
    "/admin/legal/data-deletion-requests/:requestId/approve",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const requestId = parseIdParam(request.params, "requestId");
      if (!requestId) {
        return sendError(
          reply,
          400,
          "Invalid data deletion request id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        ReviewDataDeletionRequestSchema,
        toObject(request.body),
      );
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
        const result = await approveAndCompleteDataDeletionRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
          reviewNotes: parsed.data.reviewNotes ?? null,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "data_deletion_request_approved",
            targetType: "data_deletion_request",
            targetId: requestId,
            metadata: {
              userId: result.userId,
              status: result.status,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to approve the data deletion request.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/legal/data-deletion-requests/:requestId/reject",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const requestId = parseIdParam(request.params, "requestId");
      if (!requestId) {
        return sendError(
          reply,
          400,
          "Invalid data deletion request id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        ReviewDataDeletionRequestSchema,
        toObject(request.body),
      );
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
        const result = await rejectDataDeletionRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
          reviewNotes: parsed.data.reviewNotes ?? "",
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "data_deletion_request_rejected",
            targetType: "data_deletion_request",
            targetId: requestId,
            metadata: {
              userId: result.userId,
              status: result.status,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to reject the data deletion request.",
        );
      }
    },
  );
}
