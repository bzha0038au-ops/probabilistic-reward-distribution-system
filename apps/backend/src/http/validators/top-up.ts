import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: {
    amount: { type: ['number', 'string'] },
    referenceId: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true },
  },
} as const;

export const validateTopUpCreate = createValidator(schema);
