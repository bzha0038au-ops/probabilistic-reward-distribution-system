import { z } from 'zod';

const DateLikeSchema = z.union([z.string(), z.date()]);
const MetadataSchema = z.record(z.unknown()).nullable();

export const tableStatusValues = ['open', 'running', 'paused', 'closed'] as const;
export const tableSeatStatusValues = [
  'empty',
  'reserved',
  'occupied',
  'sitting_out',
  'cashed_out',
] as const;
export const tableRoundStatusValues = [
  'pending',
  'active',
  'settling',
  'settled',
  'cancelled',
] as const;
export const tableSettlementModelValues = [
  'peer_to_peer',
  'house_bankrolled',
] as const;

export const TableStatusSchema = z.enum(tableStatusValues);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const TableSeatStatusSchema = z.enum(tableSeatStatusValues);
export type TableSeatStatus = z.infer<typeof TableSeatStatusSchema>;

export const TableRoundStatusSchema = z.enum(tableRoundStatusValues);
export type TableRoundStatus = z.infer<typeof TableRoundStatusSchema>;

export const TableSettlementModelSchema = z.enum(tableSettlementModelValues);
export type TableSettlementModel = z.infer<typeof TableSettlementModelSchema>;

export const TablePhaseSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(128).optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  usesTimeBank: z.boolean().default(false),
  metadata: MetadataSchema.optional(),
});
export type TablePhase = z.infer<typeof TablePhaseSchema>;

export const TableDefinitionSchema = z
  .object({
    key: z.string().min(1).max(64),
    gameType: z.string().min(1).max(64),
    settlementModel: TableSettlementModelSchema,
    minSeats: z.number().int().min(1),
    maxSeats: z.number().int().min(1),
    timeBankMs: z.number().int().min(0),
    phases: z.array(TablePhaseSchema).min(1),
    metadata: MetadataSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.minSeats > value.maxSeats) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minSeats'],
        message: 'minSeats must be less than or equal to maxSeats.',
      });
    }

    const seen = new Set<string>();
    value.phases.forEach((phase, index) => {
      if (seen.has(phase.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phases', index, 'key'],
          message: 'Phase keys must be unique.',
        });
        return;
      }

      seen.add(phase.key);
    });
  });
export type TableDefinition = z.infer<typeof TableDefinitionSchema>;

export const TableSchema = z.object({
  id: z.number().int(),
  definitionKey: z.string(),
  gameType: z.string(),
  settlementModel: TableSettlementModelSchema,
  status: TableStatusSchema,
  minSeats: z.number().int(),
  maxSeats: z.number().int(),
  timeBankMs: z.number().int().min(0),
  phases: z.array(TablePhaseSchema).min(1),
  currentPhase: z.string().nullable(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
  startedAt: DateLikeSchema.nullable(),
  closedAt: DateLikeSchema.nullable(),
});
export type Table = z.infer<typeof TableSchema>;

export const TableSeatSchema = z.object({
  id: z.number().int(),
  tableId: z.number().int(),
  seatNumber: z.number().int().positive(),
  userId: z.number().int().nullable(),
  status: TableSeatStatusSchema,
  buyInAmount: z.string(),
  stackAmount: z.string(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
  joinedAt: DateLikeSchema.nullable(),
  leftAt: DateLikeSchema.nullable(),
});
export type TableSeat = z.infer<typeof TableSeatSchema>;

export const TableRoundSchema = z.object({
  id: z.number().int(),
  tableId: z.number().int(),
  roundNumber: z.number().int().positive(),
  status: TableRoundStatusSchema,
  phase: z.string(),
  metadata: MetadataSchema,
  result: MetadataSchema,
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
  startedAt: DateLikeSchema.nullable(),
  settledAt: DateLikeSchema.nullable(),
  phaseDeadlineAt: DateLikeSchema.nullable(),
});
export type TableRound = z.infer<typeof TableRoundSchema>;

export const TableRoundEventSchema = z.object({
  id: z.number().int(),
  tableId: z.number().int().nullable(),
  roundId: z.number().int().nullable(),
  seatId: z.number().int().nullable(),
  userId: z.number().int().nullable(),
  phase: z.string().nullable(),
  eventIndex: z.number().int().nonnegative(),
  eventType: z.string().min(1).max(64),
  actor: z.enum(['player', 'dealer', 'system']),
  payload: MetadataSchema,
  createdAt: DateLikeSchema,
});
export type TableRoundEvent = z.infer<typeof TableRoundEventSchema>;

export const TableSnapshotSchema = z.object({
  table: TableSchema,
  seats: z.array(TableSeatSchema),
  activeRound: TableRoundSchema.nullable(),
});
export type TableSnapshot = z.infer<typeof TableSnapshotSchema>;
