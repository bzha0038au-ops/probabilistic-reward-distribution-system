import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['channelId', 'amountClaimed', 'txHash'],
  additionalProperties: false,
  properties: {
    channelId: { type: ['number', 'string'] },
    amountClaimed: { type: ['number', 'string'] },
    txHash: { type: 'string', minLength: 8, maxLength: 191 },
    fromAddress: { type: 'string', nullable: true },
    screenshotUrl: { type: 'string', nullable: true },
    memo: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true },
  },
} as const;

export const validateCryptoDepositCreate = createValidator(schema);
