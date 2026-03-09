import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['cardholderName'],
  additionalProperties: false,
  properties: {
    cardholderName: { type: 'string', minLength: 2, maxLength: 160 },
    bankName: { type: 'string', nullable: true },
    brand: { type: 'string', nullable: true },
    last4: { type: 'string', nullable: true, pattern: '^\\d{4}$' },
    isDefault: { type: 'boolean' },
  },
} as const;

export const validateBankCardCreate = createValidator(schema);
