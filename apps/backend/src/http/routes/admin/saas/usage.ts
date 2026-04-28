import type { AppInstance } from "../../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../../modules/admin-permission/definitions";
import { getSaasTenantUsageDashboard } from "../../../../modules/saas/service";
import { requireAdminPermission } from "../../../guards";
import {
  sendError,
  sendErrorForException,
  sendSuccess,
} from "../../../respond";

const readTenantSlug = (params: unknown) => {
  if (typeof params !== "object" || params === null) {
    return null;
  }

  const raw = Reflect.get(params, "tenantSlug");
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
};

export async function registerAdminSaasUsageRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    "/admin/saas/tenants/by-slug/:tenantSlug/usage",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (request, reply) => {
      const tenantSlug = readTenantSlug(request.params);
      if (!tenantSlug) {
        return sendError(
          reply,
          400,
          "Invalid tenant slug.",
          undefined,
          API_ERROR_CODES.INVALID_SLUG,
        );
      }

      try {
        const usage = await getSaasTenantUsageDashboard(tenantSlug, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        return sendSuccess(reply, usage);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to load tenant usage.",
        );
      }
    },
  );
}
