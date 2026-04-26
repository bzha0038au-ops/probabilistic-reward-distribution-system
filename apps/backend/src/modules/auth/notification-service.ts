import { getConfig } from '../../shared/config';
import { logger } from '../../shared/logger';

type AuthNotificationKind =
  | 'password_reset'
  | 'email_verification'
  | 'phone_verification'
  | 'security_alert';

type AuthNotificationChannel = 'email' | 'sms';

const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? '***' : ''}@${domain}`;
};

const maskPhone = (phone: string) =>
  phone.length <= 4 ? '****' : `${'*'.repeat(Math.max(phone.length - 4, 1))}${phone.slice(-4)}`;

const maskRecipient = (channel: AuthNotificationChannel, recipient: string) =>
  channel === 'email' ? maskEmail(recipient) : maskPhone(recipient);

async function dispatchAuthNotification(payload: {
  kind: AuthNotificationKind;
  channel: AuthNotificationChannel;
  recipient: string;
  subject: string;
  metadata?: Record<string, unknown>;
}) {
  const { authNotificationWebhookUrl } = getConfig();

  if (!authNotificationWebhookUrl) {
    logger.warning('auth notification webhook not configured', {
      kind: payload.kind,
      channel: payload.channel,
      recipient: maskRecipient(payload.channel, payload.recipient),
    });
    return false;
  }

  const response = await fetch(authNotificationWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      kind: payload.kind,
      channel: payload.channel,
      recipient: payload.recipient,
      subject: payload.subject,
      metadata: payload.metadata ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth notification webhook failed with status ${response.status}`);
  }

  return true;
}

export async function sendPasswordResetNotification(payload: {
  email: string;
  resetUrl: string;
  expiresAt: Date;
}) {
  return dispatchAuthNotification({
    kind: 'password_reset',
    channel: 'email',
    recipient: payload.email,
    subject: 'Password reset requested',
    metadata: {
      resetUrl: payload.resetUrl,
      expiresAt: payload.expiresAt.toISOString(),
    },
  });
}

export async function sendEmailVerificationNotification(payload: {
  email: string;
  verificationUrl: string;
  expiresAt: Date;
}) {
  return dispatchAuthNotification({
    kind: 'email_verification',
    channel: 'email',
    recipient: payload.email,
    subject: 'Verify your email',
    metadata: {
      verificationUrl: payload.verificationUrl,
      expiresAt: payload.expiresAt.toISOString(),
    },
  });
}

export async function sendPhoneVerificationNotification(payload: {
  phone: string;
  code: string;
  expiresAt: Date;
}) {
  return dispatchAuthNotification({
    kind: 'phone_verification',
    channel: 'sms',
    recipient: payload.phone,
    subject: 'Verify your phone',
    metadata: {
      code: payload.code,
      expiresAt: payload.expiresAt.toISOString(),
    },
  });
}

export async function sendAnomalousLoginAlert(payload: {
  email: string;
  eventType: 'user_login_anomaly' | 'admin_login_anomaly';
  currentIp?: string | null;
  previousIp?: string | null;
  currentUserAgent?: string | null;
  previousUserAgent?: string | null;
  occurredAt: Date;
}) {
  return dispatchAuthNotification({
    kind: 'security_alert',
    channel: 'email',
    recipient: payload.email,
    subject: 'New login activity detected',
    metadata: {
      eventType: payload.eventType,
      occurredAt: payload.occurredAt.toISOString(),
      currentIp: payload.currentIp ?? null,
      previousIp: payload.previousIp ?? null,
      currentUserAgent: payload.currentUserAgent ?? null,
      previousUserAgent: payload.previousUserAgent ?? null,
    },
  });
}
