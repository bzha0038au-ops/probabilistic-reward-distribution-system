import { z } from 'zod';

export const quickEightRoundStatusValues = ['lost', 'won'] as const;

export const QUICK_EIGHT_BOARD_SIZE = 80;
export const QUICK_EIGHT_PICK_COUNT = 8;
export const QUICK_EIGHT_DRAW_COUNT = 20;
export const QUICK_EIGHT_MIN_STAKE = '1.00';
export const QUICK_EIGHT_MAX_STAKE = '10.00';

export const QUICK_EIGHT_PAYOUT_TABLE = [
  { hits: 0, multiplier: '0.00' },
  { hits: 1, multiplier: '0.00' },
  { hits: 2, multiplier: '0.00' },
  { hits: 3, multiplier: '0.00' },
  { hits: 4, multiplier: '4.00' },
  { hits: 5, multiplier: '15.00' },
  { hits: 6, multiplier: '95.00' },
  { hits: 7, multiplier: '650.00' },
  { hits: 8, multiplier: '4800.00' },
] as const;

const hasUniqueNumbers = (numbers: number[]) =>
  new Set(numbers).size === numbers.length;

const QuickEightNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(QUICK_EIGHT_BOARD_SIZE);

export const QuickEightSelectionSchema = z
  .array(QuickEightNumberSchema)
  .length(QUICK_EIGHT_PICK_COUNT)
  .refine(hasUniqueNumbers, {
    message: 'Numbers must be unique.',
  });

export type QuickEightSelection = z.infer<typeof QuickEightSelectionSchema>;

export const QuickEightRequestSchema = z.object({
  numbers: QuickEightSelectionSchema,
  stakeAmount: z.string().min(1).max(32),
  clientNonce: z.string().min(1).max(128).nullable().optional(),
});

export type QuickEightRequest = z.infer<typeof QuickEightRequestSchema>;

export const QuickEightRoundStatusSchema = z.enum(quickEightRoundStatusValues);
export type QuickEightRoundStatus = z.infer<typeof QuickEightRoundStatusSchema>;

export const QuickEightFairnessSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
  clientNonce: z.string(),
  nonceSource: z.enum(['client', 'server']),
  rngDigest: z.string(),
  algorithm: z.string(),
});

export type QuickEightFairness = z.infer<typeof QuickEightFairnessSchema>;

export const QuickEightPayoutRuleSchema = z.object({
  hits: z.number().int().min(0).max(QUICK_EIGHT_PICK_COUNT),
  multiplier: z.string(),
});

export type QuickEightPayoutRule = z.infer<typeof QuickEightPayoutRuleSchema>;

export const QuickEightConfigSchema = z.object({
  boardSize: z.number().int().positive(),
  pickCount: z.number().int().positive(),
  drawCount: z.number().int().positive(),
  minStake: z.string(),
  maxStake: z.string(),
  payoutTable: z.array(QuickEightPayoutRuleSchema),
});

export type QuickEightConfig = z.infer<typeof QuickEightConfigSchema>;

export const QUICK_EIGHT_CONFIG: QuickEightConfig = {
  boardSize: QUICK_EIGHT_BOARD_SIZE,
  pickCount: QUICK_EIGHT_PICK_COUNT,
  drawCount: QUICK_EIGHT_DRAW_COUNT,
  minStake: QUICK_EIGHT_MIN_STAKE,
  maxStake: QUICK_EIGHT_MAX_STAKE,
  payoutTable: [...QUICK_EIGHT_PAYOUT_TABLE],
};

export const QuickEightRoundSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  selectedNumbers: z.array(QuickEightNumberSchema).length(QUICK_EIGHT_PICK_COUNT),
  drawnNumbers: z.array(QuickEightNumberSchema).length(QUICK_EIGHT_DRAW_COUNT),
  matchedNumbers: z.array(QuickEightNumberSchema),
  hitCount: z.number().int().min(0).max(QUICK_EIGHT_PICK_COUNT),
  multiplier: z.string(),
  stakeAmount: z.string(),
  payoutAmount: z.string(),
  status: QuickEightRoundStatusSchema,
  fairness: QuickEightFairnessSchema,
  createdAt: z.union([z.string(), z.date()]),
});

export type QuickEightRound = z.infer<typeof QuickEightRoundSchema>;
