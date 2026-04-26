import type Decimal from 'decimal.js';

import { getConfig } from '../../shared/config';
import { toDecimal } from '../../shared/money';
import {
  ANALYTICS_POOL_PUBLIC_KEY,
  ANALYTICS_PUBLIC_STATS_KEY,
  ANALYTICS_STATS_DELAY_KEY,
  ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY,
  ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY,
  ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
  AUTH_FAILURE_THRESHOLD_KEY,
  AUTH_FAILURE_WINDOW_MINUTES_KEY,
  ADMIN_FAILURE_THRESHOLD_KEY,
  BONUS_AUTO_RELEASE_ENABLED_KEY,
  BONUS_UNLOCK_WAGER_RATIO_KEY,
  DRAW_COOLDOWN_SECONDS_KEY,
  DRAW_ENABLED_KEY,
  ECONOMY_BONUS_EXPIRE_DAYS_KEY,
  ECONOMY_HOUSE_BANKROLL_KEY,
  ECONOMY_MARKETING_BUDGET_KEY,
  JACKPOT_PROB_BOOST_KEY,
  MAX_DRAW_COST_KEY,
  MAX_DRAW_PER_DAY_KEY,
  MAX_DRAW_PER_REQUEST_KEY,
  MIN_DRAW_COST_KEY,
  PAYOUT_COOLDOWN_SECONDS_KEY,
  PAYOUT_MAX_BIG_PER_DAY_KEY,
  PAYOUT_MAX_BIG_PER_HOUR_KEY,
  PAYOUT_MAX_TOTAL_PER_HOUR_KEY,
  PAYMENT_DEPOSIT_ENABLED_KEY,
  PAYMENT_MAX_DEPOSIT_KEY,
  PAYMENT_MAX_WITHDRAW_KEY,
  PAYMENT_MIN_DEPOSIT_KEY,
  PAYMENT_MIN_WITHDRAW_KEY,
  PAYMENT_WITHDRAW_ENABLED_KEY,
  PITY_BOOST_PCT_KEY,
  PITY_ENABLED_KEY,
  PITY_MAX_BOOST_PCT_KEY,
  PITY_THRESHOLD_KEY,
  POOL_EPOCH_SECONDS_KEY,
  POOL_MAX_PAYOUT_RATIO_KEY,
  POOL_MIN_RESERVE_KEY,
  POOL_NOISE_ENABLED_KEY,
  POOL_NOISE_RANGE_KEY,
  PROBABILITY_SCALE_KEY,
  PROB_WEIGHT_JITTER_ENABLED_KEY,
  PROB_WEIGHT_JITTER_RANGE_KEY,
  RANDOM_WEIGHT_JITTER_ENABLED_KEY,
  RANDOM_WEIGHT_JITTER_PCT_KEY,
  REWARD_DAILY_AMOUNT_KEY,
  REWARD_DAILY_ENABLED_KEY,
  REWARD_REFERRAL_AMOUNT_KEY,
  REWARD_REFERRAL_ENABLED_KEY,
  REWARD_SIGNUP_AMOUNT_KEY,
  REWARD_SIGNUP_ENABLED_KEY,
  SYSTEM_DEFAULT_LANGUAGE_KEY,
  SYSTEM_LOGIN_ENABLED_KEY,
  SYSTEM_MAINTENANCE_MODE_KEY,
  SYSTEM_REGISTRATION_ENABLED_KEY,
  SYSTEM_SITE_NAME_KEY,
  WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY,
  WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY,
  WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY,
  WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY,
  WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY,
} from './keys';
import {
  type DbExecutor,
  getConfigBool,
  getConfigDecimal,
  getConfigJson,
  getConfigString,
  setConfigDecimal,
} from './store';

const readNumericRange = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return { min: 0, max: 0 };
  }

  const min = Reflect.get(value, 'min');
  const max = Reflect.get(value, 'max');

  return {
    min: typeof min === 'number' ? min : 0,
    max: typeof max === 'number' ? max : 0,
  };
};

export async function getRandomizationConfig(db: DbExecutor) {
  const enabledValue = await getConfigDecimal(db, RANDOM_WEIGHT_JITTER_ENABLED_KEY, 0);
  const pctValue = await getConfigDecimal(db, RANDOM_WEIGHT_JITTER_PCT_KEY, 0);

  return {
    weightJitterEnabled: enabledValue.gt(0),
    weightJitterPct: pctValue,
  };
}

export async function getBonusReleaseConfig(db: DbExecutor) {
  const enabledValue = await getConfigDecimal(db, BONUS_AUTO_RELEASE_ENABLED_KEY, 0);
  const ratioValue = await getConfigDecimal(db, BONUS_UNLOCK_WAGER_RATIO_KEY, 1);

  return {
    bonusAutoReleaseEnabled: enabledValue.gt(0),
    bonusUnlockWagerRatio: ratioValue,
  };
}

export async function getSystemFlags(db: DbExecutor) {
  const [siteName, maintenanceMode, registrationEnabled, loginEnabled, defaultLanguage] =
    await Promise.all([
      getConfigString(db, SYSTEM_SITE_NAME_KEY, 'Prize Pool & Probability Engine System'),
      getConfigBool(db, SYSTEM_MAINTENANCE_MODE_KEY, false),
      getConfigBool(db, SYSTEM_REGISTRATION_ENABLED_KEY, true),
      getConfigBool(db, SYSTEM_LOGIN_ENABLED_KEY, true),
      getConfigString(db, SYSTEM_DEFAULT_LANGUAGE_KEY, 'en'),
    ]);

  return {
    siteName,
    maintenanceMode,
    registrationEnabled,
    loginEnabled,
    defaultLanguage,
  };
}

export async function getDrawSystemConfig(db: DbExecutor) {
  const [drawEnabled, minDrawCost, maxDrawCost, maxDrawPerRequest, maxDrawPerDay, cooldownSeconds] =
    await Promise.all([
      getConfigBool(db, DRAW_ENABLED_KEY, true),
      getConfigDecimal(db, MIN_DRAW_COST_KEY, 0),
      getConfigDecimal(db, MAX_DRAW_COST_KEY, 0),
      getConfigDecimal(db, MAX_DRAW_PER_REQUEST_KEY, 1),
      getConfigDecimal(db, MAX_DRAW_PER_DAY_KEY, 0),
      getConfigDecimal(db, DRAW_COOLDOWN_SECONDS_KEY, 0),
    ]);

  return {
    drawEnabled,
    minDrawCost,
    maxDrawCost,
    maxDrawPerRequest,
    maxDrawPerDay,
    cooldownSeconds,
  };
}

export async function getPoolSystemConfig(db: DbExecutor) {
  const [minReserve, maxPayoutRatio, noiseEnabled, noiseRange, epochSeconds] =
    await Promise.all([
      getConfigDecimal(db, POOL_MIN_RESERVE_KEY, 0),
      getConfigDecimal(db, POOL_MAX_PAYOUT_RATIO_KEY, 0),
      getConfigBool(db, POOL_NOISE_ENABLED_KEY, false),
      getConfigJson(db, POOL_NOISE_RANGE_KEY, { min: 0, max: 0 }),
      getConfigDecimal(db, POOL_EPOCH_SECONDS_KEY, 0),
    ]);

  return {
    minReserve,
    maxPayoutRatio,
    noiseEnabled,
    noiseRange: readNumericRange(noiseRange),
    epochSeconds,
  };
}

export async function getPayoutControlConfig(db: DbExecutor) {
  const [maxBigPerHour, maxBigPerDay, maxTotalPerHour, cooldownSeconds] =
    await Promise.all([
      getConfigDecimal(db, PAYOUT_MAX_BIG_PER_HOUR_KEY, 0),
      getConfigDecimal(db, PAYOUT_MAX_BIG_PER_DAY_KEY, 0),
      getConfigDecimal(db, PAYOUT_MAX_TOTAL_PER_HOUR_KEY, 0),
      getConfigDecimal(db, PAYOUT_COOLDOWN_SECONDS_KEY, 0),
    ]);

  return {
    maxBigPerHour,
    maxBigPerDay,
    maxTotalPerHour,
    cooldownSeconds,
  };
}

export async function getProbabilityControlConfig(db: DbExecutor) {
  const [
    weightJitterEnabled,
    weightJitterRange,
    probabilityScale,
    jackpotBoost,
    pityEnabled,
    pityThreshold,
    pityBoostPct,
    pityMaxBoostPct,
  ] = await Promise.all([
    getConfigBool(db, PROB_WEIGHT_JITTER_ENABLED_KEY, false),
    getConfigJson(db, PROB_WEIGHT_JITTER_RANGE_KEY, { min: 0, max: 0 }),
    getConfigDecimal(db, PROBABILITY_SCALE_KEY, 1),
    getConfigDecimal(db, JACKPOT_PROB_BOOST_KEY, 0),
    getConfigBool(db, PITY_ENABLED_KEY, false),
    getConfigDecimal(db, PITY_THRESHOLD_KEY, 0),
    getConfigDecimal(db, PITY_BOOST_PCT_KEY, 0),
    getConfigDecimal(db, PITY_MAX_BOOST_PCT_KEY, 0),
  ]);

  return {
    weightJitterEnabled,
    weightJitterRange: readNumericRange(weightJitterRange),
    probabilityScale,
    jackpotProbabilityBoost: jackpotBoost,
    pityEnabled,
    pityThreshold,
    pityBoostPct,
    pityMaxBoostPct,
  };
}

export async function getEconomyConfig(db: DbExecutor) {
  const [houseBankroll, marketingBudget, bonusExpireDays] = await Promise.all([
    getConfigDecimal(db, ECONOMY_HOUSE_BANKROLL_KEY, 0),
    getConfigDecimal(db, ECONOMY_MARKETING_BUDGET_KEY, 0),
    getConfigDecimal(db, ECONOMY_BONUS_EXPIRE_DAYS_KEY, 0),
  ]);

  return {
    houseBankroll,
    marketingBudget,
    bonusExpireDays,
  };
}

export async function consumeMarketingBudget(db: DbExecutor, amount: Decimal.Value) {
  const current = await getConfigDecimal(db, ECONOMY_MARKETING_BUDGET_KEY, 0, true);
  const requested = toDecimal(amount);
  if (current.lte(0)) {
    return { allowed: true, remaining: current };
  }
  if (requested.gt(current)) {
    return { allowed: false, remaining: current };
  }
  const next = current.minus(requested);
  await setConfigDecimal(db, ECONOMY_MARKETING_BUDGET_KEY, next, 'Marketing budget');
  return { allowed: true, remaining: next };
}

export async function getAntiAbuseConfig(db: DbExecutor) {
  const [maxAccountsPerIp, minWagerBeforeWithdraw, suspiciousThreshold, autoFreeze] =
    await Promise.all([
      getConfigDecimal(db, ANTI_ABUSE_MAX_ACCOUNTS_PER_IP_KEY, 0),
      getConfigDecimal(db, ANTI_ABUSE_MIN_WAGER_BEFORE_WITHDRAW_KEY, 0),
      getConfigDecimal(db, ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY, 0),
      getConfigBool(db, ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY, false),
    ]);

  return {
    maxAccountsPerIp,
    minWagerBeforeWithdraw,
    suspiciousThreshold,
    autoFreeze,
  };
}

export async function getPaymentConfig(db: DbExecutor) {
  const [depositEnabled, withdrawEnabled, minDepositAmount, maxDepositAmount, minWithdrawAmount, maxWithdrawAmount] =
    await Promise.all([
      getConfigBool(db, PAYMENT_DEPOSIT_ENABLED_KEY, true),
      getConfigBool(db, PAYMENT_WITHDRAW_ENABLED_KEY, true),
      getConfigDecimal(db, PAYMENT_MIN_DEPOSIT_KEY, 0),
      getConfigDecimal(db, PAYMENT_MAX_DEPOSIT_KEY, 0),
      getConfigDecimal(db, PAYMENT_MIN_WITHDRAW_KEY, 0),
      getConfigDecimal(db, PAYMENT_MAX_WITHDRAW_KEY, 0),
    ]);

  return {
    depositEnabled,
    withdrawEnabled,
    minDepositAmount,
    maxDepositAmount,
    minWithdrawAmount,
    maxWithdrawAmount,
  };
}

export async function getWithdrawalRiskConfig(db: DbExecutor) {
  const [
    newCardFirstWithdrawalReviewEnabled,
    largeAmountSecondApprovalThreshold,
    sharedIpUserThreshold,
    sharedDeviceUserThreshold,
    sharedPayoutUserThreshold,
  ] = await Promise.all([
    getConfigBool(db, WITHDRAW_RISK_NEW_CARD_REVIEW_ENABLED_KEY, true),
    getConfigDecimal(
      db,
      WITHDRAW_RISK_LARGE_AMOUNT_SECOND_APPROVAL_THRESHOLD_KEY,
      500
    ),
    getConfigDecimal(db, WITHDRAW_RISK_SHARED_IP_USER_THRESHOLD_KEY, 3),
    getConfigDecimal(db, WITHDRAW_RISK_SHARED_DEVICE_USER_THRESHOLD_KEY, 2),
    getConfigDecimal(db, WITHDRAW_RISK_SHARED_PAYOUT_USER_THRESHOLD_KEY, 2),
  ]);

  return {
    newCardFirstWithdrawalReviewEnabled,
    largeAmountSecondApprovalThreshold,
    sharedIpUserThreshold,
    sharedDeviceUserThreshold,
    sharedPayoutUserThreshold,
  };
}

export async function getRewardEventConfig(db: DbExecutor) {
  const [signupEnabled, signupAmount, referralEnabled, referralAmount, dailyEnabled, dailyAmount] =
    await Promise.all([
      getConfigBool(db, REWARD_SIGNUP_ENABLED_KEY, false),
      getConfigDecimal(db, REWARD_SIGNUP_AMOUNT_KEY, 0),
      getConfigBool(db, REWARD_REFERRAL_ENABLED_KEY, false),
      getConfigDecimal(db, REWARD_REFERRAL_AMOUNT_KEY, 0),
      getConfigBool(db, REWARD_DAILY_ENABLED_KEY, false),
      getConfigDecimal(db, REWARD_DAILY_AMOUNT_KEY, 0),
    ]);

  return {
    signupEnabled,
    signupAmount,
    referralEnabled,
    referralAmount,
    dailyEnabled,
    dailyAmount,
  };
}

export async function getAnalyticsConfig(db: DbExecutor) {
  const [statsDelay, publicStatsEnabled, poolBalancePublic] = await Promise.all([
    getConfigDecimal(db, ANALYTICS_STATS_DELAY_KEY, 0),
    getConfigBool(db, ANALYTICS_PUBLIC_STATS_KEY, false),
    getConfigBool(db, ANALYTICS_POOL_PUBLIC_KEY, false),
  ]);

  return {
    statsVisibilityDelayMinutes: statsDelay,
    publicStatsEnabled,
    poolBalancePublic,
  };
}

export async function getAuthFailureConfig(db: DbExecutor) {
  const defaults = getConfig();
  const windowMinutes = await getConfigDecimal(
    db,
    AUTH_FAILURE_WINDOW_MINUTES_KEY,
    defaults.authFailureWindowMinutes
  );
  const userThreshold = await getConfigDecimal(
    db,
    AUTH_FAILURE_THRESHOLD_KEY,
    defaults.authFailureFreezeThreshold
  );
  const adminThreshold = await getConfigDecimal(
    db,
    ADMIN_FAILURE_THRESHOLD_KEY,
    defaults.adminFailureFreezeThreshold
  );

  return {
    authFailureWindowMinutes: windowMinutes,
    authFailureFreezeThreshold: userThreshold,
    adminFailureFreezeThreshold: adminThreshold,
  };
}
