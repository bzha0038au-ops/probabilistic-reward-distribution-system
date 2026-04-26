import type { FastifyReply, FastifyRequest } from "fastify";

import {
  type AdminPermissionKey,
  STEP_UP_ADMIN_PERMISSIONS,
} from "../modules/admin-permission/definitions";
import {
  canAdminAccess,
  getAdminAccessProfileByUserId,
} from "../modules/admin-permission/service";
import { verifyAdminMfaChallenge } from "../modules/admin-mfa/service";
import { context } from "../shared/context";
import { bindActorObservability } from "../shared/telemetry";
import {
  ADMIN_SESSION_COOKIE,
  type AuthenticatedAdmin,
  verifyAdminSessionToken,
} from "../shared/admin-session";
import {
  USER_SESSION_COOKIE,
  verifyUserSessionToken,
} from "../shared/user-session";
import { sendError } from "./respond";
import { isUserFrozen } from "../modules/risk/service";
import { getSystemFlags } from "../modules/system/service";
import { db } from "../db";
import { getUserById } from "../modules/user/service";

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

export const requireAdmin = async (request: FastifyRequest) => {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const session = await verifyAdminSessionToken(token);
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
  const frozen = await isUserFrozen(user.userId);
  if (frozen) {
    return sendError(reply, 423, "Account locked.");
  }
  request.user = user;
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
        "EMAIL_VERIFICATION_REQUIRED",
      );
    }

    if (requirePhone && !currentUser.phoneVerifiedAt) {
      return sendError(
        reply,
        403,
        "Phone verification required.",
        undefined,
        "PHONE_VERIFICATION_REQUIRED",
      );
    }
  };
};

export const requireAdminGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const admin = await requireAdmin(request);
  if (!admin) {
    return sendError(reply, 401, "Unauthorized");
  }
  const frozen = await isUserFrozen(admin.userId);
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

export const requireAdminPermission = (
  permission: AdminPermissionKey,
  options: { requireStepUp?: boolean } = {},
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

    const requireStepUp =
      options.requireStepUp ?? STEP_UP_ADMIN_PERMISSIONS.has(permission);
    if (!requireStepUp) {
      return;
    }

    if (!admin.mfaEnabled) {
      return sendError(
        reply,
        403,
        "Admin MFA must be enabled for this action.",
        undefined,
        "ADMIN_MFA_REQUIRED",
      );
    }

    const totpCode = extractAdminTotpCode(request);
    if (!totpCode) {
      return sendError(
        reply,
        401,
        "Admin step-up code required.",
        undefined,
        "ADMIN_STEP_UP_REQUIRED",
      );
    }

    const result = await verifyAdminMfaChallenge({
      adminId: admin.adminId,
      code: totpCode,
    });
    if (!result.valid) {
      return sendError(
        reply,
        401,
        "Invalid admin step-up code.",
        undefined,
        "ADMIN_STEP_UP_INVALID",
      );
    }

    request.adminStepUp = {
      verified: true,
      method: result.method,
      verifiedAt: new Date().toISOString(),
      recoveryCodesRemaining: result.recoveryCodesRemaining,
    };
  };
};
