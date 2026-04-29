import { getUserByEmail, getUserById } from "../../../modules/user/service";
import {
  NotificationProviderUnavailableError,
  NotificationThrottleError,
  sendAnomalousLoginAlert,
  sendEmailVerificationNotification,
  sendPasswordResetNotification,
  sendPhoneVerificationNotification,
} from "../../../modules/auth/notification-service";
import { issueAuthToken } from "../../../modules/auth/token-service";
import { sendError } from "../../respond";
import { readStringValue } from "../../utils";
import { getConfigView } from "../../../shared/config";
import { logger } from "../../../shared/logger";
import {
  countAuthFailures,
  findLatestAuthEvent,
  recordAuthEvent,
} from "../../../modules/audit/service";
import { recordSuspiciousActivity } from "../../../modules/risk/service";
import { getAuthFailureConfig } from "../../../modules/system/service";
import { db } from "../../../db";
import { requireAdmin, requireUser } from "../../guards";

const config = getConfigView();

export const authRateLimit = {
  get max() {
    return config.rateLimitAuthMax;
  },
  get timeWindow() {
    return config.rateLimitAuthWindowMs;
  },
};

export const adminAuthRateLimit = {
  get max() {
    return config.rateLimitAdminAuthMax;
  },
  get timeWindow() {
    return config.rateLimitAdminAuthWindowMs;
  },
};

export const safeRecordAuthEvent = async (
  payload: Parameters<typeof recordAuthEvent>[0]
) => {
  try {
    await recordAuthEvent(payload);
  } catch (error) {
    logger.warning("failed to record auth event", { err: error });
  }
};

const safeEnqueueNotification = async (
  label: string,
  runner: () => Promise<unknown>
) => {
  try {
    return await runner();
  } catch (error) {
    logger.warning("failed to enqueue auth notification", {
      label,
      err: error,
    });
    return null;
  }
};

export const replyWithNotificationError = (
  reply: Parameters<typeof sendError>[0],
  label: string,
  error: unknown
) => {
  if (error instanceof NotificationThrottleError) {
    const retryAfterSeconds = Math.max(
      Math.ceil((error.resetAt - Date.now()) / 1000),
      1
    );
    reply.header("retry-after", String(retryAfterSeconds));
    return sendError(
      reply,
      429,
      error.message,
      undefined,
      "AUTH_NOTIFICATION_THROTTLED"
    );
  }

  if (error instanceof NotificationProviderUnavailableError) {
    logger.error("auth notification provider unavailable", {
      label,
      channel: error.channel,
      err: error,
    });
    return sendError(
      reply,
      503,
      "Notification delivery unavailable.",
      undefined,
      "AUTH_NOTIFICATION_UNAVAILABLE"
    );
  }

  logger.error("failed to enqueue auth notification", {
    label,
    err: error,
  });
  return sendError(
    reply,
    503,
    "Notification delivery unavailable.",
    undefined,
    "AUTH_NOTIFICATION_ENQUEUE_FAILED"
  );
};

export const resolveUserAgent = (request: {
  headers: { [key: string]: unknown };
}) => {
  const value = request.headers["user-agent"];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
};

export const maskPhone = (phone: string) =>
  phone.length <= 4
    ? "****"
    : `${"*".repeat(Math.max(phone.length - 4, 1))}${phone.slice(-4)}`;

const buildPublicUrl = (baseUrl: string, path: string, token: string) => {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
};

export const toSessionUser = (user: {
  id: number;
  email: string;
  role: string;
  emailVerifiedAt: Date | string | null;
  phoneVerifiedAt: Date | string | null;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role === "admin" ? "admin" : "user",
  emailVerifiedAt:
    user.emailVerifiedAt instanceof Date
      ? user.emailVerifiedAt.toISOString()
      : user.emailVerifiedAt,
  phoneVerifiedAt:
    user.phoneVerifiedAt instanceof Date
      ? user.phoneVerifiedAt.toISOString()
      : user.phoneVerifiedAt,
});

export const shouldFreezeAccount = async (payload: {
  email: string;
  eventType: string;
  threshold: number;
  windowMinutes: number;
}) => {
  if (payload.threshold <= 0) return false;
  const total = await countAuthFailures({
    email: payload.email,
    eventType: payload.eventType,
    windowMinutes: payload.windowMinutes,
  });
  return total >= payload.threshold;
};

export const resolveAuthFailureConfig = async () => {
  const system = await getAuthFailureConfig(db);
  return {
    windowMinutes: system.authFailureWindowMinutes.toNumber(),
    userThreshold: system.authFailureFreezeThreshold.toNumber(),
    adminThreshold: system.adminFailureFreezeThreshold.toNumber(),
  };
};

export const requireCurrentUserSession = async (
  request: Parameters<typeof requireUser>[0],
  reply: Parameters<typeof sendError>[0]
) => {
  const user = await requireUser(request);
  if (!user) {
    sendError(reply, 401, "Unauthorized");
    return null;
  }
  request.user = user;
  return user;
};

export const requireCurrentAdminSession = async (
  request: Parameters<typeof requireAdmin>[0],
  reply: Parameters<typeof sendError>[0]
) => {
  const admin = await requireAdmin(request);
  if (!admin) {
    sendError(reply, 401, "Unauthorized");
    return null;
  }
  request.admin = admin;
  return admin;
};

export const readSessionIdParam = (params: unknown) =>
  readStringValue(params, "sessionId")?.trim() || null;

export const resolvePasswordResetTarget = async (payload: {
  userId?: number | null;
  email?: string | null;
}) => {
  if (payload.userId) {
    return getUserById(payload.userId);
  }
  if (payload.email) {
    return getUserByEmail(payload.email);
  }
  return null;
};

export const detectLoginAnomaly = async (payload: {
  userId: number;
  email: string;
  successEventType: "user_login_success" | "admin_login_success";
  currentIp?: string | null;
  currentUserAgent?: string | null;
  currentDeviceFingerprint?: string | null;
}) => {
  if (config.anomalousLoginLookbackDays <= 0) {
    return null;
  }

  const previous = await findLatestAuthEvent({
    userId: payload.userId,
    email: payload.email,
    eventType: payload.successEventType,
  });
  if (!previous?.createdAt) {
    return null;
  }

  const previousCreatedAt = new Date(previous.createdAt);
  const lookbackCutoff = new Date(
    Date.now() - config.anomalousLoginLookbackDays * 24 * 60 * 60 * 1000
  );
  if (
    Number.isNaN(previousCreatedAt.valueOf()) ||
    previousCreatedAt < lookbackCutoff
  ) {
    return null;
  }

  const signals: string[] = [];
  const previousDeviceFingerprint = readStringValue(
    previous.metadata,
    "deviceFingerprint",
  );
  if (payload.currentIp && previous.ip && payload.currentIp !== previous.ip) {
    signals.push("new_ip");
  }
  if (
    payload.currentUserAgent &&
    previous.userAgent &&
    payload.currentUserAgent !== previous.userAgent
  ) {
    signals.push("new_user_agent");
  }
  if (
    payload.currentDeviceFingerprint &&
    previousDeviceFingerprint &&
    payload.currentDeviceFingerprint !== previousDeviceFingerprint
  ) {
    signals.push("new_device_fingerprint");
  }

  if (signals.length === 0) {
    return null;
  }

  return {
    previous,
    signals,
  };
};

export const handleLoginAnomaly = async (payload: {
  userId: number;
  email: string;
  anomalyEventType: "user_login_anomaly" | "admin_login_anomaly";
  currentIp?: string | null;
  currentUserAgent?: string | null;
  currentDeviceFingerprint?: string | null;
  anomaly: NonNullable<Awaited<ReturnType<typeof detectLoginAnomaly>>>;
}) => {
  const previousDeviceFingerprint = readStringValue(
    payload.anomaly.previous.metadata,
    "deviceFingerprint",
  );
  const metadata = {
    signals: payload.anomaly.signals,
    previousIp: payload.anomaly.previous.ip ?? null,
    previousUserAgent: payload.anomaly.previous.userAgent ?? null,
    previousDeviceFingerprint,
    currentDeviceFingerprint: payload.currentDeviceFingerprint ?? null,
    previousCreatedAt: new Date(
      payload.anomaly.previous.createdAt
    ).toISOString(),
  };

  await safeRecordAuthEvent({
    eventType: payload.anomalyEventType,
    email: payload.email,
    userId: payload.userId,
    ip: payload.currentIp,
    userAgent: payload.currentUserAgent,
    metadata,
  });

  await recordSuspiciousActivity({
    userId: payload.userId,
    reason: "anomalous_login",
    freezeReason: "aml_review",
    freezeScope: "account_lock",
    metadata: {
      ...metadata,
      loginType: payload.anomalyEventType,
      currentIp: payload.currentIp ?? null,
      currentUserAgent: payload.currentUserAgent ?? null,
      currentDeviceFingerprint: payload.currentDeviceFingerprint ?? null,
    },
    score: payload.anomaly.signals.length >= 2 ? 2 : 1,
  });

  logger.warning("anomalous login detected", {
    userId: payload.userId,
    email: payload.email,
    eventType: payload.anomalyEventType,
    signals: payload.anomaly.signals,
    currentIp: payload.currentIp ?? null,
    previousIp: payload.anomaly.previous.ip ?? null,
  });

  await safeEnqueueNotification("anomalous_login_alert", () =>
    sendAnomalousLoginAlert({
      email: payload.email,
      eventType: payload.anomalyEventType,
      currentIp: payload.currentIp,
      previousIp: payload.anomaly.previous.ip,
      currentUserAgent: payload.currentUserAgent,
      previousUserAgent: payload.anomaly.previous.userAgent,
      occurredAt: new Date(),
    })
  );
};

const sendEmailVerification = async (payload: {
  userId: number;
  email: string;
}) => {
  return db.transaction(async (tx) => {
    const issued = await issueAuthToken(
      {
        tokenType: "email_verification",
        userId: payload.userId,
        email: payload.email,
        ttlMinutes: config.emailVerificationTtlMinutes,
      },
      tx
    );

    await sendEmailVerificationNotification(
      {
        email: payload.email,
        verificationUrl: buildPublicUrl(
          config.webBaseUrl,
          "/verify-email",
          issued.rawToken
        ),
        expiresAt: issued.expiresAt,
      },
      tx
    );

    return issued;
  });
};

export const requestEmailVerification = async (payload: {
  userId: number;
  email: string;
  ip?: string | null;
  userAgent?: string;
  source?: string;
}) => {
  await sendEmailVerification({
    userId: payload.userId,
    email: payload.email,
  });
  await safeRecordAuthEvent({
    eventType: "email_verification_requested",
    email: payload.email,
    userId: payload.userId,
    ip: payload.ip,
    userAgent: payload.userAgent,
    ...(payload.source ? { metadata: { source: payload.source } } : {}),
  });
};

export const queuePasswordResetNotification = async (payload: {
  userId: number;
  email: string;
}) => {
  return db.transaction(async (tx) => {
    const issued = await issueAuthToken(
      {
        tokenType: "password_reset",
        userId: payload.userId,
        email: payload.email,
        ttlMinutes: config.passwordResetTtlMinutes,
      },
      tx
    );

    await sendPasswordResetNotification(
      {
        email: payload.email,
        resetUrl: buildPublicUrl(
          config.webBaseUrl,
          "/reset-password",
          issued.rawToken
        ),
        expiresAt: issued.expiresAt,
      },
      tx
    );

    return issued;
  });
};

export const queuePhoneVerificationNotification = async (payload: {
  userId: number;
  email: string;
  phone: string;
}) => {
  return db.transaction(async (tx) => {
    const issued = await issueAuthToken(
      {
        tokenType: "phone_verification",
        userId: payload.userId,
        email: payload.email,
        phone: payload.phone,
        ttlMinutes: config.phoneVerificationTtlMinutes,
        format: "code",
      },
      tx
    );

    await sendPhoneVerificationNotification(
      {
        phone: payload.phone,
        code: issued.rawToken,
        expiresAt: issued.expiresAt,
      },
      tx
    );

    return issued;
  });
};
