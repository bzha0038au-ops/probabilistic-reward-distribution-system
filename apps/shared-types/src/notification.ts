import { z } from 'zod';

import { OptionalStringSchema } from './common';

export const authNotificationKindValues = [
  'password_reset',
  'email_verification',
  'phone_verification',
  'security_alert',
  'aml_review',
  'saas_tenant_invite',
] as const;
export const AuthNotificationKindSchema = z.enum(authNotificationKindValues);
export type AuthNotificationKind = z.infer<typeof AuthNotificationKindSchema>;

export const authNotificationChannelValues = ['email', 'sms'] as const;
export const AuthNotificationChannelSchema = z.enum(
  authNotificationChannelValues
);
export type AuthNotificationChannel = z.infer<
  typeof AuthNotificationChannelSchema
>;

export const notificationProviderValues = [
  'smtp',
  'twilio',
  'webhook',
  'mock',
] as const;
export const NotificationProviderSchema = z.enum(notificationProviderValues);
export type NotificationProvider = z.infer<typeof NotificationProviderSchema>;

export const notificationDeliveryStatusValues = [
  'pending',
  'processing',
  'sent',
  'failed',
] as const;
export const NotificationDeliveryStatusSchema = z.enum(
  notificationDeliveryStatusValues
);
export type NotificationDeliveryStatus = z.infer<
  typeof NotificationDeliveryStatusSchema
>;

export const notificationDeliveryAttemptStatusValues = [
  'sent',
  'retry',
  'failed',
] as const;
export const NotificationDeliveryAttemptStatusSchema = z.enum(
  notificationDeliveryAttemptStatusValues
);
export type NotificationDeliveryAttemptStatus = z.infer<
  typeof NotificationDeliveryAttemptStatusSchema
>;

export const NotificationProviderAvailabilitySchema = z.union([
  NotificationProviderSchema,
  z.literal('unavailable'),
]);
export type NotificationProviderAvailability = z.infer<
  typeof NotificationProviderAvailabilitySchema
>;

const DateLikeSchema = z.union([z.string(), z.date()]);
const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const NotificationDeliveryRecordSchema = z.object({
  id: z.number().int(),
  kind: AuthNotificationKindSchema,
  channel: AuthNotificationChannelSchema,
  recipient: z.string(),
  recipientKey: z.string(),
  provider: NotificationProviderSchema,
  subject: z.string(),
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
});
export type NotificationProviderStatus = z.infer<
  typeof NotificationProviderStatusSchema
>;

export const NotificationDeliverySummarySchema = z.object({
  counts: z.record(NotificationDeliveryStatusSchema, z.number().int().nonnegative()),
  oldestPendingAt: DateLikeSchema.nullable(),
  providers: NotificationProviderStatusSchema,
});
export type NotificationDeliverySummary = z.infer<
  typeof NotificationDeliverySummarySchema
>;

export const NotificationDeliveryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: NotificationDeliveryStatusSchema.optional(),
  kind: AuthNotificationKindSchema.optional(),
  recipient: OptionalStringSchema,
});
export type NotificationDeliveryQuery = z.infer<
  typeof NotificationDeliveryQuerySchema
>;
