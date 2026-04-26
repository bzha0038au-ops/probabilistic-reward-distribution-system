import type { AppInstance } from '../types';
import { BonusReleaseRequestSchema } from '@reward/shared-types';

import { db } from '../../../db';
import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { releaseBonusManual } from '../../../modules/bonus/service';
import {
  getAuthFailureConfig,
  getBonusReleaseConfig,
  getDrawCost,
  getPoolBalance,
  getRandomizationConfig,
} from '../../../modules/system/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { toMoneyString } from '../../../shared/money';
import { parseSchema } from '../../../shared/validation';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import { adminRateLimit, enforceAdminLimit, toObject } from './common';

export async function registerAdminConfigRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/config',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (_request, reply) => {
      const poolBalance = await getPoolBalance(db);
      const drawCost = await getDrawCost(db);
      const randomization = await getRandomizationConfig(db);
      const bonusRelease = await getBonusReleaseConfig(db);
      const authFailure = await getAuthFailureConfig(db);

      return sendSuccess(reply, {
        poolBalance: toMoneyString(poolBalance),
        drawCost: toMoneyString(drawCost),
        weightJitterEnabled: randomization.weightJitterEnabled,
        weightJitterPct: toMoneyString(randomization.weightJitterPct),
        bonusAutoReleaseEnabled: bonusRelease.bonusAutoReleaseEnabled,
        bonusUnlockWagerRatio: toMoneyString(bonusRelease.bonusUnlockWagerRatio),
        authFailureWindowMinutes: toMoneyString(authFailure.authFailureWindowMinutes),
        authFailureFreezeThreshold: toMoneyString(
          authFailure.authFailureFreezeThreshold
        ),
        adminFailureFreezeThreshold: toMoneyString(
          authFailure.adminFailureFreezeThreshold
        ),
      });
    }
  );

  protectedRoutes.patch(
    '/admin/config',
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
        'Direct config updates are disabled. Use config change requests instead.'
      );
    }
  );

  protectedRoutes.post(
    '/admin/bonus-release',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(BonusReleaseRequestSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      try {
        const payload = parsed.data;
        const bonusRelease = await getBonusReleaseConfig(db);
        if (bonusRelease.bonusAutoReleaseEnabled) {
          return sendError(reply, 409, 'Auto release is enabled.');
        }

        const result = await releaseBonusManual({
          userId: payload.userId,
          amount: payload.amount,
        });
        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: 'bonus_release_manual',
          targetType: 'user',
          targetId: payload.userId,
          metadata: { amount: payload.amount },
          ip: request.ip,
        });
        return sendSuccess(reply, result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Bonus release failed.';
        return sendError(reply, 422, message);
      }
    }
  );
}
