import type { FastifyReply, FastifyRequest } from "fastify";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { KycTier } from "@reward/shared-types/kyc";
import type { UserFreezeScope } from "@reward/shared-types/risk";

import {
  type AdminPermissionKey,
  STEP_UP_ADMIN_PERMISSIONS,
} from "../modules/admin-permission/definitions";
import {
  canAdminAccess,
  getAdminAccessProfileByUserId,
} from "../modules/admin-permission/service";
import {
  verifyAdminMfaBreakGlassCode,
  verifyAdminMfaChallenge,
} from "../modules/admin-mfa/service";
import { context } from "../shared/context";
import { bindActorObservability } from "../shared/telemetry";
import {
  ADMIN_ACCESS_TOKEN_SCOPES,
  ADMIN_SESSION_COOKIE,
  type AuthenticatedAdmin,
  verifyScopedAdminAccessToken,
  verifyAdminSessionToken,
} from "../shared/admin-session";
import {
  USER_SESSION_COOKIE,
  verifyUserSessionToken,
} from "../shared/user-session";
import { toDecimal, toMoneyString } from "../shared/money";
import { sendError, sendErrorForException } from "./respond";
import { isUserFrozen } from "../modules/risk/service";
import {
  resolveRequestCountryCode,
  syncUserJurisdictionState,
} from "../modules/risk/jurisdiction-service";
import {
  getSystemFlags,
  getWithdrawalRiskConfig,
} from "../modules/system/service";
import { getEffectiveUserKycTier } from "../modules/kyc/service";
import { db } from "../db";
import { assertCurrentLegalAcceptanceForUser } from "../modules/legal/service";
import { getUserById } from "../modules/user/service";
import {
  isUserMfaEnabled,
  verifyUserMfaChallenge,
} from "../modules/user-mfa/service";
import { toAmountString } from "./utils";

const setActorContext = (payload: {
  userId: number;
  role: "user" | "admin";
}) => {
  const store = context().getStore();
  if (store) {
    store.userId = payload.userId;
    store.role = payload.role;
  }

  bindActorObservability(payload);
};

const freezeErrorMessages: Record<UserFreezeScope, string> = {
  account_lock: "Account locked.",
  withdrawal_lock: "Withdrawals locked.",
  gameplay_lock: "Gameplay locked.",
  gift_lock: "Gifting locked.",
  topup_lock: "Top-ups locked.",
};

const userKycTierRank: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

const jurisdictionScopedFreezeSet = new Set<UserFreezeScope>([
  "withdrawal_lock",
  "gameplay_lock",
  "topup_lock",
]);

export const requireUser = async (request: FastifyRequest) => {
  const header = request.headers.authorization;
  const bearer =
    header && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null;
  const token = bearer ?? request.cookies[USER_SESSION_COOKIE];
  const user = await verifyUserSessionToken(token);
  if (user) {
    setActorContext({ userId: user.userId, role: user.role });
  }
  return user;
};

const readQueryStringValue = (query: unknown, key: string) => {
  if (!query || typeof query !== "object") {
    return null;
  }

  const value = Reflect.get(query, key);
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
};

const supportsScopedAdminAccessToken = (request: FastifyRequest) =>
  request.url.split("?", 1)[0] === "/admin/ws/table-monitoring";

const resolveScopedAdminAccessToken = async (request: FastifyRequest) => {
  if (!supportsScopedAdminAccessToken(request)) {
    return null;
  }

  const accessToken = readQueryStringValue(request.query, "accessToken");
  if (!accessToken) {
    return null;
  }

  return verifyScopedAdminAccessToken(accessToken, {
    scope: ADMIN_ACCESS_TOKEN_SCOPES.TABLE_MONITORING_WS,
  });
};

export const requireAdmin = async (request: FastifyRequest) => {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const session =
    (await verifyAdminSessionToken(token)) ??
    (await resolveScopedAdminAccessToken(request));
  if (!session) return null;

  const adminProfile = await getAdminAccessProfileByUserId(session.userId);
  if (!adminProfile) return null;

  const admin: AuthenticatedAdmin = {
    adminId: adminProfile.adminId,
    userId: session.userId,
    email: session.email,
    role: "admin",
    mfaEnabled: adminProfile.mfaEnabled,
    mfaRecoveryMode: session.mfaRecoveryMode,
    sessionId: session.sessionId,
    permissions: adminProfile.permissions,
    requiresMfa: adminProfile.requiresMfa,
  };

  setActorContext({ userId: admin.userId, role: "admin" });
  return admin;
};

export const requireUserGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = await requireUser(request);
  if (!user) {
    return sendError(reply, 401, "Unauthorized");
  }
  const systemFlags = await getSystemFlags(db);
  if (systemFlags.maintenanceMode) {
    return sendError(reply, 503, "System under maintenance.");
  }
  const frozen = await isUserFrozen(user.userId, { scope: "account_lock" });
  if (frozen) {
    return sendError(reply, 423, "Account locked.");
  }
  request.user = user;
};

export const requireUserFreezeScope = (scope: UserFreezeScope) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return sendError(reply, 401, "Unauthorized");
    }

    if (jurisdictionScopedFreezeSet.has(scope)) {
      const countryCode = await resolveRequestCountryCode({
        headers: request.headers as Record<string, unknown>,
        ip: request.ip,
      });
      await syncUserJurisdictionState({
        userId: user.userId,
        countryCodeOverride: countryCode,
      });
    }

    const frozen = await isUserFrozen(user.userId, { scope });
    if (frozen) {
      return sendError(reply, 423, freezeErrorMessages[scope]);
    }
  };
};

export const requireVerifiedUser = (requirements: {
  email?: boolean;
  phone?: boolean;
}) => {
  const requireEmail = requirements.email === true;
  const requirePhone = requirements.phone === true;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return sendError(reply, 401, "Unauthorized");
    }

    const currentUser = await getUserById(user.userId);
    if (!currentUser) {
      return sendError(reply, 404, "User not found.");
    }

    if (requireEmail && !currentUser.emailVerifiedAt) {
      return sendError(
        reply,
        403,
        "Email verification required.",
        undefined,
        API_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
      );
    }

    if (requirePhone && !currentUser.phoneVerifiedAt) {
      return sendError(
        reply,
        403,
        "Phone verification required.",
        undefined,
        API_ERROR_CODES.PHONE_VERIFICATION_REQUIRED,
      );
    }
  };
};

export const requireUserKycTier = (requirements: {
  minimum: KycTier;
}) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return sendError(reply, 401, "Unauthorized");
    }

    const currentTier = await getEffectiveUserKycTier(user.userId);
    request.userKycTier = currentTier;
    if (
      userKycTierRank[currentTier] <
      userKycTierRank[requirements.minimum]
    ) {
      return sendError(
        reply,
        403,
        "KYC verification required.",
        undefined,
        API_ERROR_CODES.KYC_TIER_REQUIRED,
      );
    }
  };
};

export const requireCurrentLegalAcceptance = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.user;
  if (!user) {
    return sendError(reply, 401, "Unauthorized");
  }

  try {
    await assertCurrentLegalAcceptanceForUser(user.userId);
    return;
  } catch (error) {
    return sendErrorForException(
      reply,
      error,
      "Accept the current legal documents to continue.",
    );
  }
};

export const requireAdminGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const admin = await requireAdmin(request);
  if (!admin) {
    return sendError(reply, 401, "Unauthorized");
  }
  const frozen = await isUserFrozen(admin.userId, { scope: "account_lock" });
  if (frozen) {
    return sendError(reply, 423, "Account locked.");
  }
  request.admin = admin;
};

const toObject = (value: unknown) => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readString = (value: unknown) =>
  typeof value === "string"
    ? value
    : value === null || value === undefined
      ? undefined
      : String(value);

const extractAdminTotpCode = (request: FastifyRequest) => {
  const headerValue = request.headers["x-admin-totp-code"];
  const headerCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerCode === "string" && headerCode.trim() !== "") {
    return headerCode.trim();
  }

  const body = toObject(request.body);
  const bodyCode = readString(Reflect.get(body, "totpCode"));
  return bodyCode?.trim() || null;
};

const extractAdminBreakGlassCode = (request: FastifyRequest) => {
  const headerValue = request.headers["x-admin-break-glass-code"];
  const headerCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerCode === "string" && headerCode.trim() !== "") {
    return headerCode.trim();
  }

  const body = toObject(request.body);
  const bodyCode = readString(Reflect.get(body, "breakGlassCode"));
  return bodyCode?.trim() || null;
};

const extractUserTotpCode = (request: FastifyRequest) => {
  const headerValue = request.headers["x-user-totp-code"];
  const headerCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerCode === "string" && headerCode.trim() !== "") {
    return headerCode.trim();
  }

  const body = toObject(request.body);
  const bodyCode = readString(Reflect.get(body, "totpCode"));
  return bodyCode?.trim() || null;
};

export const requireUserMfaStepUp = (
  options: {
    amountField?: string;
  } = {},
) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return sendError(reply, 401, "Unauthorized");
    }

    const body = toObject(request.body);
    const amount = toAmountString(
      Reflect.get(body, options.amountField ?? "amount"),
    );
    if (!amount) {
      return;
    }

    const amountValue = toDecimal(amount);
    const { largeAmountSecondApprovalThreshold } =
      await getWithdrawalRiskConfig(db);
    if (
      largeAmountSecondApprovalThreshold.lte(0) ||
      amountValue.lt(largeAmountSecondApprovalThreshold)
    ) {
      return;
    }

    const mfaEnabled = await isUserMfaEnabled(user.userId);
    if (!mfaEnabled) {
      return sendError(
        reply,
        403,
        "User MFA must be enabled for high-value withdrawals.",
        undefined,
        API_ERROR_CODES.USER_MFA_REQUIRED,
      );
    }

    const totpCode = extractUserTotpCode(request);
    if (!totpCode) {
      return sendError(
        reply,
        401,
        "User step-up code required.",
        undefined,
        API_ERROR_CODES.USER_STEP_UP_REQUIRED,
      );
    }

    const result = await verifyUserMfaChallenge({
      userId: user.userId,
      code: totpCode,
    });
    if (!result.valid || !result.method) {
      return sendError(
        reply,
        401,
        "Invalid user step-up code.",
        undefined,
        API_ERROR_CODES.USER_STEP_UP_INVALID,
      );
    }

    request.userStepUp = {
      verified: true,
      method: result.method,
      verifiedAt: new Date().toISOString(),
      amountThreshold: toMoneyString(largeAmountSecondApprovalThreshold),
    };
  };
};

export const requireAdminPermission = (
  permission: AdminPermissionKey,
  options: { requireStepUp?: boolean; requireBreakGlass?: boolean } = {},
) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = request.admin;
    if (!admin) {
      return sendError(reply, 401, "Unauthorized");
    }

    if (!canAdminAccess(admin, permission)) {
      return sendError(
        reply,
        403,
        "Forbidden",
        undefined,
        "ADMIN_PERMISSION_REQUIRED",
      );
    }

    const requireBreakGlass = options.requireBreakGlass === true;
    const requireStepUp = requireBreakGlass
      ? true
      : options.requireStepUp ?? STEP_UP_ADMIN_PERMISSIONS.has(permission);
    if (!requireStepUp && !requireBreakGlass) {
      return;
    }

    let verifiedMethod: "totp" | "recovery_code" | null = null;
    let recoveryCodesRemaining = 0;
    const verifiedAt = new Date().toISOString();

    if (requireStepUp) {
      if (!admin.mfaEnabled) {
        return sendError(
          reply,
          403,
          "Admin MFA must be enabled for this action.",
          undefined,
          API_ERROR_CODES.ADMIN_MFA_REQUIRED,
        );
      }

      const totpCode = extractAdminTotpCode(request);
      if (!totpCode) {
        return sendError(
          reply,
          401,
          "Admin step-up code required.",
          undefined,
          API_ERROR_CODES.ADMIN_STEP_UP_REQUIRED,
        );
      }

      const result = await verifyAdminMfaChallenge({
        adminId: admin.adminId,
        code: totpCode,
      });
      if (!result.valid || !result.method) {
        return sendError(
          reply,
          401,
          "Invalid admin step-up code.",
          undefined,
          API_ERROR_CODES.ADMIN_STEP_UP_INVALID,
        );
      }

      verifiedMethod = result.method;
      recoveryCodesRemaining = result.recoveryCodesRemaining;
    }

    if (requireBreakGlass) {
      const breakGlassCode = extractAdminBreakGlassCode(request);
      if (!breakGlassCode) {
        return sendError(
          reply,
          401,
          "Admin break-glass code required.",
          undefined,
          API_ERROR_CODES.ADMIN_BREAK_GLASS_REQUIRED,
        );
      }

      if (!verifyAdminMfaBreakGlassCode(breakGlassCode)) {
        return sendError(
          reply,
          401,
          "Invalid admin break-glass code.",
          undefined,
          API_ERROR_CODES.ADMIN_BREAK_GLASS_INVALID,
        );
      }
    }

    if (verifiedMethod) {
      request.adminStepUp = {
        verified: true,
        method: verifiedMethod,
        verifiedAt,
        recoveryCodesRemaining,
        breakGlassVerified: requireBreakGlass,
      };
    }
  };
};
