import type { FastifyReply, FastifyRequest } from "fastify";

import {
  KycAdminReviewQuerySchema,
  KycApproveRequestSchema,
  KycRejectRequestSchema,
  KycRequestMoreInfoRequestSchema,
  KycRequestReverificationRequestSchema,
} from "@reward/shared-types/kyc";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import type { AppInstance } from "../types";
import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  getAdminKycDetail,
  listAdminKycQueue,
  loadKycDocumentPreview,
  reviewKycProfile,
  triggerKycReverification,
} from "../../../modules/kyc/service";
import { withAdminAuditContext } from "../../admin-audit";
import { requireAdminPermission } from "../../guards";
import { sendError, sendSuccess } from "../../respond";
import { parseSchema } from "../../../shared/validation";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  readStringValue,
  toObject,
} from "./common";

const resolveRequestOrigin = (request: FastifyRequest) => {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const host = request.headers.host;
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim() !== ""
      ? forwardedProto.split(",")[0]?.trim()
      : request.protocol;

  return `${protocol}://${host ?? "localhost:4000"}`;
};

const parseReviewTargetId = (request: FastifyRequest, reply: FastifyReply) => {
  const profileId = parseIdParam(request.params, "profileId");
  if (profileId) {
    return profileId;
  }

  sendError(
    reply,
    400,
    "Invalid KYC profile id.",
    undefined,
    API_ERROR_CODES.INVALID_REQUEST,
  );
  return null;
};

export async function registerPublicAdminKycRoutes(app: AppInstance) {
  const servePreview = async (request: FastifyRequest, reply: FastifyReply) => {
    const token =
      readStringValue(request.params, "token") ??
      readStringValue(request.query, "token");
    if (!token) {
      return sendError(
        reply,
        404,
        "KYC document preview not found.",
        undefined,
        API_ERROR_CODES.NOT_FOUND,
      );
    }

    const preview = await loadKycDocumentPreview(token);
    reply.header("cache-control", "private, max-age=300");
    reply.header("content-disposition", `inline; filename="${preview.fileName}"`);
    reply.type(preview.contentType);
    return reply.send(preview.body);
  };

  app.get("/admin/kyc-document-previews", servePreview);
  app.get("/admin/kyc-document-previews/:token", servePreview);
}

export async function registerAdminKycRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/kyc-profiles",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(
        KycAdminReviewQuerySchema,
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

      return sendSuccess(reply, await listAdminKycQueue(parsed.data));
    },
  );

  protectedRoutes.get(
    "/admin/kyc-profiles/:profileId",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_READ)] },
    async (request, reply) => {
      const profileId = parseIdParam(request.params, "profileId");
      if (!profileId) {
        return sendError(
          reply,
          400,
          "Invalid KYC profile id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      return sendSuccess(
        reply,
        await getAdminKycDetail(profileId, resolveRequestOrigin(request)),
      );
    },
  );

  protectedRoutes.post(
    "/admin/kyc-profiles/:profileId/approve",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_REVIEW),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const profileId = parseReviewTargetId(request, reply);
      if (!profileId) {
        return;
      }

      const parsed = parseSchema(KycApproveRequestSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const result = await reviewKycProfile({
        profileId,
        adminId: request.admin?.adminId ?? 0,
        decision: "approved",
        reason: parsed.data.reason ?? null,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "kyc_profile_approve",
          targetType: "kyc_profile",
          targetId: profileId,
          metadata: {
            status: result.status,
            freezeRecordId: result.freezeRecordId ?? null,
            reason: parsed.data.reason ?? null,
          },
        }),
      );

      return sendSuccess(reply, result);
    },
  );

  protectedRoutes.post(
    "/admin/kyc-profiles/:profileId/reject",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_REVIEW),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const profileId = parseReviewTargetId(request, reply);
      if (!profileId) {
        return;
      }

      const parsed = parseSchema(KycRejectRequestSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const result = await reviewKycProfile({
        profileId,
        adminId: request.admin?.adminId ?? 0,
        decision: "rejected",
        reason: parsed.data.reason,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "kyc_profile_reject",
          targetType: "kyc_profile",
          targetId: profileId,
          metadata: {
            status: result.status,
            freezeRecordId: result.freezeRecordId ?? null,
            reason: parsed.data.reason,
          },
        }),
      );

      return sendSuccess(reply, result);
    },
  );

  protectedRoutes.post(
    "/admin/kyc-profiles/:profileId/request-more-info",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_REVIEW),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const profileId = parseReviewTargetId(request, reply);
      if (!profileId) {
        return;
      }

      const parsed = parseSchema(
        KycRequestMoreInfoRequestSchema,
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

      const result = await reviewKycProfile({
        profileId,
        adminId: request.admin?.adminId ?? 0,
        decision: "request_more_info",
        reason: parsed.data.reason ?? null,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "kyc_profile_request_more_info",
          targetType: "kyc_profile",
          targetId: profileId,
          metadata: {
            status: result.status,
            freezeRecordId: result.freezeRecordId ?? null,
            reason: parsed.data.reason ?? null,
          },
        }),
      );

      return sendSuccess(reply, result);
    },
  );

  protectedRoutes.post(
    "/admin/kyc-profiles/:profileId/request-reverification",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.KYC_REVIEW),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const profileId = parseReviewTargetId(request, reply);
      if (!profileId) {
        return;
      }

      const parsed = parseSchema(
        KycRequestReverificationRequestSchema,
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

      const result = await triggerKycReverification({
        profileId,
        adminId: request.admin?.adminId ?? 0,
        trigger: "policy_update",
        reason: parsed.data.reason ?? null,
      });

      await recordAdminAction(
        withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "kyc_profile_request_reverification",
          targetType: "kyc_profile",
          targetId: profileId,
          metadata: {
            status: result.status,
            currentTier: result.currentTier,
            requestedTier: result.requestedTier,
            freezeRecordId: result.freezeRecordId ?? null,
            reason: parsed.data.reason ?? null,
          },
        }),
      );

      return sendSuccess(reply, result);
    },
  );
}
