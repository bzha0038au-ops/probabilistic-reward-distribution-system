import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppInstance } from './types';
import { DrawRequestSchema } from '@reward/shared-types';

import { getTransactionHistory, getWalletBalance } from '../../modules/wallet/service';
import { executeDraw } from '../../modules/draw/service';
import { getAnalyticsConfig, getPoolSystemConfig } from '../../modules/system/service';
import { getPublicStats } from '../../modules/admin/service';
import { db } from '../../db';
import { getFairnessCommit, revealFairnessSeed } from '../../modules/fairness/service';
import { listBankCards, createBankCard, setDefaultBankCard } from '../../modules/bank-card/service';
import { listTopUps, createTopUp } from '../../modules/top-up/service';
import { listWithdrawals, createWithdrawal } from '../../modules/withdraw/service';
import { requireUserGuard } from '../guards';
import { sendError, sendSuccess } from '../respond';
import {
  parseLimit,
  parsePositiveInt,
  readRecordValue,
  readStringValue,
  toAmountString,
  toObject,
} from '../utils';
import {
  validateBankCardCreate,
  validateTopUpCreate,
  validateWithdrawalCreate,
} from '../validators';
import { getConfig } from '../../shared/config';
import { createRateLimiter } from '../../shared/rate-limit';
import { parseSchema } from '../../shared/validation';

const config = getConfig();
const drawRateLimit = {
  max: config.rateLimitDrawMax,
  timeWindow: config.rateLimitDrawWindowMs,
};
const financeRateLimit = {
  max: config.rateLimitFinanceMax,
  timeWindow: config.rateLimitFinanceWindowMs,
};
const userDrawLimiter = createRateLimiter({
  limit: config.rateLimitDrawMax,
  windowMs: config.rateLimitDrawWindowMs,
});
const userFinanceLimiter = createRateLimiter({
  limit: config.rateLimitFinanceMax,
  windowMs: config.rateLimitFinanceWindowMs,
});

const enforceUserLimit =
  (limiter: ReturnType<typeof createRateLimiter>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) return;
    const result = await limiter.consume(`user:${user.userId}`);
    if (!result.allowed) {
      return sendError(reply, 429, 'Too many requests.');
    }
  };

const enforceUserDrawLimit = enforceUserLimit(userDrawLimiter);
const enforceUserFinanceLimit = enforceUserLimit(userFinanceLimiter);

export async function registerUserRoutes(app: AppInstance) {
  app.get('/stats', async (_request, reply) => {
    const analytics = await getAnalyticsConfig(db);
    if (!analytics.publicStatsEnabled) {
      return sendError(reply, 404, 'Not found.');
    }
    const delayMinutes = Number(analytics.statsVisibilityDelayMinutes ?? 0);
    const cutoff = new Date(Date.now() - Math.max(delayMinutes, 0) * 60 * 1000);
    const stats = await getPublicStats({
      cutoff,
      includePoolBalance: analytics.poolBalancePublic,
    });
    return sendSuccess(reply, stats);
  });

  app.get('/fairness/commit', async (_request, reply) => {
    const poolSystem = await getPoolSystemConfig(db);
    const commit = await getFairnessCommit(
      db,
      Number(poolSystem.epochSeconds ?? 0)
    );
    return sendSuccess(reply, commit);
  });

  app.get('/fairness/reveal', async (request, reply) => {
    const epoch = Number(readStringValue(request.query, 'epoch'));
    if (!Number.isFinite(epoch)) {
      return sendError(reply, 400, 'Invalid epoch.');
    }
    const poolSystem = await getPoolSystemConfig(db);
    const reveal = await revealFairnessSeed(
      db,
      epoch,
      Number(poolSystem.epochSeconds ?? 0)
    );
    if (!reveal) {
      return sendError(reply, 404, 'Not found.');
    }
    return sendSuccess(reply, reveal);
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireUserGuard);

    protectedRoutes.get('/wallet', async (request, reply) => {
      const user = request.user!;
      const balance = await getWalletBalance(user.userId);
      return sendSuccess(reply, { balance });
    });

    protectedRoutes.get('/transactions', async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, 'limit'));
      const history = await getTransactionHistory(user.userId, limit);
      return sendSuccess(reply, history);
    });

    protectedRoutes.post(
      '/draw',
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(DrawRequestSchema, toObject(request.body));
        if (!parsed.isValid) {
          return sendError(reply, 400, 'Invalid request.', parsed.errors);
        }

        try {
          const record = await executeDraw(user.userId, {
            clientNonce: parsed.data.clientNonce ?? null,
          });
          const fairness =
            record && record.metadata && typeof record.metadata === 'object'
              ? Reflect.get(record.metadata, 'fairness') ?? null
              : null;
          const safeRecord = record
            ? {
                id: record.id,
                userId: record.userId,
                prizeId: record.prizeId,
                drawCost: record.drawCost,
                rewardAmount: record.rewardAmount,
                status: record.status,
                createdAt: record.createdAt,
                fairness,
              }
            : null;
          return sendSuccess(reply, safeRecord);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Draw failed';
          return sendError(reply, 422, message);
        }
      }
    );

    protectedRoutes.get('/bank-cards', async (request, reply) => {
      const user = request.user!;
      const cards = await listBankCards(user.userId);
      return sendSuccess(reply, cards);
    });

    protectedRoutes.post(
      '/bank-cards',
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
      const user = request.user!;
      const payload = toObject(request.body);
      const validation = validateBankCardCreate(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const created = await createBankCard({
        userId: user.userId,
        cardholderName: readStringValue(payload, 'cardholderName') ?? '',
        bankName: readStringValue(payload, 'bankName') ?? null,
        brand: readStringValue(payload, 'brand') ?? null,
        last4: readStringValue(payload, 'last4') ?? null,
        isDefault: Reflect.get(payload, 'isDefault') === true,
      });

      return sendSuccess(reply, created, 201);
    });

    protectedRoutes.patch(
      '/bank-cards/:bankCardId/default',
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
      const user = request.user!;
      const bankCardId = parsePositiveInt(request.params, 'bankCardId');
      if (!bankCardId) {
        return sendError(reply, 400, 'Invalid bank card id.');
      }

      const updated = await setDefaultBankCard(user.userId, bankCardId);
      if (!updated) {
        return sendError(reply, 404, 'Bank card not found.');
      }

      return sendSuccess(reply, updated);
    });

    protectedRoutes.get('/top-ups', async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, 'limit'));
      const items = await listTopUps(user.userId, limit);
      return sendSuccess(reply, items);
    });

    protectedRoutes.post(
      '/top-ups',
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
      const user = request.user!;
      const payload = toObject(request.body);
      const validation = validateTopUpCreate(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const amount = toAmountString(Reflect.get(payload, 'amount'));
      if (!amount) {
        return sendError(reply, 400, 'Amount must be greater than 0.');
      }

      try {
        const created = await createTopUp({
          userId: user.userId,
          amount,
          referenceId: readStringValue(payload, 'referenceId') ?? null,
          metadata: readRecordValue(payload, 'metadata'),
        });

        return sendSuccess(reply, created, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Top-up failed';
        return sendError(reply, 422, message);
      }
    });

    protectedRoutes.get('/withdrawals', async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, 'limit'));
      const items = await listWithdrawals(user.userId, limit);
      return sendSuccess(reply, items);
    });

    protectedRoutes.post(
      '/withdrawals',
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
      const user = request.user!;
      const payload = toObject(request.body);
      const validation = validateWithdrawalCreate(payload);
      if (!validation.isValid) {
        return sendError(reply, 400, 'Invalid request.', validation.errors);
      }

      const amount = toAmountString(Reflect.get(payload, 'amount'));
      if (!amount) {
        return sendError(reply, 400, 'Amount must be greater than 0.');
      }

      const bankCardId =
        Reflect.get(payload, 'bankCardId') !== null &&
        Reflect.get(payload, 'bankCardId') !== undefined
          ? Number(Reflect.get(payload, 'bankCardId'))
          : null;
      if (bankCardId !== null && (!Number.isFinite(bankCardId) || bankCardId <= 0)) {
        return sendError(reply, 400, 'Invalid bank card id.');
      }

      try {
        const created = await createWithdrawal({
          userId: user.userId,
          amount,
          bankCardId,
          metadata: readRecordValue(payload, 'metadata'),
        });

        return sendSuccess(reply, created, 201);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Withdrawal failed';
        return sendError(reply, 422, message);
      }
    });
  });
}
