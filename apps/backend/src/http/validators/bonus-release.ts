import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['userId'],
  additionalProperties: false,
  properties: {
    userId: { type: 'integer', minimum: 1 },
    amount: { type: ['number', 'string'], minimum: 0 },
  },
} as const;

export const validateBonusRelease = createValidator(schema);
