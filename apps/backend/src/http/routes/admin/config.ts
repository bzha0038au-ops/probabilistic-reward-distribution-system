import type { AppInstance } from '../types';
import {
  BonusReleaseRequestSchema,
  SystemConfigPatchSchema,
} from '@reward/shared-types';

import { db } from '../../../db';
import { releaseBonusManual } from '../../../modules/bonus/service';
import {
  getAuthFailureConfig,
  getBonusReleaseConfig,
  getDrawCost,
  getPoolBalance,
  getRandomizationConfig,
  setAuthFailureConfig,
  setBonusReleaseConfig,
  setDrawCost,
  setPoolBalance,
  setRandomizationConfig,
} from '../../../modules/system/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { toDecimal, toMoneyString } from '../../../shared/money';
import { parseSchema } from '../../../shared/validation';
import { sendError, sendSuccess } from '../../respond';
import { adminRateLimit, enforceAdminLimit, toObject } from './common';

export async function registerAdminConfigRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get('/admin/config', async (_request, reply) => {
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
  });

  protectedRoutes.patch(
    '/admin/config',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
    async (request, reply) => {
      const parsed = parseSchema(SystemConfigPatchSchema, toObject(request.body));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const payload = parsed.data;
      if (payload.poolBalance !== undefined) {
        const poolBalance = toDecimal(payload.poolBalance);
        if (poolBalance.lt(0)) {
          return sendError(reply, 400, 'Pool balance must be >= 0.');
        }
        await setPoolBalance(db, poolBalance);
      }

      if (payload.drawCost !== undefined) {
        const drawCost = toDecimal(payload.drawCost);
        if (drawCost.lt(0)) {
          return sendError(reply, 400, 'Draw cost must be >= 0.');
        }
        await setDrawCost(db, drawCost);
      }

      await setRandomizationConfig(db, {
        weightJitterEnabled: payload.weightJitterEnabled,
        weightJitterPct:
          payload.weightJitterPct !== undefined
            ? toDecimal(payload.weightJitterPct)
            : undefined,
      });

      await setBonusReleaseConfig(db, {
        bonusAutoReleaseEnabled: payload.bonusAutoReleaseEnabled,
        bonusUnlockWagerRatio:
          payload.bonusUnlockWagerRatio !== undefined
            ? toDecimal(payload.bonusUnlockWagerRatio)
            : undefined,
      });

      await setAuthFailureConfig(db, {
        authFailureWindowMinutes:
          payload.authFailureWindowMinutes !== undefined
            ? toDecimal(payload.authFailureWindowMinutes)
            : undefined,
        authFailureFreezeThreshold:
          payload.authFailureFreezeThreshold !== undefined
            ? toDecimal(payload.authFailureFreezeThreshold)
            : undefined,
        adminFailureFreezeThreshold:
          payload.adminFailureFreezeThreshold !== undefined
            ? toDecimal(payload.adminFailureFreezeThreshold)
            : undefined,
      });

      await recordAdminAction({
        adminId: request.admin?.userId ?? null,
        action: 'system_config_update',
        targetType: 'system_config',
        metadata: { ...payload },
        ip: request.ip,
      });

      return sendSuccess(reply, { ok: true });
    }
  );

  protectedRoutes.post(
    '/admin/bonus-release',
    { config: { rateLimit: adminRateLimit }, preHandler: [enforceAdminLimit] },
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
          adminId: request.admin?.userId ?? null,
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
