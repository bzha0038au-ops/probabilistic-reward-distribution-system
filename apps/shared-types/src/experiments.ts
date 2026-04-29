import { z } from "zod";

export const ExperimentKeySchema = z.string().trim().min(1).max(128);
export type ExperimentKey = z.infer<typeof ExperimentKeySchema>;

export const ExperimentVariantKeySchema = z.string().trim().min(1).max(64);
export type ExperimentVariantKey = z.infer<typeof ExperimentVariantKeySchema>;

export const ExperimentPayloadSchema = z.record(z.string(), z.unknown());
export type ExperimentPayload = z.infer<typeof ExperimentPayloadSchema>;

export const ExperimentVariantDefinitionSchema = z
  .object({
    key: ExperimentVariantKeySchema,
    weight: z.coerce.number().int().positive().max(1_000_000),
    payload: ExperimentPayloadSchema.optional().default({}),
  })
  .strict();
export type ExperimentVariantDefinition = z.infer<
  typeof ExperimentVariantDefinitionSchema
>;

export const experimentStatusValues = ["active", "paused"] as const;
export const ExperimentStatusSchema = z.enum(experimentStatusValues);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

const DateLikeSchema = z.union([z.string(), z.date()]);

export const ExperimentDefinitionSchema = z
  .object({
    key: ExperimentKeySchema,
    description: z.string().trim().max(255).nullable().optional(),
    status: ExperimentStatusSchema,
    defaultVariantKey: ExperimentVariantKeySchema,
    variants: z.array(ExperimentVariantDefinitionSchema).min(1),
    createdAt: DateLikeSchema,
    updatedAt: DateLikeSchema,
  })
  .strict();
export type ExperimentDefinition = z.infer<typeof ExperimentDefinitionSchema>;

export const ExperimentBindingSchema = z
  .object({
    expKey: ExperimentKeySchema,
  })
  .strict();
export type ExperimentBinding = z.infer<typeof ExperimentBindingSchema>;

export const experimentResolutionSourceValues = [
  "assignment",
  "default",
  "inactive",
  "missing",
] as const;
export const ExperimentResolutionSourceSchema = z.enum(
  experimentResolutionSourceValues,
);
export type ExperimentResolutionSource = z.infer<
  typeof ExperimentResolutionSourceSchema
>;

export const ExperimentVariantResponseSchema = z
  .object({
    expKey: ExperimentKeySchema,
    variantKey: ExperimentVariantKeySchema,
    payload: ExperimentPayloadSchema,
    source: ExperimentResolutionSourceSchema,
    assignedAt: DateLikeSchema.nullable(),
  })
  .strict();
export type ExperimentVariantResponse = z.infer<
  typeof ExperimentVariantResponseSchema
>;
