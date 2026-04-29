import { z } from "zod";

import {
  LimitedPageSizeSchema,
  OffsetPageSchema,
  OptionalDateFilterSchema,
  OptionalPositiveIntSchema,
  OptionalStringSchema,
} from "./common";

export const kycTierValues = ["tier_0", "tier_1", "tier_2"] as const;
export const kycStatusValues = [
  "not_started",
  "pending",
  "approved",
  "rejected",
  "more_info_required",
] as const;
export const kycDocumentTypeValues = [
  "national_id",
  "passport",
  "driver_license",
  "proof_of_address",
  "supporting_document",
] as const;
export const kycDocumentKindValues = [
  "identity_front",
  "identity_back",
  "selfie",
  "proof_of_address",
  "supporting_document",
] as const;
export const kycReviewActionValues = [
  "submitted",
  "approved",
  "rejected",
  "request_more_info",
  "reverification_requested",
] as const;
export const kycMimeTypeValues = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const KycTierSchema = z.enum(kycTierValues);
export type KycTier = z.infer<typeof KycTierSchema>;

export const KycStatusSchema = z.enum(kycStatusValues);
export type KycStatus = z.infer<typeof KycStatusSchema>;

export const KycDocumentTypeSchema = z.enum(kycDocumentTypeValues);
export type KycDocumentType = z.infer<typeof KycDocumentTypeSchema>;

export const KycDocumentKindSchema = z.enum(kycDocumentKindValues);
export type KycDocumentKind = z.infer<typeof KycDocumentKindSchema>;

export const KycReviewActionSchema = z.enum(kycReviewActionValues);
export type KycReviewAction = z.infer<typeof KycReviewActionSchema>;

export const KycMimeTypeSchema = z.enum(kycMimeTypeValues);
export type KycMimeType = z.infer<typeof KycMimeTypeSchema>;

export const KycProfileSchema = z.object({
  id: z.number().int().nonnegative(),
  userId: z.number().int().positive(),
  currentTier: KycTierSchema,
  requestedTier: KycTierSchema.nullable(),
  status: KycStatusSchema,
  submissionVersion: z.number().int().nonnegative(),
  legalName: z.string().nullable(),
  documentType: KycDocumentTypeSchema.nullable(),
  documentNumberLast4: z.string().nullable(),
  countryCode: z.string().nullable(),
  notes: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  submittedData: z.record(z.string(), z.unknown()).nullable().optional(),
  riskFlags: z.array(z.string()),
  freezeRecordId: z.number().int().positive().nullable().optional(),
  reviewedByAdminId: z.number().int().positive().nullable().optional(),
  submittedAt: z.union([z.string(), z.date()]).nullable(),
  reviewedAt: z.union([z.string(), z.date()]).nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type KycProfile = z.infer<typeof KycProfileSchema>;

export const KycUserDocumentSchema = z.object({
  id: z.number().int().positive(),
  profileId: z.number().int().positive(),
  userId: z.number().int().positive(),
  submissionVersion: z.number().int().nonnegative(),
  kind: KycDocumentKindSchema,
  label: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  storagePath: z.string().optional(),
  createdAt: z.union([z.string(), z.date()]),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type KycUserDocument = z.infer<typeof KycUserDocumentSchema>;

export const KycDocumentSchema = KycUserDocumentSchema.extend({
  previewUrl: z.string().url(),
});
export type KycDocument = z.infer<typeof KycDocumentSchema>;

export const KycReviewEventSchema = z.object({
  id: z.number().int().positive(),
  profileId: z.number().int().positive(),
  userId: z.number().int().positive(),
  submissionVersion: z.number().int().nonnegative(),
  action: KycReviewActionSchema,
  fromStatus: KycStatusSchema,
  toStatus: KycStatusSchema,
  targetTier: KycTierSchema.nullable(),
  actorAdminId: z.number().int().positive().nullable(),
  actorAdminEmail: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});
export type KycReviewEvent = z.infer<typeof KycReviewEventSchema>;

export const KycUserProfileSchema = KycProfileSchema.extend({
  documents: z.array(KycUserDocumentSchema),
  reviewEvents: z.array(KycReviewEventSchema),
});
export type KycUserProfile = z.infer<typeof KycUserProfileSchema>;

export const KycSubmitDocumentSchema = z.object({
  kind: KycDocumentKindSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: KycMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(5_000_000),
  contentBase64: z.string().trim().min(32).max(8_000_000),
});
export type KycSubmitDocument = z.infer<typeof KycSubmitDocumentSchema>;

export const KycSubmitRequestSchema = z.object({
  targetTier: z.enum(["tier_1", "tier_2"]),
  legalName: z.string().trim().min(2).max(160),
  documentType: KycDocumentTypeSchema,
  documentNumberLast4: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4}$/),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  documentExpiresAt: z.string().trim().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(500).optional(),
  documents: z.array(KycSubmitDocumentSchema).min(2).max(5),
}).superRefine((value, ctx) => {
  const requiresDocumentExpiry =
    value.documentType === "national_id" ||
    value.documentType === "passport" ||
    value.documentType === "driver_license";

  if (requiresDocumentExpiry && !value.documentExpiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Document expiry is required.",
      path: ["documentExpiresAt"],
    });
    return;
  }

  if (!value.documentExpiresAt) {
    return;
  }

  const expiresAt = new Date(value.documentExpiresAt);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Document expiry must be in the future.",
      path: ["documentExpiresAt"],
    });
  }
});
export type KycSubmitRequest = z.infer<typeof KycSubmitRequestSchema>;

export const KycAdminReviewQuerySchema = z.object({
  tier: KycTierSchema.optional(),
  from: OptionalDateFilterSchema,
  to: OptionalDateFilterSchema,
  riskFlag: OptionalStringSchema,
  limit: LimitedPageSizeSchema,
  page: OptionalPositiveIntSchema,
});
export type KycAdminReviewQuery = z.infer<typeof KycAdminReviewQuerySchema>;

export const KycAdminQueueItemSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  userEmail: z.string().email(),
  currentTier: KycTierSchema,
  requestedTier: KycTierSchema.nullable(),
  tier: KycTierSchema,
  status: z.literal("pending"),
  submissionVersion: z.number().int().nonnegative(),
  legalName: z.string().nullable(),
  countryCode: z.string().nullable(),
  riskFlags: z.array(z.string()),
  submittedAt: z.union([z.string(), z.date()]).nullable(),
  hasActiveFreeze: z.boolean(),
  documentCount: z.number().int().nonnegative(),
});
export type KycAdminQueueItem = z.infer<typeof KycAdminQueueItemSchema>;

export const KycAdminQueuePageSchema = OffsetPageSchema(
  KycAdminQueueItemSchema,
);
export type KycAdminQueuePage = z.infer<typeof KycAdminQueuePageSchema>;

export const KycAdminDetailSchema = KycProfileSchema.extend({
  userEmail: z.string().email(),
  hasActiveFreeze: z.boolean(),
  documents: z.array(KycDocumentSchema),
  reviewEvents: z.array(KycReviewEventSchema),
});
export type KycAdminDetail = z.infer<typeof KycAdminDetailSchema>;

export const KycApproveRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type KycApproveRequest = z.infer<typeof KycApproveRequestSchema>;

export const KycRejectRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type KycRejectRequest = z.infer<typeof KycRejectRequestSchema>;

export const KycRequestMoreInfoRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type KycRequestMoreInfoRequest = z.infer<
  typeof KycRequestMoreInfoRequestSchema
>;

export const KycRequestReverificationRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type KycRequestReverificationRequest = z.infer<
  typeof KycRequestReverificationRequestSchema
>;
