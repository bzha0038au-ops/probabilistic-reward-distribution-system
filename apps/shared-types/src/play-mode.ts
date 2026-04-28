import { z } from "zod";

export const playModeTypeValues = [
  "standard",
  "dual_bet",
  "deferred_double",
  "snowball",
] as const;

export const playModeOutcomeValues = ["win", "lose", "push", "miss"] as const;

export const PlayModeTypeSchema = z.enum(playModeTypeValues);
export type PlayModeType = z.infer<typeof PlayModeTypeSchema>;

export const PlayModeOutcomeSchema = z.enum(playModeOutcomeValues);
export type PlayModeOutcome = z.infer<typeof PlayModeOutcomeSchema>;

export const PlayModeRequestSchema = z.object({
  type: PlayModeTypeSchema,
});
export type PlayModeRequest = z.infer<typeof PlayModeRequestSchema>;

export const PlayModeSnapshotSchema = z.object({
  type: PlayModeTypeSchema,
  appliedMultiplier: z.number().int().positive(),
  nextMultiplier: z.number().int().positive(),
  streak: z.number().int().nonnegative(),
  lastOutcome: PlayModeOutcomeSchema.nullable(),
  carryActive: z.boolean(),
});
export type PlayModeSnapshot = z.infer<typeof PlayModeSnapshotSchema>;
