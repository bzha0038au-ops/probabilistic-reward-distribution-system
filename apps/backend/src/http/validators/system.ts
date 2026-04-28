import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: {
    poolBalance: { type: ['number', 'string'], minimum: 0 },
    drawCost: { type: ['number', 'string'], minimum: 0 },
    weightJitterEnabled: { type: 'boolean' },
    weightJitterPct: { type: ['number', 'string'], minimum: 0, maximum: 0.5 },
    bonusAutoReleaseEnabled: { type: 'boolean' },
    bonusUnlockWagerRatio: { type: ['number', 'string'], minimum: 0 },
    authFailureWindowMinutes: { type: ['number', 'string'], minimum: 0 },
    authFailureFreezeThreshold: { type: ['number', 'string'], minimum: 0 },
    adminFailureFreezeThreshold: { type: ['number', 'string'], minimum: 0 },
    profileSecurityRewardAmount: { type: ['number', 'string'], minimum: 0 },
    firstDrawRewardAmount: { type: ['number', 'string'], minimum: 0 },
    drawStreakDailyRewardAmount: { type: ['number', 'string'], minimum: 0 },
    topUpStarterRewardAmount: { type: ['number', 'string'], minimum: 0 },
    blackjackMinStake: { type: ['number', 'string'], minimum: 0 },
    blackjackMaxStake: { type: ['number', 'string'], minimum: 0 },
    blackjackWinPayoutMultiplier: { type: ['number', 'string'], minimum: 0 },
    blackjackPushPayoutMultiplier: { type: ['number', 'string'], minimum: 0 },
    blackjackNaturalPayoutMultiplier: { type: ['number', 'string'], minimum: 0 },
    blackjackDealerHitsSoft17: { type: 'boolean' },
    blackjackDoubleDownAllowed: { type: 'boolean' },
    blackjackSplitAcesAllowed: { type: 'boolean' },
    blackjackHitSplitAcesAllowed: { type: 'boolean' },
    blackjackResplitAllowed: { type: 'boolean' },
    blackjackMaxSplitHands: { type: 'integer', minimum: 2, maximum: 8 },
    blackjackSplitTenValueCardsAllowed: { type: 'boolean' },
    saasUsageAlertMaxMinuteQps: { type: ['number', 'string'], minimum: 0 },
    saasUsageAlertMaxSinglePayoutAmount: { type: ['number', 'string'], minimum: 0 },
    saasUsageAlertMaxAntiExploitRatePct: {
      type: ['number', 'string'],
      minimum: 0,
      maximum: 100,
    },
  },
} as const;

export const validateSystemConfig = createValidator(schema);
