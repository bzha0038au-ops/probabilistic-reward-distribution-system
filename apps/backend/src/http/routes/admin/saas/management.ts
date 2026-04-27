import type { AppInstance } from "../../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  SaasTenantCreateSchema,
  SaasTenantInviteAcceptSchema,
  SaasTenantInviteCreateSchema,
  SaasTenantLinkCreateSchema,
  SaasTenantMembershipCreateSchema,
} from "@reward/shared-types/saas";

import { ADMIN_PERMISSION_KEYS } from "../../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../../modules/admin/audit";
import {
  acceptSaasTenantInvite,
  createSaasTenant,
  createSaasTenantInvite,
  createSaasTenantLink,
  createSaasTenantMembership,
  deleteSaasTenantLink,
  deleteSaasTenantMembership,
  getSaasOverview,
  revokeSaasTenantInvite,
} from "../../../../modules/saas/service";
import { getConfigView } from "../../../../shared/config";
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

const config = getConfigView();

export async function registerAdminSaasManagementRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    "/admin/saas/overview",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (request, reply) => {
      try {
        return sendSuccess(
          reply,
          await getSaasOverview({
            adminId: request.admin!.adminId,
            permissions: request.admin!.permissions,
          }),
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to load SaaS overview.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        SaasTenantCreateSchema,
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
        const tenant = await createSaasTenant(parsed.data);
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_tenant_create",
          targetType: "saas_tenant",
          targetId: tenant.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, tenant, 201);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to create tenant.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/memberships",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
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
        const membership = await createSaasTenantMembership(
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_membership_upsert",
          targetType: "saas_tenant",
          targetId: tenantId,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, membership, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to save tenant membership.",
        );
      }
    },
  );

  protectedRoutes.delete(
    "/admin/saas/tenants/:tenantId/memberships/:membershipId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
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
        const membership = await deleteSaasTenantMembership(
          tenantId,
          membershipId,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_membership_delete",
          targetType: "saas_tenant_membership",
          targetId: membership.id,
          metadata: { tenantId },
          ip: request.ip,
        });
        return sendSuccess(reply, membership);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to delete tenant membership.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/invites",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
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

      try {
        const invite = await createSaasTenantInvite(parsed.data, {
          adminId: request.admin?.adminId ?? null,
          permissions: request.admin?.permissions ?? [],
          inviteBaseUrl: `${config.adminBaseUrl.replace(/\/+$/g, "")}/saas`,
          invitedByLabel: request.admin?.email ?? null,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_invite_create",
          targetType: "saas_tenant_invite",
          targetId: invite.invite.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, invite, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create tenant invite.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/invites/:inviteId/revoke",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
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
        const invite = await revokeSaasTenantInvite(
          tenantId,
          inviteId,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_invite_revoke",
          targetType: "saas_tenant_invite",
          targetId: invite.id,
          metadata: { tenantId },
          ip: request.ip,
        });
        return sendSuccess(reply, invite);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to revoke tenant invite.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/invites/accept",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [enforceAdminLimit],
    },
    async (request, reply) => {
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
        const membership = await acceptSaasTenantInvite(
          parsed.data,
          request.admin?.adminId ?? null,
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_invite_accept",
          targetType: "saas_tenant_membership",
          targetId: membership.id,
          metadata: { tenantId: membership.tenantId },
          ip: request.ip,
        });
        return sendSuccess(reply, membership, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to accept tenant invite.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenant-links",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        SaasTenantLinkCreateSchema,
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
        const link = await createSaasTenantLink(
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_tenant_link_upsert",
          targetType: "saas_tenant_link",
          targetId: link.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, link, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to save tenant link.",
        );
      }
    },
  );

  protectedRoutes.delete(
    "/admin/saas/tenant-links/:linkId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const linkId = parseIdParam(request.params, "linkId");
      if (!linkId) {
        return sendError(
          reply,
          400,
          "Invalid tenant link id.",
          undefined,
          API_ERROR_CODES.INVALID_TENANT_LINK_ID,
        );
      }

      try {
        const link = await deleteSaasTenantLink(
          linkId,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_tenant_link_delete",
          targetType: "saas_tenant_link",
          targetId: link.id,
          metadata: {
            parentTenantId: link.parentTenantId,
            childTenantId: link.childTenantId,
          },
          ip: request.ip,
        });
        return sendSuccess(reply, link);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to delete tenant link.",
        );
      }
    },
  );
}
