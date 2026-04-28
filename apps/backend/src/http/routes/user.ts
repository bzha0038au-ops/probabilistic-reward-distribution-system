import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppInstance } from "./types";
import {
  BlackjackActionRequestSchema,
  BlackjackStartRequestSchema,
} from "@reward/shared-types/blackjack";
import {
  HoldemCreateTableRequestSchema,
  HoldemJoinTableRequestSchema,
  HoldemTableMessageRequestSchema,
  HoldemSeatModeRequestSchema,
  HoldemTableActionRequestSchema,
} from "@reward/shared-types/holdem";
import {
  DrawPlayRequestSchema,
  DrawRequestSchema,
} from "@reward/shared-types/draw";
import { KycSubmitRequestSchema } from "@reward/shared-types/kyc";
import {
  PredictionMarketHistoryQuerySchema,
  PredictionMarketPortfolioQuerySchema,
  PredictionMarketPositionRequestSchema,
} from "@reward/shared-types/prediction-market";
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
import {
  actOnHoldem,
  createHoldemTableMessage,
  createHoldemTable,
  getHoldemTable,
  listHoldemTableMessages,
  joinHoldemTable,
  leaveHoldemTable,
  listHoldemTables,
  setHoldemSeatMode,
  startHoldemTableHand,
  touchHoldemSeatPresence,
} from "../../modules/holdem/service";
import {
  getPredictionMarket,
  getPredictionMarketHistory,
  getPredictionMarketPortfolio,
  listPredictionMarkets,
  placePredictionPosition,
} from "../../modules/prediction-market/service";
import { playQuickEight } from "../../modules/quick-eight/service";
import { getHandHistory } from "../../modules/hand-history/service";
import { getHandHistoryEvidenceBundle } from "../../modules/hand-history/evidence-bundle";
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
  assertKycTierAtLeast,
  getUserKycProfile,
  submitKycProfile,
} from "../../modules/kyc/service";
import {
  listWithdrawals,
  createWithdrawal,
} from "../../modules/withdraw/service";
import {
  requireCurrentLegalAcceptance,
  requireUserFreezeScope,
  requireUserGuard,
  requireUserMfaStepUp,
  requireVerifiedUser,
} from "../guards";
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
const requireGameplayAccess = requireUserFreezeScope("gameplay_lock");
const requireWithdrawalAccess = requireUserFreezeScope("withdrawal_lock");
const requireTopUpAccess = requireUserFreezeScope("topup_lock");
const requireMultiplayerKycAccess = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.user;
  if (!user) {
    return sendError(reply, 401, "Unauthorized");
  }

  try {
    await assertKycTierAtLeast(user.userId, "tier_2");
  } catch (error) {
    return sendErrorForException(
      reply,
      error,
      "Multiplayer KYC verification required",
    );
  }
};

const resolveUserAgent = (request: { headers: { [key: string]: unknown } }) => {
  const value = request.headers["user-agent"];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
};

const appendUserStepUpMetadata = (
  metadata: Record<string, unknown> | null,
  request: FastifyRequest,
) => {
  if (!request.userStepUp) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    userStepUp: {
      method: request.userStepUp.method,
      verifiedAt: request.userStepUp.verifiedAt,
      amountThreshold: request.userStepUp.amountThreshold,
    },
  };
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
    protectedRoutes.addHook("preHandler", requireCurrentLegalAcceptance);

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

    protectedRoutes.get("/kyc/profile", async (request, reply) => {
      const user = request.user!;
      const profile = await getUserKycProfile(user.userId);
      return sendSuccess(reply, profile);
    });

    protectedRoutes.post(
      "/kyc/profile",
      {
        config: { rateLimit: financeRateLimit },
        bodyLimit: 12_000_000,
        preHandler: [enforceUserFinanceLimit, requireVerifiedDrawUser],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(KycSubmitRequestSchema, toObject(request.body));
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const profile = await submitKycProfile(user.userId, parsed.data);
          return sendSuccess(reply, profile, 201);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "KYC submission failed",
          );
        }
      },
    );

    protectedRoutes.get("/markets", async (request, reply) => {
      const user = request.user!;
      const markets = await listPredictionMarkets(user.userId);
      return sendSuccess(reply, markets);
    });

    protectedRoutes.get("/markets/portfolio", async (request, reply) => {
      const user = request.user!;
      const parsed = parseSchema(
        PredictionMarketPortfolioQuerySchema,
        toObject(request.query),
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const portfolio = await getPredictionMarketPortfolio(
        user.userId,
        parsed.data.status ?? "all",
      );
      return sendSuccess(reply, portfolio);
    });

    protectedRoutes.get("/markets/history", async (request, reply) => {
      const user = request.user!;
      const parsed = parseSchema(
        PredictionMarketHistoryQuerySchema,
        toObject(request.query),
      );
      if (!parsed.isValid) {
        return sendError(reply, 400, "Invalid request.", parsed.errors);
      }

      const history = await getPredictionMarketHistory(user.userId, {
        status: parsed.data.status ?? "all",
        page: parsed.data.page ?? 1,
        limit: parsed.data.limit ?? 20,
      });
      return sendSuccess(reply, history);
    });

    protectedRoutes.get("/markets/:marketId", async (request, reply) => {
      const user = request.user!;
      const marketId = parsePositiveInt(request.params, "marketId");
      if (!marketId) {
        return sendError(reply, 400, "Invalid market id.");
      }

      const market = await getPredictionMarket(marketId, user.userId);
      if (!market) {
        return sendError(reply, 404, "Prediction market not found.");
      }

      return sendSuccess(reply, market);
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

    protectedRoutes.get("/holdem/tables", async (request, reply) => {
      const user = request.user!;
      const tables = await listHoldemTables(user.userId);
      return sendSuccess(reply, tables);
    });

    protectedRoutes.get("/holdem/tables/:tableId", async (request, reply) => {
      const user = request.user!;
      const tableId = parsePositiveInt(request.params, "tableId");
      if (!tableId) {
        return sendError(reply, 400, "Invalid holdem table id.");
      }

      try {
        const table = await getHoldemTable(user.userId, tableId);
        return sendSuccess(reply, table);
      } catch (error) {
        return sendErrorForException(reply, error, "Holdem table load failed");
      }
    });

    protectedRoutes.get(
      "/holdem/tables/:tableId/messages",
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        try {
          const messages = await listHoldemTableMessages(user.userId, tableId);
          return sendSuccess(reply, messages);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Holdem table messages load failed",
          );
        }
      },
    );

    protectedRoutes.get("/hand-history/:roundId", async (request, reply) => {
      const user = request.user!;
      const roundId = readStringValue(request.params, "roundId");
      if (!roundId) {
        return sendError(reply, 400, "Invalid round id.");
      }

      try {
        const history = await getHandHistory(user.userId, roundId);
        return sendSuccess(reply, history);
      } catch (error) {
        return sendErrorForException(reply, error, "Hand history read failed.");
      }
    });

    protectedRoutes.get(
      "/hand-history/:roundId/evidence-bundle",
      async (request, reply) => {
        const user = request.user!;
        const roundId = readStringValue(request.params, "roundId");
        if (!roundId) {
          return sendError(reply, 400, "Invalid round id.");
        }

        try {
          const bundle = await getHandHistoryEvidenceBundle(user.userId, roundId);
          return sendSuccess(reply, bundle);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Hand history evidence bundle read failed.",
          );
        }
      },
    );

    protectedRoutes.get("/rewards/center", async (request, reply) => {
      const user = request.user!;
      try {
        const { getRewardCenter } = await import(
          "../../modules/gamification/service"
        );
        const center = await getRewardCenter(user.userId);
        return sendSuccess(reply, center);
      } catch (error) {
        return sendErrorForException(reply, error, "Reward center read failed.");
      }
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
          const { claimRewardMission } = await import(
            "../../modules/gamification/service"
          );
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
      "/markets/:marketId/positions",
      {
        config: { rateLimit: financeRateLimit },
        preHandler: [
          enforceUserFinanceLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const marketId = parsePositiveInt(request.params, "marketId");
        if (!marketId) {
          return sendError(reply, 400, "Invalid market id.");
        }

        const parsed = parseSchema(
          PredictionMarketPositionRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await placePredictionPosition(user.userId, marketId, {
            outcomeKey: parsed.data.outcomeKey,
            stakeAmount: parsed.data.stakeAmount,
          });
          return sendSuccess(reply, result, 201);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Prediction market position failed",
          );
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireMultiplayerKycAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const parsed = parseSchema(
          HoldemCreateTableRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await createHoldemTable(user.userId, {
            tableName: parsed.data.tableName,
            buyInAmount: parsed.data.buyInAmount,
          });
          return sendSuccess(reply, result, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem table create failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/join",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireMultiplayerKycAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        const parsed = parseSchema(
          HoldemJoinTableRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await joinHoldemTable(user.userId, tableId, {
            buyInAmount: parsed.data.buyInAmount,
          });
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem table join failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/leave",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireMultiplayerKycAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        try {
          const result = await leaveHoldemTable(user.userId, tableId);
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem table leave failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/start",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireMultiplayerKycAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        try {
          const result = await startHoldemTableHand(user.userId, tableId);
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem hand start failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/presence",
      {
        preHandler: [
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        try {
          const result = await touchHoldemSeatPresence(user.userId, tableId);
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem seat presence failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/seat-mode",
      {
        preHandler: [
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        const parsed = parseSchema(
          HoldemSeatModeRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await setHoldemSeatMode(user.userId, tableId, {
            sittingOut: parsed.data.sittingOut,
          });
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem seat mode failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/action",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        const parsed = parseSchema(
          HoldemTableActionRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await actOnHoldem(user.userId, tableId, {
            action: parsed.data.action,
            amount: parsed.data.amount,
          });
          return sendSuccess(reply, result);
        } catch (error) {
          return sendErrorForException(reply, error, "Holdem action failed");
        }
      },
    );

    protectedRoutes.post(
      "/holdem/tables/:tableId/messages",
      {
        preHandler: [
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
      },
      async (request, reply) => {
        const user = request.user!;
        const tableId = parsePositiveInt(request.params, "tableId");
        if (!tableId) {
          return sendError(reply, 400, "Invalid holdem table id.");
        }

        const parsed = parseSchema(
          HoldemTableMessageRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await createHoldemTableMessage(
            user.userId,
            tableId,
            parsed.data,
          );
          return sendSuccess(reply, result, 201);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Holdem table message failed",
          );
        }
      },
    );

    protectedRoutes.post(
      "/blackjack/start",
      {
        config: { rateLimit: drawRateLimit },
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
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
            playMode: parsed.data.playMode ?? null,
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
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
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
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
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
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
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
        preHandler: [
          enforceUserDrawLimit,
          requireGameplayAccess,
          requireVerifiedDrawUser,
        ],
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
        preHandler: [enforceUserFinanceLimit, requireTopUpAccess],
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
        preHandler: [enforceUserFinanceLimit, requireTopUpAccess],
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
        preHandler: [enforceUserFinanceLimit, requireTopUpAccess],
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
        preHandler: [
          enforceUserFinanceLimit,
          requireWithdrawalAccess,
          requireVerifiedFinanceUser,
          requireUserMfaStepUp(),
        ],
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

        const metadata = appendUserStepUpMetadata(
          readRecordValue(payload, "metadata"),
          request,
        );

        try {
          const created = await createWithdrawal({
            userId: user.userId,
            amount,
            payoutMethodId,
            bankCardId,
            metadata,
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
        preHandler: [
          enforceUserFinanceLimit,
          requireWithdrawalAccess,
          requireVerifiedFinanceUser,
          requireUserMfaStepUp(),
        ],
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

        const metadata = appendUserStepUpMetadata(
          readRecordValue(payload, "metadata"),
          request,
        );

        try {
          const created = await createCryptoWithdrawal({
            userId: user.userId,
            amount,
            payoutMethodId,
            metadata,
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
