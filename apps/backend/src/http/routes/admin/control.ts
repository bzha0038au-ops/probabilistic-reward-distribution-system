import type { AppInstance } from "../types";
import { SystemConfigPatchSchema } from "@reward/shared-types/admin";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import { z } from "zod";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  createPaymentProviderDraft,
  createSystemConfigDraft,
  getControlCenterOverview,
  publishControlChangeRequest,
  rejectControlChangeRequest,
  resetPaymentProviderCircuitBreaker,
  submitControlChangeRequest,
  approveControlChangeRequest,
  tripPaymentProviderCircuitBreaker,
} from "../../../modules/control/service";
import { withAdminAuditContext } from "../../admin-audit";
import { parseSchema } from "../../../shared/validation";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "./common";

const ControlChangeTransitionSchema = z.object({
  confirmationText: z.string().trim().max(64).optional(),
  reason: z.string().trim().max(500).optional(),
});

const SystemConfigDraftRequestSchema = SystemConfigPatchSchema.extend({
  reason: z.string().trim().max(500).optional(),
});

const OptionalMoneyStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .nullable()
  .optional();

const UpperCodeArraySchema = z.array(z.string().trim().min(1).max(16)).max(64);

const PaymentProviderGrayRuleSchema = z.object({
  grayPercent: z.number().min(0).max(100).nullable().optional(),
  grayUserIds: z.array(z.number().int().positive()).max(200).optional(),
  grayCountryCodes: UpperCodeArraySchema.optional(),
  grayCurrencies: UpperCodeArraySchema.optional(),
  grayMinAmount: OptionalMoneyStringSchema,
  grayMaxAmount: OptionalMoneyStringSchema,
});

const PaymentProviderDraftSchema = z.object({
  providerId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  providerType: z.string().trim().min(1).max(64),
  priority: z.number().int().min(0).max(100000),
  isActive: z.boolean(),
  supportedFlows: z.array(z.enum(["deposit", "withdrawal"])).max(2),
  executionMode: z.enum(["manual", "automated"]),
  adapter: z.string().trim().max(80).nullable().optional(),
  grayPercent: z.number().min(0).max(100).nullable().optional(),
  grayUserIds: z.array(z.number().int().positive()).max(200).optional(),
  grayCountryCodes: UpperCodeArraySchema.optional(),
  grayCurrencies: UpperCodeArraySchema.optional(),
  grayMinAmount: OptionalMoneyStringSchema,
  grayMaxAmount: OptionalMoneyStringSchema,
  grayRules: z.array(PaymentProviderGrayRuleSchema).max(32).optional(),
  reason: z.string().trim().max(500).optional(),
});

const CircuitBreakerSchema = z.object({
  reason: z.string().trim().min(1).max(255),
});

export async function registerAdminControlRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/control-center",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (_request, reply) => {
      const overview = await getControlCenterOverview();
      return sendSuccess(reply, overview);
    },
  );

  protectedRoutes.post(
    "/admin/control-center/system-config/drafts",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        SystemConfigDraftRequestSchema,
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
        const { reason, ...values } = parsed.data;
        const created = await createSystemConfigDraft({
          adminId: request.admin?.adminId ?? 0,
          values,
          reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "config_change_request_created",
            targetType: "config_change_request",
            targetId: created.id,
            metadata: {
              changeType: created.changeType,
              summary: created.summary,
              reviewNotes: created.reason,
            },
          }),
        );

        return sendSuccess(reply, created, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create config draft.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/payment-providers/drafts",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        PaymentProviderDraftSchema,
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
        const { reason, ...provider } = parsed.data;
        const created = await createPaymentProviderDraft({
          adminId: request.admin?.adminId ?? 0,
          provider: {
            providerId: provider.providerId ?? null,
            name: provider.name,
            providerType: provider.providerType,
            priority: provider.priority,
            isActive: provider.isActive,
            supportedFlows: provider.supportedFlows,
            executionMode: provider.executionMode,
            adapter: provider.adapter?.trim() ? provider.adapter.trim() : null,
            grayPercent: provider.grayPercent ?? null,
            grayUserIds: provider.grayUserIds ?? [],
            grayCountryCodes: provider.grayCountryCodes ?? [],
            grayCurrencies: provider.grayCurrencies ?? [],
            grayMinAmount: provider.grayMinAmount ?? null,
            grayMaxAmount: provider.grayMaxAmount ?? null,
            grayRules: provider.grayRules ?? [],
          },
          reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "payment_provider_change_request_created",
            targetType: "config_change_request",
            targetId: created.id,
            metadata: {
              changeType: created.changeType,
              summary: created.summary,
              reviewNotes: created.reason,
            },
          }),
        );

        return sendSuccess(reply, created, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create provider draft.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/change-requests/:requestId/submit",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const requestId = parseIdParam(request.params, "requestId");
      if (!requestId) {
        return sendError(
          reply,
          400,
          "Invalid config change request id.",
          undefined,
          API_ERROR_CODES.INVALID_CONFIG_CHANGE_REQUEST_ID,
        );
      }

      const parsed = parseSchema(
        ControlChangeTransitionSchema,
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
        const updated = await submitControlChangeRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
          confirmationText: parsed.data.confirmationText,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "config_change_request_submitted",
            targetType: "config_change_request",
            targetId: updated.id,
            metadata: {
              changeType: updated.changeType,
              summary: updated.summary,
              reviewNotes: updated.reason,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to submit config change request.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/change-requests/:requestId/approve",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const requestId = parseIdParam(request.params, "requestId");
      if (!requestId) {
        return sendError(
          reply,
          400,
          "Invalid config change request id.",
          undefined,
          API_ERROR_CODES.INVALID_CONFIG_CHANGE_REQUEST_ID,
        );
      }

      try {
        const updated = await approveControlChangeRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "config_change_request_approved",
            targetType: "config_change_request",
            targetId: updated.id,
            metadata: {
              changeType: updated.changeType,
              summary: updated.summary,
              reviewNotes: updated.reason,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to approve config change request.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/change-requests/:requestId/reject",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const requestId = parseIdParam(request.params, "requestId");
      if (!requestId) {
        return sendError(
          reply,
          400,
          "Invalid config change request id.",
          undefined,
          API_ERROR_CODES.INVALID_CONFIG_CHANGE_REQUEST_ID,
        );
      }

      const parsed = parseSchema(
        ControlChangeTransitionSchema,
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
        const updated = await rejectControlChangeRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "config_change_request_rejected",
            targetType: "config_change_request",
            targetId: updated.id,
            metadata: {
              changeType: updated.changeType,
              summary: updated.summary,
              reviewNotes: updated.reason,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to reject config change request.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/change-requests/:requestId/publish",
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
          "Invalid config change request id.",
          undefined,
          API_ERROR_CODES.INVALID_CONFIG_CHANGE_REQUEST_ID,
        );
      }

      const parsed = parseSchema(
        ControlChangeTransitionSchema,
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
        const result = await publishControlChangeRequest({
          requestId,
          adminId: request.admin?.adminId ?? 0,
          confirmationText: parsed.data.confirmationText,
        });
        const updated = result.changeRequest;

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "config_change_request_published",
            targetType: "config_change_request",
            targetId: updated.id,
            metadata: {
              changeType: updated.changeType,
              summary: updated.summary,
              publishedResource: result.audit?.resource ?? updated.targetType,
              publishedTargetId: result.audit?.targetId ?? updated.targetId,
              changedKeys: result.audit?.changedKeys ?? [],
              fieldDiff: result.audit?.fieldDiff ?? [],
              changeRequestRequiresMfa: updated.requiresMfa,
              publishStepUpRequired: true,
              reviewNotes: updated.reason,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to publish config change request.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/payment-providers/:providerId/circuit-break",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const providerId = parseIdParam(request.params, "providerId");
      if (!providerId) {
        return sendError(
          reply,
          400,
          "Invalid payment provider id.",
          undefined,
          API_ERROR_CODES.INVALID_PAYMENT_PROVIDER_ID,
        );
      }

      const parsed = parseSchema(CircuitBreakerSchema, toObject(request.body));
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
        const updated = await tripPaymentProviderCircuitBreaker({
          providerId,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "payment_provider_circuit_break",
            targetType: "payment_provider",
            targetId: providerId,
            metadata: {
              reason: parsed.data.reason,
              providerName: updated.name,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to trip payment provider circuit breaker.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/control-center/payment-providers/:providerId/circuit-reset",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const providerId = parseIdParam(request.params, "providerId");
      if (!providerId) {
        return sendError(
          reply,
          400,
          "Invalid payment provider id.",
          undefined,
          API_ERROR_CODES.INVALID_PAYMENT_PROVIDER_ID,
        );
      }

      const parsed = parseSchema(CircuitBreakerSchema, toObject(request.body));
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
        const updated = await resetPaymentProviderCircuitBreaker({
          providerId,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "payment_provider_circuit_reset",
            targetType: "payment_provider",
            targetId: providerId,
            metadata: {
              providerName: updated.name,
              reason: parsed.data.reason,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to reset payment provider circuit breaker.",
        );
      }
    },
  );
}
