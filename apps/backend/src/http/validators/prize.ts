import { createValidator } from '../../shared/validation';

const createSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    stock: { type: ['number', 'string'] },
    weight: { type: ['number', 'string'] },
    poolThreshold: { type: ['number', 'string'] },
    rewardAmount: { type: ['number', 'string'] },
    isActive: { type: 'boolean' },
  },
} as const;

const updateSchema = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: createSchema.properties,
} as const;

export const validatePrizeCreate = createValidator(createSchema);
export const validatePrizeUpdate = createValidator(updateSchema);
