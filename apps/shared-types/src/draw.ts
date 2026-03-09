import { z } from 'zod';

export const DrawRequestSchema = z.object({
  clientNonce: z.string().min(1).max(128).nullable().optional(),
});

export type DrawRequest = z.infer<typeof DrawRequestSchema>;

export const DrawStatusSchema = z.enum([
  'miss',
  'won',
  'out_of_stock',
  'budget_exhausted',
  'payout_limited',
]);

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

export const DrawResultSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  prizeId: z.number().int().nullable(),
  drawCost: z.string(),
  rewardAmount: z.string(),
  status: DrawStatusSchema,
  createdAt: z.union([z.string(), z.date()]),
  fairness: DrawFairnessSchema,
});

export type DrawResult = z.infer<typeof DrawResultSchema>;
