import { z } from "zod";

import { LimitedPageSizeSchema, OptionalStringSchema } from "./common";

export const notificationKindValues = [
  "password_reset",
  "email_verification",
  "phone_verification",
  "security_alert",
  "aml_review",
  "saas_tenant_invite",
  "saas_onboarding_complete",
  "saas_billing_budget_alert",
  "kyc_reverification",
  "kyc_status_changed",
  "withdrawal_status_changed",
  "prediction_market_settled",
  "holdem_table_invite",
] as const;
export const NotificationKindSchema = z.enum(notificationKindValues);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const authNotificationKindValues = [
  "password_reset",
  "email_verification",
  "phone_verification",
  "security_alert",
  "aml_review",
  "kyc_reverification",
  "saas_tenant_invite",
  "saas_billing_budget_alert",
  "saas_onboarding_complete",
] as const;
export const AuthNotificationKindSchema = z.enum(authNotificationKindValues);
export type AuthNotificationKind = z.infer<typeof AuthNotificationKindSchema>;

export const notificationChannelValues = [
  "email",
  "sms",
  "push",
  "in_app",
] as const;
export const NotificationChannelSchema = z.enum(notificationChannelValues);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const authNotificationChannelValues = ["email", "sms"] as const;
export const AuthNotificationChannelSchema = z.enum(
  authNotificationChannelValues,
);
export type AuthNotificationChannel = z.infer<
  typeof AuthNotificationChannelSchema
>;

export const notificationProviderValues = [
  "smtp",
  "twilio",
  "expo_push",
  "webhook",
  "mock",
  "in_app",
] as const;
export const NotificationProviderSchema = z.enum(notificationProviderValues);
export type NotificationProvider = z.infer<typeof NotificationProviderSchema>;

export const notificationDeliveryStatusValues = [
  "pending",
  "processing",
  "sent",
  "failed",
] as const;
export const NotificationDeliveryStatusSchema = z.enum(
  notificationDeliveryStatusValues,
);
export type NotificationDeliveryStatus = z.infer<
  typeof NotificationDeliveryStatusSchema
>;

export const notificationDeliveryAttemptStatusValues = [
  "sent",
  "retry",
  "failed",
] as const;
export const NotificationDeliveryAttemptStatusSchema = z.enum(
  notificationDeliveryAttemptStatusValues,
);
export type NotificationDeliveryAttemptStatus = z.infer<
  typeof NotificationDeliveryAttemptStatusSchema
>;

export const NotificationProviderAvailabilitySchema = z.union([
  NotificationProviderSchema,
  z.literal("unavailable"),
]);
export type NotificationProviderAvailability = z.infer<
  typeof NotificationProviderAvailabilitySchema
>;

const DateLikeSchema = z.union([z.string(), z.date()]);
const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();
const OptionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return value;
}, z.boolean().optional());

export const NotificationRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  readAt: DateLikeSchema.nullable(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

export const NotificationPreferenceRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  kind: NotificationKindSchema,
  channel: NotificationChannelSchema,
  enabled: z.boolean(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type NotificationPreferenceRecord = z.infer<
  typeof NotificationPreferenceRecordSchema
>;

export const NotificationPreferenceMutationSchema = z.object({
  kind: NotificationKindSchema,
  channel: NotificationChannelSchema,
  enabled: z.boolean(),
});
export type NotificationPreferenceMutation = z.infer<
  typeof NotificationPreferenceMutationSchema
>;

export const NotificationPreferencesUpdateRequestSchema = z.object({
  items: z.array(NotificationPreferenceMutationSchema).min(1).max(100),
});
export type NotificationPreferencesUpdateRequest = z.infer<
  typeof NotificationPreferencesUpdateRequestSchema
>;

export const NotificationListQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  unreadOnly: OptionalBooleanQuerySchema,
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationSummarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  latestCreatedAt: DateLikeSchema.nullable(),
});
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>;

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationRecordSchema),
});
export type NotificationListResponse = z.infer<
  typeof NotificationListResponseSchema
>;

export const NotificationPreferencesResponseSchema = z.object({
  items: z.array(NotificationPreferenceRecordSchema),
});
export type NotificationPreferencesResponse = z.infer<
  typeof NotificationPreferencesResponseSchema
>;

export const notificationPushPlatformValues = ["ios", "android"] as const;
export const NotificationPushPlatformSchema = z.enum(
  notificationPushPlatformValues,
);
export type NotificationPushPlatform = z.infer<
  typeof NotificationPushPlatformSchema
>;

export const NotificationPushDeviceRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  token: z.string(),
  platform: NotificationPushPlatformSchema,
  deviceFingerprint: z.string().nullable(),
  active: z.boolean(),
  lastRegisteredAt: DateLikeSchema,
  lastDeliveredAt: DateLikeSchema.nullable(),
  lastError: z.string().nullable(),
  deactivatedAt: DateLikeSchema.nullable(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type NotificationPushDeviceRecord = z.infer<
  typeof NotificationPushDeviceRecordSchema
>;

export const NotificationPushDeviceRegisterRequestSchema = z.object({
  token: z.string().trim().min(1).max(255),
  platform: NotificationPushPlatformSchema,
});
export type NotificationPushDeviceRegisterRequest = z.infer<
  typeof NotificationPushDeviceRegisterRequestSchema
>;

export const NotificationPushDeviceDeleteRequestSchema = z.object({
  token: z.string().trim().min(1).max(255),
});
export type NotificationPushDeviceDeleteRequest = z.infer<
  typeof NotificationPushDeviceDeleteRequestSchema
>;

export const NotificationDeliveryRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  notificationRecordId: z.number().int().nullable(),
  kind: NotificationKindSchema,
  channel: NotificationChannelSchema,
  recipient: z.string(),
  recipientKey: z.string(),
  provider: NotificationProviderSchema,
  subject: z.string(),
  body: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  status: NotificationDeliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: DateLikeSchema,
  lastAttemptAt: DateLikeSchema.nullable(),
  lockedAt: DateLikeSchema.nullable(),
  deliveredAt: DateLikeSchema.nullable(),
  providerMessageId: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
});
export type NotificationDeliveryRecord = z.infer<
  typeof NotificationDeliveryRecordSchema
>;

export const NotificationDeliveryAttemptRecordSchema = z.object({
  id: z.number().int(),
  deliveryId: z.number().int(),
  attemptNumber: z.number().int().positive(),
  provider: NotificationProviderSchema,
  status: NotificationDeliveryAttemptStatusSchema,
  responseCode: z.number().int().nullable().optional(),
  providerMessageId: z.string().nullable().optional(),
  latencyMs: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema,
});
export type NotificationDeliveryAttemptRecord = z.infer<
  typeof NotificationDeliveryAttemptRecordSchema
>;

export const NotificationProviderStatusSchema = z.object({
  emailProvider: NotificationProviderAvailabilitySchema,
  smsProvider: NotificationProviderAvailabilitySchema,
  pushProvider: NotificationProviderAvailabilitySchema,
});
export type NotificationProviderStatus = z.infer<
  typeof NotificationProviderStatusSchema
>;

export const NotificationDeliverySummarySchema = z.object({
  counts: z.record(
    NotificationDeliveryStatusSchema,
    z.number().int().nonnegative(),
  ),
  oldestPendingAt: DateLikeSchema.nullable(),
  providers: NotificationProviderStatusSchema,
});
export type NotificationDeliverySummary = z.infer<
  typeof NotificationDeliverySummarySchema
>;

export const NotificationDeliveryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: NotificationDeliveryStatusSchema.optional(),
  kind: NotificationKindSchema.optional(),
  recipient: OptionalStringSchema,
});
export type NotificationDeliveryQuery = z.infer<
  typeof NotificationDeliveryQuerySchema
>;
