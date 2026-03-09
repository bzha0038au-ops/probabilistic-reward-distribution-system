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
  },
} as const;

export const validateSystemConfig = createValidator(schema);
