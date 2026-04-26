import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['chain', 'network', 'token', 'address'],
  additionalProperties: false,
  properties: {
    chain: { type: 'string', minLength: 2, maxLength: 64 },
    network: { type: 'string', minLength: 2, maxLength: 64 },
    token: { type: 'string', minLength: 2, maxLength: 64 },
    address: { type: 'string', minLength: 8, maxLength: 191 },
    label: { type: 'string', nullable: true, maxLength: 120 },
    isDefault: { type: 'boolean' },
    metadata: { type: 'object', nullable: true },
  },
} as const;

export const validateCryptoWithdrawAddressCreate = createValidator(schema);
