import { z } from "zod";

export const LegalAcceptanceInputSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(64),
});

export type LegalAcceptanceInput = z.infer<typeof LegalAcceptanceInputSchema>;

export const LegalDocumentSummarySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  version: z.string(),
  effectiveAt: z.string().datetime(),
});

export type LegalDocumentSummary = z.infer<typeof LegalDocumentSummarySchema>;

export const CurrentLegalDocumentSchema = LegalDocumentSummarySchema.extend({
  html: z.string(),
});

export type CurrentLegalDocument = z.infer<typeof CurrentLegalDocumentSchema>;

export const CurrentLegalDocumentsResponseSchema = z.object({
  items: z.array(CurrentLegalDocumentSchema),
});

export type CurrentLegalDocumentsResponse = z.infer<
  typeof CurrentLegalDocumentsResponseSchema
>;

export const CurrentLegalAcceptanceStatusItemSchema =
  LegalDocumentSummarySchema.extend({
    accepted: z.boolean(),
    acceptedAt: z.string().datetime().nullable(),
  });

export type CurrentLegalAcceptanceStatusItem = z.infer<
  typeof CurrentLegalAcceptanceStatusItemSchema
>;

export const CurrentLegalAcceptanceStateSchema = z.object({
  requiresAcceptance: z.boolean(),
  items: z.array(CurrentLegalAcceptanceStatusItemSchema),
});

export type CurrentLegalAcceptanceState = z.infer<
  typeof CurrentLegalAcceptanceStateSchema
>;

export const AcceptCurrentLegalDocumentsRequestSchema = z.object({
  acceptances: z.array(LegalAcceptanceInputSchema).default([]),
});

export type AcceptCurrentLegalDocumentsRequest = z.infer<
  typeof AcceptCurrentLegalDocumentsRequestSchema
>;

export const AdminLegalDocumentSchema = CurrentLegalDocumentSchema.extend({
  createdAt: z.string().datetime(),
  isCurrent: z.boolean(),
});

export type AdminLegalDocument = z.infer<typeof AdminLegalDocumentSchema>;

export const AdminLegalDocumentsResponseSchema = z.object({
  items: z.array(AdminLegalDocumentSchema),
});

export type AdminLegalDocumentsResponse = z.infer<
  typeof AdminLegalDocumentsResponseSchema
>;

export const LegalDocumentKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_.-]*$/, "Invalid legal document key.");

export type LegalDocumentKey = z.infer<typeof LegalDocumentKeySchema>;

export const LegalDocumentLocaleSchema = z.string().trim().min(2).max(16);
export type LegalDocumentLocale = z.infer<typeof LegalDocumentLocaleSchema>;

export const LegalReleaseModeSchema = z.enum(["stable", "gray", "rollback"]);
export type LegalReleaseMode = z.infer<typeof LegalReleaseModeSchema>;

export const LegalDocumentSchema = z.object({
  id: z.number().int(),
  documentKey: LegalDocumentKeySchema,
  locale: LegalDocumentLocaleSchema,
  title: z.string().min(1).max(160),
  version: z.number().int().positive(),
  htmlContent: z.string().min(1),
  summary: z.string().nullable().optional(),
  changeNotes: z.string().nullable().optional(),
  isRequired: z.boolean(),
  createdByAdminId: z.number().int(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

export const LegalPublicationSchema = z.object({
  id: z.number().int(),
  documentId: z.number().int(),
  documentKey: LegalDocumentKeySchema,
  locale: LegalDocumentLocaleSchema,
  releaseMode: LegalReleaseModeSchema,
  rolloutPercent: z.number().int().min(1).max(100),
  fallbackPublicationId: z.number().int().nullable(),
  rollbackFromPublicationId: z.number().int().nullable(),
  changeRequestId: z.number().int().nullable(),
  publishedByAdminId: z.number().int(),
  isActive: z.boolean(),
  activatedAt: z.union([z.string(), z.date()]),
  supersededAt: z.union([z.string(), z.date()]).nullable().optional(),
  supersededByPublicationId: z.number().int().nullable().optional(),
});

export type LegalPublication = z.infer<typeof LegalPublicationSchema>;

export const LegalDocumentAdminRecordSchema = LegalDocumentSchema.extend({
  activePublication: LegalPublicationSchema.nullable(),
  latestPublication: LegalPublicationSchema.nullable(),
  acceptanceCount: z.number().int().nonnegative(),
  latestAcceptedAt: z.union([z.string(), z.date()]).nullable(),
  queuedChangeRequestCount: z.number().int().nonnegative(),
});

export type LegalDocumentAdminRecord = z.infer<
  typeof LegalDocumentAdminRecordSchema
>;

export const LegalAdminOverviewSchema = z.object({
  documents: z.array(LegalDocumentAdminRecordSchema),
});

export type LegalAdminOverview = z.infer<typeof LegalAdminOverviewSchema>;

export const LegalDocumentCreateSchema = z.object({
  documentKey: LegalDocumentKeySchema,
  locale: LegalDocumentLocaleSchema.default("zh-CN"),
  title: z.string().trim().min(1).max(160),
  htmlContent: z.string().min(1),
  summary: z.string().trim().max(500).nullable().optional(),
  changeNotes: z.string().trim().max(2000).nullable().optional(),
  isRequired: z.boolean().optional(),
});

export type LegalDocumentCreate = z.infer<typeof LegalDocumentCreateSchema>;

export const LegalDocumentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    htmlContent: z.string().min(1).optional(),
    summary: z.string().trim().max(500).nullable().optional(),
    changeNotes: z.string().trim().max(2000).nullable().optional(),
    isRequired: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated.",
  });

export type LegalDocumentUpdate = z.infer<typeof LegalDocumentUpdateSchema>;

export const LegalDocumentPublishDraftSchema = z.object({
  rolloutPercent: z.number().int().min(1).max(100).default(100),
  reason: z.string().trim().max(500).optional(),
});

export type LegalDocumentPublishDraft = z.infer<
  typeof LegalDocumentPublishDraftSchema
>;

export const LegalCurrentDocumentsQuerySchema = z.object({
  documentKey: LegalDocumentKeySchema.optional(),
  locale: LegalDocumentLocaleSchema.optional(),
  audienceId: z.string().trim().min(1).max(255).optional(),
});

export type LegalCurrentDocumentsQuery = z.infer<
  typeof LegalCurrentDocumentsQuerySchema
>;

export const LegalCurrentDocumentSchema = LegalDocumentSchema.extend({
  publication: LegalPublicationSchema,
  acceptedAt: z.union([z.string(), z.date()]).nullable(),
});

export type LegalCurrentDocument = z.infer<typeof LegalCurrentDocumentSchema>;

export const LegalCurrentDocumentsResponseSchema = z.object({
  documents: z.array(LegalCurrentDocumentSchema),
});

export type LegalCurrentDocumentsResponse = z.infer<
  typeof LegalCurrentDocumentsResponseSchema
>;

export const LegalAcceptanceCreateSchema = z.object({
  documentId: z.number().int().positive(),
});

export type LegalAcceptanceCreate = z.infer<typeof LegalAcceptanceCreateSchema>;

export const LegalAcceptanceRecordSchema = z.object({
  id: z.number().int(),
  documentId: z.number().int(),
  publicationId: z.number().int().nullable(),
  userId: z.number().int(),
  source: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  acceptedAt: z.union([z.string(), z.date()]),
});

export type LegalAcceptanceRecord = z.infer<typeof LegalAcceptanceRecordSchema>;
