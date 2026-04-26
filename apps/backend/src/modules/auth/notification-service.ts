import { and, desc, eq, ilike, lte, sql } from '@reward/database/orm';
import nodemailer from 'nodemailer';
import type {
  AuthNotificationChannel,
  AuthNotificationKind,
  NotificationDeliveryAttemptStatus,
  NotificationDeliveryQuery,
  NotificationDeliveryStatus,
  NotificationDeliverySummary,
  NotificationProvider,
  NotificationProviderStatus,
} from '@reward/shared-types';
import { notificationDeliveryStatusValues } from '@reward/shared-types';

import { client, db, type DbClient, type DbTransaction } from '../../db';
import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { createRateLimiter } from '../../shared/rate-limit';
import {
  notificationDeliveries,
  notificationDeliveryAttempts,
} from '@reward/database';

export type DeliveryStatus = NotificationDeliveryStatus;

type NotificationDb = DbClient | DbTransaction;
type DeliveryPayload = Record<string, unknown>;
type DeliveryAttemptStatus = NotificationDeliveryAttemptStatus;

type ClaimedDelivery = {
  id: number;
  kind: AuthNotificationKind;
  channel: AuthNotificationChannel;
  recipient: string;
  recipientKey: string;
  provider: NotificationProvider;
  subject: string;
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

type ProviderSendResult = {
  providerMessageId?: string | null;
  responseCode?: number | null;
  metadata?: Record<string, unknown> | null;
};

const config = getConfig();
const emailLimiter = createRateLimiter({
  limit: config.authNotificationEmailThrottleMax,
  windowMs: config.authNotificationEmailThrottleWindowMs,
  prefix: 'auth-notify-email',
});
const smsLimiter = createRateLimiter({
  limit: config.authNotificationSmsThrottleMax,
  windowMs: config.authNotificationSmsThrottleWindowMs,
  prefix: 'auth-notify-sms',
});
const alertLimiter = createRateLimiter({
  limit: config.authNotificationAlertThrottleMax,
  windowMs: config.authNotificationAlertThrottleWindowMs,
  prefix: 'auth-notify-alert',
});

let smtpTransport: nodemailer.Transporter | null = null;
let enqueueHook: (() => void) | null = null;

const hasSmtpProvider = () =>
  Boolean(config.authSmtpHost && config.authEmailFrom);

const hasTwilioProvider = () =>
  Boolean(
    config.authTwilioAccountSid &&
      config.authTwilioAuthToken &&
      (config.authTwilioFromNumber || config.authTwilioMessagingServiceSid)
  );

const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? '***' : ''}@${domain}`;
};

const maskPhone = (phone: string) =>
  phone.length <= 4
    ? '****'
    : `${'*'.repeat(Math.max(phone.length - 4, 1))}${phone.slice(-4)}`;

const maskRecipient = (
  channel: AuthNotificationChannel,
  recipient: string
) => (channel === 'email' ? maskEmail(recipient) : maskPhone(recipient));

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizePhone = (phone: string) => phone.trim().replace(/[^\d+]/g, '');

const normalizeRecipient = (
  channel: AuthNotificationChannel,
  recipient: string
) => (channel === 'email' ? normalizeEmail(recipient) : normalizePhone(recipient));

const truncate = (value: string, max = 500) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const computeRetryDelayMs = (attempts: number) => {
  const exponent = Math.max(attempts - 1, 0);
  const delay = config.authNotificationRetryBaseMs * 2 ** exponent;
  return Math.min(delay, config.authNotificationRetryMaxMs);
};

const readString = (
  payload: DeliveryPayload,
  key: string,
  required = true
): string | null => {
  const value = payload[key];
  if (typeof value === 'string' && value.trim()) {
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
      }
    );
  }
  return parsed;
};

export class NotificationThrottleError extends Error {
  constructor(
    message: string,
    readonly resetAt: number,
    readonly limit: number
  ) {
    super(message);
    this.name = 'NotificationThrottleError';
  }
}

export class NotificationProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly channel: AuthNotificationChannel
  ) {
    super(message);
    this.name = 'NotificationProviderUnavailableError';
  }
}

class NotificationDeliveryError extends Error {
  readonly retryable: boolean;
  readonly responseCode: number | null;
  readonly metadata: Record<string, unknown> | null;

  constructor(
    message: string,
    options?: {
      retryable?: boolean;
      responseCode?: number | null;
      metadata?: Record<string, unknown> | null;
    }
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
    this.retryable = options?.retryable ?? true;
    this.responseCode = options?.responseCode ?? null;
    this.metadata = options?.metadata ?? null;
  }
}

const resolveNotificationProvider = (
  channel: AuthNotificationChannel
): NotificationProvider => {
  if (channel === 'email' && hasSmtpProvider()) {
    return 'smtp';
  }
  if (channel === 'sms' && hasTwilioProvider()) {
    return 'twilio';
  }
  if (config.nodeEnv !== 'production' && config.authNotificationWebhookUrl) {
    return 'webhook';
  }
  if (config.nodeEnv !== 'production') {
    return 'mock';
  }

  throw new NotificationProviderUnavailableError(
    channel === 'email'
      ? 'Auth email provider is not configured.'
      : 'Auth SMS provider is not configured.',
    channel
  );
};

export const assertNotificationChannelAvailable = (
  channel: AuthNotificationChannel
) => {
  resolveNotificationProvider(channel);
};

const resolveLimiter = (kind: AuthNotificationKind) => {
  if (kind === 'phone_verification') {
    return {
      enabled: config.authNotificationSmsThrottleMax > 0,
      limiter: smsLimiter,
    };
  }
  if (kind === 'security_alert') {
    return {
      enabled: config.authNotificationAlertThrottleMax > 0,
      limiter: alertLimiter,
    };
  }
  return {
    enabled: config.authNotificationEmailThrottleMax > 0,
    limiter: emailLimiter,
  };
};

const enforceRecipientThrottle = async (payload: {
  kind: AuthNotificationKind;
  recipientKey: string;
}) => {
  const selected = resolveLimiter(payload.kind);
  if (!selected.enabled) {
    return;
  }

  const result = await selected.limiter.consume(
    `${payload.kind}:${payload.recipientKey}`
  );
  if (!result.allowed) {
    throw new NotificationThrottleError(
      'Too many notification requests. Please wait before trying again.',
      result.resetAt,
      result.limit
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
    config.authNotificationRequestTimeoutMs
  );

  try {
    return await runner(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NotificationDeliveryError('Notification provider request timed out.', {
        retryable: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const renderEmailBody = (delivery: ClaimedDelivery) => {
  switch (delivery.kind) {
    case 'password_reset': {
      const resetUrl = readString(delivery.payload, 'resetUrl');
      const expiresAt = readIsoDate(delivery.payload, 'expiresAt');
      return [
        'We received a request to reset your password.',
        '',
        `Reset your password: ${resetUrl}`,
        '',
        `This link expires at ${expiresAt.toISOString()}.`,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n');
    }
    case 'email_verification': {
      const verificationUrl = readString(delivery.payload, 'verificationUrl');
      const expiresAt = readIsoDate(delivery.payload, 'expiresAt');
      return [
        'Verify your email address to finish setting up your account.',
        '',
        `Verify now: ${verificationUrl}`,
        '',
        `This link expires at ${expiresAt.toISOString()}.`,
      ].join('\n');
    }
    case 'security_alert': {
      const occurredAt = readIsoDate(delivery.payload, 'occurredAt');
      const currentIp = readOptionalString(delivery.payload, 'currentIp');
      const previousIp = readOptionalString(delivery.payload, 'previousIp');
      const currentUserAgent = readOptionalString(
        delivery.payload,
        'currentUserAgent'
      );
      const previousUserAgent = readOptionalString(
        delivery.payload,
        'previousUserAgent'
      );
      return [
        'We detected a new login pattern on your account.',
        '',
        `Occurred at: ${occurredAt.toISOString()}`,
        `Current IP: ${currentIp ?? 'unknown'}`,
        `Previous IP: ${previousIp ?? 'unknown'}`,
        `Current device: ${currentUserAgent ?? 'unknown'}`,
        `Previous device: ${previousUserAgent ?? 'unknown'}`,
        '',
        'If this was not you, reset your password and review active sessions immediately.',
      ].join('\n');
    }
    default:
      throw new NotificationDeliveryError(
        `Unsupported email notification kind: ${delivery.kind}`,
        { retryable: false }
      );
  }
};

const renderSmsBody = (delivery: ClaimedDelivery) => {
  if (delivery.kind !== 'phone_verification') {
    throw new NotificationDeliveryError(
      `Unsupported SMS notification kind: ${delivery.kind}`,
      { retryable: false }
    );
  }

  const code = readString(delivery.payload, 'code');
  const expiresAt = readIsoDate(delivery.payload, 'expiresAt');
  return `Your Reward verification code is ${code}. It expires at ${expiresAt.toISOString()}.`;
};

const redactNotificationPayload = (
  kind: AuthNotificationKind,
  payload: DeliveryPayload
) => {
  switch (kind) {
    case 'password_reset':
      return {
        resetUrl: '[redacted]',
        expiresAt: readOptionalString(payload, 'expiresAt'),
      };
    case 'email_verification':
      return {
        verificationUrl: '[redacted]',
        expiresAt: readOptionalString(payload, 'expiresAt'),
      };
    case 'phone_verification':
      return {
        code: '[redacted]',
        expiresAt: readOptionalString(payload, 'expiresAt'),
      };
    case 'security_alert':
      return {
        eventType: readOptionalString(payload, 'eventType'),
        occurredAt: readOptionalString(payload, 'occurredAt'),
        currentIp: readOptionalString(payload, 'currentIp'),
        previousIp: readOptionalString(payload, 'previousIp'),
        currentUserAgent: readOptionalString(payload, 'currentUserAgent'),
        previousUserAgent: readOptionalString(payload, 'previousUserAgent'),
      };
    default:
      return {};
  }
};

const sendViaSmtp = async (
  delivery: ClaimedDelivery
): Promise<ProviderSendResult> => {
  const transporter = getSmtpTransport();
  const info = await transporter.sendMail({
    from: config.authEmailFrom,
    to: delivery.recipient,
    subject: delivery.subject,
    text: renderEmailBody(delivery),
  });

  return {
    providerMessageId: info.messageId ?? null,
    responseCode: null,
  };
};

const buildTwilioBody = (payload: Record<string, string>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    body.set(key, value);
  }
  return body.toString();
};

const sendViaTwilio = async (
  delivery: ClaimedDelivery
): Promise<ProviderSendResult> => {
  const body = buildTwilioBody({
    To: delivery.recipient,
    ...(config.authTwilioMessagingServiceSid
      ? { MessagingServiceSid: config.authTwilioMessagingServiceSid }
      : { From: config.authTwilioFromNumber }),
    Body: renderSmsBody(delivery),
  });

  const response = await withTimeout((signal) =>
    fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.authTwilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        signal,
        headers: {
          authorization: `Basic ${Buffer.from(
            `${config.authTwilioAccountSid}:${config.authTwilioAuthToken}`
          ).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    )
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
        retryable: response.status >= 500 || response.status === 408 || response.status === 429,
        responseCode: response.status,
        metadata: parsed,
      }
    );
  }

  return {
    providerMessageId:
      typeof parsed.sid === 'string' ? parsed.sid : null,
    responseCode: response.status,
    metadata: parsed,
  };
};

const sendViaWebhook = async (
  delivery: ClaimedDelivery
): Promise<ProviderSendResult> => {
  const response = await withTimeout((signal) =>
    fetch(config.authNotificationWebhookUrl, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: delivery.kind,
        channel: delivery.channel,
        recipient: delivery.recipient,
        subject: delivery.subject,
        metadata: delivery.payload,
      }),
    })
  );

  if (!response.ok) {
    throw new NotificationDeliveryError(
      `Auth notification webhook failed with status ${response.status}`,
      {
        retryable: response.status >= 500 || response.status === 408 || response.status === 429,
        responseCode: response.status,
      }
    );
  }

  return {
    responseCode: response.status,
  };
};

const sendViaMock = async (
  delivery: ClaimedDelivery
): Promise<ProviderSendResult> => {
  logger.info('auth notification mock-delivered', {
    deliveryId: delivery.id,
    kind: delivery.kind,
    channel: delivery.channel,
    recipient: maskRecipient(delivery.channel, delivery.recipient),
  });

  return {
    providerMessageId: `mock:${delivery.id}`,
  };
};

const sendDelivery = async (delivery: ClaimedDelivery) => {
  switch (delivery.provider) {
    case 'smtp':
      return sendViaSmtp(delivery);
    case 'twilio':
      return sendViaTwilio(delivery);
    case 'webhook':
      return sendViaWebhook(delivery);
    case 'mock':
      return sendViaMock(delivery);
    default:
      throw new NotificationDeliveryError(
        `Unsupported notification provider: ${String(delivery.provider)}`,
        { retryable: false }
      );
  }
};

const finalizeSuccess = async (
  delivery: ClaimedDelivery,
  result: ProviderSendResult,
  latencyMs: number
) => {
  await db.transaction(async (tx) => {
    await tx.update(notificationDeliveries).set({
      status: 'sent',
      deliveredAt: new Date(),
      lockedAt: null,
      providerMessageId: result.providerMessageId ?? null,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(notificationDeliveries.id, delivery.id));

    await tx.insert(notificationDeliveryAttempts).values({
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts,
      provider: delivery.provider,
      status: 'sent',
      responseCode: result.responseCode ?? null,
      providerMessageId: result.providerMessageId ?? null,
      latencyMs,
      metadata: result.metadata ?? null,
    });
  });

  logger.info('auth notification delivered', {
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
  latencyMs: number
) => {
  const wrapped =
    error instanceof NotificationDeliveryError
      ? error
      : new NotificationDeliveryError(
          error instanceof Error
            ? error.message
            : 'Unknown notification delivery error.',
          { retryable: true }
        );

  const exhausted =
    !wrapped.retryable || delivery.attempts >= delivery.maxAttempts;
  const nextAttemptAt = exhausted
    ? delivery.nextAttemptAt
    : new Date(Date.now() + computeRetryDelayMs(delivery.attempts));
  const status: DeliveryStatus = exhausted ? 'failed' : 'pending';
  const attemptStatus: DeliveryAttemptStatus = exhausted ? 'failed' : 'retry';
  const errorMessage = truncate(wrapped.message);

  await db.transaction(async (tx) => {
    await tx.update(notificationDeliveries).set({
      status,
      nextAttemptAt,
      lockedAt: null,
      lastError: errorMessage,
      updatedAt: new Date(),
    }).where(eq(notificationDeliveries.id, delivery.id));

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

  logger.warning('auth notification delivery failed', {
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
      d.kind,
      d.channel,
      d.recipient,
      d.recipient_key as "recipientKey",
      d.provider,
      d.subject,
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

  return rows;
};

export async function recoverStuckAuthNotifications() {
  const cutoff = new Date(Date.now() - config.authNotificationLockTimeoutMs);
  const recovered = await db
    .update(notificationDeliveries)
    .set({
      status: 'pending',
      lockedAt: null,
      lastError: 'Recovered from stale processing lock.',
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.status, 'processing'),
        lte(notificationDeliveries.lockedAt, cutoff)
      )
    )
    .returning({ id: notificationDeliveries.id });

  if (recovered.length > 0) {
    logger.warning('recovered stale auth notification locks', {
      count: recovered.length,
    });
  }

  return recovered.length;
}

export async function processPendingAuthNotifications(
  limit = config.authNotificationBatchSize
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
      status: 'pending',
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
        eq(notificationDeliveries.status, 'failed')
      )
    )
    .returning({
      id: notificationDeliveries.id,
    });

  if (delivery) {
    logger.info('auth notification requeued', {
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
      reason: 'not_found' as const,
    };
  }

  return {
    ok: false as const,
    reason: 'invalid_status' as const,
    status: existing.status as DeliveryStatus,
  };
}

export const registerAuthNotificationEnqueueHook = (hook: (() => void) | null) => {
  enqueueHook = hook;
};

const queueAuthNotification = async (
  payload: {
    kind: AuthNotificationKind;
    channel: AuthNotificationChannel;
    recipient: string;
    subject: string;
    metadata: DeliveryPayload;
  },
  database: NotificationDb = db
) => {
  const provider = resolveNotificationProvider(payload.channel);
  const recipientKey = normalizeRecipient(payload.channel, payload.recipient);

  await enforceRecipientThrottle({
    kind: payload.kind,
    recipientKey,
  });

  const [delivery] = await database
    .insert(notificationDeliveries)
    .values({
      kind: payload.kind,
      channel: payload.channel,
      recipient: payload.recipient,
      recipientKey,
      provider,
      subject: payload.subject,
      payload: payload.metadata,
      status: 'pending',
      attempts: 0,
      maxAttempts: config.authNotificationMaxAttempts,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info('auth notification queued', {
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
  database?: NotificationDb
) {
  return queueAuthNotification(
    {
      kind: 'password_reset',
      channel: 'email',
      recipient: normalizeEmail(payload.email),
      subject: 'Password reset requested',
      metadata: {
        resetUrl: payload.resetUrl,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database
  );
}

export async function sendEmailVerificationNotification(
  payload: {
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  },
  database?: NotificationDb
) {
  return queueAuthNotification(
    {
      kind: 'email_verification',
      channel: 'email',
      recipient: normalizeEmail(payload.email),
      subject: 'Verify your email',
      metadata: {
        verificationUrl: payload.verificationUrl,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database
  );
}

export async function sendPhoneVerificationNotification(
  payload: {
    phone: string;
    code: string;
    expiresAt: Date;
  },
  database?: NotificationDb
) {
  return queueAuthNotification(
    {
      kind: 'phone_verification',
      channel: 'sms',
      recipient: normalizePhone(payload.phone),
      subject: 'Verify your phone',
      metadata: {
        code: payload.code,
        expiresAt: payload.expiresAt.toISOString(),
      },
    },
    database
  );
}

export async function sendAnomalousLoginAlert(
  payload: {
    email: string;
    eventType: 'user_login_anomaly' | 'admin_login_anomaly';
    currentIp?: string | null;
    previousIp?: string | null;
    currentUserAgent?: string | null;
    previousUserAgent?: string | null;
    occurredAt: Date;
  },
  database?: NotificationDb
) {
  return queueAuthNotification(
    {
      kind: 'security_alert',
      channel: 'email',
      recipient: normalizeEmail(payload.email),
      subject: 'New login activity detected',
      metadata: {
        eventType: payload.eventType,
        occurredAt: payload.occurredAt.toISOString(),
        currentIp: payload.currentIp ?? null,
        previousIp: payload.previousIp ?? null,
        currentUserAgent: payload.currentUserAgent ?? null,
        previousUserAgent: payload.previousUserAgent ?? null,
      },
    },
    database
  );
}

export const getNotificationProviderStatus = (): NotificationProviderStatus => {
  const emailProvider = (() => {
    try {
      return resolveNotificationProvider('email');
    } catch {
      return 'unavailable' as const;
    }
  })();

  const smsProvider = (() => {
    try {
      return resolveNotificationProvider('sms');
    } catch {
      return 'unavailable' as const;
    }
  })();

  return {
    emailProvider,
    smsProvider,
  };
};

export async function listNotificationDeliveries(options?: NotificationDeliveryQuery) {
  const conditions = [];
  if (options?.status) {
    conditions.push(eq(notificationDeliveries.status, options.status));
  }
  if (options?.kind) {
    conditions.push(eq(notificationDeliveries.kind, options.kind));
  }
  if (options?.recipient) {
    conditions.push(
      ilike(notificationDeliveries.recipient, `%${options.recipient.trim()}%`)
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
    .orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
    .limit(options?.limit ?? 50);

  return rows.map((row) => ({
    ...row,
    payload: redactNotificationPayload(row.kind, row.payload as DeliveryPayload),
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
    notificationDeliveryStatusValues.map((status) => [status, 0])
  ) as Record<NotificationDeliveryStatus, number>;

  for (const row of statusRows) {
    counts[row.status] = Number(row.total ?? 0);
  }

  const [oldestPending] = await db
    .select({
      createdAt: notificationDeliveries.createdAt,
    })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.status, 'pending'))
    .orderBy(notificationDeliveries.createdAt)
    .limit(1);

  return {
    counts,
    oldestPendingAt: oldestPending?.createdAt ?? null,
    providers: getNotificationProviderStatus(),
  };
}
