import { z } from 'zod';

export const rewardMissionIdValues = [
  'daily_checkin',
  'profile_security',
  'first_draw',
  'draw_streak_daily',
  'top_up_starter',
] as const;

export const RewardMissionIdSchema = z.enum(rewardMissionIdValues);
export type RewardMissionId = z.infer<typeof RewardMissionIdSchema>;

export const rewardMissionCadenceValues = ['one_time', 'daily'] as const;
export const RewardMissionCadenceSchema = z.enum(rewardMissionCadenceValues);
export type RewardMissionCadence = z.infer<typeof RewardMissionCadenceSchema>;

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
  cadence: RewardMissionCadenceSchema,
  status: RewardMissionStatusSchema,
  rewardAmount: z.string(),
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
