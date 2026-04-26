import type { AppInstance } from "../types";

import { z } from "zod";

import {
  confirmAdminMfaEnrollment,
  createAdminMfaEnrollment,
  disableAdminMfa,
  getAdminMfaStatus,
  regenerateAdminRecoveryCodes,
} from "../../../modules/admin-mfa/service";
import { recordAdminAction } from "../../../modules/admin/audit";
import { parseSchema } from "../../../shared/validation";
import { sendError, sendSuccess } from "../../respond";
import { adminRateLimit, enforceAdminLimit, toObject } from "./common";

const AdminMfaVerifySchema = z.object({
  enrollmentToken: z.string().min(1),
  totpCode: z.string().min(6).max(8),
});

const AdminMfaCodeSchema = z.object({
  totpCode: z.string().min(1).max(64).optional(),
});

export async function registerAdminMfaRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/mfa/status",
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(reply, 401, "Unauthorized");
      }

      const status = await getAdminMfaStatus({ adminId: admin.adminId });
      return sendSuccess(reply, status);
    },
  );

  protectedRoutes.post(
    "/admin/mfa/enrollment",
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(reply, 401, "Unauthorized");
      }

      if (admin.mfaEnabled) {
        return sendError(reply, 409, "Admin MFA is already enabled.");
      }

      const enrollment = await createAdminMfaEnrollment({
        adminId: admin.adminId,
        email: admin.email,
        mfaEnabled: admin.mfaEnabled,
      });

      return sendSuccess(reply, enrollment, 201);
    },
  );

  protectedRoutes.post(
    "/admin/mfa/verify",
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(reply, 401, "Unauthorized");
      }

      const parsed = parseSchema(AdminMfaVerifySchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      try {
        const result = await confirmAdminMfaEnrollment({
          currentAdmin: {
            adminId: admin.adminId,
            userId: admin.userId,
            email: admin.email,
            sessionId: admin.sessionId,
          },
          enrollmentToken: parsed.data.enrollmentToken,
          totpCode: parsed.data.totpCode,
        });

        await recordAdminAction({
          adminId: admin.adminId,
          action: "admin_mfa_enable",
          targetType: "admin",
          targetId: admin.adminId,
          ip: request.ip,
        });

        return sendSuccess(reply, {
          token: result.token,
          expiresAt: result.expiresAt,
          mfaEnabled: true,
          recoveryCodes: result.recoveryCodes,
          recoveryCodesRemaining: result.recoveryCodesRemaining,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to enable MFA.";
        return sendError(reply, 422, message);
      }
    },
  );

  protectedRoutes.post(
    "/admin/mfa/recovery-codes/regenerate",
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(reply, 401, "Unauthorized");
      }

      const parsed = parseSchema(AdminMfaCodeSchema, toObject(request.body));
      if (!parsed.isValid || !parsed.data.totpCode) {
        return sendError(reply, 400, "Admin MFA code required.");
      }

      try {
        const result = await regenerateAdminRecoveryCodes({
          currentAdmin: {
            adminId: admin.adminId,
            userId: admin.userId,
            email: admin.email,
          },
          totpCode: parsed.data.totpCode,
        });

        await recordAdminAction({
          adminId: admin.adminId,
          action: "admin_mfa_recovery_codes_regenerated",
          targetType: "admin",
          targetId: admin.adminId,
          ip: request.ip,
          metadata: {
            verificationMethod: result.method,
            recoveryCodesRemaining: result.recoveryCodesRemaining,
          },
        });

        return sendSuccess(reply, {
          recoveryCodes: result.recoveryCodes,
          recoveryCodesRemaining: result.recoveryCodesRemaining,
          recoveryCodesGeneratedAt: result.recoveryCodesGeneratedAt,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to regenerate recovery codes.";
        return sendError(reply, 422, message);
      }
    },
  );

  protectedRoutes.post(
    "/admin/mfa/disable",
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(reply, 401, "Unauthorized");
      }

      const parsed = parseSchema(AdminMfaCodeSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      try {
        const result = await disableAdminMfa({
          currentAdmin: {
            adminId: admin.adminId,
            userId: admin.userId,
            email: admin.email,
            sessionId: admin.sessionId,
            mfaRecoveryMode: admin.mfaRecoveryMode,
          },
          totpCode: parsed.data.totpCode ?? null,
        });

        await recordAdminAction({
          adminId: admin.adminId,
          action:
            result.method === "break_glass"
              ? "admin_mfa_break_glass_reset"
              : "admin_mfa_disabled",
          targetType: "admin",
          targetId: admin.adminId,
          ip: request.ip,
          metadata: {
            verificationMethod: result.method,
          },
        });

        return sendSuccess(reply, {
          token: result.token,
          expiresAt: result.expiresAt,
          mfaEnabled: false,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to disable MFA.";
        return sendError(reply, 422, message);
      }
    },
  );
}
