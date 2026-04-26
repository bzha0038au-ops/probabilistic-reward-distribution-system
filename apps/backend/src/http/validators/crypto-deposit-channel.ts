import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['chain', 'network', 'token', 'receiveAddress'],
  additionalProperties: false,
  properties: {
    providerId: { type: ['number', 'string'], nullable: true },
    chain: { type: 'string', minLength: 2, maxLength: 64 },
    network: { type: 'string', minLength: 2, maxLength: 64 },
    token: { type: 'string', minLength: 2, maxLength: 64 },
    receiveAddress: { type: 'string', minLength: 8, maxLength: 191 },
    qrCodeUrl: { type: 'string', nullable: true },
    memoRequired: { type: 'boolean' },
    memoValue: { type: 'string', nullable: true, maxLength: 191 },
    minConfirmations: { type: ['number', 'string'], nullable: true },
    isActive: { type: 'boolean' },
  },
} as const;

export const validateCryptoDepositChannelCreate = createValidator(schema);
