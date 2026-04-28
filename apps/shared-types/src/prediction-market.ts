import { z } from "zod";

import {
  LimitedPageSizeSchema,
  OffsetPageSchema,
  OptionalPositiveIntSchema,
} from "./common";

const DateLikeSchema = z.union([z.string(), z.date()]);

export const predictionMarketMechanismValues = ["pari_mutuel"] as const;

export const predictionMarketStatusValues = [
  "draft",
  "open",
  "locked",
  "resolved",
  "cancelled",
] as const;

export const predictionPositionStatusValues = [
  "open",
  "won",
  "lost",
  "refunded",
] as const;

export const predictionMarketPortfolioStatusValues = [
  "open",
  "resolved",
  "refunded",
] as const;

export const predictionMarketPortfolioFilterValues = [
  "all",
  "open",
  "resolved",
  "refunded",
] as const;

export const predictionMarketCategoryValues = [
  "crypto",
  "finance",
  "sports",
  "politics",
  "technology",
  "culture",
  "other",
] as const;

export const predictionMarketInvalidPolicyValues = [
  "refund_all",
  "manual_review",
] as const;

const hasUniqueOutcomeKeys = (
  outcomes: ReadonlyArray<{ key: string; label: string }>,
) => new Set(outcomes.map((outcome) => outcome.key)).size === outcomes.length;

const hasUniqueTags = (tags: ReadonlyArray<string>) =>
  new Set(tags).size === tags.length;

export const PredictionMarketMechanismSchema = z.enum(
  predictionMarketMechanismValues,
);
export type PredictionMarketMechanism = z.infer<
  typeof PredictionMarketMechanismSchema
>;

export const PredictionMarketStatusSchema = z.enum(
  predictionMarketStatusValues,
);
export type PredictionMarketStatus = z.infer<
  typeof PredictionMarketStatusSchema
>;

export const PredictionPositionStatusSchema = z.enum(
  predictionPositionStatusValues,
);
export type PredictionPositionStatus = z.infer<
  typeof PredictionPositionStatusSchema
>;

export const PredictionMarketPortfolioStatusSchema = z.enum(
  predictionMarketPortfolioStatusValues,
);
export type PredictionMarketPortfolioStatus = z.infer<
  typeof PredictionMarketPortfolioStatusSchema
>;

export const PredictionMarketPortfolioFilterSchema = z.enum(
  predictionMarketPortfolioFilterValues,
);
export type PredictionMarketPortfolioFilter = z.infer<
  typeof PredictionMarketPortfolioFilterSchema
>;

export const PredictionMarketCategorySchema = z.enum(
  predictionMarketCategoryValues,
);
export type PredictionMarketCategory = z.infer<
  typeof PredictionMarketCategorySchema
>;

export const PredictionMarketInvalidPolicySchema = z.enum(
  predictionMarketInvalidPolicyValues,
);
export type PredictionMarketInvalidPolicy = z.infer<
  typeof PredictionMarketInvalidPolicySchema
>;

export const PredictionMarketOutcomeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  label: z.string().trim().min(1).max(80),
});
export type PredictionMarketOutcome = z.infer<
  typeof PredictionMarketOutcomeSchema
>;

export const PredictionMarketTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
export type PredictionMarketTag = z.infer<typeof PredictionMarketTagSchema>;

export const PredictionMarketTagsSchema = z
  .array(PredictionMarketTagSchema)
  .min(1)
  .max(8)
  .refine(hasUniqueTags, {
    message: "Tags must be unique.",
  });
export type PredictionMarketTags = z.infer<typeof PredictionMarketTagsSchema>;

export const PredictionMarketRulesSchema = z.object({
  resolutionRules: z.string().trim().min(20).max(4000),
  sourceOfTruth: z.string().trim().min(3).max(500),
  category: PredictionMarketCategorySchema,
  tags: PredictionMarketTagsSchema,
  invalidPolicy: PredictionMarketInvalidPolicySchema,
});
export type PredictionMarketRules = z.infer<typeof PredictionMarketRulesSchema>;

export const PredictionMarketPoolSchema = z.object({
  outcomeKey: z.string(),
  label: z.string(),
  totalStakeAmount: z.string(),
  positionCount: z.number().int().nonnegative(),
});
export type PredictionMarketPool = z.infer<typeof PredictionMarketPoolSchema>;

export const PredictionPositionSchema = z.object({
  id: z.number().int(),
  marketId: z.number().int(),
  userId: z.number().int(),
  outcomeKey: z.string(),
  stakeAmount: z.string(),
  payoutAmount: z.string(),
  status: PredictionPositionStatusSchema,
  createdAt: DateLikeSchema,
  settledAt: DateLikeSchema.nullable(),
});
export type PredictionPosition = z.infer<typeof PredictionPositionSchema>;

export const PredictionMarketSummarySchema = z.object({
  id: z.number().int(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  roundKey: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  description: z.string().nullable(),
  resolutionRules: PredictionMarketRulesSchema.shape.resolutionRules,
  sourceOfTruth: PredictionMarketRulesSchema.shape.sourceOfTruth,
  category: PredictionMarketRulesSchema.shape.category,
  tags: PredictionMarketRulesSchema.shape.tags,
  invalidPolicy: PredictionMarketRulesSchema.shape.invalidPolicy,
  mechanism: PredictionMarketMechanismSchema,
  status: PredictionMarketStatusSchema,
  outcomes: z.array(PredictionMarketOutcomeSchema).min(2),
  outcomePools: z.array(PredictionMarketPoolSchema),
  totalPoolAmount: z.string(),
  winningOutcomeKey: z.string().nullable(),
  winningPoolAmount: z.string().nullable(),
  oracle: z.lazy(() => PredictionMarketOracleSchema).nullable(),
  opensAt: DateLikeSchema,
  locksAt: DateLikeSchema,
  resolvesAt: DateLikeSchema.nullable(),
  resolvedAt: DateLikeSchema.nullable(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type PredictionMarketSummary = z.infer<
  typeof PredictionMarketSummarySchema
>;

export const PredictionMarketDetailSchema =
  PredictionMarketSummarySchema.extend({
    userPositions: z.array(PredictionPositionSchema),
  });
export type PredictionMarketDetail = z.infer<
  typeof PredictionMarketDetailSchema
>;

export const PredictionMarketPortfolioMarketSchema =
  PredictionMarketSummarySchema.pick({
    id: true,
    slug: true,
    roundKey: true,
    title: true,
    description: true,
    resolutionRules: true,
    sourceOfTruth: true,
    category: true,
    tags: true,
    invalidPolicy: true,
    mechanism: true,
    status: true,
    outcomes: true,
    totalPoolAmount: true,
    winningOutcomeKey: true,
    winningPoolAmount: true,
    opensAt: true,
    locksAt: true,
    resolvesAt: true,
    resolvedAt: true,
    createdAt: true,
    updatedAt: true,
  });
export type PredictionMarketPortfolioMarket = z.infer<
  typeof PredictionMarketPortfolioMarketSchema
>;

export const PredictionMarketPortfolioItemSchema = z.object({
  portfolioStatus: PredictionMarketPortfolioStatusSchema,
  market: PredictionMarketPortfolioMarketSchema,
  positions: z.array(PredictionPositionSchema),
  positionCount: z.number().int().nonnegative(),
  totalStakeAmount: z.string(),
  openStakeAmount: z.string(),
  settledPayoutAmount: z.string(),
  refundedAmount: z.string(),
  lastActivityAt: DateLikeSchema,
});
export type PredictionMarketPortfolioItem = z.infer<
  typeof PredictionMarketPortfolioItemSchema
>;

export const PredictionMarketPortfolioSummarySchema = z.object({
  marketCount: z.number().int().nonnegative(),
  positionCount: z.number().int().nonnegative(),
  totalStakeAmount: z.string(),
  openStakeAmount: z.string(),
  settledPayoutAmount: z.string(),
  refundedAmount: z.string(),
});
export type PredictionMarketPortfolioSummary = z.infer<
  typeof PredictionMarketPortfolioSummarySchema
>;

export const PredictionMarketPortfolioQuerySchema = z.object({
  status: PredictionMarketPortfolioFilterSchema.optional(),
});
export type PredictionMarketPortfolioQuery = z.infer<
  typeof PredictionMarketPortfolioQuerySchema
>;

export const PredictionMarketHistoryQuerySchema = z.object({
  status: PredictionMarketPortfolioFilterSchema.optional(),
  page: OptionalPositiveIntSchema,
  limit: LimitedPageSizeSchema,
});
export type PredictionMarketHistoryQuery = z.infer<
  typeof PredictionMarketHistoryQuerySchema
>;

export const PredictionMarketPortfolioResponseSchema = z.object({
  items: z.array(PredictionMarketPortfolioItemSchema),
  summary: PredictionMarketPortfolioSummarySchema,
  status: PredictionMarketPortfolioFilterSchema,
});
export type PredictionMarketPortfolioResponse = z.infer<
  typeof PredictionMarketPortfolioResponseSchema
>;

export const PredictionMarketHistoryResponseSchema = OffsetPageSchema(
  PredictionMarketPortfolioItemSchema,
).extend({
  summary: PredictionMarketPortfolioSummarySchema,
  status: PredictionMarketPortfolioFilterSchema,
});
export type PredictionMarketHistoryResponse = z.infer<
  typeof PredictionMarketHistoryResponseSchema
>;

export const PredictionMarketPositionMutationResponseSchema = z.object({
  market: PredictionMarketDetailSchema,
  position: PredictionPositionSchema,
});
export type PredictionMarketPositionMutationResponse = z.infer<
  typeof PredictionMarketPositionMutationResponseSchema
>;

export const PredictionMarketOracleSchema = z.object({
  source: z.string().trim().min(1).max(64),
  externalRef: z.string().trim().min(1).max(128).nullable().optional(),
  reportedAt: DateLikeSchema.nullable().optional(),
  payloadHash: z.string().trim().min(1).max(191).nullable().optional(),
  payload: z.record(z.unknown()).nullable().optional(),
});
export type PredictionMarketOracle = z.infer<
  typeof PredictionMarketOracleSchema
>;

export const CreatePredictionMarketRequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    roundKey: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    resolutionRules: PredictionMarketRulesSchema.shape.resolutionRules,
    sourceOfTruth: PredictionMarketRulesSchema.shape.sourceOfTruth,
    category: PredictionMarketRulesSchema.shape.category,
    tags: PredictionMarketRulesSchema.shape.tags,
    invalidPolicy: PredictionMarketRulesSchema.shape.invalidPolicy,
    outcomes: z
      .array(PredictionMarketOutcomeSchema)
      .min(2)
      .max(16)
      .refine(hasUniqueOutcomeKeys, {
        message: "Outcome keys must be unique.",
      }),
    opensAt: DateLikeSchema.optional(),
    locksAt: DateLikeSchema,
    resolvesAt: DateLikeSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    const opensAt = value.opensAt ? new Date(value.opensAt) : new Date();
    const locksAt = new Date(value.locksAt);
    const resolvesAt = value.resolvesAt ? new Date(value.resolvesAt) : null;

    if (Number.isNaN(opensAt.valueOf())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "opensAt is invalid.",
        path: ["opensAt"],
      });
    }

    if (Number.isNaN(locksAt.valueOf())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "locksAt is invalid.",
        path: ["locksAt"],
      });
    }

    if (!Number.isNaN(opensAt.valueOf()) && !Number.isNaN(locksAt.valueOf())) {
      if (locksAt.getTime() <= opensAt.getTime()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "locksAt must be later than opensAt.",
          path: ["locksAt"],
        });
      }
    }

    if (resolvesAt && Number.isNaN(resolvesAt.valueOf())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolvesAt is invalid.",
        path: ["resolvesAt"],
      });
    }

    if (
      resolvesAt &&
      !Number.isNaN(resolvesAt.valueOf()) &&
      !Number.isNaN(locksAt.valueOf()) &&
      resolvesAt.getTime() < locksAt.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolvesAt must be later than or equal to locksAt.",
        path: ["resolvesAt"],
      });
    }
  });
export type CreatePredictionMarketRequest = z.infer<
  typeof CreatePredictionMarketRequestSchema
>;

export const PredictionMarketPositionRequestSchema = z.object({
  outcomeKey: z.string().trim().min(1).max(64),
  stakeAmount: z.string().trim().min(1).max(32),
});
export type PredictionMarketPositionRequest = z.infer<
  typeof PredictionMarketPositionRequestSchema
>;

export const SettlePredictionMarketRequestSchema = z.object({
  winningOutcomeKey: z.string().trim().min(1).max(64),
  oracle: PredictionMarketOracleSchema,
});
export type SettlePredictionMarketRequest = z.infer<
  typeof SettlePredictionMarketRequestSchema
>;

export const CancelPredictionMarketRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  oracle: PredictionMarketOracleSchema.nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});
export type CancelPredictionMarketRequest = z.infer<
  typeof CancelPredictionMarketRequestSchema
>;
