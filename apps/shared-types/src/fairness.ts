import { z } from 'zod';

export const FairnessCommitSchema = z.object({
  epoch: z.number().int(),
  epochSeconds: z.number().int(),
  commitHash: z.string(),
});

export type FairnessCommit = z.infer<typeof FairnessCommitSchema>;

export const FairnessRevealSchema = FairnessCommitSchema.extend({
  seed: z.string(),
  revealedAt: z.union([z.string(), z.date()]),
});

export type FairnessReveal = z.infer<typeof FairnessRevealSchema>;
