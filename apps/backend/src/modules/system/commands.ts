import type Decimal from 'decimal.js';

import {
  ADMIN_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  BONUS_AUTO_RELEASE_ENABLED_KEY,
  BONUS_UNLOCK_WAGER_RATIO_KEY,
  RANDOM_WEIGHT_JITTER_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_PCT_KEY,
} from './keys';
import { type DbExecutor, setConfigDecimal } from './store';

export async function setRandomizationConfig(
  db: DbExecutor,
  config: { weightJitterEnabled?: boolean; weightJitterPct?: Decimal.Value }
) {
  const updates: Promise<void>[] = [];
  if (typeof config.weightJitterEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        RANDOM_WEIGHT_JITTER_ENABLED_KEY,
        config.weightJitterEnabled ? 1 : 0,
        'Enable weight jitter randomization'
      )
    );
  }
  if (config.weightJitterPct !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        RANDOM_WEIGHT_JITTER_PCT_KEY,
        config.weightJitterPct,
        'Weight jitter percentage'
      )
    );
  }

  await Promise.all(updates);
}

export async function setBonusReleaseConfig(
  db: DbExecutor,
  config: { bonusAutoReleaseEnabled?: boolean; bonusUnlockWagerRatio?: Decimal.Value }
) {
  const updates: Promise<void>[] = [];

  if (typeof config.bonusAutoReleaseEnabled === 'boolean') {
    updates.push(
      setConfigDecimal(
        db,
        BONUS_AUTO_RELEASE_ENABLED_KEY,
        config.bonusAutoReleaseEnabled ? 1 : 0,
        'Auto release bonus balance'
      )
    );
  }

  if (config.bonusUnlockWagerRatio !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        BONUS_UNLOCK_WAGER_RATIO_KEY,
        config.bonusUnlockWagerRatio,
        'Bonus unlock wager ratio'
      )
    );
  }

  await Promise.all(updates);
}

export async function setAuthFailureConfig(
  db: DbExecutor,
  config: {
    authFailureWindowMinutes?: Decimal.Value;
    authFailureFreezeThreshold?: Decimal.Value;
    adminFailureFreezeThreshold?: Decimal.Value;
  }
) {
  const updates: Promise<void>[] = [];

  if (config.authFailureWindowMinutes !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        AUTH_FAILURE_WINDOW_MINUTES_KEY,
        config.authFailureWindowMinutes,
        'Auth failure window minutes'
      )
    );
  }
  if (config.authFailureFreezeThreshold !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        AUTH_FAILURE_THRESHOLD_KEY,
        config.authFailureFreezeThreshold,
        'Auth failure threshold (user)'
      )
    );
  }
  if (config.adminFailureFreezeThreshold !== undefined) {
    updates.push(
      setConfigDecimal(
        db,
        ADMIN_FAILURE_THRESHOLD_KEY,
        config.adminFailureFreezeThreshold,
        'Auth failure threshold (admin)'
      )
    );
  }

  await Promise.all(updates);
}
