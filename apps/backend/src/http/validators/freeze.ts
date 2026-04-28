import { createValidator } from '../../shared/validation';
import {
  userFreezeReasonValues,
  userFreezeScopeValues,
} from '@reward/shared-types/risk';

const schema = {
  type: 'object',
  required: ['userId'],
  additionalProperties: false,
  properties: {
    userId: { type: 'integer', minimum: 1 },
    reason: { type: 'string', enum: [...userFreezeReasonValues] },
    scope: { type: 'string', enum: [...userFreezeScopeValues] },
  },
} as const;

export const validateFreezeCreate = createValidator(schema);
