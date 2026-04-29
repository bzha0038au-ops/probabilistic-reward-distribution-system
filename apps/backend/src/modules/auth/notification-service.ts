import nodemailer from "nodemailer";
import { and, desc, eq, ilike, lte, sql } from "@reward/database/orm";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationDeliveryAttemptStatus,
  NotificationDeliveryQuery,
  NotificationDeliveryStatus,
  NotificationDeliverySummary,
  NotificationProvider,
  NotificationProviderStatus,
} from "@reward/shared-types/notification";
import type { RealtimeJsonValue } from "@reward/shared-types/realtime";
import { notificationDeliveryStatusValues } from "@reward/shared-types/notification";

import { client, db, type DbClient, type DbTransaction } from "../../db";
import { publishRealtimeToUser } from "../../realtime";
import { getConfigView } from "../../shared/config";
import { logger } from "../../shared/logger";
import { createRateLimiter } from "../../shared/rate-limit";
import {
  notificationDeliveries,
  notificationDeliveryAttempts,
  notificationPushDevices,
  notificationRecords,
} from "@reward/database";

export type DeliveryPayload = Record<string, unknown>;

export type NotificationDeliveryLike = {
  id: number;
  userId: number | null;
  notificationRecordId: number | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  recipient: string;
  provider: NotificationProvider;
  subject: string;
  body: string | null;
  payload: DeliveryPayload;
};

export type ProviderSendResult = {
  providerMessageId?: string | null;
  responseCode?: number | null;
  metadata?: Record<string, unknown> | null;
};

const config = getConfigView();

let emailLimiter: ReturnType<typeof createRateLimiter> | null = null;
let smsLimiter: ReturnType<typeof createRateLimiter> | null = null;
let alertLimiter: ReturnType<typeof createRateLimiter> | null = null;

const getEmailLimiter = () => {
  if (!emailLimiter) {
    emailLimiter = createRateLimiter({
      limit: config.authNotificationEmailThrottleMax,
      windowMs: config.authNotificationEmailThrottleWindowMs,
      prefix: "auth-notify-email",
    });
  }

  return emailLimiter;
};

const getSmsLimiter = () => {
  if (!smsLimiter) {
    smsLimiter = createRateLimiter({
      limit: config.authNotificationSmsThrottleMax,
      windowMs: config.authNotificationSmsThrottleWindowMs,
      prefix: "auth-notify-sms",
    });
  }

  return smsLimiter;
};

const getAlertLimiter = () => {
  if (!alertLimiter) {
    alertLimiter = createRateLimiter({
      limit: config.authNotificationAlertThrottleMax,
      windowMs: config.authNotificationAlertThrottleWindowMs,
      prefix: "auth-notify-alert",
    });
  }

  return alertLimiter;
};

let smtpTransport: nodemailer.Transporter | null = null;

const hasSmtpProvider = () =>
  Boolean(config.authSmtpHost && config.authEmailFrom);

const hasTwilioProvider = () =>
  Boolean(
    config.authTwilioAccountSid &&
    config.authTwilioAuthToken &&
    (config.authTwilioFromNumber || config.authTwilioMessagingServiceSid),
  );

const hasExpoPushProvider = () => true;

const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? "***" : ""}@${domain}`;
};

const maskPhone = (phone: string) =>
  phone.length <= 4
    ? "****"
    : `${"*".repeat(Math.max(phone.length - 4, 1))}${phone.slice(-4)}`;

export const maskRecipient = (
  channel: NotificationChannel,
  recipient: string,
) => {
  if (channel === "email") {
    return maskEmail(recipient);
  }
  if (channel === "sms") {
    return maskPhone(recipient);
  }
  if (channel === "push") {
    return truncate(recipient, 24);
  }
  return recipient;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const normalizePhone = (phone: string) =>
  phone.trim().replace(/[^\d+]/g, "");

export const normalizeRecipient = (
  channel: NotificationChannel,
  recipient: string,
) => {
  if (channel === "email") {
    return normalizeEmail(recipient);
  }
  if (channel === "sms") {
    return normalizePhone(recipient);
  }
  return recipient.trim();
};

export const truncate = (value: string, max = 500) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const computeRetryDelayMs = (attempts: number) => {
  const exponent = Math.max(attempts - 1, 0);
  const delay = config.authNotificationRetryBaseMs * 2 ** exponent;
  return Math.min(delay, config.authNotificationRetryMaxMs);
};

const readString = (
  payload: DeliveryPayload,
  key: string,
  required = true,
): string | null => {
  const value = payload[key];
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (!required) {
    return null;
  }
  throw new NotificationDeliveryError(`Notification payload missing ${key}`, {
    retryable: false,
  });
};

const readOptionalString = (payload: DeliveryPayload, key: string) =>
  readString(payload, key, false);

const readIsoDate = (payload: DeliveryPayload, key: string) => {
  const value = readString(payload, key);
  if (!value) {
    throw new NotificationDeliveryError(`Notification payload missing ${key}`, {
      retryable: false,
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new NotificationDeliveryError(
      `Notification payload contains invalid ${key}`,
      {
        retryable: false,
      },
    );
  }
  return parsed;
};

export class NotificationThrottleError extends Error {
  constructor(
    message: string,
    readonly resetAt: number,
    readonly limit: number,
  ) {
    super(message);
    this.name = "NotificationThrottleError";
  }
}

export class NotificationProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly channel: NotificationChannel,
  ) {
    super(message);
    this.name = "NotificationProviderUnavailableError";
  }
}

export class NotificationDeliveryError extends Error {
  readonly retryable: boolean;
  readonly responseCode: number | null;
  readonly metadata: Record<string, unknown> | null;

  constructor(
    message: string,
    options?: {
      retryable?: boolean;
      responseCode?: number | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
    this.retryable = options?.retryable ?? true;
    this.responseCode = options?.responseCode ?? null;
    this.metadata = options?.metadata ?? null;
  }
}

export const resolveNotificationProvider = (
  channel: NotificationChannel,
): NotificationProvider => {
  if (channel === "in_app") {
    return "in_app";
  }
  if (channel === "push" && hasExpoPushProvider()) {
    return "expo_push";
  }
  if (channel === "email" && hasSmtpProvider()) {
    return "smtp";
  }
  if (channel === "sms" && hasTwilioProvider()) {
    return "twilio";
  }
  if (config.nodeEnv !== "production" && config.authNotificationWebhookUrl) {
    return "webhook";
  }
  if (config.nodeEnv !== "production") {
    return "mock";
  }

  throw new NotificationProviderUnavailableError(
    channel === "email"
      ? "Notification email provider is not configured."
      : channel === "sms"
        ? "Notification SMS provider is not configured."
        : channel === "push"
          ? "Notification push provider is not configured."
        : "Notification channel provider is not configured.",
    channel,
  );
};

export const assertNotificationChannelAvailable = (
  channel: NotificationChannel,
) => {
  resolveNotificationProvider(channel);
};

const resolveLimiter = (kind: NotificationKind) => {
  if (kind === "phone_verification") {
    return {
      enabled: config.authNotificationSmsThrottleMax > 0,
      limiter: getSmsLimiter(),
    };
  }
  if (
    kind === "security_alert" ||
    kind === "aml_review" ||
    kind === "kyc_reverification"
  ) {
    return {
      enabled: config.authNotificationAlertThrottleMax > 0,
      limiter: getAlertLimiter(),
    };
  }
  return {
    enabled: config.authNotificationEmailThrottleMax > 0,
    limiter: getEmailLimiter(),
  };
};

export const enforceRecipientThrottle = async (payload: {
  kind: NotificationKind;
  recipientKey: string;
}) => {
  const selected = resolveLimiter(payload.kind);
  if (!selected.enabled) {
    return;
  }

  const result = await selected.limiter.consume(
    `${payload.kind}:${payload.recipientKey}`,
  );
  if (!result.allowed) {
    throw new NotificationThrottleError(
      "Too many notification requests. Please wait before trying again.",
      result.resetAt,
      result.limit,
    );
  }
};

const getSmtpTransport = () => {
  if (smtpTransport) {
    return smtpTransport;
  }

  smtpTransport = nodemailer.createTransport({
    host: config.authSmtpHost,
    port: config.authSmtpPort,
    secure: config.authSmtpSecure,
    auth:
      config.authSmtpUser || config.authSmtpPass
        ? {
            user: config.authSmtpUser,
            pass: config.authSmtpPass,
          }
        : undefined,
  });

  return smtpTransport;
};

const withTimeout = async <T>(runner: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.authNotificationRequestTimeoutMs,
  );

  try {
    return await runner(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NotificationDeliveryError(
        "Notification provider request timed out.",
        {
          retryable: true,
        },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const renderEmailBody = (delivery: NotificationDeliveryLike) => {
  switch (delivery.kind) {
    case "password_reset": {
      const resetUrl = readString(delivery.payload, "resetUrl");
      const expiresAt = readIsoDate(delivery.payload, "expiresAt");
      return [
        "We received a request to reset your password.",
        "",
        `Reset your password: ${resetUrl}`,
        "",
        `This link expires at ${expiresAt.toISOString()}.`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n");
    }
    case "email_verification": {
      const verificationUrl = readString(delivery.payload, "verificationUrl");
      const expiresAt = readIsoDate(delivery.payload, "expiresAt");
      return [
        "Verify your email address to finish setting up your account.",
        "",
        `Verify now: ${verificationUrl}`,
        "",
        `This link expires at ${expiresAt.toISOString()}.`,
      ].join("\n");
    }
    case "security_alert": {
      const occurredAt = readIsoDate(delivery.payload, "occurredAt");
      const currentIp = readOptionalString(delivery.payload, "currentIp");
      const previousIp = readOptionalString(delivery.payload, "previousIp");
      const currentUserAgent = readOptionalString(
        delivery.payload,
        "currentUserAgent",
      );
      const previousUserAgent = readOptionalString(
        delivery.payload,
        "previousUserAgent",
      );
      return [
        "We detected a new login pattern on your account.",
        "",
        `Occurred at: ${occurredAt.toISOString()}`,
        `Current IP: ${currentIp ?? "unknown"}`,
        `Previous IP: ${previousIp ?? "unknown"}`,
        `Current device: ${currentUserAgent ?? "unknown"}`,
        `Previous device: ${previousUserAgent ?? "unknown"}`,
        "",
        "If this was not you, reset your password and review active sessions immediately.",
      ].join("\n");
    }
    case "aml_review": {
      const occurredAt = readIsoDate(delivery.payload, "occurredAt");
      const checkpoint = readString(delivery.payload, "checkpoint");
      const riskLevel = readString(delivery.payload, "riskLevel");
      const providerKey = readString(delivery.payload, "providerKey");
      const userId = readString(delivery.payload, "userId");
      const userEmail = readOptionalString(delivery.payload, "userEmail");
      const userPhone = readOptionalString(delivery.payload, "userPhone");
      const summary = readOptionalString(delivery.payload, "summary");
      return [
        `AML review required for user #${userId}.`,
        "",
        `Checkpoint: ${checkpoint}`,
        `Risk level: ${riskLevel}`,
        `Provider: ${providerKey}`,
        `Occurred at: ${occurredAt.toISOString()}`,
        `User email: ${userEmail ?? "unknown"}`,
        `User phone: ${userPhone ?? "unknown"}`,
        "",
        summary ?? "Mock AML screening reported a potential sanctions/watchlist match.",
      ].join("\n");
    }
    case "kyc_reverification": {
      const reverificationType = readString(
        delivery.payload,
        "reverificationType",
      );
      const verificationUrl = readString(delivery.payload, "verificationUrl");
      const currentTier = readOptionalString(delivery.payload, "currentTier");
      const targetTier = readOptionalString(delivery.payload, "targetTier");
      const operatorReason = readOptionalString(
        delivery.payload,
        "operatorReason",
      );
      const occurredAtValue = readOptionalString(delivery.payload, "occurredAt");
      const expiresAtValue = readOptionalString(delivery.payload, "expiresAt");
      const occurredAt = occurredAtValue ? new Date(occurredAtValue) : null;
      const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;

      if (reverificationType === "document_expiring_soon") {
        return [
          "One of your KYC identity documents is expiring soon.",
          "",
          `Current tier: ${currentTier ?? "unknown"}`,
          `Document expires at: ${expiresAt?.toISOString() ?? "unknown"}`,
          "",
          `Review and resubmit documents: ${verificationUrl}`,
        ].join("\n");
      }

      const reverificationReasonLabel =
        reverificationType === "document_expired"
          ? "Document expired"
          : reverificationType === "policy_update"
            ? "Policy update"
            : "Manual reverification request";

      return [
        "Your account requires KYC re-verification before protected access can continue.",
        "",
        `Reason: ${reverificationReasonLabel}`,
        `Previous tier: ${targetTier ?? currentTier ?? "unknown"}`,
        `Triggered at: ${occurredAt?.toISOString() ?? "unknown"}`,
        `Expired document at: ${expiresAt?.toISOString() ?? "not provided"}`,
        `Operator note: ${operatorReason ?? "none"}`,
        "",
        `Upload refreshed documents: ${verificationUrl}`,
      ].join("\n");
    }
    case "saas_tenant_invite": {
      const inviteUrl = readString(delivery.payload, "inviteUrl");
      const tenantName = readString(delivery.payload, "tenantName");
      const role = readString(delivery.payload, "role");
      const expiresAt = readIsoDate(delivery.payload, "expiresAt");
      const invitedBy = readOptionalString(delivery.payload, "invitedBy");
      return [
        `You've been invited to the Reward SaaS tenant "${tenantName}".`,
        "",
        `Role: ${role}`,
        `Invited by: ${invitedBy ?? "Reward admin"}`,
        `Expires at: ${expiresAt.toISOString()}`,
        "",
        `Accept invitation: ${inviteUrl}`,
      ].join("\n");
    }
    case "saas_billing_budget_alert": {
      const tenantName = readString(delivery.payload, "tenantName");
      const eventType = readString(delivery.payload, "eventType");
      const month = readString(delivery.payload, "month");
      const currency = readString(delivery.payload, "currency");
      const currentTotalAmount = readString(
        delivery.payload,
        "currentTotalAmount",
      );
      const currentUsageAmount = readString(
        delivery.payload,
        "currentUsageAmount",
      );
      const monthlyBudget = readOptionalString(delivery.payload, "monthlyBudget");
      const budgetThresholdAmount = readOptionalString(
        delivery.payload,
        "budgetThresholdAmount",
      );
      const hardCap = readOptionalString(delivery.payload, "hardCap");
      const projectedTotalAmount7d = readString(
        delivery.payload,
        "projectedTotalAmount7d",
      );
      const projectedTotalAmount30d = readString(
        delivery.payload,
        "projectedTotalAmount30d",
      );
      const dailyRunRate7d = readString(delivery.payload, "dailyRunRate7d");
      const dailyRunRate30d = readString(delivery.payload, "dailyRunRate30d");
      const hardCapReachedAt = readOptionalString(
        delivery.payload,
        "hardCapReachedAt",
      );
      return [
        `Reward SaaS billing alert for tenant "${tenantName}".`,
        "",
        `Event: ${eventType}`,
        `Month: ${month}`,
        `Current total: ${currentTotalAmount} ${currency}`,
        `Current usage: ${currentUsageAmount} ${currency}`,
        `Budget target: ${monthlyBudget ?? "not configured"}`,
        `Threshold amount: ${budgetThresholdAmount ?? "not configured"}`,
        `Hard cap: ${hardCap ?? "not configured"}`,
        `7d monthly projection: ${projectedTotalAmount7d} ${currency}`,
        `30d monthly projection: ${projectedTotalAmount30d} ${currency}`,
        `7d daily run rate: ${dailyRunRate7d} ${currency}`,
        `30d daily run rate: ${dailyRunRate30d} ${currency}`,
        `Hard cap reached at: ${hardCapReachedAt ?? "not reached"}`,
      ].join("\n");
    }
    case "saas_onboarding_complete": {
      const tenantName = readString(delivery.payload, "tenantName");
      const projectName = readString(delivery.payload, "projectName");
      const environment = readString(delivery.payload, "environment");
      const completedAt = readIsoDate(delivery.payload, "completedAt");
      const activityType = readString(delivery.payload, "activityType");
      const subjectId = readOptionalString(delivery.payload, "subjectId");
      return [
        `Your Reward SaaS tenant "${tenantName}" completed its first successful hello-reward call.`,
        "",
        `Project: ${projectName}`,
        `Environment: ${environment}`,
        `First successful call type: ${activityType}`,
        `Subject id: ${subjectId ?? "not provided"}`,
        `Completed at: ${completedAt.toISOString()}`,
        "",
        "The tenant is now marked as onboarded in the portal.",
      ].join("\n");
    }
    default:
      throw new NotificationDeliveryError(
        `Unsupported email notification kind: ${delivery.kind}`,
        { retryable: false },
      );
  }
};

const renderSmsBody = (delivery: NotificationDeliveryLike) => {
  if (delivery.kind !== "phone_verification") {
    throw new NotificationDeliveryError(
      `Unsupported SMS notification kind: ${delivery.kind}`,
      { retryable: false },
    );
  }

  const code = readString(delivery.payload, "code");
  const expiresAt = readIsoDate(delivery.payload, "expiresAt");
  return `Your Reward verification code is ${code}. It expires at ${expiresAt.toISOString()}.`;
};

export const redactNotificationPayload = (
  kind: NotificationKind,
  payload: DeliveryPayload,
) => {
  switch (kind) {
    case "password_reset":
      return {
        resetUrl: "[redacted]",
        expiresAt: readOptionalString(payload, "expiresAt"),
      };
    case "email_verification":
      return {
        verificationUrl: "[redacted]",
        expiresAt: readOptionalString(payload, "expiresAt"),
      };
    case "phone_verification":
      return {
        code: "[redacted]",
        expiresAt: readOptionalString(payload, "expiresAt"),
      };
    case "security_alert":
      return {
        eventType: readOptionalString(payload, "eventType"),
        occurredAt: readOptionalString(payload, "occurredAt"),
        currentIp: readOptionalString(payload, "currentIp"),
        previousIp: readOptionalString(payload, "previousIp"),
        currentUserAgent: readOptionalString(payload, "currentUserAgent"),
        previousUserAgent: readOptionalString(payload, "previousUserAgent"),
      };
    case "aml_review":
      return {
        userId: readOptionalString(payload, "userId"),
        userEmail: readOptionalString(payload, "userEmail"),
        userPhone: readOptionalString(payload, "userPhone"),
        checkpoint: readOptionalString(payload, "checkpoint"),
        riskLevel: readOptionalString(payload, "riskLevel"),
        providerKey: readOptionalString(payload, "providerKey"),
        summary: readOptionalString(payload, "summary"),
        occurredAt: readOptionalString(payload, "occurredAt"),
      };
    case "kyc_reverification":
      return {
        reverificationType: readOptionalString(payload, "reverificationType"),
        verificationUrl: "[redacted]",
        currentTier: readOptionalString(payload, "currentTier"),
        targetTier: readOptionalString(payload, "targetTier"),
        operatorReason: readOptionalString(payload, "operatorReason"),
        occurredAt: readOptionalString(payload, "occurredAt"),
        expiresAt: readOptionalString(payload, "expiresAt"),
      };
    case "saas_tenant_invite":
      return {
        inviteUrl: "[redacted]",
        tenantName: readOptionalString(payload, "tenantName"),
        role: readOptionalString(payload, "role"),
        invitedBy: readOptionalString(payload, "invitedBy"),
        expiresAt: readOptionalString(payload, "expiresAt"),
      };
    case "saas_billing_budget_alert":
      return {
        tenantName: readOptionalString(payload, "tenantName"),
        eventType: readOptionalString(payload, "eventType"),
        month: readOptionalString(payload, "month"),
        currency: readOptionalString(payload, "currency"),
        currentTotalAmount: readOptionalString(payload, "currentTotalAmount"),
        currentUsageAmount: readOptionalString(payload, "currentUsageAmount"),
        monthlyBudget: readOptionalString(payload, "monthlyBudget"),
        budgetThresholdAmount: readOptionalString(
          payload,
          "budgetThresholdAmount",
        ),
        hardCap: readOptionalString(payload, "hardCap"),
        projectedTotalAmount7d: readOptionalString(
          payload,
          "projectedTotalAmount7d",
        ),
        projectedTotalAmount30d: readOptionalString(
          payload,
          "projectedTotalAmount30d",
        ),
        dailyRunRate7d: readOptionalString(payload, "dailyRunRate7d"),
        dailyRunRate30d: readOptionalString(payload, "dailyRunRate30d"),
        hardCapReachedAt: readOptionalString(payload, "hardCapReachedAt"),
      };
    case "saas_onboarding_complete":
      return {
        tenantName: readOptionalString(payload, "tenantName"),
        projectName: readOptionalString(payload, "projectName"),
        environment: readOptionalString(payload, "environment"),
        activityType: readOptionalString(payload, "activityType"),
        subjectId: readOptionalString(payload, "subjectId"),
        completedAt: readOptionalString(payload, "completedAt"),
      };
    default:
      return {};
  }
};

const buildTwilioBody = (payload: Record<string, string>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    body.set(key, value);
  }
  return body.toString();
};

const sendViaSmtp = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  const transporter = getSmtpTransport();
  const info = await transporter.sendMail({
    from: config.authEmailFrom,
    to: delivery.recipient,
    subject: delivery.subject,
    text: delivery.body ?? renderEmailBody(delivery),
  });

  return {
    providerMessageId: info.messageId ?? null,
    responseCode: null,
  };
};

const sendViaTwilio = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  const body = buildTwilioBody({
    To: delivery.recipient,
    ...(config.authTwilioMessagingServiceSid
      ? { MessagingServiceSid: config.authTwilioMessagingServiceSid }
      : { From: config.authTwilioFromNumber }),
    Body: delivery.body ?? renderSmsBody(delivery),
  });

  const response = await withTimeout((signal) =>
    fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.authTwilioAccountSid}/Messages.json`,
      {
        method: "POST",
        signal,
        headers: {
          authorization: `Basic ${Buffer.from(
            `${config.authTwilioAccountSid}:${config.authTwilioAuthToken}`,
          ).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    ),
  );

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      parsed = { raw: responseText };
    }
  }

  if (!response.ok) {
    throw new NotificationDeliveryError(
      `Twilio request failed with status ${response.status}`,
      {
        retryable:
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429,
        responseCode: response.status,
        metadata: parsed,
      },
    );
  }

  return {
    providerMessageId: typeof parsed.sid === "string" ? parsed.sid : null,
    responseCode: response.status,
    metadata: parsed,
  };
};

const markPushDeviceDelivered = async (token: string) => {
  await db
    .update(notificationPushDevices)
    .set({
      lastDeliveredAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(notificationPushDevices.token, token));
};

const markPushDeviceErrored = async (token: string, error: string) => {
  await db
    .update(notificationPushDevices)
    .set({
      lastError: truncate(error, 500),
      updatedAt: new Date(),
    })
    .where(eq(notificationPushDevices.token, token));
};

const deactivatePushDevice = async (token: string, error: string) => {
  await db
    .update(notificationPushDevices)
    .set({
      active: false,
      lastError: truncate(error, 500),
      deactivatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(notificationPushDevices.token, token));
};

const sendViaExpoPush = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  const response = await withTimeout((signal) =>
    fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
      },
      body: JSON.stringify([
        {
          to: delivery.recipient,
          title: delivery.subject,
          body: delivery.body ?? delivery.subject,
          data: {
            kind: delivery.kind,
            notificationRecordId: delivery.notificationRecordId,
            ...(delivery.payload ?? {}),
          },
          sound: "default",
        },
      ]),
    }),
  );

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      parsed = { raw: responseText };
    }
  }

  if (!response.ok) {
    await markPushDeviceErrored(
      delivery.recipient,
      `Expo push request failed with status ${response.status}`,
    );
    throw new NotificationDeliveryError(
      `Expo push request failed with status ${response.status}`,
      {
        retryable:
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429,
        responseCode: response.status,
        metadata: parsed,
      },
    );
  }

  const entries = Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data
      ? [parsed.data]
      : [];
  const entry =
    entries[0] && typeof entries[0] === "object"
      ? (entries[0] as Record<string, unknown>)
      : null;

  if (!entry) {
    await markPushDeviceErrored(
      delivery.recipient,
      "Expo push response did not include a ticket.",
    );
    throw new NotificationDeliveryError(
      "Expo push response did not include a ticket.",
      {
        retryable: true,
        responseCode: response.status,
        metadata: parsed,
      },
    );
  }

  if (entry.status !== "ok") {
    const details =
      entry.details && typeof entry.details === "object"
        ? (entry.details as Record<string, unknown>)
        : null;
    const expoError =
      details && typeof details.error === "string" ? details.error : null;
    const message =
      typeof entry.message === "string"
        ? entry.message
        : expoError
          ? `Expo push error: ${expoError}`
          : "Expo push rejected notification.";

    if (expoError === "DeviceNotRegistered") {
      await deactivatePushDevice(delivery.recipient, message);
    } else {
      await markPushDeviceErrored(delivery.recipient, message);
    }

    throw new NotificationDeliveryError(message, {
      retryable: false,
      responseCode: response.status,
      metadata: parsed,
    });
  }

  await markPushDeviceDelivered(delivery.recipient);

  return {
    providerMessageId: typeof entry.id === "string" ? entry.id : null,
    responseCode: response.status,
    metadata: parsed,
  };
};

const sendViaWebhook = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  const response = await withTimeout((signal) =>
    fetch(config.authNotificationWebhookUrl, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: delivery.kind,
        channel: delivery.channel,
        recipient: delivery.recipient,
        subject: delivery.subject,
        body: delivery.body,
        metadata: delivery.payload,
      }),
    }),
  );

  if (!response.ok) {
    throw new NotificationDeliveryError(
      `Auth notification webhook failed with status ${response.status}`,
      {
        retryable:
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429,
        responseCode: response.status,
      },
    );
  }

  return {
    responseCode: response.status,
  };
};

const sendViaInApp = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  if (!delivery.userId || !delivery.notificationRecordId) {
    throw new NotificationDeliveryError(
      "In-app notifications require a user and notification record.",
      {
        retryable: false,
      },
    );
  }

  const [record] = await db
    .select({
      id: notificationRecords.id,
      userId: notificationRecords.userId,
      kind: notificationRecords.kind,
      title: notificationRecords.title,
      body: notificationRecords.body,
      data: notificationRecords.data,
      readAt: notificationRecords.readAt,
      createdAt: notificationRecords.createdAt,
      updatedAt: notificationRecords.updatedAt,
    })
    .from(notificationRecords)
    .where(eq(notificationRecords.id, delivery.notificationRecordId))
    .limit(1);

  if (!record) {
    throw new NotificationDeliveryError("Notification record not found.", {
      retryable: false,
    });
  }

  publishRealtimeToUser({
    userId: delivery.userId,
    event: "notification.created",
      data: {
        id: record.id,
        userId: record.userId,
        kind: record.kind,
        title: record.title,
        body: record.body,
        data: ((record.data as DeliveryPayload | null) ?? null) as RealtimeJsonValue,
        readAt: record.readAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      },
  });

  return {
    providerMessageId: `in-app:${delivery.notificationRecordId}`,
  };
};

const sendViaMock = async (
  delivery: NotificationDeliveryLike,
): Promise<ProviderSendResult> => {
  logger.info("auth notification mock-delivered", {
    deliveryId: delivery.id,
    kind: delivery.kind,
    channel: delivery.channel,
    recipient: maskRecipient(delivery.channel, delivery.recipient),
  });

  return {
    providerMessageId: `mock:${delivery.id}`,
  };
};

export const sendDelivery = async (delivery: NotificationDeliveryLike) => {
  switch (delivery.provider) {
    case "smtp":
      return sendViaSmtp(delivery);
    case "twilio":
      return sendViaTwilio(delivery);
    case "expo_push":
      return sendViaExpoPush(delivery);
    case "in_app":
      return sendViaInApp(delivery);
    case "webhook":
      return sendViaWebhook(delivery);
    case "mock":
      return sendViaMock(delivery);
    default:
      throw new NotificationDeliveryError(
        `Unsupported notification provider: ${String(delivery.provider)}`,
        { retryable: false },
      );
  }
};

export const getNotificationProviderStatus = (): NotificationProviderStatus => {
  const emailProvider = (() => {
    try {
      return resolveNotificationProvider("email");
    } catch {
      return "unavailable" as const;
    }
  })();

  const smsProvider = (() => {
    try {
      return resolveNotificationProvider("sms");
    } catch {
      return "unavailable" as const;
    }
  })();

  const pushProvider = (() => {
    try {
      return resolveNotificationProvider("push");
    } catch {
      return "unavailable" as const;
    }
  })();

  return {
    emailProvider,
    smsProvider,
    pushProvider,
  };
};

export type DeliveryStatus = NotificationDeliveryStatus;

type NotificationDb = DbClient | DbTransaction;
type DeliveryAttemptStatus = NotificationDeliveryAttemptStatus;

type ClaimedDelivery = {
  id: number;
  userId: number | null;
  notificationRecordId: number | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  recipient: string;
  recipientKey: string;
  provider: NotificationProvider;
  subject: string;
  body: string | null;
  payload: DeliveryPayload;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  lockedAt: Date | null;
  deliveredAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const coerceDateValue = (value: Date | string | null): Date | null => {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new NotificationDeliveryError("Notification delivery contains an invalid timestamp.", {
      retryable: false,
    });
  }

  return parsed;
};

let enqueueHook: (() => void) | null = null;

const finalizeSuccess = async (
  delivery: ClaimedDelivery,
  result: ProviderSendResult,
  latencyMs: number,
) => {
  await db.transaction(async (tx) => {
    await tx
      .update(notificationDeliveries)
      .set({
        status: "sent",
        deliveredAt: new Date(),
        lockedAt: null,
        providerMessageId: result.providerMessageId ?? null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, delivery.id));

    await tx.insert(notificationDeliveryAttempts).values({
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts,
      provider: delivery.provider,
      status: "sent",
      responseCode: result.responseCode ?? null,
      providerMessageId: result.providerMessageId ?? null,
      latencyMs,
      metadata: result.metadata ?? null,
    });
  });

  logger.info("auth notification delivered", {
    deliveryId: delivery.id,
    kind: delivery.kind,
    channel: delivery.channel,
    provider: delivery.provider,
    attempts: delivery.attempts,
    recipient: maskRecipient(delivery.channel, delivery.recipient),
  });
};

const finalizeFailure = async (
  delivery: ClaimedDelivery,
  error: unknown,
  latencyMs: number,
) => {
  const wrapped =
    error instanceof NotificationDeliveryError
      ? error
      : new NotificationDeliveryError(
          error instanceof Error
            ? error.message
            : "Unknown notification delivery error.",
          { retryable: true },
        );

  const exhausted =
    !wrapped.retryable || delivery.attempts >= delivery.maxAttempts;
  const nextAttemptAt = exhausted
    ? delivery.nextAttemptAt
    : new Date(Date.now() + computeRetryDelayMs(delivery.attempts));
  const status: DeliveryStatus = exhausted ? "failed" : "pending";
  const attemptStatus: DeliveryAttemptStatus = exhausted ? "failed" : "retry";
  const errorMessage = truncate(wrapped.message);

  await db.transaction(async (tx) => {
    await tx
      .update(notificationDeliveries)
      .set({
        status,
        nextAttemptAt,
        lockedAt: null,
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, delivery.id));

    await tx.insert(notificationDeliveryAttempts).values({
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts,
      provider: delivery.provider,
      status: attemptStatus,
      responseCode: wrapped.responseCode ?? null,
      latencyMs,
      error: errorMessage,
      metadata: wrapped.metadata ?? null,
    });
  });

  logger.warning("auth notification delivery failed", {
    deliveryId: delivery.id,
    kind: delivery.kind,
    channel: delivery.channel,
    provider: delivery.provider,
    attempts: delivery.attempts,
    exhausted,
    retryable: wrapped.retryable,
    responseCode: wrapped.responseCode ?? null,
    recipient: maskRecipient(delivery.channel, delivery.recipient),
    err: wrapped,
  });
};

const claimPendingDeliveries = async (limit: number) => {
  const rows = await client<ClaimedDelivery[]>`
    with due as (
      select id
      from notification_deliveries
      where status = 'pending'
        and next_attempt_at <= now()
      order by next_attempt_at asc, id asc
      limit ${limit}
      for update skip locked
    )
    update notification_deliveries as d
    set status = 'processing',
        attempts = d.attempts + 1,
        last_attempt_at = now(),
        locked_at = now(),
        updated_at = now()
    from due
    where d.id = due.id
    returning
      d.id,
      d.user_id as "userId",
      d.notification_record_id as "notificationRecordId",
      d.kind,
      d.channel,
      d.recipient,
      d.recipient_key as "recipientKey",
      d.provider,
      d.subject,
      d.body,
      d.payload,
      d.status,
      d.attempts,
      d.max_attempts as "maxAttempts",
      d.next_attempt_at as "nextAttemptAt",
      d.last_attempt_at as "lastAttemptAt",
      d.locked_at as "lockedAt",
      d.delivered_at as "deliveredAt",
      d.provider_message_id as "providerMessageId",
      d.last_error as "lastError",
      d.created_at as "createdAt",
      d.updated_at as "updatedAt"
  `;

  return rows.map((row) => ({
    ...row,
    nextAttemptAt: coerceDateValue(row.nextAttemptAt)!,
    lastAttemptAt: coerceDateValue(row.lastAttemptAt),
    lockedAt: coerceDateValue(row.lockedAt),
    deliveredAt: coerceDateValue(row.deliveredAt),
    createdAt: coerceDateValue(row.createdAt)!,
    updatedAt: coerceDateValue(row.updatedAt)!,
  }));
};

export async function recoverStuckAuthNotifications() {
  const cutoff = new Date(Date.now() - config.authNotificationLockTimeoutMs);
  const recovered = await db
    .update(notificationDeliveries)
    .set({
      status: "pending",
      lockedAt: null,
      lastError: "Recovered from stale processing lock.",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.status, "processing"),
        lte(notificationDeliveries.lockedAt, cutoff),
      ),
    )
    .returning({ id: notificationDeliveries.id });

  if (recovered.length > 0) {
    logger.warning("recovered stale auth notification locks", {
      count: recovered.length,
    });
  }

  return recovered.length;
}

export async function processPendingAuthNotifications(
  limit = config.authNotificationBatchSize,
) {
  const claimed = await claimPendingDeliveries(limit);
  for (const delivery of claimed) {
    const startedAt = Date.now();
    try {
      const result = await sendDelivery(delivery);
      await finalizeSuccess(delivery, result, Date.now() - startedAt);
    } catch (error) {
      await finalizeFailure(delivery, error, Date.now() - startedAt);
    }
  }

  return claimed.length;
}

export async function retryFailedNotificationDelivery(deliveryId: number) {
  const [delivery] = await db
    .update(notificationDeliveries)
    .set({
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastAttemptAt: null,
      lockedAt: null,
      deliveredAt: null,
      providerMessageId: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        eq(notificationDeliveries.status, "failed"),
      ),
    )
    .returning({
      id: notificationDeliveries.id,
    });

  if (delivery) {
    logger.info("auth notification requeued", {
      deliveryId: delivery.id,
    });
    enqueueHook?.();
    return {
      ok: true as const,
      deliveryId: delivery.id,
    };
  }

  const [existing] = await db
    .select({
      status: notificationDeliveries.status,
    })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, deliveryId))
    .limit(1);

  if (!existing) {
    return {
      ok: false as const,
      reason: "not_found" as const,
    };
  }

  return {
    ok: false as const,
    reason: "invalid_status" as const,
    status: existing.status as DeliveryStatus,
  };
}

export const registerAuthNotificationEnqueueHook = (
  hook: (() => void) | null,
) => {
  enqueueHook = hook;
};

export const queueNotificationDelivery = async (
  payload: {
    kind: NotificationKind;
    channel: NotificationChannel;
    recipient: string;
    subject: string;
    body?: string | null;
    metadata: DeliveryPayload;
    userId?: number | null;
    notificationRecordId?: number | null;
  },
  database: NotificationDb = db,
) => {
  const provider = resolveNotificationProvider(payload.channel);
  const recipientKey = normalizeRecipient(payload.channel, payload.recipient);

  if (payload.channel !== "in_app") {
    await enforceRecipientThrottle({
      kind: payload.kind,
      recipientKey,
    });
  }

  const [delivery] = await database
    .insert(notificationDeliveries)
    .values({
      userId: payload.userId ?? null,
      notificationRecordId: payload.notificationRecordId ?? null,
      kind: payload.kind,
      channel: payload.channel,
      recipient: payload.recipient,
      recipientKey,
      provider,
      subject: payload.subject,
      body: payload.body ?? null,
      payload: payload.metadata,
      status: "pending",
      attempts: 0,
      maxAttempts: config.authNotificationMaxAttempts,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info("auth notification queued", {
    deliveryId: delivery.id,
    kind: payload.kind,
    channel: payload.channel,
    provider,
    recipient: maskRecipient(payload.channel, payload.recipient),
  });

  enqueueHook?.();

  return delivery;
};

export async function sendPasswordResetNotification(
  payload: {
    email: string;
    resetUrl: string;
    expiresAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "password_reset",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: "Password reset requested",
      metadata: {
        resetUrl: payload.resetUrl,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendEmailVerificationNotification(
  payload: {
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "email_verification",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: "Verify your email",
      metadata: {
        verificationUrl: payload.verificationUrl,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendPhoneVerificationNotification(
  payload: {
    phone: string;
    code: string;
    expiresAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "phone_verification",
      channel: "sms",
      recipient: normalizePhone(payload.phone),
      subject: "Verify your phone",
      metadata: {
        code: payload.code,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendSaasTenantInviteNotification(
  payload: {
    email: string;
    inviteUrl: string;
    tenantName: string;
    role: string;
    invitedBy?: string | null;
    expiresAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "saas_tenant_invite",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: `Invitation to ${payload.tenantName}`,
      metadata: {
        inviteUrl: payload.inviteUrl,
        tenantName: payload.tenantName,
        role: payload.role,
        invitedBy: payload.invitedBy ?? null,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendSaasBillingBudgetAlertNotification(
  payload: {
    email: string;
    tenantName: string;
    eventType:
      | "billing.threshold_exceeded"
      | "billing.forecast_7d_exceeded"
      | "billing.forecast_30d_exceeded"
      | "billing.hard_cap_reached";
    currency: string;
    month: string;
    currentTotalAmount: string;
    currentUsageAmount: string;
    monthlyBudget?: string | null;
    budgetThresholdAmount?: string | null;
    hardCap?: string | null;
    projectedTotalAmount7d: string;
    projectedTotalAmount30d: string;
    dailyRunRate7d: string;
    dailyRunRate30d: string;
    hardCapReachedAt?: string | null;
  },
  database?: NotificationDb,
) {
  const subject =
    payload.eventType === "billing.hard_cap_reached"
      ? `Billing hard cap reached for ${payload.tenantName}`
      : payload.eventType === "billing.threshold_exceeded"
        ? `Billing threshold reached for ${payload.tenantName}`
        : `Billing forecast alert for ${payload.tenantName}`;

  return queueNotificationDelivery(
    {
      kind: "saas_billing_budget_alert",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject,
      metadata: {
        tenantName: payload.tenantName,
        eventType: payload.eventType,
        currency: payload.currency,
        month: payload.month,
        currentTotalAmount: payload.currentTotalAmount,
        currentUsageAmount: payload.currentUsageAmount,
        monthlyBudget: payload.monthlyBudget ?? null,
        budgetThresholdAmount: payload.budgetThresholdAmount ?? null,
        hardCap: payload.hardCap ?? null,
        projectedTotalAmount7d: payload.projectedTotalAmount7d,
        projectedTotalAmount30d: payload.projectedTotalAmount30d,
        dailyRunRate7d: payload.dailyRunRate7d,
        dailyRunRate30d: payload.dailyRunRate30d,
        hardCapReachedAt: payload.hardCapReachedAt ?? null,
      },
    },
    database,
  );
}

export async function sendSaasOnboardingCompleteNotification(
  payload: {
    email: string;
    tenantName: string;
    projectName: string;
    environment: string;
    activityType: "reward" | "draw";
    subjectId?: string | null;
    completedAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "saas_onboarding_complete",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: `${payload.tenantName} is now onboarded`,
      metadata: {
        tenantName: payload.tenantName,
        projectName: payload.projectName,
        environment: payload.environment,
        activityType: payload.activityType,
        subjectId: payload.subjectId ?? null,
        completedAt: payload.completedAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendAnomalousLoginAlert(
  payload: {
    email: string;
    eventType: "user_login_anomaly" | "admin_login_anomaly";
    currentIp?: string | null;
    previousIp?: string | null;
    currentUserAgent?: string | null;
    previousUserAgent?: string | null;
    occurredAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "security_alert",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: "New login activity detected",
      metadata: {
        eventType: payload.eventType,
        occurredAt: payload.occurredAt.toISOString(),
        currentIp: payload.currentIp ?? null,
        previousIp: payload.previousIp ?? null,
        currentUserAgent: payload.currentUserAgent ?? null,
        previousUserAgent: payload.previousUserAgent ?? null,
      },
    },
    database,
  );
}

export async function sendAmlReviewNotification(
  payload: {
    email: string;
    userId: number;
    userEmail: string;
    userPhone?: string | null;
    checkpoint: string;
    riskLevel: string;
    providerKey: string;
    summary?: string | null;
    occurredAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "aml_review",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: `AML review required for user #${payload.userId}`,
      metadata: {
        userId: String(payload.userId),
        userEmail: payload.userEmail,
        userPhone: payload.userPhone ?? null,
        checkpoint: payload.checkpoint,
        riskLevel: payload.riskLevel,
        providerKey: payload.providerKey,
        summary: payload.summary ?? null,
        occurredAt: payload.occurredAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendKycExpiryReminderNotification(
  payload: {
    email: string;
    verificationUrl: string;
    currentTier: string;
    expiresAt: Date;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "kyc_reverification",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: "KYC document expires soon",
      metadata: {
        reverificationType: "document_expiring_soon",
        verificationUrl: payload.verificationUrl,
        currentTier: payload.currentTier,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database,
  );
}

export async function sendKycReverificationRequiredNotification(
  payload: {
    email: string;
    verificationUrl: string;
    targetTier: string;
    reverificationType: "document_expired" | "policy_update" | "admin_trigger";
    occurredAt: Date;
    operatorReason?: string | null;
    expiresAt?: Date | null;
  },
  database?: NotificationDb,
) {
  return queueNotificationDelivery(
    {
      kind: "kyc_reverification",
      channel: "email",
      recipient: normalizeEmail(payload.email),
      subject: "KYC re-verification required",
      metadata: {
        reverificationType: payload.reverificationType,
        verificationUrl: payload.verificationUrl,
        targetTier: payload.targetTier,
        operatorReason: payload.operatorReason ?? null,
        occurredAt: payload.occurredAt.toISOString(),
        expiresAt: payload.expiresAt?.toISOString() ?? null,
      },
    },
    database,
  );
}

export async function listNotificationDeliveries(
  options?: NotificationDeliveryQuery,
) {
  const conditions = [];
  if (options?.status) {
    conditions.push(eq(notificationDeliveries.status, options.status));
  }
  if (options?.kind) {
    conditions.push(eq(notificationDeliveries.kind, options.kind));
  }
  if (options?.recipient) {
    conditions.push(
      ilike(notificationDeliveries.recipient, `%${options.recipient.trim()}%`),
    );
  }

  const whereClause =
    conditions.length === 1
      ? conditions[0]
      : conditions.length > 1
        ? and(...conditions)
        : undefined;

  const query = db.select().from(notificationDeliveries);
  if (whereClause) {
    query.where(whereClause);
  }

  const rows = await query
    .orderBy(
      desc(notificationDeliveries.createdAt),
      desc(notificationDeliveries.id),
    )
    .limit(options?.limit ?? 50);

  return rows.map((row) => ({
    ...row,
    payload: redactNotificationPayload(
      row.kind,
      row.payload as DeliveryPayload,
    ),
  }));
}

export async function getNotificationDeliverySummary(): Promise<NotificationDeliverySummary> {
  const statusRows = await db
    .select({
      status: notificationDeliveries.status,
      total: sql<number>`count(*)`,
    })
    .from(notificationDeliveries)
    .groupBy(notificationDeliveries.status);

  const counts = Object.fromEntries(
    notificationDeliveryStatusValues.map((status) => [status, 0]),
  ) as Record<NotificationDeliveryStatus, number>;

  for (const row of statusRows) {
    counts[row.status] = Number(row.total ?? 0);
  }

  const [oldestPending] = await db
    .select({
      createdAt: notificationDeliveries.createdAt,
    })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.status, "pending"))
    .orderBy(notificationDeliveries.createdAt)
    .limit(1);

  return {
    counts,
    oldestPendingAt: oldestPending?.createdAt ?? null,
    providers: getNotificationProviderStatus(),
  };
}
