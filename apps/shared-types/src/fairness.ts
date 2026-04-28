import { z } from 'zod';

export const FairnessAuditStatusSchema = z.object({
  latestAuditedEpoch: z.number().int().nullable(),
  lastAuditPassed: z.boolean().nullable(),
  lastAuditedAt: z.union([z.string(), z.date()]).nullable(),
  consecutiveVerifiedEpochs: z.number().int().nonnegative(),
  consecutiveVerifiedDays: z.number().int().nonnegative(),
});

export type FairnessAuditStatus = z.infer<typeof FairnessAuditStatusSchema>;

const FairnessCommitCoreSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
});

export const FairnessCommitSchema = FairnessCommitCoreSchema.extend({
  audit: FairnessAuditStatusSchema.optional(),
});

export type FairnessCommit = z.infer<typeof FairnessCommitSchema>;

export const FairnessRevealSchema = FairnessCommitCoreSchema.extend({
  seed: z.string(),
  revealedAt: z.union([z.string(), z.date()]),
});

export type FairnessReveal = z.infer<typeof FairnessRevealSchema>;
