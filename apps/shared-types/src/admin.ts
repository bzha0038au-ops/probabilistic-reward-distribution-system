import { z } from 'zod';

import {
  CursorDirectionSchema,
  CursorPageSchema,
  CursorTokenSchema,
  LimitedPageSizeSchema,
  MoneyLikeSchema,
  OffsetPageSchema,
  OptionalBooleanSchema,
  OptionalDateFilterSchema,
  OptionalPositiveIntSchema,
  OptionalStringSchema,
  SortOrderSchema,
} from './common';

export const PrizeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  stock: MoneyLikeSchema.optional(),
  weight: MoneyLikeSchema.optional(),
  poolThreshold: MoneyLikeSchema.optional(),
  userPoolThreshold: MoneyLikeSchema.optional(),
  rewardAmount: MoneyLikeSchema.optional(),
  payoutBudget: MoneyLikeSchema.optional(),
  payoutPeriodDays: MoneyLikeSchema.optional(),
  isActive: z.boolean().optional(),
});

export const PrizeUpdateSchema = PrizeCreateSchema.partial();

export const SystemConfigPatchSchema = z.object({
  poolBalance: MoneyLikeSchema.optional(),
  drawCost: MoneyLikeSchema.optional(),
  weightJitterEnabled: OptionalBooleanSchema,
  weightJitterPct: MoneyLikeSchema.optional(),
  bonusAutoReleaseEnabled: OptionalBooleanSchema,
  bonusUnlockWagerRatio: MoneyLikeSchema.optional(),
  authFailureWindowMinutes: MoneyLikeSchema.optional(),
  authFailureFreezeThreshold: MoneyLikeSchema.optional(),
  adminFailureFreezeThreshold: MoneyLikeSchema.optional(),
  profileSecurityRewardAmount: MoneyLikeSchema.optional(),
  firstDrawRewardAmount: MoneyLikeSchema.optional(),
  drawStreakDailyRewardAmount: MoneyLikeSchema.optional(),
  topUpStarterRewardAmount: MoneyLikeSchema.optional(),
  blackjackMinStake: MoneyLikeSchema.optional(),
  blackjackMaxStake: MoneyLikeSchema.optional(),
  blackjackWinPayoutMultiplier: MoneyLikeSchema.optional(),
  blackjackPushPayoutMultiplier: MoneyLikeSchema.optional(),
  blackjackNaturalPayoutMultiplier: MoneyLikeSchema.optional(),
  blackjackDealerHitsSoft17: OptionalBooleanSchema,
  blackjackDoubleDownAllowed: OptionalBooleanSchema,
  blackjackSplitAcesAllowed: OptionalBooleanSchema,
  blackjackHitSplitAcesAllowed: OptionalBooleanSchema,
  blackjackResplitAllowed: OptionalBooleanSchema,
  blackjackMaxSplitHands: z.number().int().min(2).max(8).optional(),
  blackjackSplitTenValueCardsAllowed: OptionalBooleanSchema,
});

export const FreezeCreateSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().min(1).max(255).optional(),
});

export const FreezeReleaseBodySchema = z.object({
  reason: z.string().min(1).max(255).optional(),
});

export const AdminActionSchema = z.object({
  id: z.number().int(),
  adminId: z.number().int().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.number().int().nullable(),
  ip: z.string().nullable(),
  sessionId: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});

export const AuthEventSchema = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  email: z.string().nullable(),
  eventType: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});

export const FreezeRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  reason: z.string().nullable(),
  status: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  releasedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export const AdminAuditQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  cursor: CursorTokenSchema.optional(),
  direction: CursorDirectionSchema.optional(),
  sort: SortOrderSchema.optional(),
  adminId: OptionalPositiveIntSchema,
  action: OptionalStringSchema,
  from: OptionalDateFilterSchema,
  to: OptionalDateFilterSchema,
});

export const AuthEventQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  cursor: CursorTokenSchema.optional(),
  direction: CursorDirectionSchema.optional(),
  sort: SortOrderSchema.optional(),
  email: OptionalStringSchema,
  eventType: OptionalStringSchema,
  from: OptionalDateFilterSchema,
  to: OptionalDateFilterSchema,
});

export const FreezeRecordQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  page: OptionalPositiveIntSchema,
  sort: SortOrderSchema.optional(),
});

export const CursorAdminActionPageSchema = CursorPageSchema(AdminActionSchema);
export const CursorAuthEventPageSchema = CursorPageSchema(AuthEventSchema);
export const FreezeRecordPageSchema = OffsetPageSchema(FreezeRecordSchema);
