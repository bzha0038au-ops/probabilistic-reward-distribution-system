import Ajv, { type AnySchema, type ErrorObject } from 'ajv';

export const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  removeAdditional: 'failing',
});

export const formatValidationErrors = (errors?: ErrorObject[] | null) => {
  if (!errors || errors.length === 0) return [];
  return errors.map((error) => {
    const path = error.instancePath ? error.instancePath : 'body';
    const message = error.message ?? 'is invalid';
    return `${path} ${message}`.trim();
  });
};

export const createValidator = <T = unknown>(schema: AnySchema) => {
  const validate = ajv.compile<T>(schema);

  return (payload: unknown) => {
    const isValid = validate(payload);
    return {
      isValid: Boolean(isValid),
      errors: formatValidationErrors(validate.errors),
    };
  };
};
