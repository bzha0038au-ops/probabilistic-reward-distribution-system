import { z } from 'zod';

const DateLikeSchema = z.union([z.string(), z.date()]);

export const saasStatusLevelValues = [
  'operational',
  'degraded',
  'outage',
] as const;
export const SaasStatusLevelSchema = z.enum(saasStatusLevelValues);
export type SaasStatusLevel = z.infer<typeof SaasStatusLevelSchema>;

export const SaasStatusThresholdSchema = z.object({
  degraded: z.number().finite().nonnegative(),
  outage: z.number().finite().nonnegative(),
});
export type SaasStatusThreshold = z.infer<typeof SaasStatusThresholdSchema>;

export const SaasStatusThresholdsSchema = z.object({
  apiErrorRatePct: SaasStatusThresholdSchema,
  apiP95Ms: SaasStatusThresholdSchema,
  workerLagMs: SaasStatusThresholdSchema,
  monthlySlaTargetPct: z.number().finite().nonnegative(),
});
export type SaasStatusThresholds = z.infer<typeof SaasStatusThresholdsSchema>;

export const SaasStatusMinuteSchema = z.object({
  minuteStart: DateLikeSchema,
  totalRequestCount: z.number().int().nonnegative(),
  availabilityEligibleRequestCount: z.number().int().nonnegative(),
  availabilityErrorCount: z.number().int().nonnegative(),
  errorRatePct: z.number().finite().nonnegative(),
  apiP95Ms: z.number().int().nonnegative(),
  workerLagMs: z.number().int().nonnegative(),
  stripeWebhookReadyCount: z.number().int().nonnegative(),
  stripeWebhookLagMs: z.number().int().nonnegative(),
  outboundWebhookReadyCount: z.number().int().nonnegative(),
  outboundWebhookLagMs: z.number().int().nonnegative(),
  apiStatus: SaasStatusLevelSchema,
  workerStatus: SaasStatusLevelSchema,
  overallStatus: SaasStatusLevelSchema,
  computedAt: DateLikeSchema,
});
export type SaasStatusMinute = z.infer<typeof SaasStatusMinuteSchema>;

export const SaasStatusSummarySchema = z.object({
  generatedAt: DateLikeSchema,
  latestMinuteStart: DateLikeSchema.nullable(),
  currentStatus: SaasStatusLevelSchema,
  currentWindowMinutes: z.number().int().positive(),
  totalRequestsLastHour: z.number().int().nonnegative(),
  availabilityEligibleRequestsLastHour: z.number().int().nonnegative(),
  availabilityErrorRatePctLastHour: z.number().finite().nonnegative(),
  peakApiP95MsLastHour: z.number().int().nonnegative(),
  workerLagMsCurrent: z.number().int().nonnegative(),
});
export type SaasStatusSummary = z.infer<typeof SaasStatusSummarySchema>;

export const SaasMonthlySlaSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  targetPct: z.number().finite().nonnegative(),
  actualPct: z.number().finite().nonnegative(),
  metTarget: z.boolean(),
  observedMinutes: z.number().int().nonnegative(),
  elapsedMinutes: z.number().int().nonnegative(),
  coveragePct: z.number().finite().min(0).max(100),
  operationalMinutes: z.number().int().nonnegative(),
  degradedMinutes: z.number().int().nonnegative(),
  outageMinutes: z.number().int().nonnegative(),
  trackingStartedAt: DateLikeSchema.nullable(),
});
export type SaasMonthlySla = z.infer<typeof SaasMonthlySlaSchema>;

export const SaasPublicStatusPageSchema = z.object({
  summary: SaasStatusSummarySchema,
  monthlySla: SaasMonthlySlaSchema,
  thresholds: SaasStatusThresholdsSchema,
  recentMinutes: z.array(SaasStatusMinuteSchema),
});
export type SaasPublicStatusPage = z.infer<typeof SaasPublicStatusPageSchema>;
