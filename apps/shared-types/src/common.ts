import { z } from 'zod';

const emptyToUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
};

export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export const CursorDirectionSchema = z.enum(['next', 'prev']);
export type CursorDirection = z.infer<typeof CursorDirectionSchema>;

export const OptionalIntSchema = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) return undefined;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : normalized;
  },
  z.number().int().optional()
);

export const PositiveIntSchema = z.preprocess(
  (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  },
  z.number().int().positive()
);

export const OptionalPositiveIntSchema = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) return undefined;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : normalized;
  },
  z.number().int().positive().optional()
);

export const LimitedPageSizeSchema = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) return undefined;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : normalized;
  },
  z.number().int().min(1).max(200).optional()
);

export const MoneyLikeSchema = z.union([z.string(), z.number()]);
export const OptionalMoneyLikeSchema = MoneyLikeSchema.optional();
export const OptionalBooleanSchema = z.boolean().optional();
export const OptionalStringSchema = z.string().optional();

export const OptionalDateFilterSchema = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) return undefined;
    if (typeof normalized === 'number') return normalized;
    if (typeof normalized === 'string') return normalized;
    return value;
  },
  z.union([z.string(), z.number()]).optional()
);

export const CursorTokenSchema = z.string().min(1);
export type CursorToken = z.infer<typeof CursorTokenSchema>;

export const CursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    hasPrevious: z.boolean(),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    direction: CursorDirectionSchema,
    sort: SortOrderSchema,
  });

export const OffsetPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
  });
