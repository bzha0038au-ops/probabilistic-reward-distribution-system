import type { AppInstance } from './types';
import {
  EmailVerificationRequestSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  PhoneVerificationConfirmSchema,
  PhoneVerificationRequestSchema,
  VerificationTokenConfirmSchema,
} from '@reward/shared-types';

import { and, eq, gte, sql } from 'drizzle-orm';

import {
  createUserWithWallet,
  getUserByEmail,
  getUserById,
  getUserByPhone,
  markUserEmailVerified,
  markUserPhoneVerified,
  updateUserPassword,
} from '../../modules/user/service';
import { verifyCredentials, verifyAdminCredentials } from '../../modules/auth/service';
import {
  sendAnomalousLoginAlert,
  sendEmailVerificationNotification,
  sendPasswordResetNotification,
  sendPhoneVerificationNotification,
} from '../../modules/auth/notification-service';
import {
  consumeAuthToken,
  issueAuthToken,
  revokeOutstandingAuthTokens,
} from '../../modules/auth/token-service';
import { createAdminSessionToken } from '../../shared/admin-session';
import { createUserSessionToken } from '../../shared/user-session';
import { sendError, sendSuccess } from '../respond';
import { validateAuth } from '../validators';
import { readStringValue, toObject } from '../utils';
import { getConfig } from '../../shared/config';
import { applyAuthFailureDelay } from '../../shared/auth-delay';
import { logger } from '../../shared/logger';
import {
  countAuthEventsByIp,
  countAuthFailures,
  findLatestAuthEvent,
  recordAuthEvent,
} from '../../modules/audit/service';
import {
  ensureUserFreeze,
  isUserFrozen,
  recordSuspiciousActivity,
} from '../../modules/risk/service';
import {
  consumeMarketingBudget,
  getAntiAbuseConfig,
  getAuthFailureConfig,
  getRewardEventConfig,
  getSystemFlags,
} from '../../modules/system/service';
import { db } from '../../db';
import { grantBonus } from '../../modules/bonus/service';
import {
  listActiveAuthSessions,
  revokeAuthSession,
  revokeAuthSessions,
} from '../../modules/session/service';
import { recordAdminAction } from '../../modules/admin/audit';
import { verifyAdminTotpCode } from '../../modules/admin-mfa/service';
import { ledgerEntries, users } from '@reward/database';
import { requireAdmin, requireUser, requireUserGuard } from '../guards';
import { parseSchema } from '../../shared/validation';

const config = getConfig();
const authRateLimit = {
  max: config.rateLimitAuthMax,
  timeWindow: config.rateLimitAuthWindowMs,
};
const adminAuthRateLimit = {
  max: config.rateLimitAdminAuthMax,
  timeWindow: config.rateLimitAdminAuthWindowMs,
};

const safeRecordAuthEvent = async (payload: Parameters<typeof recordAuthEvent>[0]) => {
  try {
    await recordAuthEvent(payload);
  } catch (error) {
    logger.warning('failed to record auth event', { err: error });
  }
};

const safeDispatchNotification = async (
  label: string,
  runner: () => Promise<unknown>
) => {
  try {
    return await runner();
  } catch (error) {
    logger.warning('failed to dispatch auth notification', {
      label,
      err: error,
    });
    return null;
  }
};

const resolveUserAgent = (request: { headers: { [key: string]: unknown } }) => {
  const value = request.headers['user-agent'];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
};

const maskPhone = (phone: string) =>
  phone.length <= 4 ? '****' : `${'*'.repeat(Math.max(phone.length - 4, 1))}${phone.slice(-4)}`;

const buildPublicUrl = (baseUrl: string, path: string, token: string) => {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('token', token);
  return url.toString();
};

const shouldFreezeAccount = async (payload: {
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

const resolveAuthFailureConfig = async () => {
  const system = await getAuthFailureConfig(db);
  return {
    windowMinutes: system.authFailureWindowMinutes.toNumber(),
    userThreshold: system.authFailureFreezeThreshold.toNumber(),
    adminThreshold: system.adminFailureFreezeThreshold.toNumber(),
  };
};

const requireCurrentUserSession = async (
  request: Parameters<typeof requireUser>[0],
  reply: Parameters<typeof sendError>[0]
) => {
  const user = await requireUser(request);
  if (!user) {
    sendError(reply, 401, 'Unauthorized');
    return null;
  }
  request.user = user;
  return user;
};

const requireCurrentAdminSession = async (
  request: Parameters<typeof requireAdmin>[0],
  reply: Parameters<typeof sendError>[0]
) => {
  const admin = await requireAdmin(request);
  if (!admin) {
    sendError(reply, 401, 'Unauthorized');
    return null;
  }
  request.admin = admin;
  return admin;
};

const readSessionIdParam = (params: unknown) =>
  readStringValue(params, 'sessionId')?.trim() || null;

const resolvePasswordResetTarget = async (payload: {
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

const detectLoginAnomaly = async (payload: {
  userId: number;
  email: string;
  successEventType: 'user_login_success' | 'admin_login_success';
  currentIp?: string | null;
  currentUserAgent?: string | null;
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
  if (Number.isNaN(previousCreatedAt.valueOf()) || previousCreatedAt < lookbackCutoff) {
    return null;
  }

  const signals: string[] = [];
  if (
    payload.currentIp &&
    previous.ip &&
    payload.currentIp !== previous.ip
  ) {
    signals.push('new_ip');
  }
  if (
    payload.currentUserAgent &&
    previous.userAgent &&
    payload.currentUserAgent !== previous.userAgent
  ) {
    signals.push('new_user_agent');
  }

  if (signals.length === 0) {
    return null;
  }

  return {
    previous,
    signals,
  };
};

const handleLoginAnomaly = async (payload: {
  userId: number;
  email: string;
  anomalyEventType: 'user_login_anomaly' | 'admin_login_anomaly';
  currentIp?: string | null;
  currentUserAgent?: string | null;
  anomaly: NonNullable<Awaited<ReturnType<typeof detectLoginAnomaly>>>;
}) => {
  const metadata = {
    signals: payload.anomaly.signals,
    previousIp: payload.anomaly.previous.ip ?? null,
    previousUserAgent: payload.anomaly.previous.userAgent ?? null,
    previousCreatedAt: new Date(payload.anomaly.previous.createdAt).toISOString(),
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
    reason: 'anomalous_login',
    metadata: {
      ...metadata,
      loginType: payload.anomalyEventType,
      currentIp: payload.currentIp ?? null,
      currentUserAgent: payload.currentUserAgent ?? null,
    },
    score: payload.anomaly.signals.length >= 2 ? 2 : 1,
  });

  logger.warning('anomalous login detected', {
    userId: payload.userId,
    email: payload.email,
    eventType: payload.anomalyEventType,
    signals: payload.anomaly.signals,
    currentIp: payload.currentIp ?? null,
    previousIp: payload.anomaly.previous.ip ?? null,
  });

  await safeDispatchNotification('anomalous_login_alert', () =>
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

const sendEmailVerification = async (payload: { userId: number; email: string }) => {
  const issued = await issueAuthToken({
    tokenType: 'email_verification',
    userId: payload.userId,
    email: payload.email,
    ttlMinutes: config.emailVerificationTtlMinutes,
  });

  await safeDispatchNotification('email_verification', () =>
    sendEmailVerificationNotification({
      email: payload.email,
      verificationUrl: buildPublicUrl(
        config.webBaseUrl,
        '/verify-email',
        issued.rawToken
      ),
      expiresAt: issued.expiresAt,
    })
  );

  return issued;
};

export async function registerAuthRoutes(app: AppInstance) {
  app.get(
    '/health',
    { config: { rateLimit: false } },
    async (_request, reply) => {
      return sendSuccess(reply, { status: 'ok' });
    }
  );

  app.post(
    '/auth/register',
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const payload = toObject(request.body);
      const validation = validateAuth(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const email = (readStringValue(payload, 'email') ?? '').toLowerCase();
      const password = readStringValue(payload, 'password') ?? '';
      const referrerId = Number(readStringValue(payload, 'referrerId') ?? 0);

      const systemFlags = await getSystemFlags(db);
      if (systemFlags.maintenanceMode) {
        await safeRecordAuthEvent({
          eventType: 'register_blocked',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'maintenance_mode' },
        });
        return sendError(reply, 503, 'Registration temporarily disabled.');
      }
      if (!systemFlags.registrationEnabled) {
        await safeRecordAuthEvent({
          eventType: 'register_blocked',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'registration_disabled' },
        });
        return sendError(reply, 403, 'Registration disabled.');
      }

      const antiAbuse = await getAntiAbuseConfig(db);
      if (antiAbuse.maxAccountsPerIp.gt(0) && request.ip) {
        const existingCount = await countAuthEventsByIp({
          ip: request.ip,
          eventType: 'register_success',
        });
        if (existingCount >= Number(antiAbuse.maxAccountsPerIp)) {
          await safeRecordAuthEvent({
            eventType: 'register_blocked',
            email,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: { reason: 'max_accounts_per_ip' },
          });
          return sendError(reply, 429, 'Registration limit reached.');
        }
      }

      const existing = await getUserByEmail(email);
      if (existing) {
        await applyAuthFailureDelay();
        return sendSuccess(reply, { id: existing.id, email: existing.email }, 201);
      }

      const user = await createUserWithWallet(email, password);
      await safeRecordAuthEvent({
        eventType: 'register_success',
        email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });
      await sendEmailVerification({ userId: user.id, email: user.email });
      await safeRecordAuthEvent({
        eventType: 'email_verification_requested',
        email: user.email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: { source: 'register' },
      });

      const rewardConfig = await getRewardEventConfig(db);
      if (rewardConfig.signupEnabled && rewardConfig.signupAmount.gt(0)) {
        const budget = await consumeMarketingBudget(
          db,
          rewardConfig.signupAmount
        );
        if (budget.allowed) {
          await grantBonus({
            userId: user.id,
            amount: rewardConfig.signupAmount.toString(),
            entryType: 'signup_bonus',
            referenceType: 'reward_event',
            metadata: { reason: 'signup_bonus' },
          });
        }
      }
      if (
        rewardConfig.referralEnabled &&
        rewardConfig.referralAmount.gt(0) &&
        Number.isFinite(referrerId) &&
        referrerId > 0
      ) {
        const referrer = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, referrerId))
          .limit(1);
        if (referrer.length > 0) {
          const budget = await consumeMarketingBudget(
            db,
            rewardConfig.referralAmount
          );
          if (budget.allowed) {
            await grantBonus({
              userId: referrerId,
              amount: rewardConfig.referralAmount.toString(),
              entryType: 'referral_bonus',
              referenceType: 'reward_event',
              metadata: { reason: 'referral_bonus', referredUserId: user.id },
            });
          }
        }
      }

      await applyAuthFailureDelay();
      return sendSuccess(reply, { id: user.id, email: user.email }, 201);
    }
  );

  app.post(
    '/auth/password-reset/request',
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(PasswordResetRequestSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const email = parsed.data.email.toLowerCase();
      const user = await getUserByEmail(email);
      if (user) {
        const issued = await issueAuthToken({
          tokenType: 'password_reset',
          userId: user.id,
          email: user.email,
          ttlMinutes: config.passwordResetTtlMinutes,
        });
        await safeDispatchNotification('password_reset', () =>
          sendPasswordResetNotification({
            email: user.email,
            resetUrl: buildPublicUrl(
              config.webBaseUrl,
              '/reset-password',
              issued.rawToken
            ),
            expiresAt: issued.expiresAt,
          })
        );
      }

      await safeRecordAuthEvent({
        eventType: 'password_reset_requested',
        email,
        userId: user?.id ?? null,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: { userFound: Boolean(user) },
      });

      await applyAuthFailureDelay();
      return sendSuccess(reply, { accepted: true }, 202);
    }
  );

  app.post(
    '/auth/password-reset/confirm',
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(PasswordResetConfirmSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const consumed = await consumeAuthToken({
        tokenType: 'password_reset',
        token: parsed.data.token,
      });
      if (!consumed) {
        await safeRecordAuthEvent({
          eventType: 'password_reset_failed',
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'invalid_or_expired_token' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 400, 'Invalid or expired reset token.');
      }

      const user = await resolvePasswordResetTarget({
        userId: consumed.userId,
        email: consumed.email,
      });
      if (!user) {
        return sendError(reply, 404, 'User not found.');
      }

      await updateUserPassword(user.id, parsed.data.password);
      await revokeOutstandingAuthTokens({
        tokenType: 'password_reset',
        userId: user.id,
        email: user.email,
      });
      await revokeAuthSessions({
        userId: user.id,
        reason: 'password_reset',
        eventType: 'password_reset_sessions_revoked',
        email: user.email,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });
      await safeRecordAuthEvent({
        eventType: 'password_reset_success',
        email: user.email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });

      return sendSuccess(reply, { completed: true });
    }
  );

  app.post(
    '/auth/user/session',
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const payload = toObject(request.body);
      const validation = validateAuth(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const email = (readStringValue(payload, 'email') ?? '').toLowerCase();
      const password = readStringValue(payload, 'password') ?? '';

      const systemFlags = await getSystemFlags(db);
      if (systemFlags.maintenanceMode) {
        await safeRecordAuthEvent({
          eventType: 'user_login_blocked',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'maintenance_mode' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 503, 'System under maintenance.');
      }
      if (!systemFlags.loginEnabled) {
        await safeRecordAuthEvent({
          eventType: 'user_login_blocked',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'login_disabled' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 403, 'Login disabled.');
      }

      const failureConfig = await resolveAuthFailureConfig();
      const existingUser = await getUserByEmail(email);
      if (existingUser && (await isUserFrozen(existingUser.id))) {
        await safeRecordAuthEvent({
          eventType: 'user_login_blocked',
          email,
          userId: existingUser.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'account_frozen' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 423, 'Account locked.');
      }

      const user = await verifyCredentials(email, password);
      if (!user) {
        await safeRecordAuthEvent({
          eventType: 'user_login_failed',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'invalid_credentials' },
        });
        if (existingUser) {
          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: 'user_login_failed',
            threshold: failureConfig.userThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: existingUser.id,
              reason: 'auth_failure_threshold',
            });
          }
        }
        await applyAuthFailureDelay();
        return sendError(reply, 401, 'Invalid credentials.');
      }

      const anomaly = await detectLoginAnomaly({
        userId: user.id,
        email: user.email,
        successEventType: 'user_login_success',
        currentIp: request.ip,
        currentUserAgent: resolveUserAgent(request),
      });

      const { token, expiresAt, sessionId } = await createUserSessionToken(
        {
          userId: Number(user.id),
          email: user.email,
          role: user.role === 'admin' ? 'admin' : 'user',
        },
        {
          ip: request.ip,
          userAgent: resolveUserAgent(request),
        }
      );

      await safeRecordAuthEvent({
        eventType: 'user_login_success',
        email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: {
          sessionId,
          sessionKind: 'user',
        },
      });
      if (anomaly) {
        await handleLoginAnomaly({
          userId: user.id,
          email: user.email,
          anomalyEventType: 'user_login_anomaly',
          currentIp: request.ip,
          currentUserAgent: resolveUserAgent(request),
          anomaly,
        });
      }

      const rewardConfig = await getRewardEventConfig(db);
      if (rewardConfig.dailyEnabled && rewardConfig.dailyAmount.gt(0)) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const [{ total = 0 }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.userId, user.id),
              eq(ledgerEntries.entryType, 'daily_bonus'),
              gte(ledgerEntries.createdAt, startOfDay)
            )
          );
        if (Number(total ?? 0) === 0) {
          const budget = await consumeMarketingBudget(
            db,
            rewardConfig.dailyAmount
          );
          if (budget.allowed) {
            await grantBonus({
              userId: user.id,
              amount: rewardConfig.dailyAmount.toString(),
              entryType: 'daily_bonus',
              referenceType: 'reward_event',
              metadata: { reason: 'daily_bonus' },
            });
          }
        }
      }

      return sendSuccess(reply, {
        token,
        expiresAt,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          role: user.role === 'admin' ? 'admin' : 'user',
        },
      });
    }
  );

  app.post(
    '/auth/admin/login',
    { config: { rateLimit: adminAuthRateLimit } },
    async (request, reply) => {
      const payload = toObject(request.body);
      const validation = validateAuth(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const email = (readStringValue(payload, 'email') ?? '').toLowerCase();
      const password = readStringValue(payload, 'password') ?? '';
      const totpCode = readStringValue(payload, 'totpCode') ?? '';

      const failureConfig = await resolveAuthFailureConfig();
      const existingUser = await getUserByEmail(email);
      if (existingUser && (await isUserFrozen(existingUser.id))) {
        await safeRecordAuthEvent({
          eventType: 'admin_login_blocked',
          email,
          userId: existingUser.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'account_frozen' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 423, 'Account locked.');
      }

      const adminResult = await verifyAdminCredentials(email, password);
      if (!adminResult) {
        await safeRecordAuthEvent({
          eventType: 'admin_login_failed',
          email,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'invalid_credentials' },
        });
        if (existingUser) {
          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: 'admin_login_failed',
            threshold: failureConfig.adminThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: existingUser.id,
              reason: 'admin_auth_failure_threshold',
            });
          }
        }
        await applyAuthFailureDelay();
        return sendError(reply, 401, 'Invalid admin credentials.');
      }

      const { user, admin } = adminResult;
      if (admin.mfaEnabled) {
        const hasValidMfa = await verifyAdminTotpCode({
          adminId: admin.id,
          totpCode,
        });
        if (!hasValidMfa) {
          await safeRecordAuthEvent({
            eventType: 'admin_login_failed',
            email,
            userId: user.id,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: {
              reason: totpCode ? 'invalid_mfa_code' : 'mfa_required',
            },
          });

          const shouldFreeze = await shouldFreezeAccount({
            email,
            eventType: 'admin_login_failed',
            threshold: failureConfig.adminThreshold,
            windowMinutes: failureConfig.windowMinutes,
          });
          if (shouldFreeze) {
            await ensureUserFreeze({
              userId: user.id,
              reason: 'admin_auth_failure_threshold',
            });
          }

          await applyAuthFailureDelay();
          return sendError(
            reply,
            401,
            totpCode ? 'Invalid admin MFA code.' : 'Admin MFA code required.'
          );
        }
      }

      const anomaly = await detectLoginAnomaly({
        userId: user.id,
        email: user.email,
        successEventType: 'admin_login_success',
        currentIp: request.ip,
        currentUserAgent: resolveUserAgent(request),
      });

      const { token, expiresAt, sessionId } = await createAdminSessionToken(
        {
          adminId: admin.id,
          userId: Number(user.id),
          email: user.email,
          role: 'admin',
          mfaEnabled: Boolean(admin.mfaEnabled),
        },
        {
          ip: request.ip,
          userAgent: resolveUserAgent(request),
        }
      );

      await safeRecordAuthEvent({
        eventType: 'admin_login_success',
        email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
        metadata: {
          adminId: admin.id,
          mfaEnabled: Boolean(admin.mfaEnabled),
          sessionId,
          sessionKind: 'admin',
        },
      });
      await recordAdminAction({
        adminId: admin.id,
        action: 'admin_login_success',
        targetType: 'admin_session',
        targetId: admin.id,
        ip: request.ip,
      });
      if (anomaly) {
        await handleLoginAnomaly({
          userId: user.id,
          email: user.email,
          anomalyEventType: 'admin_login_anomaly',
          currentIp: request.ip,
          currentUserAgent: resolveUserAgent(request),
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
    }
  );

  app.get('/auth/user/session', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const sessions = await listActiveAuthSessions({
      userId: user.userId,
      kind: 'user',
      currentJti: user.sessionId,
    });
    const currentSession =
      sessions.find((session) => session.current) ??
      ({
        sessionId: user.sessionId,
        kind: 'user',
        role: user.role,
        ip: null,
        userAgent: null,
        createdAt: null,
        lastSeenAt: null,
        expiresAt: null,
        current: true,
      } as const);

    return sendSuccess(reply, {
      user,
      session: currentSession,
    });
  });

  app.get('/auth/user/sessions', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const sessions = await listActiveAuthSessions({
      userId: user.userId,
      kind: 'user',
      currentJti: user.sessionId,
    });

    return sendSuccess(reply, { items: sessions });
  });

  app.delete('/auth/user/session', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    await revokeAuthSession({
      jti: user.sessionId,
      userId: user.userId,
      kind: 'user',
      reason: 'logout',
      eventType: 'user_logout',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
    });

    return sendSuccess(reply, { revoked: true, scope: 'current' });
  });

  app.delete('/auth/user/sessions/:sessionId', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const sessionId = readSessionIdParam(request.params);
    if (!sessionId) {
      return sendError(reply, 400, 'Invalid session id.');
    }

    const revoked = await revokeAuthSession({
      jti: sessionId,
      userId: user.userId,
      kind: 'user',
      reason: sessionId === user.sessionId ? 'logout' : 'session_revoked',
      eventType: sessionId === user.sessionId ? 'user_logout' : 'user_session_revoked',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        initiatedBy: 'self_service',
      },
    });
    if (!revoked) {
      return sendError(reply, 404, 'Session not found.');
    }

    return sendSuccess(reply, {
      revoked: true,
      scope: sessionId === user.sessionId ? 'current' : 'single',
      sessionId,
    });
  });

  app.post('/auth/user/sessions/revoke-all', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const revoked = await revokeAuthSessions({
      userId: user.userId,
      kind: 'user',
      reason: 'logout_all',
      eventType: 'user_sessions_revoked_all',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        initiatedBy: 'self_service',
      },
    });

    return sendSuccess(reply, {
      revokedCount: revoked.length,
      scope: 'all',
    });
  });

  app.get('/auth/admin/session', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessions = await listActiveAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      currentJti: admin.sessionId,
    });
    const currentSession =
      sessions.find((session) => session.current) ??
      ({
        sessionId: admin.sessionId,
        kind: 'admin',
        role: 'admin',
        ip: null,
        userAgent: null,
        createdAt: null,
        lastSeenAt: null,
        expiresAt: null,
        current: true,
      } as const);

    return sendSuccess(reply, {
      admin,
      session: currentSession,
    });
  });

  app.get('/auth/admin/sessions', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessions = await listActiveAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      currentJti: admin.sessionId,
    });

    return sendSuccess(reply, { items: sessions });
  });

  app.delete('/auth/admin/session', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    await revokeAuthSession({
      jti: admin.sessionId,
      userId: admin.userId,
      kind: 'admin',
      reason: 'logout',
      eventType: 'admin_logout',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
      },
    });
    await recordAdminAction({
      adminId: admin.adminId,
      action: 'admin_logout',
      targetType: 'admin_session',
      targetId: admin.adminId,
      ip: request.ip,
      metadata: { sessionId: admin.sessionId },
    });

    return sendSuccess(reply, { revoked: true, scope: 'current' });
  });

  app.delete('/auth/admin/sessions/:sessionId', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessionId = readSessionIdParam(request.params);
    if (!sessionId) {
      return sendError(reply, 400, 'Invalid session id.');
    }

    const revoked = await revokeAuthSession({
      jti: sessionId,
      userId: admin.userId,
      kind: 'admin',
      reason: sessionId === admin.sessionId ? 'logout' : 'session_revoked',
      eventType: sessionId === admin.sessionId ? 'admin_logout' : 'admin_session_revoked',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
        initiatedBy: 'self_service',
      },
    });
    if (!revoked) {
      return sendError(reply, 404, 'Session not found.');
    }

    await recordAdminAction({
      adminId: admin.adminId,
      action:
        sessionId === admin.sessionId ? 'admin_logout' : 'admin_session_revoked',
      targetType: 'admin_session',
      targetId: admin.adminId,
      ip: request.ip,
      metadata: { sessionId },
    });

    return sendSuccess(reply, {
      revoked: true,
      scope: sessionId === admin.sessionId ? 'current' : 'single',
      sessionId,
    });
  });

  app.post('/auth/admin/sessions/revoke-all', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const revoked = await revokeAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      reason: 'logout_all',
      eventType: 'admin_sessions_revoked_all',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
        initiatedBy: 'self_service',
      },
    });
    await recordAdminAction({
      adminId: admin.adminId,
      action: 'admin_sessions_revoked_all',
      targetType: 'admin_session',
      targetId: admin.adminId,
      ip: request.ip,
      metadata: { revokedCount: revoked.length },
    });

    return sendSuccess(reply, {
      revokedCount: revoked.length,
      scope: 'all',
    });
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireUserGuard);

    protectedRoutes.post(
      '/auth/email-verification/request',
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          EmailVerificationRequestSchema,
          toObject(request.body)
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, 'Invalid request.', parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(reply, 404, 'User not found.');
        }
        if (user.emailVerifiedAt) {
          return sendSuccess(reply, { accepted: true });
        }

        await sendEmailVerification({ userId: user.id, email: user.email });
        await safeRecordAuthEvent({
          eventType: 'email_verification_requested',
          email: user.email,
          userId: user.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
        });

        return sendSuccess(reply, { accepted: true });
      }
    );

    protectedRoutes.post(
      '/auth/phone-verification/request',
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          PhoneVerificationRequestSchema,
          toObject(request.body)
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, 'Invalid request.', parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(reply, 404, 'User not found.');
        }

        const phone = parsed.data.phone;
        const existingPhoneUser = await getUserByPhone(phone);
        if (existingPhoneUser && existingPhoneUser.id !== user.id) {
          return sendError(reply, 409, 'Phone already in use.');
        }

        const issued = await issueAuthToken({
          tokenType: 'phone_verification',
          userId: user.id,
          email: user.email,
          phone,
          ttlMinutes: config.phoneVerificationTtlMinutes,
          format: 'code',
        });
        await safeDispatchNotification('phone_verification', () =>
          sendPhoneVerificationNotification({
            phone,
            code: issued.rawToken,
            expiresAt: issued.expiresAt,
          })
        );
        await safeRecordAuthEvent({
          eventType: 'phone_verification_requested',
          email: user.email,
          userId: user.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { phone: maskPhone(phone) },
        });

        return sendSuccess(reply, { accepted: true });
      }
    );

    protectedRoutes.post(
      '/auth/phone-verification/confirm',
      { config: { rateLimit: authRateLimit } },
      async (request, reply) => {
        const parsed = parseSchema(
          PhoneVerificationConfirmSchema,
          toObject(request.body)
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, 'Invalid request.', parsed.errors);
        }

        const user = await getUserById(request.user!.userId);
        if (!user) {
          return sendError(reply, 404, 'User not found.');
        }

        const phone = parsed.data.phone;
        const duplicatePhoneUser = await getUserByPhone(phone);
        if (duplicatePhoneUser && duplicatePhoneUser.id !== user.id) {
          return sendError(reply, 409, 'Phone already in use.');
        }

        const consumed = await consumeAuthToken({
          tokenType: 'phone_verification',
          token: parsed.data.code,
          userId: user.id,
          phone,
        });
        if (!consumed) {
          await safeRecordAuthEvent({
            eventType: 'phone_verification_failed',
            email: user.email,
            userId: user.id,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
            metadata: { phone: maskPhone(phone), reason: 'invalid_or_expired_code' },
          });
          await applyAuthFailureDelay();
          return sendError(reply, 400, 'Invalid or expired verification code.');
        }

        const verified = await markUserPhoneVerified(user.id, phone);
        if (!verified) {
          return sendError(reply, 404, 'User not found.');
        }
        await revokeOutstandingAuthTokens({
          tokenType: 'phone_verification',
          userId: user.id,
          phone,
        });
        await safeRecordAuthEvent({
          eventType: 'phone_verification_success',
          email: verified.email,
          userId: verified.id,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { phone: maskPhone(phone) },
        });

        return sendSuccess(reply, { verified: true, phone });
      }
    );
  });

  app.post(
    '/auth/email-verification/confirm',
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = parseSchema(
        VerificationTokenConfirmSchema,
        toObject(request.body)
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const consumed = await consumeAuthToken({
        tokenType: 'email_verification',
        token: parsed.data.token,
      });
      if (!consumed) {
        await safeRecordAuthEvent({
          eventType: 'email_verification_failed',
          ip: request.ip,
          userAgent: resolveUserAgent(request),
          metadata: { reason: 'invalid_or_expired_token' },
        });
        await applyAuthFailureDelay();
        return sendError(reply, 400, 'Invalid or expired verification token.');
      }

      const user = await resolvePasswordResetTarget({
        userId: consumed.userId,
        email: consumed.email,
      });
      if (!user) {
        return sendError(reply, 404, 'User not found.');
      }

      const verified = await markUserEmailVerified(user.id);
      if (!verified) {
        return sendError(reply, 404, 'User not found.');
      }
      await revokeOutstandingAuthTokens({
        tokenType: 'email_verification',
        userId: user.id,
        email: user.email,
      });
      await safeRecordAuthEvent({
        eventType: 'email_verification_success',
        email: verified.email,
        userId: verified.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });

      return sendSuccess(reply, { verified: true, email: verified.email });
    }
  );
}
