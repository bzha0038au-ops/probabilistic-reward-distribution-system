import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/config', () => ({
  getConfig: () => ({
    drawCost: 10,
  }),
}));

import {
  ADMIN_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  BONUS_AUTO_RELEASE_ENABLED_KEY,
  BONUS_UNLOCK_WAGER_RATIO_KEY,
  RANDOM_WEIGHT_JITTER_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_PCT_KEY,
} from './keys';

const { setConfigDecimal } = vi.hoisted(() => ({
  setConfigDecimal: vi.fn(async () => undefined),
}));

vi.mock('./store', () => ({
  setConfigDecimal,
}));

import {
  setAuthFailureConfig,
  setBonusReleaseConfig,
  setRandomizationConfig,
} from './commands';

describe('system config commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes randomization settings through setConfigDecimal', async () => {
    await setRandomizationConfig({} as never, {
      weightJitterEnabled: true,
      weightJitterPct: '2.50',
    });

    expect(setConfigDecimal).toHaveBeenCalledTimes(2);
    expect(setConfigDecimal).toHaveBeenNthCalledWith(
      1,
      {},
      RANDOM_WEIGHT_JITTER_ENABLED_KEY,
      1,
      'Enable weight jitter randomization'
    );
    expect(setConfigDecimal).toHaveBeenNthCalledWith(
      2,
      {},
      RANDOM_WEIGHT_JITTER_PCT_KEY,
      '2.50',
      'Weight jitter percentage'
    );
  });

  it('skips bonus updates that are not provided', async () => {
    await setBonusReleaseConfig({} as never, {
      bonusAutoReleaseEnabled: false,
    });

    expect(setConfigDecimal).toHaveBeenCalledTimes(1);
    expect(setConfigDecimal).toHaveBeenCalledWith(
      {},
      BONUS_AUTO_RELEASE_ENABLED_KEY,
      0,
      'Auto release bonus balance'
    );
    expect(setConfigDecimal).not.toHaveBeenCalledWith(
      {},
      BONUS_UNLOCK_WAGER_RATIO_KEY,
      expect.anything(),
      expect.any(String)
    );
  });

  it('writes all auth failure thresholds when present', async () => {
    await setAuthFailureConfig({} as never, {
      authFailureWindowMinutes: '15',
      authFailureFreezeThreshold: '5',
      adminFailureFreezeThreshold: '3',
    });

    expect(setConfigDecimal).toHaveBeenCalledTimes(3);
    expect(setConfigDecimal).toHaveBeenNthCalledWith(
      1,
      {},
      AUTH_FAILURE_WINDOW_MINUTES_KEY,
      '15',
      'Auth failure window minutes'
    );
    expect(setConfigDecimal).toHaveBeenNthCalledWith(
      2,
      {},
      AUTH_FAILURE_THRESHOLD_KEY,
      '5',
      'Auth failure threshold (user)'
    );
    expect(setConfigDecimal).toHaveBeenNthCalledWith(
      3,
      {},
      ADMIN_FAILURE_THRESHOLD_KEY,
      '3',
      'Auth failure threshold (admin)'
    );
  });
});
