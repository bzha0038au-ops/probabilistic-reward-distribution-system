import type { FastifyReply, FastifyRequest } from "fastify";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  SaasApiKeyCreateSchema,
  SaasApiKeyRevokeSchema,
  SaasApiKeyRotateSchema,
  SaasBillingBudgetPolicyPatchSchema,
  SaasBillingDisputeCreateSchema,
  SaasPortalTenantCreateSchema,
  SaasProjectPrizeCreateSchema,
  SaasProjectPrizePatchSchema,
  SaasReportExportCreateSchema,
  SaasReportExportListQuerySchema,
  SaasTenantInviteCreateSchema,
  SaasTenantInviteAcceptSchema,
  SaasTenantMembershipCreateSchema,
} from "@reward/shared-types/saas";

import type { AppInstance } from "../types";
import { requireCurrentLegalAcceptance, requireUserGuard } from "../../guards";
import { parseSchema } from "../../../shared/validation";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  ensurePortalAdminAccessProfile,
  getAdminAccessProfileByUserId,
} from "../../../modules/admin-permission/service";
import {
  acceptSaasTenantInvite,
  createBillingDispute,
  createBillingSetupSession,
  createPortalSaasTenant,
  createCustomerPortalSession,
  createProjectApiKey,
  createProjectPrize,
  createSaasReportExportJob,
  createSaasTenantInvite,
  createSaasTenantMembership,
  deleteSaasTenantMembership,
  deleteProjectPrize,
  getSaasOverview,
  getSaasTenantBillingInsights,
  listSaasReportExportJobs,
  listProjectPrizes,
  loadSaasReportExportDownload,
  revokeSaasTenantInvite,
  revokeProjectApiKey,
  rotateProjectApiKey,
  updateSaasBillingBudgetPolicy,
  updateProjectPrize,
} from "../../../modules/saas/service";
import { toSaasAdminActor } from "../../../modules/saas/records";
import { parseIdParam, toObject } from "../admin/common";

type PortalContext = {
  adminId: number;
  permissions: string[];
};

const PORTAL_ACCESS_SCOPE = "membership" as const;

const resolvePortalContext = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<PortalContext | null> => {
  const currentUser = request.user;
  if (!currentUser) {
    sendError(
      reply,
      401,
      "Unauthorized",
      undefined,
      API_ERROR_CODES.UNAUTHORIZED,
    );
    return null;
  }

  const adminProfile = await getAdminAccessProfileByUserId(currentUser.userId);
  if (!adminProfile) {
    sendError(
      reply,
      403,
      "SaaS portal access is not configured for this account.",
      undefined,
      API_ERROR_CODES.SAAS_TENANT_ACCESS_FORBIDDEN,
    );
    return null;
  }

  return {
    adminId: adminProfile.adminId,
    permissions: adminProfile.permissions,
  };
};

const resolvePortalInviteContext = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<PortalContext | null> => {
  const currentUser = request.user;
  if (!currentUser) {
    sendError(
      reply,
      401,
      "Unauthorized",
      undefined,
      API_ERROR_CODES.UNAUTHORIZED,
    );
    return null;
  }

  const adminProfile = await ensurePortalAdminAccessProfile({
    userId: currentUser.userId,
    email: currentUser.email,
  });
  if (!adminProfile) {
    sendError(
      reply,
      403,
      "SaaS portal access is not configured for this account.",
      undefined,
      API_ERROR_CODES.SAAS_TENANT_ACCESS_FORBIDDEN,
    );
    return null;
  }

  return {
    adminId: adminProfile.adminId,
    permissions: adminProfile.permissions,
  };
};

const resolvePortalActor = (context: PortalContext) =>
  toSaasAdminActor(context.adminId, context.permissions, PORTAL_ACCESS_SCOPE);

const buildDownloadUrlBase = (request: FastifyRequest) => {
  const host = request.headers.host ?? "localhost:4000";
  return `${request.protocol}://${host}`;
};

export async function registerPortalSaasRoutes(app: AppInstance) {
  app.get(
    "/portal/saas/reports/exports/:exportId/download",
    async (request, reply) => {
      const token =
        typeof Reflect.get(toObject(request.query), "token") === "string"
          ? String(Reflect.get(toObject(request.query), "token"))
          : "";

      if (!token.trim()) {
        return sendError(
          reply,
          404,
          "Report export download not found.",
          undefined,
          API_ERROR_CODES.NOT_FOUND,
        );
      }

      try {
        const payload = await loadSaasReportExportDownload(token);
        reply.header("content-type", payload.contentType);
        reply.header(
          "content-disposition",
          `attachment; filename="${payload.fileName}"`,
        );
        reply.header("cache-control", "no-store");
        return reply.send(payload.content);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Report export download not found.",
        );
      }
    },
  );

  app.register(async (portalRoutes) => {
    portalRoutes.addHook("preHandler", requireUserGuard);
    portalRoutes.addHook("preHandler", requireCurrentLegalAcceptance);

    portalRoutes.get("/portal/saas/overview", async (request, reply) => {
      const context = await resolvePortalContext(request, reply);
      if (!context) {
        return;
      }

      try {
        return sendSuccess(
          reply,
          await getSaasOverview(resolvePortalActor(context), {
            viewerUserId: request.user?.userId,
          }),
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to load SaaS portal overview.",
        );
      }
    });

    portalRoutes.post("/portal/saas/tenants", async (request, reply) => {
      const currentUser = request.user;
      const context = await resolvePortalInviteContext(request, reply);
      if (!context || !currentUser) {
        return;
      }

      const parsed = parseSchema(
        SaasPortalTenantCreateSchema,
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
        return sendSuccess(
          reply,
          await createPortalSaasTenant(parsed.data, {
            adminId: context.adminId,
            email: currentUser.email,
          }),
          201,
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create SaaS tenant.",
        );
      }
    });

    portalRoutes.get(
      "/portal/saas/tenants/:tenantId/reports/exports",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(
          SaasReportExportListQuerySchema,
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

        try {
          return sendSuccess(
            reply,
            await listSaasReportExportJobs(
              tenantId,
              resolvePortalActor(context),
              {
                limit: parsed.data.limit,
                downloadUrlBase: buildDownloadUrlBase(request),
              },
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to load tenant report exports.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/reports/exports",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(
          SaasReportExportCreateSchema,
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
          return sendSuccess(
            reply,
            await createSaasReportExportJob(
              tenantId,
              parsed.data,
              resolvePortalActor(context),
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to queue tenant report export.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/disputes",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(SaasBillingDisputeCreateSchema, {
          ...toObject(request.body),
          tenantId,
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
          return sendSuccess(
            reply,
            await createBillingDispute(
              parsed.data,
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to submit billing dispute.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/memberships",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(SaasTenantMembershipCreateSchema, {
          ...toObject(request.body),
          tenantId,
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
          return sendSuccess(
            reply,
            await createSaasTenantMembership(
              parsed.data,
              context.adminId,
              context.permissions,
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to save tenant membership.",
          );
        }
      },
    );

    portalRoutes.delete(
      "/portal/saas/tenants/:tenantId/memberships/:membershipId",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        const membershipId = parseIdParam(request.params, "membershipId");
        if (!tenantId || !membershipId) {
          return sendError(
            reply,
            400,
            "Invalid tenant or membership id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_OR_MEMBERSHIP_ID,
          );
        }

        try {
          return sendSuccess(
            reply,
            await deleteSaasTenantMembership(
              tenantId,
              membershipId,
              context.adminId,
              context.permissions,
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to delete tenant membership.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/invites",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(SaasTenantInviteCreateSchema, {
          ...toObject(request.body),
          tenantId,
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

        const origin = request.headers.origin ?? "http://localhost:3002";

        try {
          return sendSuccess(
            reply,
            await createSaasTenantInvite(parsed.data, {
              adminId: context.adminId,
              permissions: context.permissions,
              inviteBaseUrl: `${origin}/portal`,
              invitedByLabel: request.user?.email ?? null,
            }),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to create tenant invite.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/invites/:inviteId/revoke",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        const inviteId = parseIdParam(request.params, "inviteId");
        if (!tenantId || !inviteId) {
          return sendError(
            reply,
            400,
            "Invalid tenant or invite id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_OR_INVITE_ID,
          );
        }

        try {
          return sendSuccess(
            reply,
            await revokeSaasTenantInvite(
              tenantId,
              inviteId,
              context.adminId,
              context.permissions,
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to revoke tenant invite.",
          );
        }
      },
    );

    portalRoutes.post("/portal/saas/invites/accept", async (request, reply) => {
      const context = await resolvePortalInviteContext(request, reply);
      if (!context) {
        return;
      }

      const parsed = parseSchema(
        SaasTenantInviteAcceptSchema,
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
        return sendSuccess(
          reply,
          await acceptSaasTenantInvite(parsed.data, context.adminId),
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to accept SaaS tenant invite.",
        );
      }
    });

    portalRoutes.get(
      "/portal/saas/projects/:projectId/prizes",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
            await listProjectPrizes(projectId, resolvePortalActor(context)),
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

    portalRoutes.post(
      "/portal/saas/projects/:projectId/keys",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await createProjectApiKey(
              parsed.data,
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to issue API key.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/projects/:projectId/keys/:keyId/rotate",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await rotateProjectApiKey(
              projectId,
              keyId,
              parsed.data,
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to rotate API key.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/projects/:projectId/keys/:keyId/revoke",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await revokeProjectApiKey(
              projectId,
              keyId,
              parsed.data,
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to revoke API key.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/projects/:projectId/prizes",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await createProjectPrize(
              projectId,
              parsed.data,
              resolvePortalActor(context),
            ),
            201,
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to create project prize.",
          );
        }
      },
    );

    portalRoutes.patch(
      "/portal/saas/projects/:projectId/prizes/:prizeId",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await updateProjectPrize(
              projectId,
              prizeId,
              parsed.data,
              resolvePortalActor(context),
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to update project prize.",
          );
        }
      },
    );

    portalRoutes.delete(
      "/portal/saas/projects/:projectId/prizes/:prizeId",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

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
          return sendSuccess(
            reply,
            await deleteProjectPrize(
              projectId,
              prizeId,
              resolvePortalActor(context),
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to delete project prize.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/billing/portal",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const origin = request.headers.origin ?? "http://localhost:3002";

        try {
          return sendSuccess(
            reply,
            await createCustomerPortalSession(
              tenantId,
              { returnUrl: `${origin}/portal` },
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to create billing portal session.",
          );
        }
      },
    );

    portalRoutes.post(
      "/portal/saas/tenants/:tenantId/billing/setup-session",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const origin = request.headers.origin ?? "http://localhost:3002";

        try {
          return sendSuccess(
            reply,
            await createBillingSetupSession(
              tenantId,
              {
                successUrl: `${origin}/portal?billingSetup=success`,
                cancelUrl: `${origin}/portal?billingSetup=cancelled`,
              },
              context.adminId,
              context.permissions,
              PORTAL_ACCESS_SCOPE,
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to create billing setup session.",
          );
        }
      },
    );

    portalRoutes.get(
      "/portal/saas/tenants/:tenantId/billing/insights",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        try {
          return sendSuccess(
            reply,
            await getSaasTenantBillingInsights(
              tenantId,
              resolvePortalActor(context),
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to load tenant billing insights.",
          );
        }
      },
    );

    portalRoutes.patch(
      "/portal/saas/tenants/:tenantId/billing/budget-policy",
      async (request, reply) => {
        const context = await resolvePortalContext(request, reply);
        if (!context) {
          return;
        }

        const tenantId = parseIdParam(request.params, "tenantId");
        if (!tenantId) {
          return sendError(
            reply,
            400,
            "Invalid tenant id.",
            undefined,
            API_ERROR_CODES.INVALID_TENANT_ID,
          );
        }

        const parsed = parseSchema(SaasBillingBudgetPolicyPatchSchema, {
          ...toObject(request.body),
          tenantId,
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
          return sendSuccess(
            reply,
            await updateSaasBillingBudgetPolicy(
              parsed.data,
              resolvePortalActor(context),
            ),
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to update tenant billing budget policy.",
          );
        }
      },
    );
  });
}
