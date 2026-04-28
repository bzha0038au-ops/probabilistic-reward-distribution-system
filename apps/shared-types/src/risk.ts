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

export const UserFreezeReasonSchema = z.enum(userFreezeReasonValues);
export const UserFreezeScopeSchema = z.enum(userFreezeScopeValues);
export const UserFreezeCategorySchema = z.enum(userFreezeCategoryValues);

export type UserFreezeReason = z.infer<typeof UserFreezeReasonSchema>;
export type UserFreezeScope = z.infer<typeof UserFreezeScopeSchema>;
export type UserFreezeCategory = z.infer<typeof UserFreezeCategorySchema>;
