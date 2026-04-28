import type { AppInstance } from "../../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  SaasBillingAccountUpsertSchema,
  SaasBillingRunCreateSchema,
  SaasBillingRunSettleSchema,
  SaasBillingRunSyncSchema,
  SaasBillingTopUpCreateSchema,
} from "@reward/shared-types/saas";

import { ADMIN_PERMISSION_KEYS } from "../../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../../modules/admin/audit";
import {
  createBillingRun,
  createBillingSetupSession,
  createBillingTopUp,
  createCustomerPortalSession,
  refreshBillingRun,
  settleBillingRun,
  syncBillingRun,
  syncBillingTopUp,
  upsertSaasBillingAccount,
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
import { withAdminAuditContext } from "../../../admin-audit";

const config = getConfigView();

export async function registerAdminSaasBillingRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.put(
    "/admin/saas/tenants/:tenantId/billing",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireBreakGlass: true,
        }),
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

      const parsed = parseSchema(SaasBillingAccountUpsertSchema, {
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
        const billing = await upsertSaasBillingAccount(parsed.data, {
          adminId: request.admin!.adminId,
          permissions: request.admin!.permissions,
        });
        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_upsert",
          targetType: "saas_tenant",
          targetId: tenantId,
          metadata: parsed.data,
        }));
        return sendSuccess(reply, billing);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to save billing account.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/billing/portal",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ),
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

      try {
        return sendSuccess(
          reply,
          await createCustomerPortalSession(
            tenantId,
            {
              returnUrl: `${config.adminBaseUrl.replace(/\/+$/g, "")}/saas`,
            },
            request.admin?.adminId ?? null,
            request.admin?.permissions ?? [],
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

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/billing/setup-session",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ),
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

      try {
        return sendSuccess(
          reply,
          await createBillingSetupSession(
            tenantId,
            {
              successUrl: `${config.adminBaseUrl.replace(/\/+$/g, "")}/saas?billingSetup=success`,
              cancelUrl: `${config.adminBaseUrl.replace(/\/+$/g, "")}/saas?billingSetup=cancelled`,
            },
            request.admin?.adminId ?? null,
            request.admin?.permissions ?? [],
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

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/billing-runs",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
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

      const parsed = parseSchema(SaasBillingRunCreateSchema, {
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
        const billingRun = await createBillingRun(
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_run_create",
          targetType: "saas_billing_run",
          targetId: billingRun.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, billingRun, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create billing run.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/billing-runs/:billingRunId/sync",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const billingRunId = parseIdParam(request.params, "billingRunId");
      if (!billingRunId) {
        return sendError(
          reply,
          400,
          "Invalid billing run id.",
          undefined,
          API_ERROR_CODES.INVALID_BILLING_RUN_ID,
        );
      }

      const parsed = parseSchema(
        SaasBillingRunSyncSchema,
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
        const billingRun = await syncBillingRun(
          billingRunId,
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_run_sync",
          targetType: "saas_billing_run",
          targetId: billingRun.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, billingRun);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to sync billing run.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/billing-runs/:billingRunId/refresh",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const billingRunId = parseIdParam(request.params, "billingRunId");
      if (!billingRunId) {
        return sendError(
          reply,
          400,
          "Invalid billing run id.",
          undefined,
          API_ERROR_CODES.INVALID_BILLING_RUN_ID,
        );
      }

      try {
        return sendSuccess(
          reply,
          await refreshBillingRun(
            billingRunId,
            request.admin?.adminId ?? null,
            request.admin?.permissions ?? [],
          ),
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to refresh billing run.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/billing-runs/:billingRunId/settle",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const billingRunId = parseIdParam(request.params, "billingRunId");
      if (!billingRunId) {
        return sendError(
          reply,
          400,
          "Invalid billing run id.",
          undefined,
          API_ERROR_CODES.INVALID_BILLING_RUN_ID,
        );
      }

      const parsed = parseSchema(
        SaasBillingRunSettleSchema,
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
        const billingRun = await settleBillingRun(
          billingRunId,
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_run_settle",
          targetType: "saas_billing_run",
          targetId: billingRun.id,
          metadata: parsed.data,
          ip: request.ip,
        });
        return sendSuccess(reply, billingRun);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to settle billing run.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/tenants/:tenantId/top-ups",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE, {
          requireBreakGlass: true,
        }),
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

      const parsed = parseSchema(SaasBillingTopUpCreateSchema, {
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
        const topUp = await createBillingTopUp(
          parsed.data,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_top_up_create",
          targetType: "saas_billing_top_up",
          targetId: topUp.id,
          metadata: parsed.data,
        }));
        return sendSuccess(reply, topUp, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create billing top-up.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/saas/top-ups/:topUpId/sync",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const topUpId = parseIdParam(request.params, "topUpId");
      if (!topUpId) {
        return sendError(
          reply,
          400,
          "Invalid top-up id.",
          undefined,
          API_ERROR_CODES.INVALID_TOP_UP_ID,
        );
      }

      try {
        const topUp = await syncBillingTopUp(
          topUpId,
          request.admin?.adminId ?? null,
          request.admin?.permissions ?? [],
        );
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "saas_billing_top_up_sync",
          targetType: "saas_billing_top_up",
          targetId: topUp.id,
          ip: request.ip,
        });
        return sendSuccess(reply, topUp);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to sync billing top-up.",
        );
      }
    },
  );
}
