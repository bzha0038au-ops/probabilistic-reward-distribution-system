import { z } from "zod";

const DateLikeSchema = z.union([z.string(), z.date()]);
const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const dataDeletionRequestStatusValues = [
  "pending_review",
  "processing",
  "completed",
  "rejected",
  "failed",
] as const;
export const DataDeletionRequestStatusSchema = z.enum(
  dataDeletionRequestStatusValues,
);
export type DataDeletionRequestStatus = z.infer<
  typeof DataDeletionRequestStatusSchema
>;

export const dataDeletionRequestSourceValues = [
  "user_self_service",
  "admin_support",
] as const;
export const DataDeletionRequestSourceSchema = z.enum(
  dataDeletionRequestSourceValues,
);
export type DataDeletionRequestSource = z.infer<
  typeof DataDeletionRequestSourceSchema
>;

export const dataDeletionReviewDecisionValues = [
  "approved",
  "rejected",
] as const;
export const DataDeletionReviewDecisionSchema = z.enum(
  dataDeletionReviewDecisionValues,
);
export type DataDeletionReviewDecision = z.infer<
  typeof DataDeletionReviewDecisionSchema
>;

export const dataRightsAuditActionValues = [
  "requested",
  "approved",
  "rejected",
  "completed",
  "failed",
] as const;
export const DataRightsAuditActionSchema = z.enum(dataRightsAuditActionValues);
export type DataRightsAuditAction = z.infer<typeof DataRightsAuditActionSchema>;

export const DataDeletionResultSummarySchema = z.object({
  usersUpdated: z.number().int().nonnegative(),
  authSessionsRevoked: z.number().int().nonnegative(),
  authTokensRedacted: z.number().int().nonnegative(),
  authEventsRedacted: z.number().int().nonnegative(),
  legalAcceptancesRedacted: z.number().int().nonnegative(),
  kycProfilesRedacted: z.number().int().nonnegative(),
  kycDocumentsRedacted: z.number().int().nonnegative(),
  kycReviewEventsRedacted: z.number().int().nonnegative(),
  payoutMethodsRedacted: z.number().int().nonnegative(),
  fiatPayoutMethodsRedacted: z.number().int().nonnegative(),
  cryptoAddressesRedacted: z.number().int().nonnegative(),
  notificationsRedacted: z.number().int().nonnegative(),
  adminActionsRedacted: z.number().int().nonnegative(),
  userMfaSecretsDeleted: z.number().int().nonnegative(),
});
export type DataDeletionResultSummary = z.infer<
  typeof DataDeletionResultSummarySchema
>;

export const DataDeletionRequestRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  status: DataDeletionRequestStatusSchema,
  source: DataDeletionRequestSourceSchema,
  requestedByUserId: z.number().int().nullable(),
  requestReason: z.string().nullable(),
  subjectEmailHint: z.string().nullable(),
  subjectPhoneHint: z.string().nullable(),
  subjectEmailHash: z.string().nullable(),
  subjectPhoneHash: z.string().nullable(),
  dueAt: DateLikeSchema,
  reviewedByAdminId: z.number().int().nullable(),
  reviewDecision: DataDeletionReviewDecisionSchema.nullable(),
  reviewNotes: z.string().nullable(),
  reviewedAt: DateLikeSchema.nullable(),
  completedByAdminId: z.number().int().nullable(),
  completedAt: DateLikeSchema.nullable(),
  failureReason: z.string().nullable(),
  resultSummary: DataDeletionResultSummarySchema.nullable(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type DataDeletionRequestRecord = z.infer<
  typeof DataDeletionRequestRecordSchema
>;

export const CreateDataDeletionRequestSchema = z.object({
  reason: z.string().trim().max(1000).nullable().optional(),
});
export type CreateDataDeletionRequest = z.infer<
  typeof CreateDataDeletionRequestSchema
>;

export const ReviewDataDeletionRequestSchema = z.object({
  reviewNotes: z.string().trim().max(1000).nullable().optional(),
});
export type ReviewDataDeletionRequest = z.infer<
  typeof ReviewDataDeletionRequestSchema
>;

export const AdminDataDeletionQueueItemSchema =
  DataDeletionRequestRecordSchema.extend({
    currentUserEmail: z.string().nullable(),
    currentUserPhone: z.string().nullable(),
    currentUserRole: z.string().nullable(),
    isOverdue: z.boolean(),
  });
export type AdminDataDeletionQueueItem = z.infer<
  typeof AdminDataDeletionQueueItemSchema
>;

export const AdminDataDeletionQueueSchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  items: z.array(AdminDataDeletionQueueItemSchema),
});
export type AdminDataDeletionQueue = z.infer<
  typeof AdminDataDeletionQueueSchema
>;

export const DataRightsAuditRecordSchema = z.object({
  id: z.number().int(),
  requestId: z.number().int(),
  userId: z.number().int(),
  action: DataRightsAuditActionSchema,
  actorUserId: z.number().int().nullable(),
  actorAdminId: z.number().int().nullable(),
  notes: z.string().nullable(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema,
});
export type DataRightsAuditRecord = z.infer<typeof DataRightsAuditRecordSchema>;
