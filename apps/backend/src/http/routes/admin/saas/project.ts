import type { AppInstance } from "../../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  SaasApiKeyCreateSchema,
  SaasApiKeyRevokeSchema,
  SaasApiKeyRotateSchema,
  SaasOutboundWebhookCreateSchema,
  SaasOutboundWebhookPatchSchema,
  SaasProjectCreateSchema,
  SaasProjectPatchSchema,
  SaasProjectPrizeCreateSchema,
  SaasProjectPrizePatchSchema,
} from "@reward/shared-types/saas";

import { ADMIN_PERMISSION_KEYS } from "../../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../../modules/admin/audit";
import {
  createProjectApiKey,
  createProjectPrize,
  createSaasOutboundWebhook,
  createSaasProject,
  deleteSaasOutboundWebhook,
  deleteProjectPrize,
  listProjectPrizes,
  rotateProjectApiKey,
  revokeProjectApiKey,
  updateSaasOutboundWebhook,
  updateProjectPrize,
  updateSaasProject,
} from "../../../../modules/saas/service";
import { parseSchema } from "../../../../shared/validation";
import { requireAdminPermission } from "../../../guards";
import {
  sendError,
  sendErrorForException,
  sendSuccess,
} from "../../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "../common";

export async function registerAdminSaasProjectRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.post(
    "/admin/saas/projects",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        SaasProjectCreateSchema,
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
        const project = await createSaasProject(parsed.data, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_project_create",
          targetType: "saas_project",
          targetId: project.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, project, 201);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to create project.");
      }
    },
  );

  protectedRoutes.patch(
    "/admin/saas/projects/:projectId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      if (!projectId) {
        return sendError(
          reply,
          400,
          "Invalid project id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      const parsed = parseSchema(
        SaasProjectPatchSchema,
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
        const project = await updateSaasProject(projectId, parsed.data, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_project_update",
          targetType: "saas_project",
          targetId: project.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, project);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to update project.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/projects/:projectId/outbound-webhooks",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      if (!projectId) {
        return sendError(
          reply,
          400,
          "Invalid project id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      const parsed = parseSchema(
        SaasOutboundWebhookCreateSchema,
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
        const webhook = await createSaasOutboundWebhook(projectId, parsed.data, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_outbound_webhook_create",
          targetType: "saas_outbound_webhook",
          targetId: webhook.id,
          metadata: {
            projectId,
            url: webhook.url,
            events: webhook.events,
            isActive: webhook.isActive,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, webhook, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create outbound webhook.",
        );
      }
    },
  );

  protectedRoutes.patch(
    "/admin/saas/projects/:projectId/outbound-webhooks/:webhookId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const webhookId = parseIdParam(request.params, "webhookId");
      if (!projectId || !webhookId) {
        return sendError(
          reply,
          400,
          "Invalid project or webhook id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      const parsed = parseSchema(
        SaasOutboundWebhookPatchSchema,
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
        const webhook = await updateSaasOutboundWebhook(
          projectId,
          webhookId,
          parsed.data,
          {
            adminId: request.admin!.adminId,
            permissions: request.admin!.permissions,
          },
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_outbound_webhook_update",
          targetType: "saas_outbound_webhook",
          targetId: webhook.id,
          metadata: {
            projectId,
            url: webhook.url,
            events: webhook.events,
            isActive: webhook.isActive,
            secretRotated: parsed.data.secret !== undefined,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, webhook);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to update outbound webhook.",
        );
      }
    },
  );

  protectedRoutes.delete(
    "/admin/saas/projects/:projectId/outbound-webhooks/:webhookId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const webhookId = parseIdParam(request.params, "webhookId");
      if (!projectId || !webhookId) {
        return sendError(
          reply,
          400,
          "Invalid project or webhook id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      try {
        const webhook = await deleteSaasOutboundWebhook(projectId, webhookId, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_outbound_webhook_delete",
          targetType: "saas_outbound_webhook",
          targetId: webhook.id,
          metadata: {
            projectId,
            url: webhook.url,
            events: webhook.events,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, webhook);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to delete outbound webhook.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/projects/:projectId/keys",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      if (!projectId) {
        return sendError(
          reply,
          400,
          "Invalid project id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      const parsed = parseSchema(SaasApiKeyCreateSchema, {
        ...toObject(request.body),
        projectId,
      });
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
        const issued = await createProjectApiKey(
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_api_key_issue",
          targetType: "saas_api_key",
          targetId: issued.id,
          metadata: {
            projectId,
            label: parsed.data.label,
            scopes: issued.scopes,
            keyPrefix: issued.keyPrefix,
            expiresAt: new Date(issued.expiresAt).toISOString(),
          },
          ip: request.ip,
        });
        return sendSuccess(reply, issued, 201);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to issue API key.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/projects/:projectId/keys/:keyId/rotate",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const keyId = parseIdParam(request.params, "keyId");
      if (!projectId || !keyId) {
        return sendError(
          reply,
          400,
          "Invalid project or key id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_OR_KEY_ID,
        );
      }

      const parsed = parseSchema(
        SaasApiKeyRotateSchema,
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
        const rotation = await rotateProjectApiKey(
          projectId,
          keyId,
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_api_key_rotate",
          targetType: "saas_api_key",
          targetId: rotation.issuedKey.id,
          metadata: {
            projectId,
            previousKeyId: rotation.previousKey.id,
            previousKeyPrefix: rotation.previousKey.keyPrefix,
            previousExpiresAt: new Date(
              rotation.previousKey.expiresAt,
            ).toISOString(),
            issuedKeyId: rotation.issuedKey.id,
            issuedKeyPrefix: rotation.issuedKey.keyPrefix,
            issuedScopes: rotation.issuedKey.scopes,
            issuedExpiresAt: new Date(
              rotation.issuedKey.expiresAt,
            ).toISOString(),
            overlapEndsAt: new Date(rotation.overlapEndsAt).toISOString(),
            reason: rotation.reason ?? null,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, rotation, 201);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to rotate API key.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/projects/:projectId/keys/:keyId/revoke",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const keyId = parseIdParam(request.params, "keyId");
      if (!projectId || !keyId) {
        return sendError(
          reply,
          400,
          "Invalid project or key id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_OR_KEY_ID,
        );
      }

      const parsed = parseSchema(
        SaasApiKeyRevokeSchema,
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
        const apiKey = await revokeProjectApiKey(
          projectId,
          keyId,
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_api_key_revoke",
          targetType: "saas_api_key",
          targetId: apiKey.id,
          metadata: {
            projectId,
            reason: parsed.data.reason ?? null,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, apiKey);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to revoke API key.");
      }
    },
  );

  protectedRoutes.get(
    "/admin/saas/projects/:projectId/prizes",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.PRIZES_READ)] },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      if (!projectId) {
        return sendError(
          reply,
          400,
          "Invalid project id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      try {
        return sendSuccess(
          reply,
          await listProjectPrizes(projectId, {
            adminId: request.admin!.adminId,
            permissions: request.admin!.permissions,
          }),
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to load project prizes.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/projects/:projectId/prizes",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.PRIZES_CREATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      if (!projectId) {
        return sendError(
          reply,
          400,
          "Invalid project id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_ID,
        );
      }

      const parsed = parseSchema(
        SaasProjectPrizeCreateSchema,
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
        const prize = await createProjectPrize(projectId, parsed.data, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_project_prize_create",
          targetType: "saas_project_prize",
          targetId: prize.id,
          metadata: { projectId, ...parsed.data },
          ip: request.ip,
        });
        return sendSuccess(reply, prize, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create project prize.",
        );
      }
    },
  );

  protectedRoutes.patch(
    "/admin/saas/projects/:projectId/prizes/:prizeId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.PRIZES_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const prizeId = parseIdParam(request.params, "prizeId");
      if (!projectId || !prizeId) {
        return sendError(
          reply,
          400,
          "Invalid project or prize id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_OR_PRIZE_ID,
        );
      }

      const parsed = parseSchema(
        SaasProjectPrizePatchSchema,
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
        const prize = await updateProjectPrize(
          projectId,
          prizeId,
          parsed.data,
          {
            adminId: request.admin!.adminId,
            permissions: request.admin!.permissions,
          },
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_project_prize_update",
          targetType: "saas_project_prize",
          targetId: prize.id,
          metadata: { projectId, ...parsed.data },
          ip: request.ip,
        });
        return sendSuccess(reply, prize);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to update project prize.",
        );
      }
    },
  );

  protectedRoutes.delete(
    "/admin/saas/projects/:projectId/prizes/:prizeId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.PRIZES_DELETE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const projectId = parseIdParam(request.params, "projectId");
      const prizeId = parseIdParam(request.params, "prizeId");
      if (!projectId || !prizeId) {
        return sendError(
          reply,
          400,
          "Invalid project or prize id.",
          undefined,
          API_ERROR_CODES.INVALID_PROJECT_OR_PRIZE_ID,
        );
      }

      try {
        const prize = await deleteProjectPrize(projectId, prizeId, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_project_prize_delete",
          targetType: "saas_project_prize",
          targetId: prize.id,
          metadata: { projectId },
          ip: request.ip,
        });
        return sendSuccess(reply, prize);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to delete project prize.",
        );
      }
    },
  );
}
