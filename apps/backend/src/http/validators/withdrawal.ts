import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: {
    amount: { type: ['number', 'string'] },
    payoutMethodId: { type: ['number', 'string'], nullable: true },
    bankCardId: { type: ['number', 'string'], nullable: true },
    metadata: { type: 'object', nullable: true },
  },
} as const;

export const validateWithdrawalCreate = createValidator(schema);
