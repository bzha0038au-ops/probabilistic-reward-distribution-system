import { z } from 'zod';
import { MoneyLikeSchema } from './common';
import { ExperimentBindingSchema } from "./experiments";

export const RewardMissionIdSchema = z.string().trim().min(1).max(128);
export type RewardMissionId = z.infer<typeof RewardMissionIdSchema>;

export const rewardMissionCadenceValues = ['one_time', 'daily'] as const;
export const RewardMissionCadenceSchema = z.enum(rewardMissionCadenceValues);
export type RewardMissionCadence = z.infer<typeof RewardMissionCadenceSchema>;

export const rewardMissionDefinitionTypeValues = [
  'daily_checkin',
  'metric_threshold',
] as const;
export const RewardMissionDefinitionTypeSchema = z.enum(
  rewardMissionDefinitionTypeValues,
);
export type RewardMissionDefinitionType = z.infer<
  typeof RewardMissionDefinitionTypeSchema
>;

export const rewardMissionMetricValues = [
  'verified_contacts',
  'draw_count_all',
  'draw_count_today',
  'deposit_count',
  'deposit_credited_count',
  'referral_success_count',
] as const;
export const RewardMissionMetricSchema = z.enum(rewardMissionMetricValues);
export type RewardMissionMetric = z.infer<typeof RewardMissionMetricSchema>;

export const rewardMissionAwardModeValues = [
  'manual_claim',
  'auto_grant',
] as const;
export const RewardMissionAwardModeSchema = z.enum(
  rewardMissionAwardModeValues,
);
export type RewardMissionAwardMode = z.infer<
  typeof RewardMissionAwardModeSchema
>;

const RewardMissionTitleSchema = z.string().trim().min(1).max(120);
const RewardMissionDescriptionSchema = z.string().trim().min(1).max(400);

export const RewardMissionDailyCheckInParamsSchema = z.object({
  title: RewardMissionTitleSchema,
  description: RewardMissionDescriptionSchema,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  experiment: ExperimentBindingSchema.optional(),
});
export type RewardMissionDailyCheckInParams = z.infer<
  typeof RewardMissionDailyCheckInParamsSchema
>;

export const RewardMissionMetricThresholdParamsSchema = z.object({
  title: RewardMissionTitleSchema,
  description: RewardMissionDescriptionSchema,
  metric: RewardMissionMetricSchema,
  target: z.coerce.number().int().positive().max(100000),
  cadence: RewardMissionCadenceSchema,
  rewardId: RewardMissionIdSchema.optional(),
  awardMode: RewardMissionAwardModeSchema.optional(),
  bonusUnlockWagerRatio: MoneyLikeSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  experiment: ExperimentBindingSchema.optional(),
});
export type RewardMissionMetricThresholdParams = z.infer<
  typeof RewardMissionMetricThresholdParamsSchema
>;

export const rewardMissionStatusValues = [
  'disabled',
  'in_progress',
  'ready',
  'claimed',
] as const;
export const RewardMissionStatusSchema = z.enum(rewardMissionStatusValues);
export type RewardMissionStatus = z.infer<typeof RewardMissionStatusSchema>;

const DateLikeSchema = z.union([z.string(), z.date()]);

export const RewardMissionSchema = z.object({
  id: RewardMissionIdSchema,
  title: RewardMissionTitleSchema,
  description: RewardMissionDescriptionSchema,
  cadence: RewardMissionCadenceSchema,
  status: RewardMissionStatusSchema,
  rewardAmount: z.string(),
  bonusUnlockWagerRatio: z.string().nullable().optional(),
  progressCurrent: z.number().int().nonnegative(),
  progressTarget: z.number().int().positive(),
  claimable: z.boolean(),
  autoAwarded: z.boolean(),
  claimedAt: DateLikeSchema.nullable(),
  resetsAt: DateLikeSchema.nullable(),
});
export type RewardMission = z.infer<typeof RewardMissionSchema>;

export const RewardCenterSummarySchema = z.object({
  bonusBalance: z.string(),
  streakDays: z.number().int().nonnegative(),
  todayDailyClaimed: z.boolean(),
  availableMissionCount: z.number().int().nonnegative(),
  claimedMissionCount: z.number().int().nonnegative(),
});
export type RewardCenterSummary = z.infer<typeof RewardCenterSummarySchema>;

export const RewardCenterResponseSchema = z.object({
  summary: RewardCenterSummarySchema,
  missions: z.array(RewardMissionSchema),
});
export type RewardCenterResponse = z.infer<typeof RewardCenterResponseSchema>;

export const RewardMissionClaimRequestSchema = z.object({
  missionId: RewardMissionIdSchema,
});
export type RewardMissionClaimRequest = z.infer<typeof RewardMissionClaimRequestSchema>;

export const RewardMissionClaimResponseSchema = z.object({
  missionId: RewardMissionIdSchema,
  grantedAmount: z.string(),
});
export type RewardMissionClaimResponse = z.infer<typeof RewardMissionClaimResponseSchema>;

export const rewardMissionMetricWindowValues = ['lifetime', 'today'] as const;
export const RewardMissionMetricWindowSchema = z.enum(
  rewardMissionMetricWindowValues,
);
export type RewardMissionMetricWindow = z.infer<
  typeof RewardMissionMetricWindowSchema
>;

export const RewardMissionAdminMetricsSchema = z.object({
  window: RewardMissionMetricWindowSchema,
  totalUsers: z.number().int().nonnegative(),
  completedUsers: z.number().int().nonnegative(),
  claimedUsers: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  claimRate: z.number().min(0).max(1),
  grantedAmountTotal: z.string(),
});
export type RewardMissionAdminMetrics = z.infer<
  typeof RewardMissionAdminMetricsSchema
>;

export const RewardMissionAdminRecordSchema = z.object({
  id: RewardMissionIdSchema,
  type: RewardMissionDefinitionTypeSchema,
  params: z.record(z.string(), z.unknown()),
  reward: z.string(),
  isActive: z.boolean(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
  metrics: RewardMissionAdminMetricsSchema,
});
export type RewardMissionAdminRecord = z.infer<
  typeof RewardMissionAdminRecordSchema
>;

export const RewardMissionCreateSchema = z.object({
  id: RewardMissionIdSchema,
  type: RewardMissionDefinitionTypeSchema,
  params: z.record(z.string(), z.unknown()),
  reward: MoneyLikeSchema,
  isActive: z.boolean().optional(),
});
export type RewardMissionCreateRequest = z.infer<
  typeof RewardMissionCreateSchema
>;

export const RewardMissionUpdateSchema = z.object({
  type: RewardMissionDefinitionTypeSchema,
  params: z.record(z.string(), z.unknown()),
  reward: MoneyLikeSchema,
  isActive: z.boolean().optional(),
});
export type RewardMissionUpdateRequest = z.infer<
  typeof RewardMissionUpdateSchema
>;
