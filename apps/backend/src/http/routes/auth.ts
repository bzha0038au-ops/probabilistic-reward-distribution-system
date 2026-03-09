import type { AppInstance } from './types';

import { and, eq, gte, sql } from 'drizzle-orm';

import { createUserWithWallet, getUserByEmail } from '../../modules/user/service';
import { verifyCredentials, verifyAdminCredentials } from '../../modules/auth/service';
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
  recordAuthEvent,
} from '../../modules/audit/service';
import { ensureUserFreeze, isUserFrozen } from '../../modules/risk/service';
import {
  getAntiAbuseConfig,
  getAuthFailureConfig,
  consumeMarketingBudget,
  getRewardEventConfig,
  getSystemFlags,
} from '../../modules/system/service';
import { db } from '../../db';
import { grantBonus } from '../../modules/bonus/service';
import { ledgerEntries, users } from '@reward/database';

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

const resolveUserAgent = (request: { headers: { [key: string]: unknown } }) => {
  const value = request.headers['user-agent'];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
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

export async function registerAuthRoutes(app: AppInstance) {
  app.get(
    '/health',
    { config: { rateLimit: false } },
    async (request, reply) => {
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

      const { token, expiresAt } = await createUserSessionToken({
        userId: Number(user.id),
        email: user.email,
        role: user.role === 'admin' ? 'admin' : 'user',
      });

      await safeRecordAuthEvent({
        eventType: 'user_login_success',
        email,
        userId: user.id,
        ip: request.ip,
        userAgent: resolveUserAgent(request),
      });

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

      const { user } = adminResult;

      const { token, expiresAt } = await createAdminSessionToken({
        userId: Number(user.id),
        email: user.email,
        role: 'admin',
      });

      return sendSuccess(reply, {
        token,
        expiresAt,
        user: { id: user.id, email: user.email },
      });
    }
  );
}
