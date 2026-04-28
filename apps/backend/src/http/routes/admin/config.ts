import type { AppInstance } from "../types";
import { BonusReleaseRequestSchema } from "@reward/shared-types/auth";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { db } from "../../../db";
import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { releaseBonusManual } from "../../../modules/bonus/service";
import {
  getAuthFailureConfig,
  getBlackjackConfig,
  getBonusReleaseConfig,
  getDrawCost,
  getGamificationRewardConfig,
  getPoolBalance,
  getRandomizationConfig,
  getSaasUsageAlertConfig,
} from "../../../modules/system/service";
import { recordAdminAction } from "../../../modules/admin/audit";
import { withAdminAuditContext } from "../../admin-audit";
import { toMoneyString } from "../../../shared/money";
import { parseSchema } from "../../../shared/validation";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import { adminRateLimit, enforceAdminLimit, toObject } from "./common";

export async function registerAdminConfigRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/config",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (_request, reply) => {
      const poolBalance = await getPoolBalance(db);
      const drawCost = await getDrawCost(db);
      const randomization = await getRandomizationConfig(db);
      const bonusRelease = await getBonusReleaseConfig(db);
      const authFailure = await getAuthFailureConfig(db);
      const gamificationReward = await getGamificationRewardConfig(db);
      const blackjackConfig = await getBlackjackConfig(db);
      const saasUsageAlert = await getSaasUsageAlertConfig(db);

      return sendSuccess(reply, {
        poolBalance: toMoneyString(poolBalance),
        drawCost: toMoneyString(drawCost),
        weightJitterEnabled: randomization.weightJitterEnabled,
        weightJitterPct: toMoneyString(randomization.weightJitterPct),
        bonusAutoReleaseEnabled: bonusRelease.bonusAutoReleaseEnabled,
        bonusUnlockWagerRatio: toMoneyString(
          bonusRelease.bonusUnlockWagerRatio,
        ),
        authFailureWindowMinutes: toMoneyString(
          authFailure.authFailureWindowMinutes,
        ),
        authFailureFreezeThreshold: toMoneyString(
          authFailure.authFailureFreezeThreshold,
        ),
        adminFailureFreezeThreshold: toMoneyString(
          authFailure.adminFailureFreezeThreshold,
        ),
        profileSecurityRewardAmount: toMoneyString(
          gamificationReward.profileSecurityRewardAmount,
        ),
        firstDrawRewardAmount: toMoneyString(
          gamificationReward.firstDrawRewardAmount,
        ),
        drawStreakDailyRewardAmount: toMoneyString(
          gamificationReward.drawStreakDailyRewardAmount,
        ),
        topUpStarterRewardAmount: toMoneyString(
          gamificationReward.topUpStarterRewardAmount,
        ),
        blackjackMinStake: blackjackConfig.minStake,
        blackjackMaxStake: blackjackConfig.maxStake,
        blackjackWinPayoutMultiplier: blackjackConfig.winPayoutMultiplier,
        blackjackPushPayoutMultiplier: blackjackConfig.pushPayoutMultiplier,
        blackjackNaturalPayoutMultiplier:
          blackjackConfig.naturalPayoutMultiplier,
        blackjackDealerHitsSoft17: blackjackConfig.dealerHitsSoft17,
        blackjackDoubleDownAllowed: blackjackConfig.doubleDownAllowed,
        saasUsageAlertMaxMinuteQps: toMoneyString(
          saasUsageAlert.maxMinuteQps,
        ),
        saasUsageAlertMaxSinglePayoutAmount: toMoneyString(
          saasUsageAlert.maxSinglePayoutAmount,
        ),
        saasUsageAlertMaxAntiExploitRatePct: toMoneyString(
          saasUsageAlert.maxAntiExploitRatePct,
        ),
      });
    },
  );

  protectedRoutes.patch(
    "/admin/config",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (_request, reply) => {
      return sendError(
        reply,
        409,
        "Direct config updates are disabled. Use config change requests instead.",
        undefined,
        API_ERROR_CODES.DIRECT_CONFIG_UPDATES_DISABLED,
      );
    },
  );

  protectedRoutes.post(
    "/admin/bonus-release",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        BonusReleaseRequestSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const payload = parsed.data;
        const bonusRelease = await getBonusReleaseConfig(db);
        if (bonusRelease.bonusAutoReleaseEnabled) {
          return sendError(
            reply,
            409,
            "Auto release is enabled.",
            undefined,
            API_ERROR_CODES.AUTO_RELEASE_ENABLED,
          );
        }

        const result = await releaseBonusManual({
          userId: payload.userId,
          amount: payload.amount,
        });
        await recordAdminAction(withAdminAuditContext(request, {
          adminId: request.admin?.adminId ?? null,
          action: "bonus_release_manual",
          targetType: "user",
          targetId: payload.userId,
          metadata: { amount: payload.amount },
        }));
        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(reply, error, "Bonus release failed.");
      }
    },
  );
}
