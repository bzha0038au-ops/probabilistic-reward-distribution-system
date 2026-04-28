import type { AppInstance } from "../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  UserMfaDisableRequestSchema,
  UserMfaVerifyRequestSchema,
} from "@reward/shared-types/auth";

import { getUserById } from "../../../modules/user/service";
import {
  confirmUserMfaEnrollment,
  createUserMfaEnrollment,
  disableUserMfa,
  getUserMfaStatus,
} from "../../../modules/user-mfa/service";
import { parseSchema } from "../../../shared/validation";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  requireCurrentUserSession,
  resolveUserAgent,
  safeRecordAuthEvent,
} from "./support";

const requireVerifiedUserMfaManager = async (
  request: Parameters<typeof requireCurrentUserSession>[0],
  reply: Parameters<typeof sendError>[0],
) => {
  const session = await requireCurrentUserSession(request, reply);
  if (!session) {
    return null;
  }

  const currentUser = await getUserById(session.userId);
  if (!currentUser) {
    sendError(
      reply,
      404,
      "User not found.",
      undefined,
      API_ERROR_CODES.USER_NOT_FOUND,
    );
    return null;
  }

  if (!currentUser.emailVerifiedAt) {
    sendError(
      reply,
      403,
      "Email verification required.",
      undefined,
      API_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
    );
    return null;
  }

  if (!currentUser.phoneVerifiedAt) {
    sendError(
      reply,
      403,
      "Phone verification required.",
      undefined,
      API_ERROR_CODES.PHONE_VERIFICATION_REQUIRED,
    );
    return null;
  }

  return {
    session,
    currentUser,
  };
};

export async function registerAuthMfaRoutes(app: AppInstance) {
  app.get("/auth/user/mfa/status", async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) {
      return;
    }

    const status = await getUserMfaStatus({ userId: user.userId });
    return sendSuccess(reply, status);
  });

  app.post("/auth/user/mfa/enrollment", async (request, reply) => {
    const context = await requireVerifiedUserMfaManager(request, reply);
    if (!context) {
      return;
    }

    try {
      const enrollment = await createUserMfaEnrollment({
        userId: context.session.userId,
        email: context.session.email,
      });

      return sendSuccess(reply, enrollment, 201);
    } catch (error) {
      return sendErrorForException(
        reply,
        error,
        "Failed to start user MFA enrollment.",
      );
    }
  });

  app.post("/auth/user/mfa/verify", async (request, reply) => {
    const context = await requireVerifiedUserMfaManager(request, reply);
    if (!context) {
      return;
    }

    const parsed = parseSchema(UserMfaVerifyRequestSchema, request.body);
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
      const result = await confirmUserMfaEnrollment({
        currentUser: {
          userId: context.session.userId,
          email: context.session.email,
        },
        enrollmentToken: parsed.data.enrollmentToken,
        totpCode: parsed.data.totpCode,
      });

      await safeRecordAuthEvent({
        eventType: "user_mfa_enabled",
        email: context.session.email,
        userId: context.session.userId,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: {
          method: "totp",
        },
      });

      return sendSuccess(reply, result);
    } catch (error) {
      return sendErrorForException(reply, error, "Failed to enable user MFA.");
    }
  });

  app.post("/auth/user/mfa/disable", async (request, reply) => {
    const context = await requireVerifiedUserMfaManager(request, reply);
    if (!context) {
      return;
    }

    const parsed = parseSchema(UserMfaDisableRequestSchema, request.body);
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
      const result = await disableUserMfa({
        currentUser: {
          userId: context.session.userId,
          email: context.session.email,
        },
        totpCode: parsed.data.totpCode,
      });

      await safeRecordAuthEvent({
        eventType: "user_mfa_disabled",
        email: context.session.email,
        userId: context.session.userId,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: {
          method: result.method,
        },
      });

      return sendSuccess(reply, {
        mfaEnabled: result.mfaEnabled,
      });
    } catch (error) {
      return sendErrorForException(reply, error, "Failed to disable user MFA.");
    }
  });
}
