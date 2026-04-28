import type { AppInstance } from "../types";
import {
  AmlHitQuerySchema,
  AmlHitReviewBodySchema,
  CollusionDashboardQuerySchema,
  FreezeCreateSchema,
  FreezeRecordQuerySchema,
  FreezeReleaseBodySchema,
  RiskManualFlagClearSchema,
  RiskManualFlagCreateSchema,
} from "@reward/shared-types/admin";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import { NotificationDeliveryQuerySchema } from "@reward/shared-types/notification";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import {
  getPendingAmlHitSummary,
  listPendingAmlHits,
  reviewPendingAmlHit,
} from "../../../modules/aml/service";
import {
  clearManualCollusionFlag,
  ensureUserFreeze,
  getCollusionDashboard,
  listFrozenUsers,
  releaseUserFreeze,
  upsertManualCollusionFlag,
} from "../../../modules/risk/service";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  getNotificationDeliverySummary,
  listNotificationDeliveries,
  retryFailedNotificationDelivery,
} from "../../../modules/auth/notification-service";
import { withAdminAuditContext } from "../../admin-audit";
import { parseSchema } from "../../../shared/validation";
import { requireAdminPermission } from "../../guards";
import { sendError, sendSuccess } from "../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "./common";

export async function registerAdminSecurityRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    "/admin/notification-deliveries",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(
        NotificationDeliveryQuerySchema,
        toObject(request.query),
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

      const [summary, items] = await Promise.all([
        getNotificationDeliverySummary(),
        listNotificationDeliveries(parsed.data),
      ]);

      return sendSuccess(reply, {
        summary,
        items,
      });
    },
  );

  protectedRoutes.post(
    "/admin/notification-deliveries/:deliveryId/retry",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const deliveryId = parseIdParam(request.params, "deliveryId");
      if (!deliveryId) {
        return sendError(
          reply,
          400,
          "Invalid notification delivery id.",
          undefined,
          API_ERROR_CODES.INVALID_NOTIFICATION_DELIVERY_ID,
        );
      }

      const result = await retryFailedNotificationDelivery(deliveryId);
      if (!result.ok) {
        if (result.reason === "not_found") {
          return sendError(
            reply,
            404,
            "Notification delivery not found.",
            undefined,
            API_ERROR_CODES.NOTIFICATION_DELIVERY_NOT_FOUND,
          );
        }

        return sendError(
          reply,
          409,
          `Only failed notification deliveries can be retried. Current status: ${result.status}.`,
          undefined,
          API_ERROR_CODES.NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED,
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "notification_delivery_retry",
          targetType: "notification_delivery",
          targetId: deliveryId,
          metadata: {
            status: "pending",
          },
        }),
      );

      return sendSuccess(reply, {
        id: result.deliveryId,
        status: "pending",
      });
    },
  );

  protectedRoutes.get(
    "/admin/risk/collusion",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(
        CollusionDashboardQuerySchema,
        toObject(request.query),
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

      const dashboard = await getCollusionDashboard(parsed.data);
      return sendSuccess(reply, dashboard);
    },
  );

  protectedRoutes.post(
    "/admin/risk/collusion/manual-flags",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER, {
          requireBreakGlass: true,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        RiskManualFlagCreateSchema,
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

      const record = await upsertManualCollusionFlag({
        userId: parsed.data.userId,
        adminId: request.admin?.adminId ?? null,
        reason: parsed.data.reason ?? null,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "collusion_manual_flag_create",
          targetType: "user",
          targetId: parsed.data.userId,
          metadata: {
            reason: parsed.data.reason ?? null,
            suspiciousAccountId: record?.id ?? null,
          },
        }),
      );

      return sendSuccess(reply, record, 201);
    },
  );

  protectedRoutes.post(
    "/admin/risk/collusion/manual-flags/:userId/clear",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const userId = parseIdParam(request.params, "userId");
      if (!userId) {
        return sendError(
          reply,
          400,
          "Invalid user id.",
          undefined,
          API_ERROR_CODES.INVALID_USER_ID,
        );
      }

      const parsed = parseSchema(
        RiskManualFlagClearSchema,
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

      const cleared = await clearManualCollusionFlag({
        userId,
        adminId: request.admin?.adminId ?? null,
        reason: parsed.data.reason ?? null,
      });

      if (!cleared) {
        return sendError(
          reply,
          404,
          "Open risk flag not found.",
          undefined,
          API_ERROR_CODES.NOT_FOUND,
        );
      }

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "collusion_manual_flag_clear",
          targetType: "user",
          targetId: userId,
          metadata: {
            reason: parsed.data.reason ?? null,
            suspiciousAccountId: cleared.id,
          },
        }),
      );

      return sendSuccess(reply, cleared);
    },
  );

  protectedRoutes.get(
    "/admin/aml-checks",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(AmlHitQuerySchema, toObject(request.query));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const query = parsed.data;
      const limit = query.limit ?? 50;
      const page = query.page ?? 1;
      const offset = (page - 1) * limit;
      const sort = query.sort ?? "desc";
      const [records, summary] = await Promise.all([
        listPendingAmlHits({ limit: limit + 1, offset, order: sort }),
        getPendingAmlHitSummary(),
      ]);
      const hasNext = records.length > limit;
      const items = hasNext ? records.slice(0, limit) : records;

      return sendSuccess(reply, { items, page, limit, hasNext, summary });
    },
  );

  for (const reviewAction of ["clear", "confirm", "escalate"] as const) {
    const requiredPermission =
      reviewAction === "clear"
        ? ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER
        : ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER;

    protectedRoutes.post(
      `/admin/aml-checks/:amlCheckId/${reviewAction}`,
      {
        config: { rateLimit: adminRateLimit },
        preHandler: [
          requireAdminPermission(requiredPermission),
          enforceAdminLimit,
        ],
      },
      async (request, reply) => {
        const amlCheckId = parseIdParam(request.params, "amlCheckId");
        if (!amlCheckId) {
          return sendError(
            reply,
            400,
            "Invalid AML check id.",
            undefined,
            API_ERROR_CODES.INVALID_REQUEST,
          );
        }

        const parsed = parseSchema(
          AmlHitReviewBodySchema,
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

        const reviewed = await reviewPendingAmlHit({
          amlCheckId,
          adminId: request.admin?.adminId ?? 0,
          action: reviewAction,
          note: parsed.data.note ?? null,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: `aml_hit_${reviewAction}`,
            targetType: "aml_check",
            targetId: amlCheckId,
            metadata: {
              userId: reviewed.userId,
              checkpoint: reviewed.checkpoint,
              riskLevel: reviewed.riskLevel,
              reviewStatus: reviewed.reviewStatus,
              note: parsed.data.note ?? null,
              freezeRecordIds: reviewed.freezeRecordIds,
              activeFreezeReason: reviewed.activeFreezeReason,
            },
          }),
        );

        return sendSuccess(reply, reviewed);
      },
    );
  }

  protectedRoutes.get(
    "/admin/freeze-records",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(
        FreezeRecordQuerySchema,
        toObject(request.query),
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

      const query = parsed.data;
      const limit = query.limit ?? 50;
      const page = query.page ?? 1;
      const offset = (page - 1) * limit;
      const sort = query.sort ?? "desc";
      const records = await listFrozenUsers(
        limit + 1,
        offset,
        sort,
        query.userId ?? null
      );
      const hasNext = records.length > limit;
      const items = hasNext ? records.slice(0, limit) : records;

      return sendSuccess(reply, { items, page, limit, hasNext });
    },
  );

  protectedRoutes.post(
    "/admin/freeze-records/:freezeRecordId/release",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const freezeRecordId = parseIdParam(request.params, "freezeRecordId");
      if (!freezeRecordId) {
        return sendError(
          reply,
          400,
          "Invalid freeze record id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        FreezeReleaseBodySchema,
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

      const released = await releaseUserFreeze({ freezeRecordId });
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
          action: "freeze_release",
          targetType: "user",
          targetId: released.userId,
          metadata: {
            freezeRecordId: released.id,
            previousReason: released.reason ?? null,
            previousScope: released.scope,
            reason: parsed.data.reason?.trim() || null,
          },
        }),
      );

      return sendSuccess(reply, released);
    },
  );

  protectedRoutes.post(
    "/admin/freeze-records",
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
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const payload = parsed.data;
      const record = await ensureUserFreeze({
        userId: payload.userId,
        category: payload.category,
        reason: payload.reason,
        scope: payload.scope,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "freeze_create",
          targetType: "user",
          targetId: payload.userId,
          metadata: {
            freezeRecordId: record?.id ?? null,
            category: payload.category,
            reason: payload.reason,
            scope: payload.scope,
          },
        }),
      );

      return sendSuccess(reply, record, 201);
    },
  );
}
