import { blackjackGames, users } from "@reward/database";
import { desc, eq } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  TableMonitoringActionResult,
  TableMonitoringPhase,
  TableMonitoringSeat,
  TableMonitoringSnapshot,
  TableMonitoringSourceKind,
  TableMonitoringStatus,
  TableMonitoringTable,
} from "@reward/shared-types/table-monitoring";
import { z } from "zod";

import { db } from "../../db";
import {
  conflictError,
  internalInvariantError,
  notFoundError,
  toAppError,
} from "../../shared/errors";
import { toDecimal } from "../../shared/money";
import { parseSchema } from "../../shared/validation";
import { actOnBlackjack } from "../blackjack/service";
import {
  loadBlackjackGameRows,
  loadLockedBlackjackUser,
  settleGameByStatus,
} from "../blackjack/blackjack-persistence";
import { toGameState } from "../blackjack/blackjack-state";
import { BlackjackGameRowsSchema } from "../blackjack/game";
import { appendRoundEvents } from "../hand-history/service";
import {
  BLACKJACK_ROUND_TYPE,
  buildRoundId,
  parseRoundId,
} from "../hand-history/round-id";

const BLACKJACK_ACTION_TIME_BANK_MS = 30_000;
const BLACKJACK_PLAYER_SEAT_INDEX = 1;
const BLACKJACK_DEALER_LABEL = "AI Dealer";

const ActiveBlackjackMonitorRowsSchema = z.array(
  BlackjackGameRowsSchema.element.extend({
    email: z.string().min(1).max(255),
  }),
);

type ActiveBlackjackMonitorRow = z.infer<
  typeof ActiveBlackjackMonitorRowsSchema
>[number];

const toDate = (value: Date | string) => {
  const next = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(next.valueOf())) {
    throw internalInvariantError("Invalid table monitoring timestamp.");
  }
  return next;
};

const parseActiveBlackjackMonitorRows = (rows: unknown) => {
  const parsed = parseSchema(ActiveBlackjackMonitorRowsSchema, rows);
  if (!parsed.isValid) {
    throw internalInvariantError("Invalid active blackjack monitor rows.");
  }
  return parsed.data;
};

const loadActiveBlackjackMonitorRows = async () => {
  const rows = await db
    .select({
      id: blackjackGames.id,
      userId: blackjackGames.userId,
      stakeAmount: blackjackGames.stakeAmount,
      totalStake: blackjackGames.totalStake,
      payoutAmount: blackjackGames.payoutAmount,
      playerCards: blackjackGames.playerCards,
      dealerCards: blackjackGames.dealerCards,
      deck: blackjackGames.deck,
      nextCardIndex: blackjackGames.nextCardIndex,
      status: blackjackGames.status,
      metadata: blackjackGames.metadata,
      settledAt: blackjackGames.settledAt,
      createdAt: blackjackGames.createdAt,
      updatedAt: blackjackGames.updatedAt,
      email: users.email,
    })
    .from(blackjackGames)
    .innerJoin(users, eq(users.id, blackjackGames.userId))
    .where(eq(blackjackGames.status, "active"))
    .orderBy(desc(blackjackGames.updatedAt), desc(blackjackGames.id));

  return parseActiveBlackjackMonitorRows(rows);
};

const resolveBlackjackPhase = (
  currentActorSeatIndex: number | null,
): TableMonitoringPhase =>
  currentActorSeatIndex === BLACKJACK_PLAYER_SEAT_INDEX
    ? "player_turn"
    : "waiting";

const resolveBlackjackSeatStatus = (params: {
  seatIndex: number;
  currentActorSeatIndex: number | null;
  timedOut: boolean;
}): TableMonitoringSeat["status"] => {
  if (params.seatIndex === params.currentActorSeatIndex) {
    return params.timedOut ? "timed_out" : "acting";
  }

  return "occupied";
};

const resolveBlackjackSeatView = (params: {
  row: ActiveBlackjackMonitorRow;
  timedOut: boolean;
}) => {
  const game = toGameState(params.row);
  const table = game.metadata.table;
  if (!table) {
    throw internalInvariantError("Blackjack table metadata is missing.");
  }
  const currentActorSeatIndex =
    game.status === "active" && game.metadata.activeHandIndex !== null
      ? BLACKJACK_PLAYER_SEAT_INDEX
      : null;

  return table.seats.map((seat): TableMonitoringSeat => {
    const isPlayerSeat =
      seat.seatIndex === BLACKJACK_PLAYER_SEAT_INDEX &&
      seat.participantType === "human_user";

    return {
      seatIndex: seat.seatIndex,
      role: seat.role === "dealer" ? "dealer" : "player",
      participantType: seat.participantType,
      participantId: seat.participantId,
      userId: isPlayerSeat ? params.row.userId : null,
      displayName: isPlayerSeat ? params.row.email : BLACKJACK_DEALER_LABEL,
      status: resolveBlackjackSeatStatus({
        seatIndex: seat.seatIndex,
        currentActorSeatIndex,
        timedOut: params.timedOut,
      }),
      isCurrentActor: seat.seatIndex === currentActorSeatIndex,
      isTimedOut: Boolean(
        params.timedOut && seat.seatIndex === currentActorSeatIndex,
      ),
      canKick: isPlayerSeat,
    };
  });
};

const toBlackjackMonitorTable = (
  row: ActiveBlackjackMonitorRow,
  now = Date.now(),
): TableMonitoringTable => {
  const game = toGameState(row);
  const table = game.metadata.table;
  if (!table) {
    throw internalInvariantError("Blackjack table metadata is missing.");
  }
  const updatedAt = toDate(row.updatedAt);
  const currentActorSeatIndex =
    game.status === "active" && game.metadata.activeHandIndex !== null
      ? BLACKJACK_PLAYER_SEAT_INDEX
      : null;
  const actionDeadlineAt =
    currentActorSeatIndex === null
      ? null
      : new Date(updatedAt.getTime() + BLACKJACK_ACTION_TIME_BANK_MS);
  const timeBankRemainingMs = actionDeadlineAt
    ? Math.max(0, actionDeadlineAt.getTime() - now)
    : null;
  const timedOut =
    actionDeadlineAt !== null && actionDeadlineAt.getTime() <= now;
  const status: TableMonitoringStatus = timedOut ? "overdue" : "active";

  return {
    sourceKind: "blackjack",
    tableId: table.tableId,
    displayName: `Blackjack ${table.tableId}`,
    roundId: buildRoundId({
      roundType: BLACKJACK_ROUND_TYPE,
      roundEntityId: game.id,
    }),
    status,
    phase: resolveBlackjackPhase(currentActorSeatIndex),
    currentActorSeatIndex,
    actionDeadlineAt,
    timeBankTotalMs:
      currentActorSeatIndex === null ? null : BLACKJACK_ACTION_TIME_BANK_MS,
    timeBankRemainingMs,
    canForceTimeout: currentActorSeatIndex !== null,
    canClose: true,
    seats: resolveBlackjackSeatView({ row, timedOut }),
    updatedAt,
  };
};

const compareTables = (left: TableMonitoringTable, right: TableMonitoringTable) => {
  if (left.status !== right.status) {
    if (left.status === "overdue") return -1;
    if (right.status === "overdue") return 1;
  }

  return toDate(right.updatedAt).getTime() - toDate(left.updatedAt).getTime();
};

const loadActiveBlackjackMonitorTables = async () => {
  const rows = await loadActiveBlackjackMonitorRows();
  const now = Date.now();
  return rows.map((row) => toBlackjackMonitorTable(row, now));
};

const findBlackjackTableById = async (tableId: string) => {
  const tables = await loadActiveBlackjackMonitorTables();
  return tables.find((item) => item.tableId === tableId) ?? null;
};

const getRequiredBlackjackTable = async (tableId: string) => {
  const table = await findBlackjackTableById(tableId);
  if (!table) {
    throw notFoundError("Table not found.");
  }
  return table;
};

const closeBlackjackTable = async (params: {
  tableId: string;
  reason: string;
  action: "close_table" | "kick_seat";
  seatIndex?: number | null;
}) => {
  const table = await getRequiredBlackjackTable(params.tableId);
  const playerSeat = table.seats.find(
    (seat) => seat.seatIndex === BLACKJACK_PLAYER_SEAT_INDEX,
  );
  const userId = playerSeat?.userId ?? null;

  if (!userId) {
    throw notFoundError("Table user not found.");
  }

  return db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      throw notFoundError("User not found.");
    }

    const [activeRow] = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
    });
    if (!activeRow) {
      throw notFoundError("No active blackjack game found.");
    }

    const game = toGameState(activeRow);
    const table = game.metadata.table;
    if (!table) {
      throw internalInvariantError("Blackjack table metadata is missing.");
    }
    if (table.tableId !== params.tableId) {
      throw conflictError("Table is no longer active.");
    }

    if (
      params.action === "kick_seat" &&
      params.seatIndex !== BLACKJACK_PLAYER_SEAT_INDEX
    ) {
      throw conflictError("Only the player seat can be kicked.");
    }

    await appendRoundEvents(tx, {
      roundType: BLACKJACK_ROUND_TYPE,
      roundEntityId: game.id,
      userId: game.userId,
      events: [
        {
          type:
            params.action === "kick_seat"
              ? "admin_seat_kicked"
              : "admin_table_closed",
          actor: "system",
          payload: {
            tableId: params.tableId,
            seatIndex: params.seatIndex ?? null,
            reason: params.reason,
          },
        },
      ],
    });

    await settleGameByStatus({
      tx,
      game,
      status: "push",
      walletBalance: toDecimal(user.withdrawable_balance ?? 0),
    });
  });
};

const tableStillActive = async (
  sourceKind: TableMonitoringSourceKind,
  tableId: string,
) => {
  if (sourceKind !== "blackjack") {
    return false;
  }

  return Boolean(await findBlackjackTableById(tableId));
};

const unsupportedSource = (sourceKind: TableMonitoringSourceKind) => {
  throw conflictError(`Table source ${sourceKind} is not supported yet.`);
};

export async function getTableMonitoringSnapshot(): Promise<TableMonitoringSnapshot> {
  const tables = await loadActiveBlackjackMonitorTables();

  return {
    generatedAt: new Date(),
    tables: [...tables].sort(compareTables),
  };
}

export async function forceTimeoutTable(params: {
  sourceKind: TableMonitoringSourceKind;
  tableId: string;
}): Promise<TableMonitoringActionResult> {
  if (params.sourceKind !== "blackjack") {
    unsupportedSource(params.sourceKind);
  }

  const table = await getRequiredBlackjackTable(params.tableId);
  const playerSeat = table.seats.find((seat) => seat.userId !== null);
  if (!playerSeat?.userId) {
    throw notFoundError("Table user not found.");
  }
  const roundId = table.roundId;
  if (!roundId) {
    throw internalInvariantError("Blackjack round id is missing.");
  }
  const { roundEntityId } = parseRoundId(roundId);

  try {
    await actOnBlackjack(playerSeat.userId, roundEntityId, "stand");
  } catch (error) {
    if (toAppError(error).code !== API_ERROR_CODES.BLACKJACK_TURN_EXPIRED) {
      throw error;
    }
  }

  return {
    sourceKind: "blackjack",
    tableId: params.tableId,
    action: "force_timeout",
    seatIndex: table.currentActorSeatIndex,
    removed: !(await tableStillActive("blackjack", params.tableId)),
  };
}

export async function closeTable(params: {
  sourceKind: TableMonitoringSourceKind;
  tableId: string;
  reason: string;
}): Promise<TableMonitoringActionResult> {
  if (params.sourceKind !== "blackjack") {
    unsupportedSource(params.sourceKind);
  }

  await closeBlackjackTable({
    tableId: params.tableId,
    reason: params.reason,
    action: "close_table",
  });

  return {
    sourceKind: "blackjack",
    tableId: params.tableId,
    action: "close_table",
    seatIndex: null,
    removed: true,
  };
}

export async function kickTableSeat(params: {
  sourceKind: TableMonitoringSourceKind;
  tableId: string;
  seatIndex: number;
  reason: string;
}): Promise<TableMonitoringActionResult> {
  if (params.sourceKind !== "blackjack") {
    unsupportedSource(params.sourceKind);
  }

  await closeBlackjackTable({
    tableId: params.tableId,
    reason: params.reason,
    action: "kick_seat",
    seatIndex: params.seatIndex,
  });

  return {
    sourceKind: "blackjack",
    tableId: params.tableId,
    action: "kick_seat",
    seatIndex: params.seatIndex,
    removed: true,
  };
}
