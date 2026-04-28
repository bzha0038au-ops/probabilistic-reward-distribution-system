import { z } from "zod";

const DateLikeSchema = z.union([z.string(), z.date()]);

export const tableMonitoringSourceKindValues = [
  "blackjack",
  "holdem",
  "live_dealer",
  "prediction_market",
] as const;

export const tableMonitoringStatusValues = [
  "active",
  "overdue",
  "closing",
  "closed",
] as const;

export const tableMonitoringPhaseValues = [
  "waiting",
  "betting",
  "player_turn",
  "dealer_turn",
  "market_open",
  "market_locked",
  "settling",
  "resolved",
  "closed",
] as const;

export const tableMonitoringSeatRoleValues = [
  "dealer",
  "player",
  "observer",
  "market_maker",
] as const;

export const tableMonitoringSeatStatusValues = [
  "empty",
  "occupied",
  "acting",
  "waiting",
  "timed_out",
  "removed",
] as const;

export const tableMonitoringActionValues = [
  "force_timeout",
  "close_table",
  "kick_seat",
] as const;

export const TableMonitoringSourceKindSchema = z.enum(
  tableMonitoringSourceKindValues,
);
export type TableMonitoringSourceKind = z.infer<
  typeof TableMonitoringSourceKindSchema
>;

export const TableMonitoringStatusSchema = z.enum(
  tableMonitoringStatusValues,
);
export type TableMonitoringStatus = z.infer<
  typeof TableMonitoringStatusSchema
>;

export const TableMonitoringPhaseSchema = z.enum(
  tableMonitoringPhaseValues,
);
export type TableMonitoringPhase = z.infer<typeof TableMonitoringPhaseSchema>;

export const TableMonitoringSeatRoleSchema = z.enum(
  tableMonitoringSeatRoleValues,
);
export type TableMonitoringSeatRole = z.infer<
  typeof TableMonitoringSeatRoleSchema
>;

export const TableMonitoringSeatStatusSchema = z.enum(
  tableMonitoringSeatStatusValues,
);
export type TableMonitoringSeatStatus = z.infer<
  typeof TableMonitoringSeatStatusSchema
>;

export const TableMonitoringActionSchema = z.enum(
  tableMonitoringActionValues,
);
export type TableMonitoringAction = z.infer<
  typeof TableMonitoringActionSchema
>;

export const TableMonitoringSeatSchema = z.object({
  seatIndex: z.number().int().nonnegative(),
  role: TableMonitoringSeatRoleSchema,
  participantType: z.string().min(1).max(64),
  participantId: z.string().min(1).max(255).nullable(),
  userId: z.number().int().positive().nullable(),
  displayName: z.string().min(1).max(255).nullable(),
  status: TableMonitoringSeatStatusSchema,
  isCurrentActor: z.boolean(),
  isTimedOut: z.boolean(),
  canKick: z.boolean(),
});
export type TableMonitoringSeat = z.infer<typeof TableMonitoringSeatSchema>;

export const TableMonitoringTableSchema = z.object({
  sourceKind: TableMonitoringSourceKindSchema,
  tableId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(160),
  roundId: z.string().min(1).max(160).nullable(),
  status: TableMonitoringStatusSchema,
  phase: TableMonitoringPhaseSchema,
  currentActorSeatIndex: z.number().int().nonnegative().nullable(),
  actionDeadlineAt: DateLikeSchema.nullable(),
  timeBankTotalMs: z.number().int().nonnegative().nullable(),
  timeBankRemainingMs: z.number().int().nonnegative().nullable(),
  canForceTimeout: z.boolean(),
  canClose: z.boolean(),
  seats: z.array(TableMonitoringSeatSchema),
  updatedAt: DateLikeSchema,
});
export type TableMonitoringTable = z.infer<typeof TableMonitoringTableSchema>;

export const TableMonitoringSnapshotSchema = z.object({
  generatedAt: DateLikeSchema,
  tables: z.array(TableMonitoringTableSchema),
});
export type TableMonitoringSnapshot = z.infer<
  typeof TableMonitoringSnapshotSchema
>;

const ActionReasonSchema = z.string().trim().min(1).max(255);

export const ForceTimeoutAdminRequestSchema = z.object({
  reason: ActionReasonSchema.optional(),
  totpCode: z.string().trim().min(1).max(64).optional(),
});
export type ForceTimeoutAdminRequest = z.infer<
  typeof ForceTimeoutAdminRequestSchema
>;

export const CloseTableAdminRequestSchema = z.object({
  reason: ActionReasonSchema,
  totpCode: z.string().trim().min(1).max(64).optional(),
});
export type CloseTableAdminRequest = z.infer<
  typeof CloseTableAdminRequestSchema
>;

export const KickSeatAdminRequestSchema = z.object({
  reason: ActionReasonSchema,
  totpCode: z.string().trim().min(1).max(64).optional(),
});
export type KickSeatAdminRequest = z.infer<typeof KickSeatAdminRequestSchema>;

export const TableMonitoringActionResultSchema = z.object({
  sourceKind: TableMonitoringSourceKindSchema,
  tableId: z.string().min(1).max(128),
  action: TableMonitoringActionSchema,
  seatIndex: z.number().int().nonnegative().nullable(),
  removed: z.boolean(),
});
export type TableMonitoringActionResult = z.infer<
  typeof TableMonitoringActionResultSchema
>;

export const TableMonitoringWsAccessTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: DateLikeSchema,
});
export type TableMonitoringWsAccessToken = z.infer<
  typeof TableMonitoringWsAccessTokenSchema
>;

export const TableMonitoringChannelSnapshotEventSchema = z.object({
  type: z.literal("snapshot"),
  snapshot: TableMonitoringSnapshotSchema,
});

export const TableMonitoringChannelErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string().min(1),
});

export const TableMonitoringChannelEventSchema = z.union([
  TableMonitoringChannelSnapshotEventSchema,
  TableMonitoringChannelErrorEventSchema,
]);
export type TableMonitoringChannelEvent = z.infer<
  typeof TableMonitoringChannelEventSchema
>;
