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
  traceId?: string;
  status?: number;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  requestId?: string;
  traceId?: string;
  status?: number;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    requestId: z.string().optional(),
    traceId: z.string().optional(),
    status: z.number().int().optional(),
  });

export const ApiFailureSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  status: z.number().int().optional(),
});

export const ApiEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([ApiSuccessSchema(dataSchema), ApiFailureSchema]);
