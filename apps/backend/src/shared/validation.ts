import Ajv, { type AnySchema, type ErrorObject } from 'ajv';

export const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
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

type SchemaIssue = {
  path: Array<string | number>;
  message: string;
};

type SchemaParseSuccess<T> = {
  success: true;
  data: T;
};

type SchemaParseFailure = {
  success: false;
  error: {
    issues: SchemaIssue[];
  };
};

type SafeParseSchema<T> = {
  safeParse(payload: unknown): SchemaParseSuccess<T> | SchemaParseFailure;
};

const formatSchemaIssues = (issues: SchemaIssue[]) =>
  issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
    return `${path} ${issue.message}`.trim();
  });

export const parseSchema = <T>(schema: SafeParseSchema<T>, payload: unknown) => {
  const result = schema.safeParse(payload);
  if (result.success) {
    return {
      isValid: true as const,
      data: result.data,
      errors: [] as string[],
    };
  }

  return {
    isValid: false as const,
    errors: formatSchemaIssues(result.error.issues),
  };
};
