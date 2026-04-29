import { z } from "zod";

export const userFreezeReasonValues = [
  "account_lock",
  "withdrawal_lock",
  "gameplay_lock",
  "pending_kyc",
  "aml_review",
  "auth_failure",
  "manual_admin",
  "forum_moderation",
  "jurisdiction_restriction",
  "underage_restriction",
] as const;

export const userFreezeScopeValues = [
  "account_lock",
  "withdrawal_lock",
  "gameplay_lock",
  "topup_lock",
] as const;

export const userFreezeCategoryValues = [
  "risk",
  "community",
  "compliance",
  "security",
  "support",
  "operations",
] as const;

export const deviceFingerprintEntrypointValues = [
  "login",
  "bet",
  "withdrawal",
] as const;

export const jurisdictionFeatureValues = [
  "real_money_gameplay",
  "topup",
  "withdrawal",
] as const;

export const countryTierValues = [
  "unknown",
  "blocked",
  "restricted",
  "full",
] as const;

export const jurisdictionRestrictionReasonValues = [
  "jurisdiction_restriction",
  "underage_restriction",
] as const;

export const UserFreezeReasonSchema = z.enum(userFreezeReasonValues);
export const UserFreezeScopeSchema = z.enum(userFreezeScopeValues);
export const UserFreezeCategorySchema = z.enum(userFreezeCategoryValues);
export const DeviceFingerprintEntrypointSchema = z.enum(
  deviceFingerprintEntrypointValues,
);
export const JurisdictionFeatureSchema = z.enum(jurisdictionFeatureValues);
export const CountryTierSchema = z.enum(countryTierValues);
export const JurisdictionRestrictionReasonSchema = z.enum(
  jurisdictionRestrictionReasonValues,
);

export type UserFreezeReason = z.infer<typeof UserFreezeReasonSchema>;
export type UserFreezeScope = z.infer<typeof UserFreezeScopeSchema>;
export type UserFreezeCategory = z.infer<typeof UserFreezeCategorySchema>;
export type DeviceFingerprintEntrypoint = z.infer<
  typeof DeviceFingerprintEntrypointSchema
>;
export type JurisdictionFeature = z.infer<typeof JurisdictionFeatureSchema>;
export type CountryTier = z.infer<typeof CountryTierSchema>;
export type JurisdictionRestrictionReason = z.infer<
  typeof JurisdictionRestrictionReasonSchema
>;

export const JurisdictionRuleSchema = z.object({
  id: z.number().int().positive(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  minimumAge: z.number().int().min(0).max(120),
  allowedFeatures: z.array(JurisdictionFeatureSchema),
  notes: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type JurisdictionRule = z.infer<typeof JurisdictionRuleSchema>;

export const JurisdictionRuleUpsertSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  minimumAge: z.number().int().min(0).max(120).default(18),
  allowedFeatures: z
    .array(JurisdictionFeatureSchema)
    .max(jurisdictionFeatureValues.length)
    .default([...jurisdictionFeatureValues]),
  notes: z.string().trim().max(1000).optional(),
});
export type JurisdictionRuleUpsert = z.infer<typeof JurisdictionRuleUpsertSchema>;

export const UserJurisdictionStateSchema = z.object({
  registrationCountryCode: z.string().nullable(),
  birthDate: z.string().nullable(),
  countryTier: CountryTierSchema,
  minimumAge: z.number().int().min(0).max(120),
  userAge: z.number().int().min(0).nullable(),
  isOfAge: z.boolean(),
  allowedFeatures: z.array(JurisdictionFeatureSchema),
  blockedScopes: z.array(UserFreezeScopeSchema),
  restrictionReasons: z.array(JurisdictionRestrictionReasonSchema),
  countryResolvedAt: z.union([z.string(), z.date()]).nullable(),
});
export type UserJurisdictionState = z.infer<typeof UserJurisdictionStateSchema>;
