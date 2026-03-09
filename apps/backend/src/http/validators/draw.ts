import { createValidator } from '../../shared/validation';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clientNonce: { type: 'string', nullable: true, minLength: 1, maxLength: 128 },
  },
} as const;

export const validateDrawRequest = createValidator(schema);
