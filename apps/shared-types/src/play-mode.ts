import { z } from "zod";

export const playModeGameKeyValues = [
  "draw",
  "blackjack",
  "holdem",
] as const;

export const playModeTypeValues = [
  "standard",
  "dual_bet",
  "deferred_double",
  "snowball",
] as const;

export const playModeOutcomeValues = ["win", "lose", "push", "miss"] as const;

export const PlayModeTypeSchema = z.enum(playModeTypeValues);
export type PlayModeType = z.infer<typeof PlayModeTypeSchema>;

export const PlayModeGameKeySchema = z.enum(playModeGameKeyValues);
export type PlayModeGameKey = z.infer<typeof PlayModeGameKeySchema>;

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
  pendingPayoutAmount: z.string().default("0.00"),
  pendingPayoutCount: z.number().int().nonnegative().default(0),
  snowballCarryAmount: z.string().default("0.00"),
  snowballEnvelopeAmount: z.string().default("0.00"),
});
export type PlayModeSnapshot = z.infer<typeof PlayModeSnapshotSchema>;

export const PlayModeStateResponseSchema = z.object({
  gameKey: PlayModeGameKeySchema,
  snapshot: PlayModeSnapshotSchema,
});
export type PlayModeStateResponse = z.infer<typeof PlayModeStateResponseSchema>;
