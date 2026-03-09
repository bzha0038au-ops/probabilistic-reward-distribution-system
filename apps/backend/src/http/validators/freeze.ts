import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['userId'],
  additionalProperties: false,
  properties: {
    userId: { type: 'integer', minimum: 1 },
    reason: { type: 'string' },
  },
} as const;

export const validateFreezeCreate = createValidator(schema);
