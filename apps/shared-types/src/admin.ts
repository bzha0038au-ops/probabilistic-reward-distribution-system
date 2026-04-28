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
import {
  AmlCheckResultSchema,
  AmlCheckpointSchema,
  AmlProviderKeySchema,
  AmlReviewStatusSchema,
  AmlRiskLevelSchema,
} from './aml';
import {
  RewardMissionDailyCheckInParamsSchema,
  RewardMissionDefinitionTypeSchema,
  RewardMissionMetricThresholdParamsSchema,
} from './gamification';
import {
  UserFreezeCategorySchema,
  UserFreezeReasonSchema,
  UserFreezeScopeSchema,
} from "./risk";

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

const MissionParamsSchema = z.union([
  RewardMissionDailyCheckInParamsSchema,
  RewardMissionMetricThresholdParamsSchema,
]);

export const MissionCreateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  type: RewardMissionDefinitionTypeSchema,
  params: MissionParamsSchema,
  reward: MoneyLikeSchema,
  isActive: z.boolean().optional(),
});

export const MissionUpdateSchema = z.object({
  type: RewardMissionDefinitionTypeSchema.optional(),
  params: MissionParamsSchema.optional(),
  reward: MoneyLikeSchema.optional(),
  isActive: z.boolean().optional(),
});

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
  saasUsageAlertMaxMinuteQps: MoneyLikeSchema.optional(),
  saasUsageAlertMaxSinglePayoutAmount: MoneyLikeSchema.optional(),
  saasUsageAlertMaxAntiExploitRatePct: MoneyLikeSchema.optional(),
});

export const FreezeCreateSchema = z.object({
  userId: z.number().int().positive(),
  category: UserFreezeCategorySchema.default("risk" as const),
  reason: UserFreezeReasonSchema.default("manual_admin" as const),
  scope: UserFreezeScopeSchema.default("account_lock" as const),
});

export const FreezeReleaseBodySchema = z.object({
  reason: z.string().min(1).max(255).optional(),
});

export const AdminActionSchema = z.object({
  id: z.number().int(),
  adminId: z.number().int().nullable(),
  adminEmail: z.string().nullable().optional(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.number().int().nullable(),
  subjectUserId: z.number().int().nullable().optional(),
  subjectUserEmail: z.string().nullable().optional(),
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
  category: UserFreezeCategorySchema,
  reason: UserFreezeReasonSchema,
  scope: UserFreezeScopeSchema,
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  releasedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export const AdminUserSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(255),
  limit: LimitedPageSizeSchema,
});

export const AdminUserSearchItemSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  phone: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  emailVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
  phoneVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
  kycTier: z.string(),
  activeScopes: z.array(UserFreezeScopeSchema),
});

export const AdminUserSearchResultSchema = z.object({
  query: z.string(),
  limit: z.number().int(),
  items: z.array(AdminUserSearchItemSchema),
});

export const AdminUserWalletSnapshotSchema = z.object({
  withdrawableBalance: z.string(),
  bonusBalance: z.string(),
  lockedBalance: z.string(),
  wageredAmount: z.string(),
  updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export const AdminUserRecentDrawSchema = z.object({
  id: z.number().int(),
  prizeId: z.number().int().nullable(),
  prizeName: z.string().nullable(),
  status: z.string(),
  drawCost: z.string(),
  rewardAmount: z.string(),
  createdAt: z.union([z.string(), z.date()]),
});

export const AdminUserRecentPaymentSchema = z.object({
  id: z.number().int(),
  flow: z.enum(["deposit", "withdrawal"]),
  amount: z.string(),
  status: z.string(),
  channelType: z.string(),
  assetType: z.string(),
  assetCode: z.string().nullable(),
  network: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export const AdminUserRecentLoginSchema = z.object({
  id: z.number().int(),
  eventType: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
});

export const AdminUserDetailSchema = z.object({
  user: z.object({
    id: z.number().int(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.string(),
    createdAt: z.union([z.string(), z.date()]),
    updatedAt: z.union([z.string(), z.date()]),
    emailVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
    phoneVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
    userPoolBalance: z.string(),
    pityStreak: z.number().int(),
    lastDrawAt: z.union([z.string(), z.date()]).nullable().optional(),
    lastWinAt: z.union([z.string(), z.date()]).nullable().optional(),
    kycTier: z.string(),
    kycTierSource: z.string(),
    activeScopes: z.array(UserFreezeScopeSchema),
  }),
  wallet: AdminUserWalletSnapshotSchema,
  freezes: z.array(FreezeRecordSchema),
  recentDraws: z.array(AdminUserRecentDrawSchema),
  recentPayments: z.array(AdminUserRecentPaymentSchema),
  recentLoginIps: z.array(AdminUserRecentLoginSchema),
});

export const AdminAuditQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  cursor: CursorTokenSchema.optional(),
  direction: CursorDirectionSchema.optional(),
  sort: SortOrderSchema.optional(),
  adminId: OptionalPositiveIntSchema,
  userId: OptionalPositiveIntSchema,
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
  userId: OptionalPositiveIntSchema,
});

export const AmlHitQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  page: OptionalPositiveIntSchema,
  sort: SortOrderSchema.optional(),
});

export const AmlHitReviewBodySchema = z.object({
  note: z.string().trim().min(1).max(1000).optional(),
});

const DateLikeSchema = z.union([z.string(), z.date()]);

export const AmlHitSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  checkpoint: AmlCheckpointSchema,
  providerKey: AmlProviderKeySchema,
  result: AmlCheckResultSchema,
  riskLevel: AmlRiskLevelSchema,
  providerReference: z.string().nullable().optional(),
  providerPayload: z.unknown().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  reviewStatus: AmlReviewStatusSchema,
  reviewedByAdminId: z.number().int().nullable().optional(),
  reviewedAt: DateLikeSchema.nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
  escalatedAt: DateLikeSchema.nullable().optional(),
  slaDueAt: DateLikeSchema.nullable().optional(),
  activeFreezeRecordId: z.number().int().nullable().optional(),
  activeFreezeReason: UserFreezeReasonSchema.nullable().optional(),
  activeFreezeScope: UserFreezeScopeSchema.nullable().optional(),
  createdAt: DateLikeSchema,
});

export const AmlHitSummarySchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  slaMinutes: z.number().int().positive(),
  oldestPendingAt: DateLikeSchema.nullable(),
});

export const CollusionDashboardQuerySchema = z.object({
  days: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().int().min(1).max(90).optional()
  ),
  seriesLimit: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().int().min(1).max(12).optional()
  ),
  topLimit: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().int().min(1).max(20).optional()
  ),
});

export const RiskManualFlagCreateSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().min(1).max(255).optional(),
});

export const RiskManualFlagClearSchema = z.object({
  reason: z.string().min(1).max(255).optional(),
});

export const RiskUserStatusSchema = z.object({
  userId: z.number().int().positive(),
  email: z.string().nullable(),
  isFrozen: z.boolean(),
  freezeReason: z.string().nullable(),
  hasOpenRiskFlag: z.boolean(),
  manualFlagged: z.boolean(),
  riskReason: z.string().nullable(),
  riskScore: z.number().int().nonnegative(),
});

export const CollusionSeriesPointSchema = z.object({
  bucket: z.string().min(1),
  deltaScore: z.number().int().nonnegative(),
  cumulativeScore: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});

export const CollusionSeriesSchema = z.object({
  entityKey: z.string().min(1),
  entityType: z.enum(['user', 'device']),
  label: z.string().min(1),
  fingerprint: z.string().nullable().optional(),
  user: RiskUserStatusSchema.nullable().optional(),
  totalScore: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  lastSeenAt: z.union([z.string(), z.date()]),
  points: z.array(CollusionSeriesPointSchema),
});

export const CollusionClusterSchema = z.object({
  fingerprint: z.string().min(1),
  label: z.string().min(1),
  pairEventCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  totalScore: z.number().int().nonnegative(),
  lastSeenAt: z.union([z.string(), z.date()]),
  users: z.array(RiskUserStatusSchema),
});

export const CollusionFrequentPairSchema = z.object({
  tableId: z.string().min(1),
  interactionCount: z.number().int().nonnegative(),
  sharedIpCount: z.number().int().nonnegative(),
  sharedDeviceCount: z.number().int().nonnegative(),
  suspicionScore: z.number().int().nonnegative(),
  lastSeenAt: z.union([z.string(), z.date()]),
  users: z.tuple([RiskUserStatusSchema, RiskUserStatusSchema]),
});

export const CollusionDashboardSchema = z.object({
  windowDays: z.number().int().positive(),
  seriesLimit: z.number().int().positive(),
  topLimit: z.number().int().positive(),
  generatedAt: z.union([z.string(), z.date()]),
  userSeries: z.array(CollusionSeriesSchema),
  deviceSeries: z.array(CollusionSeriesSchema),
  sharedIpTop: z.array(CollusionClusterSchema),
  sharedDeviceTop: z.array(CollusionClusterSchema),
  frequentTablePairs: z.array(CollusionFrequentPairSchema),
});

export const AdminPermissionScopeGroupSchema = z.enum([
  'engine',
  'consumer',
  'business',
]);

export const AdminPermissionScopeDefinitionSchema = z.object({
  key: z.string().min(1).max(64),
  group: AdminPermissionScopeGroupSchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(255),
});

export const AdminPermissionScopeAssignmentSchema = z.object({
  adminId: z.number().int().positive(),
  userId: z.number().int().positive(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  isActive: z.boolean(),
  mfaEnabled: z.boolean(),
  managedScopes: z.array(z.string().min(1).max(64)),
  legacyPermissions: z.array(z.string().min(1).max(64)),
});

export const AdminPermissionScopeOverviewSchema = z.object({
  admins: z.array(AdminPermissionScopeAssignmentSchema),
  scopePool: z.array(AdminPermissionScopeDefinitionSchema),
});

export const AdminPermissionScopeUpdateSchema = z.object({
  scopeKeys: z.array(z.string().min(1).max(64)).max(32),
  confirmationText: z.string().trim().min(1).max(128),
  totpCode: z.string().trim().min(1).max(32),
});

export const AdminPermissionScopeUpdateResultSchema = z.object({
  admin: AdminPermissionScopeAssignmentSchema,
  addedScopes: z.array(z.string().min(1).max(64)),
  removedScopes: z.array(z.string().min(1).max(64)),
});

export const CursorAdminActionPageSchema = CursorPageSchema(AdminActionSchema);
export const CursorAuthEventPageSchema = CursorPageSchema(AuthEventSchema);
export const FreezeRecordPageSchema = OffsetPageSchema(FreezeRecordSchema);
export const AmlHitPageSchema = OffsetPageSchema(AmlHitSchema).extend({
  summary: AmlHitSummarySchema,
});

const SummaryCountSchema = z.number().int().nonnegative();

export const AdminActionSummarySchema = z.object({
  totalCount: SummaryCountSchema,
  byAdmin: z.array(
    z.object({
      adminId: z.number().int().nullable(),
      adminEmail: z.string().nullable(),
      count: SummaryCountSchema,
    }),
  ),
  byAction: z.array(
    z.object({
      action: z.string(),
      count: SummaryCountSchema,
    }),
  ),
  byUser: z.array(
    z.object({
      userId: z.number().int().nullable(),
      userEmail: z.string().nullable(),
      count: SummaryCountSchema,
    }),
  ),
  byDay: z.array(
    z.object({
      day: z.string(),
      count: SummaryCountSchema,
    }),
  ),
});
