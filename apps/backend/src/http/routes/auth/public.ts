import type { AppInstance } from "../types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RegisterRequestSchema,
  VerificationTokenConfirmSchema,
} from "@reward/shared-types/auth";
import { type UserFreezeScope } from "@reward/shared-types/risk";

import { db } from "../../../db";
import {
  createUserWithWallet,
  getUserByEmail,
  markUserEmailVerified,
  updateUserPassword,
} from "../../../modules/user/service";
import { screenUserRegistration } from "../../../modules/aml";
import {
  verifyAdminCredentials,
  verifyCredentials,
} from "../../../modules/auth/service";
import { assertNotificationChannelAvailable } from "../../../modules/auth/notification-service";
import {
  consumeAuthToken,
  revokeOutstandingAuthTokens,
} from "../../../modules/auth/token-service";
import { countAuthEventsByIp } from "../../../modules/audit/service";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  verifyAdminMfaBreakGlassCode,
  verifyAdminMfaChallenge,
} from "../../../modules/admin-mfa/service";
import {
  assertCurrentLegalAcceptances,
  getCurrentEffectiveLegalDocuments,
  getCurrentLegalAcceptanceStateForUser,
  recordLegalAcceptancesInTransaction,
} from "../../../modules/legal/service";
import { creditAsset } from "../../../modules/economy/service";
import {
  ensureUserFreeze,
  isUserFrozen,
  trackUserDeviceFingerprint,
} from "../../../modules/risk/service";
import {
  resolveRequestCountryCode,
  syncUserJurisdictionState,
} from "../../../modules/risk/jurisdiction-service";
import {
  consumeMarketingBudget,
  getAntiAbuseConfig,
  getRewardEventConfig,
  getSystemFlags,
} from "../../../modules/system/service";
import { grantDailyCheckInRewardOnLogin } from "../../../modules/gamification/service";
import { createReferralForRegistration } from "../../../modules/referral/service";
import { revokeAuthSessions } from "../../../modules/session/service";
import { withAdminAuditContext } from "../../admin-audit";
import { createAdminSessionToken } from "../../../shared/admin-session";
import { applyAuthFailureDelay } from "../../../shared/auth-delay";
import { createUserSessionToken } from "../../../shared/user-session";
import { parseSchema } from "../../../shared/validation";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import { readHeaderValue, readStringValue, toObject } from "../../utils";
import { validateAuth } from "../../validators";
import {
  adminAuthRateLimit,
  authRateLimit,
  detectLoginAnomaly,
  handleLoginAnomaly,
  queuePasswordResetNotification,
  replyWithNotificationError,
  requestEmailVerification,
  resolveAuthFailureConfig,
  resolvePasswordResetTarget,
  resolveUserAgent,
  safeRecordAuthEvent,
  shouldFreezeAccount,
  toSessionUser,
} from "./support";

const ACCOUNT_FREEZE_SCOPE: UserFreezeScope = "account_lock";

export async function registerAuthPublicRoutes(app: AppInstance) {
  app.post(
    "/auth/register",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(RegisterRequestSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const email = parsed.data.email.toLowerCase();
      const password = parsed.data.password;
      const referrerId = Number(parsed.data.referrerId ?? 0);
      const userAgent = resolveUserAgent(request);
      const requestDeviceFingerprint = readHeaderValue(
        request.headers as Record<string, unknown>,
        "x-device-fingerprint",
      ) ?? parsed.data.deviceFingerprint?.trim() ?? null;
      const requestCountryCode = await resolveRequestCountryCode({
        headers: request.headers as Record<string, unknown>,
        ip: request.ip,
      });
      const currentLegalDocuments = await getCurrentEffectiveLegalDocuments(db);

      const systemFlags = await getSystemFlags(db);
      if (systemFlags.maintenanceMode) {
        await safeRecordAuthEvent({
          eventType: "register_blocked",
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: "maintenance_mode" },
        });
        return sendError(reply, 503, "Registration temporarily disabled.");
      }
      if (!systemFlags.registrationEnabled) {
        await safeRecordAuthEvent({
          eventType: "register_blocked",
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: "registration_disabled" },
        });
        return sendError(
          reply,
          403,
          "Registration disabled.",
          undefined,
          API_ERROR_CODES.REGISTRATION_DISABLED,
        );
      }

      const antiAbuse = await getAntiAbuseConfig(db);
      if (antiAbuse.maxAccountsPerIp.gt(0) && request.ip) {
        const existingCount = await countAuthEventsByIp({
          ip: request.ip,
          eventType: "register_success",
        });
        if (existingCount >= Number(antiAbuse.maxAccountsPerIp)) {
          await safeRecordAuthEvent({
            eventType: "register_blocked",
            email,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: { reason: "max_accounts_per_ip" },
          });
          return sendError(
            reply,
            429,
            "Registration limit reached.",
            undefined,
            API_ERROR_CODES.REGISTRATION_LIMIT_REACHED,
          );
        }
      }

      try {
        assertNotificationChannelAvailable("email");
      } catch (error) {
        return replyWithNotificationError(
          reply,
          "register_email_verification",
          error,
        );
      }

      try {
        assertCurrentLegalAcceptances({
          currentDocuments: currentLegalDocuments,
          providedAcceptances: parsed.data.legalAcceptances,
        });
      } catch (error) {
        await safeRecordAuthEvent({
          eventType: "register_blocked",
          email,
          ip: request.ip,
          userAgent,
          metadata: { reason: "legal_acceptance_required" },
        });
        return sendErrorForException(reply, error, "Registration blocked.");
      }

      const existing = await getUserByEmail(email);
      if (existing) {
        if (await isUserFrozen(existing.id, { scope: ACCOUNT_FREEZE_SCOPE })) {
          await safeRecordAuthEvent({
            eventType: "register_blocked",
            email,
            userId: existing.id,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: { reason: "account_lock" },
          });
          await applyAuthFailureDelay();
          return sendError(
            reply,
            423,
            "Account locked.",
            undefined,
            API_ERROR_CODES.ACCOUNT_LOCKED,
          );
        }

        if (!existing.emailVerifiedAt) {
          try {
            await requestEmailVerification({
              userId: existing.id,
              email: existing.email,
              ip: request.ip,
              userAgent: resolveUserAgent(request),
              source: "register",
            });
          } catch (error) {
            return replyWithNotificationError(
              reply,
              "register_email_verification",
              error,
            );
          }
        }
        await applyAuthFailureDelay();
        return sendSuccess(
          reply,
          { id: existing.id, email: existing.email },
          201,
        );
      }

      const user = await createUserWithWallet(email, password, {
        profile: {
          birthDate: parsed.data.birthDate,
          registrationCountryCode: requestCountryCode,
          countryTier: "unknown",
          countryResolvedAt: requestCountryCode ? new Date() : null,
        },
        afterCreate: async (transaction, createdUser) => {
          await recordLegalAcceptancesInTransaction(transaction, {
            userId: createdUser.id,
            documents: currentLegalDocuments,
            source: "register",
            ip: request.ip,
            userAgent,
          });

          await createReferralForRegistration(
            {
              referrerId,
              referredId: createdUser.id,
            },
            transaction,
          );
        },
      });
      await syncUserJurisdictionState({
        userId: user.id,
        countryCodeOverride: requestCountryCode,
      });
      await trackUserDeviceFingerprint({
        userId: user.id,
        deviceFingerprint: requestDeviceFingerprint,
        entrypoint: "login",
        activityType: "user_register_success",
        ip: request.ip,
        userAgent,
        metadata: {
          source: "register",
        },
      });
      try {
        await screenUserRegistration(user.id);
      } catch (error) {
        await safeRecordAuthEvent({
          eventType: "register_blocked",
          email,
          userId: user.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: "aml_review" },
        });
        await applyAuthFailureDelay();
        return sendErrorForException(reply, error, "Registration blocked.");
      }

      await safeRecordAuthEvent({
        eventType: "register_success",
        email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });
      try {
        await requestEmailVerification({
          userId: user.id,
          email: user.email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          source: "register",
        });
      } catch (error) {
        return replyWithNotificationError(
          reply,
          "register_email_verification",
          error,
        );
      }

      const rewardConfig = await getRewardEventConfig(db);
      if (rewardConfig.signupEnabled && rewardConfig.signupAmount.gt(0)) {
        const budget = await consumeMarketingBudget(
          db,
          rewardConfig.signupAmount,
        );
        if (budget.allowed) {
          await creditAsset({
            userId: user.id,
            assetCode: "B_LUCK",
            amount: rewardConfig.signupAmount.toString(),
            entryType: "signup_bonus",
            referenceType: "reward_event",
            audit: {
              sourceApp: "backend.auth",
              idempotencyKey: `reward:signup:${user.id}`,
              metadata: { reason: "signup_bonus" },
            },
          });
        }
      }
      await applyAuthFailureDelay();
      return sendSuccess(reply, { id: user.id, email: user.email }, 201);
    },
  );

  app.post(
    "/auth/password-reset/request",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(
        PasswordResetRequestSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const email = parsed.data.email.toLowerCase();
      try {
        assertNotificationChannelAvailable("email");
      } catch (error) {
        await safeRecordAuthEvent({
          eventType: "password_reset_requested",
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: {
            userFound: null,
            deliveryUnavailable: true,
          },
        });
        await applyAuthFailureDelay();
        return replyWithNotificationError(reply, "password_reset", error);
      }

      const user = await getUserByEmail(email);
      if (user) {
        try {
          await queuePasswordResetNotification({
            userId: user.id,
            email: user.email,
          });
        } catch (error) {
          await safeRecordAuthEvent({
            eventType: "password_reset_requested",
            email,
            userId: user.id,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: {
              userFound: true,
              deliveryFailed: true,
            },
          });
          await applyAuthFailureDelay();
          return replyWithNotificationError(reply, "password_reset", error);
        }
      }

      await safeRecordAuthEvent({
        eventType: "password_reset_requested",
        email,
        userId: user?.id ?? null,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: { userFound: Boolean(user) },
      });

      await applyAuthFailureDelay();
      return sendSuccess(reply, { accepted: true }, 202);
    },
  );

  app.post(
    "/auth/password-reset/confirm",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(
        PasswordResetConfirmSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const consumed = await consumeAuthToken({
        tokenType: "password_reset",
        token: parsed.data.token,
      });
      if (!consumed) {
        await safeRecordAuthEvent({
          eventType: "password_reset_failed",
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: "invalid_or_expired_token" },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 400, "Invalid or expired reset token.");
      }

      const user = await resolvePasswordResetTarget({
        userId: consumed.userId,
        email: consumed.email,
      });
      if (!user) {
        return sendError(reply, 404, "User not found.");
      }

      await updateUserPassword(user.id, parsed.data.password);
      await revokeOutstandingAuthTokens({
        tokenType: "password_reset",
        userId: user.id,
        email: user.email,
      });
      await revokeAuthSessions({
        userId: user.id,
        reason: "password_reset",
        eventType: "password_reset_sessions_revoked",
        email: user.email,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });
      await safeRecordAuthEvent({
        eventType: "password_reset_success",
        email: user.email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });

      return sendSuccess(reply, { completed: true });
    },
  );

  app.post(
    "/auth/user/session",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const payload = toObject(request.body);
      const validation = validateAuth(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, "Invalid request.", validation.errors);
      }

      const email = (readStringValue(payload, "email") ?? "").toLowerCase();
      const password = readStringValue(payload, "password") ?? "";
      const userAgent = resolveUserAgent(request);
      const requestDeviceFingerprint = readHeaderValue(
        request.headers as Record<string, unknown>,
        "x-device-fingerprint",
      );

      const systemFlags = await getSystemFlags(db);
      if (systemFlags.maintenanceMode) {
        await safeRecordAuthEvent({
          eventType: "user_login_blocked",
          email,
          ip: request.ip,
          userAgent,
          metadata: { reason: "maintenance_mode" },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 503, "System under maintenance.");
      }
      if (!systemFlags.loginEnabled) {
        await safeRecordAuthEvent({
          eventType: "user_login_blocked",
          email,
          ip: request.ip,
          userAgent,
          metadata: { reason: "login_disabled" },
        });
        await applyAuthFailureDelay();
        return sendError(
          reply,
          403,
          "Login disabled.",
          undefined,
          API_ERROR_CODES.LOGIN_DISABLED,
        );
      }

      const failureConfig = await resolveAuthFailureConfig();
      const existingUser = await getUserByEmail(email);
      if (
        existingUser &&
        (await isUserFrozen(existingUser.id, { scope: ACCOUNT_FREEZE_SCOPE }))
      ) {
        await safeRecordAuthEvent({
          eventType: "user_login_blocked",
          email,
          userId: existingUser.id,
          ip: request.ip,
          userAgent,
          metadata: { reason: "account_lock" },
        });
        await applyAuthFailureDelay();
        return sendError(
          reply,
          423,
          "Account locked.",
          undefined,
          API_ERROR_CODES.ACCOUNT_LOCKED,
        );
      }

      const user = await verifyCredentials(email, password);
      if (!user) {
        await safeRecordAuthEvent({
          eventType: "user_login_failed",
          email,
          ip: request.ip,
          userAgent,
          metadata: { reason: "invalid_credentials" },
        });
        if (existingUser) {
          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: "user_login_failed",
            threshold: failureConfig.userThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: existingUser.id,
              reason: "auth_failure",
              scope: ACCOUNT_FREEZE_SCOPE,
            });
          }
        }
        await applyAuthFailureDelay();
        return sendError(
          reply,
          401,
          "Invalid credentials.",
          undefined,
          API_ERROR_CODES.INVALID_CREDENTIALS,
        );
      }

      const requestCountryCode = await resolveRequestCountryCode({
        headers: request.headers as Record<string, unknown>,
        ip: request.ip,
      });
      await syncUserJurisdictionState({
        userId: user.id,
        countryCodeOverride: requestCountryCode,
      });

      const { token, expiresAt, sessionId } = await createUserSessionToken(
        {
          userId: Number(user.id),
          email: user.email,
          role: user.role === "admin" ? "admin" : "user",
        },
        {
          ip: request.ip,
          userAgent,
        },
      );

      const trackedDevice = await trackUserDeviceFingerprint({
        userId: user.id,
        deviceFingerprint: requestDeviceFingerprint,
        entrypoint: "login",
        activityType: "user_login_success",
        ip: request.ip,
        userAgent,
        sessionId,
      });
      const currentDeviceFingerprint = trackedDevice?.fingerprint ?? null;

      const anomaly = await detectLoginAnomaly({
        userId: user.id,
        email: user.email,
        successEventType: "user_login_success",
        currentIp: request.ip,
        currentUserAgent: userAgent,
        currentDeviceFingerprint,
      });

      await safeRecordAuthEvent({
        eventType: "user_login_success",
        email,
        userId: user.id,
        ip: request.ip,
        userAgent,
        metadata: {
          sessionId,
          sessionKind: "user",
          deviceFingerprint: currentDeviceFingerprint,
          deviceFingerprintSource: trackedDevice?.source ?? null,
        },
      });
      if (anomaly) {
        await handleLoginAnomaly({
          userId: user.id,
          email: user.email,
          anomalyEventType: "user_login_anomaly",
          currentIp: request.ip,
          currentUserAgent: userAgent,
          currentDeviceFingerprint,
          anomaly,
        });
      }

      await grantDailyCheckInRewardOnLogin(user.id);

      const legal = await getCurrentLegalAcceptanceStateForUser(user.id);

      return sendSuccess(reply, {
        token,
        expiresAt,
        sessionId,
        user: toSessionUser(user),
        legal,
      });
    },
  );

  app.post(
    "/auth/admin/login",
    { config: { rateLimit: adminAuthRateLimit } },
    async (request, reply) => {
      const payload = toObject(request.body);
      const validation = validateAuth(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, "Invalid request.", validation.errors);
      }

      const email = (readStringValue(payload, "email") ?? "").toLowerCase();
      const password = readStringValue(payload, "password") ?? "";
      const totpCode = readStringValue(payload, "totpCode") ?? "";
      const breakGlassCode = readStringValue(payload, "breakGlassCode") ?? "";
      const userAgent = resolveUserAgent(request);
      const requestDeviceFingerprint = readHeaderValue(
        request.headers as Record<string, unknown>,
        "x-device-fingerprint",
      );

      const failureConfig = await resolveAuthFailureConfig();
      const existingUser = await getUserByEmail(email);
      if (
        existingUser &&
        (await isUserFrozen(existingUser.id, { scope: ACCOUNT_FREEZE_SCOPE }))
      ) {
        await safeRecordAuthEvent({
          eventType: "admin_login_blocked",
          email,
          userId: existingUser.id,
          ip: request.ip,
          userAgent,
          metadata: { reason: "account_lock" },
        });
        await applyAuthFailureDelay();
        return sendError(
          reply,
          423,
          "Account locked.",
          undefined,
          API_ERROR_CODES.ACCOUNT_LOCKED,
        );
      }

      const adminResult = await verifyAdminCredentials(email, password);
      if (!adminResult) {
        await safeRecordAuthEvent({
          eventType: "admin_login_failed",
          email,
          ip: request.ip,
          userAgent,
          metadata: { reason: "invalid_credentials" },
        });
        if (existingUser) {
          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: "admin_login_failed",
            threshold: failureConfig.adminThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: existingUser.id,
              reason: "auth_failure",
              scope: ACCOUNT_FREEZE_SCOPE,
            });
          }
        }
        await applyAuthFailureDelay();
        return sendError(
          reply,
          401,
          "Invalid admin credentials.",
          undefined,
          API_ERROR_CODES.INVALID_ADMIN_CREDENTIALS,
        );
      }

      const { user, admin } = adminResult;
      let mfaMethod: "none" | "totp" | "recovery_code" | "break_glass" = "none";
      let recoveryCodesRemaining: number | null = null;
      if (admin.mfaEnabled) {
        const mfaResult = await verifyAdminMfaChallenge({
          adminId: admin.id,
          code: totpCode,
        });
        recoveryCodesRemaining = mfaResult.recoveryCodesRemaining;

        if (mfaResult.valid && mfaResult.method) {
          mfaMethod = mfaResult.method;
        } else if (verifyAdminMfaBreakGlassCode(breakGlassCode)) {
          mfaMethod = "break_glass";
        } else {
          const failureReason = breakGlassCode
            ? "invalid_break_glass_code"
            : totpCode
              ? "invalid_mfa_code"
              : "mfa_required";
          await safeRecordAuthEvent({
            eventType: "admin_login_failed",
            email,
            userId: user.id,
            ip: request.ip,
            userAgent,
            metadata: {
              reason: failureReason,
            },
          });

          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: "admin_login_failed",
            threshold: failureConfig.adminThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: user.id,
              reason: "auth_failure",
              scope: ACCOUNT_FREEZE_SCOPE,
            });
          }

          await applyAuthFailureDelay();
          const mfaError = breakGlassCode
            ? {
                message: "Invalid admin emergency recovery code.",
                code: API_ERROR_CODES.INVALID_ADMIN_MFA_CODE,
              }
            : totpCode
              ? {
                  message: "Invalid admin MFA code.",
                  code: API_ERROR_CODES.INVALID_ADMIN_MFA_CODE,
                }
              : {
                  message: "Admin MFA code required.",
                  code: API_ERROR_CODES.ADMIN_MFA_CODE_REQUIRED,
                };
          return sendError(
            reply,
            401,
            mfaError.message,
            undefined,
            mfaError.code,
          );
        }
      }

      const { token, expiresAt, sessionId } = await createAdminSessionToken(
        {
          adminId: admin.id,
          userId: Number(user.id),
          email: user.email,
          role: "admin",
          mfaEnabled: Boolean(admin.mfaEnabled),
          mfaRecoveryMode:
            mfaMethod === "recovery_code" || mfaMethod === "break_glass"
              ? mfaMethod
              : "none",
        },
        {
          ip: request.ip,
          userAgent,
        },
      );

      const trackedDevice = await trackUserDeviceFingerprint({
        userId: user.id,
        deviceFingerprint: requestDeviceFingerprint,
        entrypoint: "login",
        activityType: "admin_login_success",
        ip: request.ip,
        userAgent,
        sessionId,
        metadata: {
          adminId: admin.id,
        },
      });
      const currentDeviceFingerprint = trackedDevice?.fingerprint ?? null;

      const anomaly = await detectLoginAnomaly({
        userId: user.id,
        email: user.email,
        successEventType: "admin_login_success",
        currentIp: request.ip,
        currentUserAgent: userAgent,
        currentDeviceFingerprint,
      });

      await safeRecordAuthEvent({
        eventType: "admin_login_success",
        email,
        userId: user.id,
        ip: request.ip,
        userAgent,
        metadata: {
          adminId: admin.id,
          mfaEnabled: Boolean(admin.mfaEnabled),
          mfaMethod,
          recoveryCodesRemaining,
          sessionId,
          sessionKind: "admin",
          deviceFingerprint: currentDeviceFingerprint,
          deviceFingerprintSource: trackedDevice?.source ?? null,
        },
      });
      await recordAdminAction(withAdminAuditContext(request, {
        adminId: admin.id,
        action: "admin_login_success",
        targetType: "admin_session",
        targetId: admin.id,
        sessionId,
        metadata: {
          mfaMethod,
          sessionId,
        },
      }));
      if (mfaMethod === "break_glass") {
        await recordAdminAction(withAdminAuditContext(request, {
          adminId: admin.id,
          action: "admin_mfa_break_glass_login",
          targetType: "admin",
          targetId: admin.id,
          sessionId,
          metadata: {
            sessionId,
          },
        }));
      }
      if (anomaly) {
        await handleLoginAnomaly({
          userId: user.id,
          email: user.email,
          anomalyEventType: "admin_login_anomaly",
          currentIp: request.ip,
          currentUserAgent: userAgent,
          currentDeviceFingerprint,
          anomaly,
        });
      }

      return sendSuccess(reply, {
        token,
        expiresAt,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          adminId: admin.id,
          mfaEnabled: Boolean(admin.mfaEnabled),
        },
      });
    },
  );

  app.post(
    "/auth/email-verification/confirm",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(
        VerificationTokenConfirmSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const consumed = await consumeAuthToken({
        tokenType: "email_verification",
        token: parsed.data.token,
      });
      if (!consumed) {
        await safeRecordAuthEvent({
          eventType: "email_verification_failed",
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: "invalid_or_expired_token" },
        });
        await applyAuthFailureDelay();
        return sendError(
          reply,
          400,
          "Invalid or expired verification token.",
          undefined,
          API_ERROR_CODES.INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
        );
      }

      const user = await resolvePasswordResetTarget({
        userId: consumed.userId,
        email: consumed.email,
      });
      if (!user) {
        return sendError(
          reply,
          404,
          "User not found.",
          undefined,
          API_ERROR_CODES.USER_NOT_FOUND,
        );
      }

      const verified = await markUserEmailVerified(user.id);
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
        tokenType: "email_verification",
        userId: user.id,
        email: user.email,
      });
      await safeRecordAuthEvent({
        eventType: "email_verification_success",
        email: verified.email,
        userId: verified.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });

      return sendSuccess(reply, { verified: true, email: verified.email });
    },
  );
}
