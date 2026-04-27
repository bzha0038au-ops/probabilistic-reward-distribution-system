import type { AppInstance } from "../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  EmailVerificationRequestSchema,
  PhoneVerificationConfirmSchema,
  PhoneVerificationRequestSchema,
} from "@reward/shared-types/auth";

import {
  getUserById,
  getUserByPhone,
  markUserPhoneVerified,
} from "../../../modules/user/service";
import { assertNotificationChannelAvailable } from "../../../modules/auth/notification-service";
import {
  consumeAuthToken,
  revokeOutstandingAuthTokens,
} from "../../../modules/auth/token-service";
import { applyAuthFailureDelay } from "../../../shared/auth-delay";
import { parseSchema } from "../../../shared/validation";
import { requireUserGuard } from "../../guards";
import { sendError, sendSuccess } from "../../respond";
import { toObject } from "../../utils";
import {
  authRateLimit,
  maskPhone,
  queuePhoneVerificationNotification,
  replyWithNotificationError,
  requestEmailVerification,
  resolveUserAgent,
  safeRecordAuthEvent,
} from "./support";

export async function registerAuthVerificationRoutes(app: AppInstance) {
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", requireUserGuard);

    protectedRoutes.post(
      "/auth/email-verification/request",
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          EmailVerificationRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(
            reply,
            404,
            "User not found.",
            undefined,
            API_ERROR_CODES.USER_NOT_FOUND,
          );
        }
        if (user.emailVerifiedAt) {
          return sendSuccess(reply, { accepted: true });
        }

        try {
          assertNotificationChannelAvailable("email");
          await requestEmailVerification({
            userId: user.id,
            email: user.email,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
          });
        } catch (error) {
          return replyWithNotificationError(reply, "email_verification", error);
        }

        return sendSuccess(reply, { accepted: true });
      },
    );

    protectedRoutes.post(
      "/auth/phone-verification/request",
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          PhoneVerificationRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(
            reply,
            404,
            "User not found.",
            undefined,
            API_ERROR_CODES.USER_NOT_FOUND,
          );
        }

        const phone = parsed.data.phone;
        const existingPhoneUser = await getUserByPhone(phone);
        if (existingPhoneUser && existingPhoneUser.id !== user.id) {
          return sendError(
            reply,
            409,
            "Phone already in use.",
            undefined,
            API_ERROR_CODES.PHONE_ALREADY_IN_USE,
          );
        }

        try {
          assertNotificationChannelAvailable("sms");
          await queuePhoneVerificationNotification({
            userId: user.id,
            email: user.email,
            phone,
          });
        } catch (error) {
          return replyWithNotificationError(reply, "phone_verification", error);
        }
        await safeRecordAuthEvent({
          eventType: "phone_verification_requested",
          email: user.email,
          userId: user.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { phone: maskPhone(phone) },
        });

        return sendSuccess(reply, { accepted: true });
      },
    );

    protectedRoutes.post(
      "/auth/phone-verification/confirm",
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          PhoneVerificationConfirmSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(
            reply,
            404,
            "User not found.",
            undefined,
            API_ERROR_CODES.USER_NOT_FOUND,
          );
        }

        const phone = parsed.data.phone;
        const duplicatePhoneUser = await getUserByPhone(phone);
        if (duplicatePhoneUser && duplicatePhoneUser.id !== user.id) {
          return sendError(
            reply,
            409,
            "Phone already in use.",
            undefined,
            API_ERROR_CODES.PHONE_ALREADY_IN_USE,
          );
        }

        const consumed = await consumeAuthToken({
          tokenType: "phone_verification",
          token: parsed.data.code,
          userId: user.id,
          phone,
        });
        if (!consumed) {
          await safeRecordAuthEvent({
            eventType: "phone_verification_failed",
            email: user.email,
            userId: user.id,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: {
              phone: maskPhone(phone),
              reason: "invalid_or_expired_code",
            },
          });
          await applyAuthFailureDelay();
          return sendError(
            reply,
            400,
            "Invalid or expired verification code.",
            undefined,
            API_ERROR_CODES.INVALID_OR_EXPIRED_VERIFICATION_CODE,
          );
        }

        const verified = await markUserPhoneVerified(user.id, phone);
        if (!verified) {
          return sendError(
            reply,
            404,
            "User not found.",
            undefined,
            API_ERROR_CODES.USER_NOT_FOUND,
          );
        }
        await revokeOutstandingAuthTokens({
          tokenType: "phone_verification",
          userId: user.id,
          phone,
        });
        await safeRecordAuthEvent({
          eventType: "phone_verification_success",
          email: verified.email,
          userId: verified.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { phone: maskPhone(phone) },
        });

        return sendSuccess(reply, { verified: true, phone });
      },
    );
  });
}
