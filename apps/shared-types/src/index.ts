import { z } from 'zod';

export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.array(z.string()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    requestId: z.string().optional(),
  });

export const ApiFailureSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
  requestId: z.string().optional(),
});

export const ApiEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([ApiSuccessSchema(dataSchema), ApiFailureSchema]);

export const AuthCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
});

export const AdminSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
});

export const UserSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  user: UserSchema,
});

export const AdminSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  user: AdminSchema,
});
