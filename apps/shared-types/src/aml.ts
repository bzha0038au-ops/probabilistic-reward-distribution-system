import { z } from 'zod';

export const amlCheckpointValues = [
  'registration',
  'first_deposit',
  'withdrawal_request',
] as const;
export const AmlCheckpointSchema = z.enum(amlCheckpointValues);
export type AmlCheckpoint = z.infer<typeof AmlCheckpointSchema>;

export const amlProviderKeyValues = ['mock'] as const;
export const AmlProviderKeySchema = z.enum(amlProviderKeyValues);
export type AmlProviderKey = z.infer<typeof AmlProviderKeySchema>;

export const amlCheckResultValues = [
  'clear',
  'hit',
  'provider_error',
] as const;
export const AmlCheckResultSchema = z.enum(amlCheckResultValues);
export type AmlCheckResult = z.infer<typeof AmlCheckResultSchema>;

export const amlRiskLevelValues = ['low', 'medium', 'high'] as const;
export const AmlRiskLevelSchema = z.enum(amlRiskLevelValues);
export type AmlRiskLevel = z.infer<typeof AmlRiskLevelSchema>;

export const amlReviewStatusValues = [
  'pending',
  'cleared',
  'confirmed',
  'escalated',
] as const;
export const AmlReviewStatusSchema = z.enum(amlReviewStatusValues);
export type AmlReviewStatus = z.infer<typeof AmlReviewStatusSchema>;
