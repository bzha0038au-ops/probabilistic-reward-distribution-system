import { z } from 'zod';
import type { DealerEvent } from '@reward/shared-types/dealer';
import {
  ledgerEntries,
  roundEvents,
  rounds,
  seats,
  tables,
  userWallets,
  users,
} from '@reward/database';
import { asc, desc, eq, sql } from '@reward/database/orm';
import {
  TableDefinitionSchema,
  TablePhaseSchema,
  type Table,
  type TableDefinition,
  type TableRound,
  type TableRoundEvent,
  type TableSeat,
  type TableSettlementModel,
  type TableSnapshot,
} from '@reward/shared-types/table-engine';

import { db, type DbClient, type DbTransaction } from '../../db';
import {
  badRequestError,
  conflictError,
  internalInvariantError,
  notFoundError,
  persistenceError,
} from '../../shared/errors';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';
import { parseSchema } from '../../shared/validation';
import {
  buildDealerEvent,
  maybeGenerateDealerLanguageEvent,
  publishDealerRealtimeToTopic,
} from '../dealer-bot/service';
import { applyPrizePoolDelta } from '../house/service';

const TABLE_ROUND_EVENT_TYPE = 'table_round' as const;
const TablePhaseListSchema = z.array(TablePhaseSchema);

type DbExecutor = DbClient | DbTransaction;
type MoneyAmount = ReturnType<typeof toDecimal>;
type MetadataRecord = Record<string, unknown> | null;
type TimestampLike = Date | string | null;

type TableRowLike = {
  id: number;
  definitionKey: string;
  gameType: string;
  settlementModel: TableSettlementModel;
  status: Table['status'];
  minSeats: number;
  maxSeats: number;
  timeBankMs: number;
  currentPhase: string | null;
  phaseOrder: unknown;
  metadata: unknown;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  startedAt: TimestampLike;
  closedAt: TimestampLike;
};

type SeatRowLike = {
  id: number;
  tableId: number;
  seatNumber: number;
  userId: number | null;
  status: TableSeat['status'];
  buyInAmount: string | number;
  stackAmount: string | number;
  metadata: unknown;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  joinedAt: TimestampLike;
  leftAt: TimestampLike;
};

type RoundRowLike = {
  id: number;
  tableId: number;
  roundNumber: number;
  status: TableRound['status'];
  phase: string;
  metadata: unknown;
  result: unknown;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  startedAt: TimestampLike;
  settledAt: TimestampLike;
  phaseDeadlineAt: TimestampLike;
};

type RoundEventRowLike = {
  id: number;
  tableId: number | null;
  tableRoundId: number | null;
  seatId: number | null;
  userId: number | null;
  phase: string | null;
  eventIndex: number;
  eventType: string;
  actor: 'player' | 'dealer' | 'system';
  payload: unknown;
  createdAt: TimestampLike;
};

type LockedWalletRow = {
  userId: number;
  withdrawableBalance: string | number;
  lockedBalance: string | number;
};

type SettlementSeatInput = {
  seatId: number;
  resultingStackAmount: string;
  metadata?: Record<string, unknown> | null;
};

export const defineTableDefinition = (definition: TableDefinition) => {
  const parsed = parseSchema(TableDefinitionSchema, definition);
  if (!parsed.isValid) {
    throw badRequestError('Invalid table definition.', {
      details: parsed.errors,
    });
  }

  return parsed.data;
};

export const TEXAS_HOLDEM_TABLE_DEFINITION = defineTableDefinition({
  key: 'texas_holdem',
  gameType: 'texas_holdem',
  settlementModel: 'peer_to_peer',
  minSeats: 2,
  maxSeats: 9,
  timeBankMs: 30000,
  phases: [
    { key: 'lobby', label: 'Lobby', usesTimeBank: false },
    { key: 'preflop', label: 'Preflop', durationMs: 30000, usesTimeBank: true },
    { key: 'flop', label: 'Flop', durationMs: 30000, usesTimeBank: true },
    { key: 'turn', label: 'Turn', durationMs: 30000, usesTimeBank: true },
    { key: 'river', label: 'River', durationMs: 30000, usesTimeBank: true },
    { key: 'showdown', label: 'Showdown', durationMs: 15000, usesTimeBank: false },
    { key: 'settlement', label: 'Settlement', durationMs: 15000, usesTimeBank: false },
  ],
});

export const LIVE_DEALER_TABLE_DEFINITION = defineTableDefinition({
  key: 'live_dealer',
  gameType: 'live_dealer',
  settlementModel: 'house_bankrolled',
  minSeats: 1,
  maxSeats: 7,
  timeBankMs: 15000,
  phases: [
    { key: 'lobby', label: 'Lobby', usesTimeBank: false },
    { key: 'betting_open', label: 'Betting Open', durationMs: 20000, usesTimeBank: true },
    { key: 'betting_closed', label: 'Betting Closed', durationMs: 10000, usesTimeBank: false },
    { key: 'reveal', label: 'Reveal', durationMs: 15000, usesTimeBank: false },
    { key: 'settlement', label: 'Settlement', durationMs: 10000, usesTimeBank: false },
  ],
});

export const PREDICTION_MARKET_TABLE_DEFINITION = defineTableDefinition({
  key: 'prediction_market',
  gameType: 'prediction_market',
  settlementModel: 'peer_to_peer',
  minSeats: 2,
  maxSeats: 50,
  timeBankMs: 20000,
  phases: [
    { key: 'lobby', label: 'Lobby', usesTimeBank: false },
    { key: 'market_open', label: 'Market Open', durationMs: 30000, usesTimeBank: true },
    { key: 'market_locked', label: 'Market Locked', durationMs: 15000, usesTimeBank: false },
    { key: 'resolution', label: 'Resolution', durationMs: 15000, usesTimeBank: false },
    { key: 'settlement', label: 'Settlement', durationMs: 10000, usesTimeBank: false },
  ],
});

export const TABLE_DEFINITION_PRESETS = {
  texas_holdem: TEXAS_HOLDEM_TABLE_DEFINITION,
  live_dealer: LIVE_DEALER_TABLE_DEFINITION,
  prediction_market: PREDICTION_MARKET_TABLE_DEFINITION,
} as const;

const normalizeMetadata = (value: unknown): MetadataRecord => {
  if (typeof value === 'string') {
    try {
      return normalizeMetadata(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const parsePhaseOrder = (value: unknown) => {
  const parsed = parseSchema(TablePhaseListSchema, value);
  if (!parsed.isValid) {
    throw internalInvariantError('Invalid table phase snapshot.');
  }

  return parsed.data;
};

const mapTableRow = (row: TableRowLike): Table => ({
  id: row.id,
  definitionKey: row.definitionKey,
  gameType: row.gameType,
  settlementModel: row.settlementModel,
  status: row.status,
  minSeats: row.minSeats,
  maxSeats: row.maxSeats,
  timeBankMs: row.timeBankMs,
  phases: parsePhaseOrder(row.phaseOrder),
  currentPhase: row.currentPhase,
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt ?? new Date(),
  updatedAt: row.updatedAt ?? new Date(),
  startedAt: row.startedAt ?? null,
  closedAt: row.closedAt ?? null,
});

const mapSeatRow = (row: SeatRowLike): TableSeat => ({
  id: row.id,
  tableId: row.tableId,
  seatNumber: row.seatNumber,
  userId: row.userId,
  status: row.status,
  buyInAmount: toMoneyString(row.buyInAmount ?? 0),
  stackAmount: toMoneyString(row.stackAmount ?? 0),
  metadata: normalizeMetadata(row.metadata),
  createdAt: row.createdAt ?? new Date(),
  updatedAt: row.updatedAt ?? new Date(),
  joinedAt: row.joinedAt ?? null,
  leftAt: row.leftAt ?? null,
});

const mapRoundRow = (row: RoundRowLike): TableRound => ({
  id: row.id,
  tableId: row.tableId,
  roundNumber: row.roundNumber,
  status: row.status,
  phase: row.phase,
  metadata: normalizeMetadata(row.metadata),
  result: normalizeMetadata(row.result),
  createdAt: row.createdAt ?? new Date(),
  updatedAt: row.updatedAt ?? new Date(),
  startedAt: row.startedAt ?? null,
  settledAt: row.settledAt ?? null,
  phaseDeadlineAt: row.phaseDeadlineAt ?? null,
});

const mapRoundEventRow = (row: RoundEventRowLike): TableRoundEvent => ({
  id: row.id,
  tableId: row.tableId,
  roundId: row.tableRoundId,
  seatId: row.seatId,
  userId: row.userId,
  phase: row.phase,
  eventIndex: row.eventIndex,
  eventType: row.eventType,
  actor: row.actor,
  payload: normalizeMetadata(row.payload),
  createdAt: row.createdAt ?? new Date(),
});

const parseMoneyAmount = (
  value: string,
  label: string,
  options: { allowZero?: boolean } = {},
) => {
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw badRequestError(`Invalid ${label}.`);
  }

  if (
    !amount.isFinite() ||
    amount.lt(0) ||
    (!options.allowZero && amount.lte(0)) ||
    amount.decimalPlaces() > 2
  ) {
    throw badRequestError(`Invalid ${label}.`);
  }

  return amount;
};

const mergeMetadata = (
  current: MetadataRecord,
  next: MetadataRecord,
): MetadataRecord => {
  if (!current) {
    return next ?? null;
  }

  if (!next) {
    return current;
  }

  return {
    ...current,
    ...next,
  };
};

const toTimestampValue = (value: TimestampLike) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const next = new Date(value);
  if (Number.isNaN(next.valueOf())) {
    return null;
  }

  return next;
};

const calculatePhaseDeadline = (
  definition: TableDefinition,
  phaseKey: string,
  now: Date,
) => {
  const phase = definition.phases.find((entry) => entry.key === phaseKey);
  if (!phase?.durationMs) {
    return null;
  }

  return new Date(now.getTime() + phase.durationMs);
};

export const getInitialTablePhase = (definition: TableDefinition) =>
  definition.phases[0]?.key ?? null;

export const getNextTablePhase = (
  definition: TableDefinition,
  currentPhase: string,
) => {
  const currentIndex = definition.phases.findIndex(
    (phase) => phase.key === currentPhase,
  );
  if (currentIndex < 0) {
    throw conflictError(`Unknown table phase "${currentPhase}".`);
  }

  return definition.phases[currentIndex + 1]?.key ?? null;
};

const buildTableEngineRealtimeTopic = (tableId: number) => `public:table:${tableId}`;
const buildTableEngineTableRef = (tableId: number) => `table-engine:${tableId}`;

const buildTableEngineDealerEvent = (params: {
  tableId: number;
  roundId: number;
  phase: string;
  actionCode: string;
  text: string;
  source?: DealerEvent['source'];
  metadata?: Record<string, unknown> | null;
}) =>
  buildDealerEvent({
    kind: 'action',
    source: params.source ?? 'rule',
    gameType: 'table_engine',
    tableId: params.tableId,
    tableRef: buildTableEngineTableRef(params.tableId),
    roundId: `table_round:${params.roundId}`,
    referenceId: params.roundId,
    phase: params.phase,
    actionCode: params.actionCode,
    text: params.text,
    metadata: params.metadata ?? null,
  });

const publishTableEngineDealerEvent = (tableId: number, event: DealerEvent) => {
  publishDealerRealtimeToTopic(buildTableEngineRealtimeTopic(tableId), event);
};

const emitAsyncTableEngineDealerLanguageEvent = (params: {
  tableId: number;
  roundId: number;
  phase: string;
  summary: Record<string, unknown>;
}) => {
  void (async () => {
    const event = await maybeGenerateDealerLanguageEvent({
      scenario: 'table_phase_entered',
      locale: '',
      gameType: 'table_engine',
      tableId: params.tableId,
      tableRef: buildTableEngineTableRef(params.tableId),
      roundId: `table_round:${params.roundId}`,
      referenceId: params.roundId,
      phase: params.phase,
      seatIndex: null,
      summary: params.summary,
    });
    if (!event) {
      return;
    }

    const appended = await appendTableRoundEvent({
      roundId: params.roundId,
      eventType: 'dealer_message',
      actor: 'dealer',
      payload: {
        dealerEvent: event,
      },
    });

    publishTableEngineDealerEvent(params.tableId, event);
    return appended;
  })().catch((error) => {
    logger.warning('table engine dealer bot async emission failed', {
      err: error,
      tableId: params.tableId,
      roundId: params.roundId,
      phase: params.phase,
    });
  });
};

export const resolveTableBuyIn = (params: {
  withdrawableBefore: MoneyAmount;
  lockedBefore: MoneyAmount;
  amount: MoneyAmount;
}) => {
  const { withdrawableBefore, lockedBefore, amount } = params;
  if (amount.lte(0)) {
    throw badRequestError('Buy-in amount must be greater than 0.');
  }
  if (withdrawableBefore.lt(amount)) {
    throw conflictError('Insufficient balance for table buy-in.');
  }

  return {
    withdrawableBefore,
    withdrawableAfter: withdrawableBefore.minus(amount),
    lockedBefore,
    lockedAfter: lockedBefore.plus(amount),
  };
};

export const resolveTableCashOut = (params: {
  withdrawableBefore: MoneyAmount;
  lockedBefore: MoneyAmount;
  amount: MoneyAmount;
}) => {
  const { withdrawableBefore, lockedBefore, amount } = params;
  if (amount.lt(0)) {
    throw badRequestError('Cash-out amount cannot be negative.');
  }
  if (lockedBefore.lt(amount)) {
    throw conflictError('Locked balance is too low for table cash-out.');
  }

  return {
    withdrawableBefore,
    withdrawableAfter: withdrawableBefore.plus(amount),
    lockedBefore,
    lockedAfter: lockedBefore.minus(amount),
  };
};

export const buildRoundSettlementPlan = (params: {
  settlementModel: TableSettlementModel;
  seatStates: Array<{
    seatId: number;
    userId: number;
    currentStackAmount: string | number;
    resultingStackAmount: string | number;
    metadata?: Record<string, unknown> | null;
  }>;
}) => {
  const seatPlans = params.seatStates.map((seat) => {
    const currentStackAmount = parseMoneyAmount(
      String(seat.currentStackAmount ?? '0'),
      'current stack amount',
      { allowZero: true },
    );
    const resultingStackAmount = parseMoneyAmount(
      String(seat.resultingStackAmount ?? '0'),
      'resulting stack amount',
      { allowZero: true },
    );

    return {
      seatId: seat.seatId,
      userId: seat.userId,
      currentStackAmount,
      resultingStackAmount,
      delta: resultingStackAmount.minus(currentStackAmount),
      metadata: seat.metadata ?? null,
    };
  });

  const totalSeatDelta = seatPlans.reduce(
    (sum, seat) => sum.plus(seat.delta),
    toDecimal(0),
  );

  if (params.settlementModel === 'peer_to_peer' && !totalSeatDelta.eq(0)) {
    throw conflictError(
      'Peer-to-peer round settlement must preserve the total locked seat stack.',
    );
  }

  return {
    houseDelta:
      params.settlementModel === 'house_bankrolled'
        ? totalSeatDelta.negated()
        : toDecimal(0),
    seatPlans,
  };
};

const ensureUserWallet = async (tx: DbTransaction, userId: number) => {
  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();
};

const loadLockedWallet = async (
  tx: DbTransaction,
  userId: number,
): Promise<LockedWalletRow | null> => {
  await ensureUserWallet(tx, userId);

  const result = await tx.execute(sql`
    SELECT u.id AS "userId",
           w.withdrawable_balance AS "withdrawableBalance",
           w.locked_balance AS "lockedBalance"
    FROM ${users} u
    JOIN ${userWallets} w ON w.user_id = u.id
    WHERE u.id = ${userId}
    FOR UPDATE
  `);

  return readSqlRows<LockedWalletRow>(result)[0] ?? null;
};

const loadTableById = async (executor: DbExecutor, tableId: number) => {
  const [row] = await executor
    .select()
    .from(tables)
    .where(eq(tables.id, tableId))
    .limit(1);

  return row ? mapTableRow(row) : null;
};

const loadLockedTable = async (tx: DbTransaction, tableId: number) => {
  const result = await tx.execute(sql`
    SELECT id,
           definition_key AS "definitionKey",
           game_type AS "gameType",
           settlement_model AS "settlementModel",
           status,
           min_seats AS "minSeats",
           max_seats AS "maxSeats",
           time_bank_ms AS "timeBankMs",
           current_phase AS "currentPhase",
           phase_order AS "phaseOrder",
           metadata,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           started_at AS "startedAt",
           closed_at AS "closedAt"
    FROM ${tables}
    WHERE id = ${tableId}
    FOR UPDATE
  `);

  const row = readSqlRows<TableRowLike>(result)[0];
  return row ? mapTableRow(row) : null;
};

const loadSeatsForTable = async (executor: DbExecutor, tableId: number) => {
  const rows = await executor
    .select()
    .from(seats)
    .where(eq(seats.tableId, tableId))
    .orderBy(asc(seats.seatNumber));

  return rows.map((row) => mapSeatRow(row));
};

const loadLockedSeatByNumber = async (
  tx: DbTransaction,
  tableId: number,
  seatNumber: number,
) => {
  const result = await tx.execute(sql`
    SELECT id,
           table_id AS "tableId",
           seat_number AS "seatNumber",
           user_id AS "userId",
           status,
           buy_in_amount AS "buyInAmount",
           stack_amount AS "stackAmount",
           metadata,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           joined_at AS "joinedAt",
           left_at AS "leftAt"
    FROM ${seats}
    WHERE table_id = ${tableId}
      AND seat_number = ${seatNumber}
    FOR UPDATE
  `);

  const row = readSqlRows<SeatRowLike>(result)[0];
  return row ? mapSeatRow(row) : null;
};

const loadLockedSeatForUser = async (
  tx: DbTransaction,
  tableId: number,
  userId: number,
  excludeSeatId?: number,
) => {
  const exclusionClause =
    typeof excludeSeatId === 'number'
      ? sql`AND id <> ${excludeSeatId}`
      : sql``;

  const result = await tx.execute(sql`
    SELECT id,
           table_id AS "tableId",
           seat_number AS "seatNumber",
           user_id AS "userId",
           status,
           buy_in_amount AS "buyInAmount",
           stack_amount AS "stackAmount",
           metadata,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           joined_at AS "joinedAt",
           left_at AS "leftAt"
    FROM ${seats}
    WHERE table_id = ${tableId}
      AND user_id = ${userId}
      ${exclusionClause}
    FOR UPDATE
  `);

  const row = readSqlRows<SeatRowLike>(result)[0];
  return row ? mapSeatRow(row) : null;
};

const loadLockedSeatsByIds = async (tx: DbTransaction, seatIds: number[]) => {
  if (seatIds.length === 0) {
    return [];
  }

  const result = await tx.execute(sql`
    SELECT id,
           table_id AS "tableId",
           seat_number AS "seatNumber",
           user_id AS "userId",
           status,
           buy_in_amount AS "buyInAmount",
           stack_amount AS "stackAmount",
           metadata,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           joined_at AS "joinedAt",
           left_at AS "leftAt"
    FROM ${seats}
    WHERE id = ANY(${seatIds})
    FOR UPDATE
  `);

  return readSqlRows<SeatRowLike>(result).map((row) => mapSeatRow(row));
};

const loadActiveRoundForTable = async (
  executor: DbExecutor,
  tableId: number,
  options: { lock?: boolean } = {},
) => {
  const result = await executor.execute(sql`
    SELECT id,
           table_id AS "tableId",
           round_number AS "roundNumber",
           status,
           phase,
           metadata,
           result,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           started_at AS "startedAt",
           settled_at AS "settledAt",
           phase_deadline_at AS "phaseDeadlineAt"
    FROM ${rounds}
    WHERE table_id = ${tableId}
      AND status IN ('pending', 'active', 'settling')
    ORDER BY round_number DESC
    LIMIT 1
    ${options.lock ? sql`FOR UPDATE` : sql``}
  `);

  const row = readSqlRows<RoundRowLike>(result)[0];
  return row ? mapRoundRow(row) : null;
};

const loadLockedRoundById = async (tx: DbTransaction, roundId: number) => {
  const result = await tx.execute(sql`
    SELECT id,
           table_id AS "tableId",
           round_number AS "roundNumber",
           status,
           phase,
           metadata,
           result,
           created_at AS "createdAt",
           updated_at AS "updatedAt",
           started_at AS "startedAt",
           settled_at AS "settledAt",
           phase_deadline_at AS "phaseDeadlineAt"
    FROM ${rounds}
    WHERE id = ${roundId}
    FOR UPDATE
  `);

  const row = readSqlRows<RoundRowLike>(result)[0];
  return row ? mapRoundRow(row) : null;
};

const getNextRoundNumber = async (tx: DbTransaction, tableId: number) => {
  const result = await tx.execute(sql`
    SELECT COALESCE(MAX(round_number), 0) + 1 AS "nextRoundNumber"
    FROM ${rounds}
    WHERE table_id = ${tableId}
    FOR UPDATE
  `);

  const row = readSqlRows<{ nextRoundNumber: number }>(result)[0];
  return Number(row?.nextRoundNumber ?? 1);
};

const insertRoundEvent = async (params: {
  tx: DbTransaction;
  tableId: number;
  roundId: number;
  phase: string | null;
  eventType: string;
  actor: 'player' | 'dealer' | 'system';
  seatId?: number | null;
  userId?: number | null;
  payload?: Record<string, unknown> | null;
}) => {
  const { tx } = params;
  const [row] = await tx
    .select({
      maxEventIndex: sql<number>`coalesce(max(${roundEvents.eventIndex}), -1)`,
    })
    .from(roundEvents)
    .where(eq(roundEvents.tableRoundId, params.roundId));
  const nextEventIndex = Number(row?.maxEventIndex ?? -1) + 1;

  const [event] = await tx
    .insert(roundEvents)
    .values({
      roundType: TABLE_ROUND_EVENT_TYPE,
      roundEntityId: params.roundId,
      userId: params.userId ?? null,
      tableId: params.tableId,
      seatId: params.seatId ?? null,
      tableRoundId: params.roundId,
      phase: params.phase ?? null,
      eventIndex: nextEventIndex,
      eventType: params.eventType,
      actor: params.actor,
      payload: params.payload ?? {},
    })
    .returning({
      id: roundEvents.id,
      tableId: roundEvents.tableId,
      tableRoundId: roundEvents.tableRoundId,
      seatId: roundEvents.seatId,
      userId: roundEvents.userId,
      phase: roundEvents.phase,
      eventIndex: roundEvents.eventIndex,
      eventType: roundEvents.eventType,
      actor: roundEvents.actor,
      payload: roundEvents.payload,
      createdAt: roundEvents.createdAt,
    });

  if (!event) {
    throw persistenceError('Failed to persist table round event.');
  }

  return mapRoundEventRow(event);
};

const loadTableRoundEvents = async (
  executor: DbExecutor,
  roundId: number,
  limit: number,
) => {
  const rows = await executor
    .select({
      id: roundEvents.id,
      tableId: roundEvents.tableId,
      tableRoundId: roundEvents.tableRoundId,
      seatId: roundEvents.seatId,
      userId: roundEvents.userId,
      phase: roundEvents.phase,
      eventIndex: roundEvents.eventIndex,
      eventType: roundEvents.eventType,
      actor: roundEvents.actor,
      payload: roundEvents.payload,
      createdAt: roundEvents.createdAt,
    })
    .from(roundEvents)
    .where(eq(roundEvents.tableRoundId, roundId))
    .orderBy(desc(roundEvents.eventIndex))
    .limit(limit);

  return rows.map((row) => mapRoundEventRow(row)).reverse();
};

const getTableSnapshotFromExecutor = async (
  executor: DbExecutor,
  tableId: number,
): Promise<TableSnapshot> => {
  const table = await loadTableById(executor, tableId);
  if (!table) {
    throw notFoundError('Table not found.');
  }

  const [tableSeats, activeRound] = await Promise.all([
    loadSeatsForTable(executor, tableId),
    loadActiveRoundForTable(executor, tableId),
  ]);

  return {
    table,
    seats: tableSeats,
    activeRound,
  };
};

export async function getTableSnapshot(tableId: number): Promise<TableSnapshot> {
  return getTableSnapshotFromExecutor(db, tableId);
}

export async function listTableRoundEvents(roundId: number, limit = 200) {
  return loadTableRoundEvents(db, roundId, limit);
}

export async function createTable(params: {
  definition: TableDefinition;
  metadata?: Record<string, unknown> | null;
}) {
  const definition = defineTableDefinition(params.definition);

  return db.transaction(async (tx) => {
    const [createdTable] = await tx
      .insert(tables)
      .values({
        definitionKey: definition.key,
        gameType: definition.gameType,
        settlementModel: definition.settlementModel,
        status: 'open',
        minSeats: definition.minSeats,
        maxSeats: definition.maxSeats,
        timeBankMs: definition.timeBankMs,
        currentPhase: null,
        phaseOrder: definition.phases,
        metadata: params.metadata ?? definition.metadata ?? null,
      })
      .returning();

    if (!createdTable) {
      throw persistenceError('Failed to create table.');
    }

    await tx.insert(seats).values(
      Array.from({ length: definition.maxSeats }, (_value, index) => ({
        tableId: createdTable.id,
        seatNumber: index + 1,
        status: 'empty' as const,
        buyInAmount: '0.00',
        stackAmount: '0.00',
      })),
    );

    return getTableSnapshotFromExecutor(tx, createdTable.id);
  });
}

export async function buyInToSeat(params: {
  tableId: number;
  seatNumber: number;
  userId: number;
  amount: string;
  metadata?: Record<string, unknown> | null;
}) {
  const amount = parseMoneyAmount(params.amount, 'buy-in amount');

  return db.transaction(async (tx) => {
    const table = await loadLockedTable(tx, params.tableId);
    if (!table) {
      throw notFoundError('Table not found.');
    }
    if (table.status === 'closed') {
      throw conflictError('Cannot buy into a closed table.');
    }

    const activeRound = await loadActiveRoundForTable(tx, table.id, {
      lock: true,
    });
    if (activeRound) {
      throw conflictError('Cannot buy into a seat while a round is active.');
    }

    const seat = await loadLockedSeatByNumber(tx, table.id, params.seatNumber);
    if (!seat) {
      throw notFoundError('Seat not found.');
    }
    if (seat.userId !== null && seat.userId !== params.userId) {
      throw conflictError('Seat is already occupied.');
    }

    const duplicateSeat = await loadLockedSeatForUser(
      tx,
      table.id,
      params.userId,
      seat.id,
    );
    if (duplicateSeat) {
      throw conflictError('User already occupies another seat at this table.');
    }

    const wallet = await loadLockedWallet(tx, params.userId);
    if (!wallet) {
      throw notFoundError('User not found.');
    }

    const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
    const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
    const walletMutation = resolveTableBuyIn({
      withdrawableBefore,
      lockedBefore,
      amount,
    });

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(walletMutation.withdrawableAfter),
        lockedBalance: toMoneyString(walletMutation.lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, params.userId));

    await tx.insert(ledgerEntries).values({
      userId: params.userId,
      entryType: seat.userId === params.userId ? 'table_rebuy' : 'table_buy_in',
      amount: toMoneyString(amount.negated()),
      balanceBefore: toMoneyString(walletMutation.withdrawableBefore),
      balanceAfter: toMoneyString(walletMutation.withdrawableAfter),
      referenceType: 'seat',
      referenceId: seat.id,
      metadata: {
        balanceAxis: 'withdrawable_balance',
        lockedBalanceBefore: toMoneyString(walletMutation.lockedBefore),
        lockedBalanceAfter: toMoneyString(walletMutation.lockedAfter),
        tableId: table.id,
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        definitionKey: table.definitionKey,
      },
    });

    const nextBuyInAmount = toDecimal(seat.buyInAmount).plus(amount);
    const nextStackAmount = toDecimal(seat.stackAmount).plus(amount);
    const now = new Date();
    const [updatedSeat] = await tx
      .update(seats)
      .set({
        userId: params.userId,
        status: 'occupied',
        buyInAmount: toMoneyString(nextBuyInAmount),
        stackAmount: toMoneyString(nextStackAmount),
        metadata: mergeMetadata(seat.metadata, params.metadata ?? null),
        joinedAt:
          seat.userId === params.userId ? toTimestampValue(seat.joinedAt) : now,
        leftAt: null,
        updatedAt: now,
      })
      .where(eq(seats.id, seat.id))
      .returning();

    if (!updatedSeat) {
      throw persistenceError('Failed to update table seat.');
    }

    return mapSeatRow(updatedSeat);
  });
}

export async function cashOutSeat(params: {
  tableId: number;
  seatNumber: number;
  userId?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const table = await loadLockedTable(tx, params.tableId);
    if (!table) {
      throw notFoundError('Table not found.');
    }

    const activeRound = await loadActiveRoundForTable(tx, table.id, {
      lock: true,
    });
    if (activeRound) {
      throw conflictError('Cannot cash out while a round is active.');
    }

    const seat = await loadLockedSeatByNumber(tx, table.id, params.seatNumber);
    if (!seat || seat.userId === null) {
      throw notFoundError('Occupied seat not found.');
    }
    if (params.userId && params.userId !== seat.userId) {
      throw conflictError('Seat belongs to a different user.');
    }

    const wallet = await loadLockedWallet(tx, seat.userId);
    if (!wallet) {
      throw notFoundError('User not found.');
    }

    const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
    const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
    const cashOutAmount = toDecimal(seat.stackAmount);
    const walletMutation = resolveTableCashOut({
      withdrawableBefore,
      lockedBefore,
      amount: cashOutAmount,
    });

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(walletMutation.withdrawableAfter),
        lockedBalance: toMoneyString(walletMutation.lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, seat.userId));

    if (cashOutAmount.gt(0)) {
      await tx.insert(ledgerEntries).values({
        userId: seat.userId,
        entryType: 'table_cash_out',
        amount: toMoneyString(cashOutAmount),
        balanceBefore: toMoneyString(walletMutation.withdrawableBefore),
        balanceAfter: toMoneyString(walletMutation.withdrawableAfter),
        referenceType: 'seat',
        referenceId: seat.id,
        metadata: {
          balanceAxis: 'withdrawable_balance',
          lockedBalanceBefore: toMoneyString(walletMutation.lockedBefore),
          lockedBalanceAfter: toMoneyString(walletMutation.lockedAfter),
          tableId: table.id,
          seatId: seat.id,
          seatNumber: seat.seatNumber,
          definitionKey: table.definitionKey,
          ...params.metadata,
        },
      });
    }

    const [updatedSeat] = await tx
      .update(seats)
      .set({
        userId: null,
        status: 'empty',
        buyInAmount: '0.00',
        stackAmount: '0.00',
        metadata: null,
        leftAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seats.id, seat.id))
      .returning();

    if (!updatedSeat) {
      throw persistenceError('Failed to clear table seat.');
    }

    return {
      seat: mapSeatRow(updatedSeat),
      cashOutAmount: toMoneyString(cashOutAmount),
    };
  });
}

export async function openRound(params: {
  tableId: number;
  metadata?: Record<string, unknown> | null;
}) {
  const result = await db.transaction(async (tx) => {
    const table = await loadLockedTable(tx, params.tableId);
    if (!table) {
      throw notFoundError('Table not found.');
    }
    if (table.status === 'closed') {
      throw conflictError('Cannot open a round on a closed table.');
    }

    const activeRound = await loadActiveRoundForTable(tx, table.id, {
      lock: true,
    });
    if (activeRound) {
      throw conflictError('Finish the active round before opening a new round.');
    }

    const tableSeats = await loadSeatsForTable(tx, table.id);
    const occupiedSeats = tableSeats.filter((seat) => seat.status === 'occupied');
    if (occupiedSeats.length < table.minSeats) {
      throw conflictError('Not enough occupied seats to open a round.');
    }
    if (occupiedSeats.length > table.maxSeats) {
      throw internalInvariantError('Occupied seats exceed table capacity.');
    }

    const definition = defineTableDefinition({
      key: table.definitionKey,
      gameType: table.gameType,
      settlementModel: table.settlementModel,
      minSeats: table.minSeats,
      maxSeats: table.maxSeats,
      timeBankMs: table.timeBankMs,
      phases: table.phases,
      metadata: table.metadata,
    });
    const firstPhase = getInitialTablePhase(definition);
    if (!firstPhase) {
      throw internalInvariantError('Table definition has no phases.');
    }

    const now = new Date();
    const [createdRound] = await tx
      .insert(rounds)
      .values({
        tableId: table.id,
        roundNumber: await getNextRoundNumber(tx, table.id),
        status: 'active',
        phase: firstPhase,
        metadata: params.metadata ?? null,
        result: null,
        phaseDeadlineAt: calculatePhaseDeadline(definition, firstPhase, now),
        startedAt: now,
      })
      .returning();

    if (!createdRound) {
      throw persistenceError('Failed to create round.');
    }

    await tx
      .update(tables)
      .set({
        status: 'running',
        currentPhase: firstPhase,
        startedAt: toTimestampValue(table.startedAt) ?? now,
        updatedAt: now,
      })
      .where(eq(tables.id, table.id));

    const round = mapRoundRow(createdRound);
    await insertRoundEvent({
      tx,
      tableId: table.id,
      roundId: round.id,
      phase: round.phase,
      eventType: 'round_opened',
      actor: 'system',
      payload: {
        occupiedSeatCount: occupiedSeats.length,
        phase: round.phase,
      },
    });

    const dealerRuleEvent = buildTableEngineDealerEvent({
      tableId: table.id,
      roundId: round.id,
      phase: round.phase,
      actionCode: 'phase_opened',
      text: `${round.phase} is open. Dealer flow is live.`,
      metadata: {
        roundNumber: round.roundNumber,
      },
    });
    await insertRoundEvent({
      tx,
      tableId: table.id,
      roundId: round.id,
      phase: round.phase,
      eventType: 'dealer_action',
      actor: 'dealer',
      payload: {
        dealerEvent: dealerRuleEvent,
      },
    });

    return {
      dealerRuleEvent,
      round,
    };
  });

  publishTableEngineDealerEvent(result.round.tableId, result.dealerRuleEvent);
  emitAsyncTableEngineDealerLanguageEvent({
    tableId: result.round.tableId,
    roundId: result.round.id,
    phase: result.round.phase,
    summary: {
      roundNumber: result.round.roundNumber,
      phase: result.round.phase,
      actionCode: 'phase_opened',
    },
  });

  return result.round;
}

export async function appendTableRoundEvent(params: {
  roundId: number;
  eventType: string;
  actor: 'player' | 'dealer' | 'system';
  seatId?: number | null;
  userId?: number | null;
  payload?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const round = await loadLockedRoundById(tx, params.roundId);
    if (!round) {
      throw notFoundError('Round not found.');
    }
    if (round.status === 'settled' || round.status === 'cancelled') {
      throw conflictError('Cannot append events to a finished round.');
    }

    let userId = params.userId ?? null;
    if (params.seatId) {
      const [seat] = await loadLockedSeatsByIds(tx, [params.seatId]);
      if (!seat || seat.tableId !== round.tableId) {
        throw conflictError('Seat does not belong to this table round.');
      }
      userId = userId ?? seat.userId ?? null;
    }

    return insertRoundEvent({
      tx,
      tableId: round.tableId,
      roundId: round.id,
      phase: round.phase,
      eventType: params.eventType,
      actor: params.actor,
      seatId: params.seatId ?? null,
      userId,
      payload: params.payload ?? null,
    });
  });
}

export async function advanceRoundPhase(params: {
  roundId: number;
  payload?: Record<string, unknown> | null;
}) {
  const result = await db.transaction(async (tx) => {
    const round = await loadLockedRoundById(tx, params.roundId);
    if (!round) {
      throw notFoundError('Round not found.');
    }
    if (round.status !== 'active' && round.status !== 'pending') {
      throw conflictError('Only active rounds can advance phases.');
    }

    const table = await loadLockedTable(tx, round.tableId);
    if (!table) {
      throw notFoundError('Table not found.');
    }

    const definition = defineTableDefinition({
      key: table.definitionKey,
      gameType: table.gameType,
      settlementModel: table.settlementModel,
      minSeats: table.minSeats,
      maxSeats: table.maxSeats,
      timeBankMs: table.timeBankMs,
      phases: table.phases,
      metadata: table.metadata,
    });
    const nextPhase = getNextTablePhase(definition, round.phase);
    if (!nextPhase) {
      throw conflictError('Current phase has no next phase.');
    }

    const now = new Date();
    const [updatedRound] = await tx
      .update(rounds)
      .set({
        phase: nextPhase,
        phaseDeadlineAt: calculatePhaseDeadline(definition, nextPhase, now),
        updatedAt: now,
      })
      .where(eq(rounds.id, round.id))
      .returning();

    if (!updatedRound) {
      throw persistenceError('Failed to advance round phase.');
    }

    await tx
      .update(tables)
      .set({
        currentPhase: nextPhase,
        updatedAt: now,
      })
      .where(eq(tables.id, table.id));

    await insertRoundEvent({
      tx,
      tableId: table.id,
      roundId: round.id,
      phase: nextPhase,
      eventType: 'phase_advanced',
      actor: 'system',
      payload: {
        fromPhase: round.phase,
        toPhase: nextPhase,
        ...params.payload,
      },
    });

    const nextRound = mapRoundRow(updatedRound);
    const dealerRuleEvent = buildTableEngineDealerEvent({
      tableId: table.id,
      roundId: round.id,
      phase: nextPhase,
      actionCode: 'phase_advanced',
      text: `${nextPhase} phase begins.`,
      metadata: {
        fromPhase: round.phase,
        toPhase: nextPhase,
      },
    });
    await insertRoundEvent({
      tx,
      tableId: table.id,
      roundId: round.id,
      phase: nextPhase,
      eventType: 'dealer_action',
      actor: 'dealer',
      payload: {
        dealerEvent: dealerRuleEvent,
      },
    });

    return {
      dealerRuleEvent,
      round: nextRound,
    };
  });

  publishTableEngineDealerEvent(result.round.tableId, result.dealerRuleEvent);
  emitAsyncTableEngineDealerLanguageEvent({
    tableId: result.round.tableId,
    roundId: result.round.id,
    phase: result.round.phase,
    summary: {
      phase: result.round.phase,
      actionCode: 'phase_advanced',
    },
  });

  return result.round;
}

export async function settleRound(params: {
  roundId: number;
  seatResults: SettlementSeatInput[];
  result?: Record<string, unknown> | null;
  eventPayload?: Record<string, unknown> | null;
}) {
  if (params.seatResults.length === 0) {
    throw badRequestError('Round settlement requires at least one seat result.');
  }

  return db.transaction(async (tx) => {
    const round = await loadLockedRoundById(tx, params.roundId);
    if (!round) {
      throw notFoundError('Round not found.');
    }
    if (round.status === 'settled' || round.status === 'cancelled') {
      throw conflictError('Round has already been settled.');
    }

    const table = await loadLockedTable(tx, round.tableId);
    if (!table) {
      throw notFoundError('Table not found.');
    }

    const lockedSeats = await loadLockedSeatsByIds(
      tx,
      params.seatResults.map((seat) => seat.seatId),
    );
    if (lockedSeats.length !== params.seatResults.length) {
      throw conflictError('One or more seat results reference an unknown seat.');
    }

    const seatById = new Map(lockedSeats.map((seat) => [seat.id, seat]));
    const settlementPlan = buildRoundSettlementPlan({
      settlementModel: table.settlementModel,
      seatStates: params.seatResults.map((seatResult) => {
        const seat = seatById.get(seatResult.seatId);
        if (!seat) {
          throw conflictError('Seat result could not be matched to a seat.');
        }
        if (seat.tableId !== table.id) {
          throw conflictError('Seat does not belong to this table.');
        }
        if (seat.userId === null) {
          throw conflictError('Cannot settle an empty seat.');
        }
        if (seat.status !== 'occupied' && seat.status !== 'sitting_out') {
          throw conflictError('Seat is not eligible for round settlement.');
        }

        return {
          seatId: seat.id,
          userId: seat.userId,
          currentStackAmount: seat.stackAmount,
          resultingStackAmount: seatResult.resultingStackAmount,
          metadata: seatResult.metadata ?? null,
        };
      }),
    });

    for (const seatPlan of settlementPlan.seatPlans) {
      const seat = seatById.get(seatPlan.seatId);
      if (!seat || seat.userId === null) {
        throw internalInvariantError('Seat snapshot disappeared during settlement.');
      }

      const wallet = await loadLockedWallet(tx, seat.userId);
      if (!wallet) {
        throw notFoundError('User not found.');
      }

      const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
      const lockedAfter = lockedBefore.plus(seatPlan.delta);
      if (lockedAfter.lt(0)) {
        throw conflictError('Locked balance would become negative after settlement.');
      }

      if (!seatPlan.delta.eq(0)) {
        await tx
          .update(userWallets)
          .set({
            lockedBalance: toMoneyString(lockedAfter),
            updatedAt: new Date(),
          })
          .where(eq(userWallets.userId, seat.userId));

        await tx.insert(ledgerEntries).values({
          userId: seat.userId,
          entryType: 'table_round_settlement',
          amount: toMoneyString(seatPlan.delta),
          balanceBefore: toMoneyString(lockedBefore),
          balanceAfter: toMoneyString(lockedAfter),
          referenceType: 'round',
          referenceId: round.id,
          metadata: {
            balanceAxis: 'locked_balance',
            tableId: table.id,
            roundId: round.id,
            seatId: seat.id,
            seatNumber: seat.seatNumber,
            settlementModel: table.settlementModel,
            currentStackAmount: toMoneyString(seatPlan.currentStackAmount),
            resultingStackAmount: toMoneyString(seatPlan.resultingStackAmount),
            ...seatPlan.metadata,
          },
        });
      }

      await tx
        .update(seats)
        .set({
          stackAmount: toMoneyString(seatPlan.resultingStackAmount),
          updatedAt: new Date(),
        })
        .where(eq(seats.id, seat.id));
    }

    if (!settlementPlan.houseDelta.eq(0)) {
      await applyPrizePoolDelta(tx, settlementPlan.houseDelta, {
        entryType: 'table_round_house_settlement',
        referenceType: 'round',
        referenceId: round.id,
        metadata: {
          tableId: table.id,
          roundId: round.id,
          settlementModel: table.settlementModel,
        },
      });
    }

    const settlementSummary = {
      houseDelta: toMoneyString(settlementPlan.houseDelta),
      seatDeltas: settlementPlan.seatPlans.map((seatPlan) => ({
        seatId: seatPlan.seatId,
        userId: seatPlan.userId,
        delta: toMoneyString(seatPlan.delta),
        resultingStackAmount: toMoneyString(seatPlan.resultingStackAmount),
      })),
      ...params.result,
    };

    const [updatedRound] = await tx
      .update(rounds)
      .set({
        status: 'settled',
        result: settlementSummary,
        settledAt: new Date(),
        phaseDeadlineAt: null,
        updatedAt: new Date(),
      })
      .where(eq(rounds.id, round.id))
      .returning();

    if (!updatedRound) {
      throw persistenceError('Failed to settle round.');
    }

    await tx
      .update(tables)
      .set({
        currentPhase: null,
        updatedAt: new Date(),
      })
      .where(eq(tables.id, table.id));

    await insertRoundEvent({
      tx,
      tableId: table.id,
      roundId: round.id,
      phase: round.phase,
      eventType: 'round_settled',
      actor: 'system',
      payload: {
        houseDelta: toMoneyString(settlementPlan.houseDelta),
        ...params.eventPayload,
      },
    });

    return mapRoundRow(updatedRound);
  });
}
