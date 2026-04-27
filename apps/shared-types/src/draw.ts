import { z } from 'zod';

export const drawStatusValues = [
  'miss',
  'won',
  'out_of_stock',
  'budget_exhausted',
  'payout_limited',
] as const;

export const DrawRequestSchema = z.object({
  clientNonce: z.string().min(1).max(128).nullable().optional(),
});

export type DrawRequest = z.infer<typeof DrawRequestSchema>;

export const DrawPlayRequestSchema = z.object({
  count: z.number().int().min(1).max(100),
  clientNonce: z.string().min(1).max(128).nullable().optional(),
});

export type DrawPlayRequest = z.infer<typeof DrawPlayRequestSchema>;

export const DrawStatusSchema = z.enum(drawStatusValues);
export type DrawStatus = z.infer<typeof DrawStatusSchema>;

export const drawPrizeRarityValues = [
  'common',
  'rare',
  'epic',
  'legendary',
] as const;

export const DrawPrizeRaritySchema = z.enum(drawPrizeRarityValues);
export type DrawPrizeRarity = z.infer<typeof DrawPrizeRaritySchema>;

export const DrawFairnessSchema = z
  .object({
    epoch: z.number().int().optional(),
    epochSeconds: z.number().int().optional(),
    commitHash: z.string().optional(),
    clientNonce: z.string().nullable().optional(),
    nonceSource: z.enum(['client', 'server']).optional(),
    rngDigest: z.string().nullable().optional(),
    totalWeight: z.number().nullable().optional(),
    randomPick: z.number().nullable().optional(),
    algorithm: z.string().optional(),
  })
  .nullable();

export const DrawPrizePresentationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rewardAmount: z.string(),
  displayRarity: DrawPrizeRaritySchema,
  stock: z.number().int().nonnegative(),
  stockState: z.enum(['available', 'low', 'sold_out']),
  isFeatured: z.boolean(),
});

export type DrawPrizePresentation = z.infer<
  typeof DrawPrizePresentationSchema
>;

export const DrawPityStateSchema = z.object({
  enabled: z.boolean(),
  currentStreak: z.number().int().nonnegative(),
  threshold: z.number().int().nonnegative(),
  boostPct: z.number(),
  maxBoostPct: z.number(),
  active: z.boolean(),
  drawsUntilBoost: z.number().int().nonnegative().nullable(),
});

export type DrawPityState = z.infer<typeof DrawPityStateSchema>;

export const DrawResultSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  prizeId: z.number().int().nullable(),
  drawCost: z.string(),
  rewardAmount: z.string(),
  status: DrawStatusSchema,
  createdAt: z.union([z.string(), z.date()]),
  fairness: DrawFairnessSchema,
  prize: DrawPrizePresentationSchema.nullable().optional(),
});

export type DrawResult = z.infer<typeof DrawResultSchema>;

export const DrawCatalogResponseSchema = z.object({
  drawEnabled: z.boolean(),
  balance: z.string(),
  drawCost: z.string(),
  maxBatchCount: z.number().int().positive(),
  recommendedBatchCount: z.number().int().positive(),
  pity: DrawPityStateSchema,
  fairness: z.object({
    epoch: z.number().int(),
    epochSeconds: z.number().int(),
    commitHash: z.string(),
  }),
  prizes: z.array(DrawPrizePresentationSchema),
  featuredPrizes: z.array(DrawPrizePresentationSchema),
});

export type DrawCatalogResponse = z.infer<typeof DrawCatalogResponseSchema>;

export const DrawPlayResponseSchema = z.object({
  count: z.number().int().positive(),
  totalCost: z.string(),
  totalReward: z.string(),
  winCount: z.number().int().nonnegative(),
  endingBalance: z.string(),
  highestRarity: DrawPrizeRaritySchema.nullable(),
  pity: DrawPityStateSchema,
  results: z.array(DrawResultSchema),
});

export type DrawPlayResponse = z.infer<typeof DrawPlayResponseSchema>;

export const DrawFairnessCommitSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
});

export type DrawFairnessCommit = z.infer<typeof DrawFairnessCommitSchema>;

export const DrawPrizePreviewSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  stock: z.number().int().nonnegative(),
  rewardAmount: z.string(),
  isSoldOut: z.boolean(),
});

export type DrawPrizePreview = z.infer<typeof DrawPrizePreviewSchema>;

export const DrawOverviewResponseSchema = DrawCatalogResponseSchema;

export type DrawOverviewResponse = DrawCatalogResponse;
