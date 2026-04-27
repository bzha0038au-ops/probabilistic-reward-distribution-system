import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppInstance } from "./types";
import {
  BlackjackActionRequestSchema,
  BlackjackStartRequestSchema,
} from "@reward/shared-types/blackjack";
import {
  DrawPlayRequestSchema,
  DrawRequestSchema,
} from "@reward/shared-types/draw";
import { QuickEightRequestSchema } from "@reward/shared-types/quick-eight";
import { RewardMissionClaimRequestSchema } from "@reward/shared-types/gamification";

import {
  getTransactionHistory,
  getWalletBalance,
} from "../../modules/wallet/service";
import {
  executeDraw,
  executeDrawPlay,
  getDrawCatalog,
  getDrawOverview,
  serializeDrawRecordForResponse,
} from "../../modules/draw/service";
import {
  actOnBlackjack,
  getBlackjackOverview,
  startBlackjack,
} from "../../modules/blackjack/service";
import { playQuickEight } from "../../modules/quick-eight/service";
import {
  claimRewardMission,
  getRewardCenter,
} from "../../modules/gamification/service";
import {
  getAnalyticsConfig,
  getPoolSystemConfig,
} from "../../modules/system/service";
import { getPublicStats } from "../../modules/admin/service";
import { db } from "../../db";
import {
  getFairnessCommit,
  revealFairnessSeed,
} from "../../modules/fairness/service";
import {
  listBankCards,
  createBankCard,
  setDefaultBankCard,
} from "../../modules/bank-card/service";
import {
  createCryptoDeposit,
  createCryptoWithdrawal,
  createCryptoWithdrawAddress,
  listCryptoDepositChannels,
  listCryptoWithdrawAddresses,
  setDefaultCryptoWithdrawAddress,
} from "../../modules/crypto";
import { listTopUps, createTopUp } from "../../modules/top-up";
import {
  listWithdrawals,
  createWithdrawal,
} from "../../modules/withdraw/service";
import { requireUserGuard, requireVerifiedUser } from "../guards";
import { sendError, sendErrorForException, sendSuccess } from "../respond";
import {
  parseLimit,
  parsePositiveInt,
  readRecordValue,
  readStringValue,
  toAmountString,
  toObject,
} from "../utils";
import {
  validateBankCardCreate,
  validateCryptoDepositCreate,
  validateCryptoWithdrawAddressCreate,
  validateTopUpCreate,
  validateWithdrawalCreate,
} from "../validators";
import { getConfigView } from "../../shared/config";
import { createRateLimiter } from "../../shared/rate-limit";
import { parseSchema } from "../../shared/validation";
import { recordDrawRequestOutcome } from "../../shared/observability";

const config = getConfigView();
const drawRateLimit = {
  get max() {
    return config.rateLimitDrawMax;
  },
  get timeWindow() {
    return config.rateLimitDrawWindowMs;
  },
};
const financeRateLimit = {
  get max() {
    return config.rateLimitFinanceMax;
  },
  get timeWindow() {
    return config.rateLimitFinanceWindowMs;
  },
};
let userDrawLimiter: ReturnType<typeof createRateLimiter> | null = null;
let userFinanceLimiter: ReturnType<typeof createRateLimiter> | null = null;

const getUserDrawLimiter = () => {
  if (!userDrawLimiter) {
    userDrawLimiter = createRateLimiter({
      limit: config.rateLimitDrawMax,
      windowMs: config.rateLimitDrawWindowMs,
    });
  }

  return userDrawLimiter;
};

const getUserFinanceLimiter = () => {
  if (!userFinanceLimiter) {
    userFinanceLimiter = createRateLimiter({
      limit: config.rateLimitFinanceMax,
      windowMs: config.rateLimitFinanceWindowMs,
    });
  }

  return userFinanceLimiter;
};

const enforceUserLimit =
  (getLimiter: () => ReturnType<typeof createRateLimiter>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) return;
    const result = await getLimiter().consume(`user:${user.userId}`);
    if (!result.allowed) {
      return sendError(reply, 429, "Too many requests.");
    }
  };

const enforceUserDrawLimit = enforceUserLimit(getUserDrawLimiter);
const enforceUserFinanceLimit = enforceUserLimit(getUserFinanceLimiter);
const requireVerifiedDrawUser = requireVerifiedUser({ email: true });
const requireVerifiedFinanceUser = requireVerifiedUser({
  email: true,
  phone: true,
});

const resolveUserAgent = (request: { headers: { [key: string]: unknown } }) => {
  const value = request.headers["user-agent"];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
};

export async function registerUserRoutes(app: AppInstance) {
  app.get("/stats", async (_request, reply) => {
    const analytics = await getAnalyticsConfig(db);
    if (!analytics.publicStatsEnabled) {
      return sendError(reply, 404, "Not found.");
    }
    const delayMinutes = Number(analytics.statsVisibilityDelayMinutes ?? 0);
    const cutoff = new Date(Date.now() - Math.max(delayMinutes, 0) * 60 * 1000);
    const stats = await getPublicStats({
      cutoff,
      includePoolBalance: analytics.poolBalancePublic,
    });
    return sendSuccess(reply, stats);
  });

  app.get("/fairness/commit", async (_request, reply) => {
    const poolSystem = await getPoolSystemConfig(db);
    const commit = await getFairnessCommit(
      db,
      Number(poolSystem.epochSeconds ?? 0),
    );
    return sendSuccess(reply, commit);
  });

  app.get("/fairness/reveal", async (request, reply) => {
    const epoch = Number(readStringValue(request.query, "epoch"));
    if (!Number.isFinite(epoch)) {
      return sendError(reply, 400, "Invalid epoch.");
    }
    const poolSystem = await getPoolSystemConfig(db);
    const reveal = await revealFairnessSeed(
      db,
      epoch,
      Number(poolSystem.epochSeconds ?? 0),
    );
    if (!reveal) {
      return sendError(reply, 404, "Not found.");
    }
    return sendSuccess(reply, reveal);
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", requireUserGuard);

    protectedRoutes.get("/wallet", async (request, reply) => {
      const user = request.user!;
      const balance = await getWalletBalance(user.userId);
      return sendSuccess(reply, { balance });
    });

    protectedRoutes.get("/transactions", async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, "limit"));
      const history = await getTransactionHistory(user.userId, limit);
      return sendSuccess(reply, history);
    });

    protectedRoutes.get("/draw/overview", async (request, reply) => {
      const user = request.user!;
      const overview = await getDrawOverview(user.userId);
      return sendSuccess(reply, overview);
    });

    protectedRoutes.get("/draw/catalog", async (request, reply) => {
      const user = request.user!;
      const catalog = await getDrawCatalog(user.userId);
      return sendSuccess(reply, catalog);
    });

    protectedRoutes.get("/blackjack", async (request, reply) => {
      const user = request.user!;
      const overview = await getBlackjackOverview(user.userId);
      return sendSuccess(reply, overview);
    });

    protectedRoutes.get("/rewards/center", async (request, reply) => {
      const user = request.user!;
      const center = await getRewardCenter(user.userId);
      return sendSuccess(reply, center);
    });

    protectedRoutes.post(
      "/rewards/claim",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(
          RewardMissionClaimRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await claimRewardMission(
            user.userId,
            parsed.data.missionId,
          );
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Reward claim failed.");
        }
      },
    );

    protectedRoutes.post(
      "/blackjack/start",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(
          BlackjackStartRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await startBlackjack(user.userId, {
            stakeAmount: parsed.data.stakeAmount,
            clientNonce: parsed.data.clientNonce ?? null,
          });
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Blackjack start failed");
        }
      },
    );

    protectedRoutes.post(
      "/blackjack/:gameId/action",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const gameId = parsePositiveInt(request.params, "gameId");
        if (!gameId) {
          return sendError(reply, 400, "Invalid blackjack game id.");
        }

        const parsed = parseSchema(
          BlackjackActionRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await actOnBlackjack(
            user.userId,
            gameId,
            parsed.data.action,
          );
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Blackjack action failed");
        }
      },
    );

    protectedRoutes.post(
      "/draw/play",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(
          DrawPlayRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await executeDrawPlay(user.userId, parsed.data);
          recordDrawRequestOutcome("success");
          return sendSuccess(reply, result);
        } catch (error) {
          recordDrawRequestOutcome("error");
          return sendErrorForException(reply, error, "Draw failed");
        }
      },
    );

    protectedRoutes.post(
      "/quick-eight",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(
          QuickEightRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const round = await playQuickEight(user.userId, {
            numbers: parsed.data.numbers,
            stakeAmount: parsed.data.stakeAmount,
            clientNonce: parsed.data.clientNonce ?? null,
          });
          return sendSuccess(reply, round);
        } catch (error) {
          return sendErrorForException(reply, error, "Quick Eight play failed");
        }
      },
    );

    protectedRoutes.post(
      "/draw",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [enforceUserDrawLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(DrawRequestSchema, toObject(request.body));
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const record = await executeDraw(user.userId, {
            clientNonce: parsed.data.clientNonce ?? null,
          });
          recordDrawRequestOutcome("success");
          const safeRecord = record
            ? await serializeDrawRecordForResponse({
                id: record.id,
                userId: record.userId,
                prizeId: record.prizeId,
                drawCost: record.drawCost,
                rewardAmount: record.rewardAmount,
                status: record.status,
                createdAt: record.createdAt,
                metadata: record.metadata,
              })
            : null;
          return sendSuccess(reply, safeRecord);
        } catch (error) {
          recordDrawRequestOutcome("error");
          return sendErrorForException(reply, error, "Draw failed");
        }
      },
    );

    protectedRoutes.get("/bank-cards", async (request, reply) => {
      const user = request.user!;
      const cards = await listBankCards(user.userId);
      return sendSuccess(reply, cards);
    });

    protectedRoutes.post(
      "/bank-cards",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateBankCardCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const created = await createBankCard({
          userId: user.userId,
          cardholderName: readStringValue(payload, "cardholderName") ?? "",
          bankName: readStringValue(payload, "bankName") ?? null,
          brand: readStringValue(payload, "brand") ?? null,
          last4: readStringValue(payload, "last4") ?? null,
          isDefault: Reflect.get(payload, "isDefault") === true,
        });

        return sendSuccess(reply, created, 201);
      },
    );

    protectedRoutes.patch(
      "/bank-cards/:bankCardId/default",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const bankCardId = parsePositiveInt(request.params, "bankCardId");
        if (!bankCardId) {
          return sendError(reply, 400, "Invalid bank card id.");
        }

        const updated = await setDefaultBankCard(user.userId, bankCardId);
        if (!updated) {
          return sendError(reply, 404, "Bank card not found.");
        }

        return sendSuccess(reply, updated);
      },
    );

    protectedRoutes.get("/payout-methods", async (request, reply) => {
      const user = request.user!;
      const methods = await listBankCards(user.userId);
      return sendSuccess(reply, methods);
    });

    protectedRoutes.get("/crypto-deposit-channels", async (_request, reply) => {
      const channels = await listCryptoDepositChannels(true);
      return sendSuccess(reply, channels);
    });

    protectedRoutes.post(
      "/crypto-deposits",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateCryptoDepositCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const channelId = parsePositiveInt(payload, "channelId");
        if (!channelId) {
          return sendError(reply, 400, "Invalid crypto deposit channel id.");
        }

        const amountClaimed = readStringValue(payload, "amountClaimed");
        if (!amountClaimed) {
          return sendError(
            reply,
            400,
            "Claimed amount must be greater than 0.",
          );
        }

        try {
          const created = await createCryptoDeposit({
            userId: user.userId,
            channelId,
            amountClaimed,
            txHash: readStringValue(payload, "txHash") ?? "",
            fromAddress: readStringValue(payload, "fromAddress") ?? null,
            screenshotUrl: readStringValue(payload, "screenshotUrl") ?? null,
            memo: readStringValue(payload, "memo") ?? null,
            metadata: readRecordValue(payload, "metadata"),
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Crypto deposit failed");
        }
      },
    );

    protectedRoutes.get(
      "/crypto-withdraw-addresses",
      async (request, reply) => {
        const user = request.user!;
        const addresses = await listCryptoWithdrawAddresses(user.userId);
        return sendSuccess(reply, addresses);
      },
    );

    protectedRoutes.post(
      "/crypto-withdraw-addresses",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateCryptoWithdrawAddressCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        try {
          const created = await createCryptoWithdrawAddress({
            userId: user.userId,
            chain: readStringValue(payload, "chain") ?? "",
            network: readStringValue(payload, "network") ?? "",
            token: readStringValue(payload, "token") ?? "",
            address: readStringValue(payload, "address") ?? "",
            label: readStringValue(payload, "label") ?? null,
            isDefault: Reflect.get(payload, "isDefault") === true,
            metadata: readRecordValue(payload, "metadata"),
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Crypto withdrawal address creation failed",
          );
        }
      },
    );

    protectedRoutes.patch(
      "/crypto-withdraw-addresses/:payoutMethodId/default",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payoutMethodId = parsePositiveInt(
          request.params,
          "payoutMethodId",
        );
        if (!payoutMethodId) {
          return sendError(reply, 400, "Invalid payout method id.");
        }

        try {
          const updated = await setDefaultCryptoWithdrawAddress(
            user.userId,
            payoutMethodId,
          );
          if (!updated) {
            return sendError(
              reply,
              404,
              "Crypto withdrawal address not found.",
            );
          }

          return sendSuccess(reply, updated);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to update crypto withdrawal address.",
          );
        }
      },
    );

    protectedRoutes.post(
      "/payout-methods",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateBankCardCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const created = await createBankCard({
          userId: user.userId,
          cardholderName: readStringValue(payload, "cardholderName") ?? "",
          bankName: readStringValue(payload, "bankName") ?? null,
          brand: readStringValue(payload, "brand") ?? null,
          last4: readStringValue(payload, "last4") ?? null,
          isDefault: Reflect.get(payload, "isDefault") === true,
        });

        return sendSuccess(reply, created, 201);
      },
    );

    protectedRoutes.patch(
      "/payout-methods/:payoutMethodId/default",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payoutMethodId = parsePositiveInt(
          request.params,
          "payoutMethodId",
        );
        if (!payoutMethodId) {
          return sendError(reply, 400, "Invalid payout method id.");
        }

        const updated = await setDefaultBankCard(user.userId, payoutMethodId);
        if (!updated) {
          return sendError(reply, 404, "Payout method not found.");
        }

        return sendSuccess(reply, updated);
      },
    );

    protectedRoutes.get("/top-ups", async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, "limit"));
      const items = await listTopUps(user.userId, limit);
      return sendSuccess(reply, items);
    });

    protectedRoutes.post(
      "/top-ups",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateTopUpCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const amount = toAmountString(Reflect.get(payload, "amount"));
        if (!amount) {
          return sendError(reply, 400, "Amount must be greater than 0.");
        }

        try {
          const created = await createTopUp({
            userId: user.userId,
            amount,
            referenceId: readStringValue(payload, "referenceId") ?? null,
            metadata: readRecordValue(payload, "metadata"),
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Top-up failed");
        }
      },
    );

    protectedRoutes.get("/deposits", async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, "limit"));
      const items = await listTopUps(user.userId, limit);
      return sendSuccess(reply, items);
    });

    protectedRoutes.post(
      "/deposits",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateTopUpCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const amount = toAmountString(Reflect.get(payload, "amount"));
        if (!amount) {
          return sendError(reply, 400, "Amount must be greater than 0.");
        }

        try {
          const created = await createTopUp({
            userId: user.userId,
            amount,
            referenceId: readStringValue(payload, "referenceId") ?? null,
            metadata: readRecordValue(payload, "metadata"),
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Deposit failed");
        }
      },
    );

    protectedRoutes.get("/withdrawals", async (request, reply) => {
      const user = request.user!;
      const limit = parseLimit(readStringValue(request.query, "limit"));
      const items = await listWithdrawals(user.userId, limit);
      return sendSuccess(reply, items);
    });

    protectedRoutes.post(
      "/withdrawals",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateWithdrawalCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const amount = toAmountString(Reflect.get(payload, "amount"));
        if (!amount) {
          return sendError(reply, 400, "Amount must be greater than 0.");
        }

        const payoutMethodId =
          Reflect.get(payload, "payoutMethodId") !== null &&
          Reflect.get(payload, "payoutMethodId") !== undefined
            ? Number(Reflect.get(payload, "payoutMethodId"))
            : null;
        if (
          payoutMethodId !== null &&
          (!Number.isFinite(payoutMethodId) || payoutMethodId <= 0)
        ) {
          return sendError(reply, 400, "Invalid payout method id.");
        }

        const bankCardId =
          Reflect.get(payload, "bankCardId") !== null &&
          Reflect.get(payload, "bankCardId") !== undefined
            ? Number(Reflect.get(payload, "bankCardId"))
            : null;
        if (
          bankCardId !== null &&
          (!Number.isFinite(bankCardId) || bankCardId <= 0)
        ) {
          return sendError(reply, 400, "Invalid bank card id.");
        }

        try {
          const created = await createWithdrawal({
            userId: user.userId,
            amount,
            payoutMethodId,
            bankCardId,
            metadata: readRecordValue(payload, "metadata"),
            requestContext: {
              ip: request.ip,
              userAgent: resolveUserAgent(request),
              sessionId: user.sessionId,
            },
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Withdrawal failed");
        }
      },
    );

    protectedRoutes.post(
      "/crypto-withdrawals",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [enforceUserFinanceLimit, requireVerifiedFinanceUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const payload = toObject(request.body);
        const validation = validateWithdrawalCreate(payload);
        if (!validation.isValid) {
          return sendError(reply, 400, "Invalid request.", validation.errors);
        }

        const amount = toAmountString(Reflect.get(payload, "amount"));
        if (!amount) {
          return sendError(reply, 400, "Amount must be greater than 0.");
        }

        const payoutMethodId = parsePositiveInt(payload, "payoutMethodId");
        if (!payoutMethodId) {
          return sendError(reply, 400, "Invalid payout method id.");
        }

        try {
          const created = await createCryptoWithdrawal({
            userId: user.userId,
            amount,
            payoutMethodId,
            metadata: readRecordValue(payload, "metadata"),
            requestContext: {
              ip: request.ip,
              userAgent: resolveUserAgent(request),
              sessionId: user.sessionId,
            },
          });

          return sendSuccess(reply, created, 201);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Crypto withdrawal failed",
          );
        }
      },
    );
  });
}
