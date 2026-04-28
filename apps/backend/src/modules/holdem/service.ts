import { z } from "zod";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  handHistories,
  holdemTableMessages,
  holdemTableSeats,
  holdemTables,
  ledgerEntries,
  tableEvents,
  userWallets,
  users,
} from "@reward/database";
import { and, asc, desc, eq, isNotNull, lte, or, sql } from "@reward/database/orm";
import {
  HOLDEM_CONFIG,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  type HoldemAction,
  type HoldemTableMessage,
  type HoldemTableMessageRequest,
  type HoldemTableMessagesResponse,
  type HoldemPresenceResponse,
  type HoldemTableResponse,
  type HoldemTablesResponse,
} from "@reward/shared-types/holdem";

import { db, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { getConfigView, type AppConfig } from "../../shared/config";
import { toDecimal, toMoneyString } from "../../shared/money";
import { ensureFairnessSeed } from "../fairness/service";
import { appendRoundEvents } from "../hand-history/service";
import { HOLDEM_ROUND_TYPE, buildRoundId } from "../hand-history/round-id";
import { applyHouseBankrollDelta } from "../house/service";
import {
  recordSuspiciousActivity,
  recordTableInteraction,
} from "../risk/service";
import {
  getConfigBoolFromRows,
  getConfigDecimalFromRows,
  getConfigRowsByKeys,
} from "../system/store";
import {
  HOLDEM_DISCONNECT_GRACE_SECONDS_KEY,
  HOLDEM_RAKE_BPS_KEY,
  HOLDEM_RAKE_CAP_AMOUNT_KEY,
  HOLDEM_RAKE_NO_FLOP_NO_DROP_KEY,
  HOLDEM_SEAT_LEASE_SECONDS_KEY,
  HOLDEM_TIME_BANK_MS_KEY,
} from "../system/keys";
import {
  buildHoldemRealtimeFanout,
  publishHoldemRealtimeTableMessage,
  publishHoldemRealtimeUpdate,
  type HoldemRealtimeFanout,
} from "./realtime";
import {
  applyRakeToSettledState,
  actOnHoldemSeat,
  actOnHoldemTable,
  canUserLeaveTable,
  clearTableAfterCashout,
  resolveHoldemTimeoutAction,
  serializeHoldemRealtimeTable,
  serializeHoldemTable,
  serializeHoldemTableSummary,
  startHoldemHand,
  type HoldemAppliedRake,
  type HoldemRakePolicy,
} from "./engine";
import {
  HoldemTableMessageRowsSchema,
  HoldemSeatRowsSchema,
  HoldemTableRowsSchema,
  type DbExecutor,
  parseSqlRows,
  resolveSeatPresenceState,
  resolveSeatDisplayName,
  toHoldemTableMessage,
  toJsonbLiteral,
  toTableState,
  type HoldemTableState,
} from "./model";

const LockedWalletRowSchema = z.object({
  userId: z.number().int().positive(),
  withdrawableBalance: z.union([z.string(), z.number()]),
  lockedBalance: z.union([z.string(), z.number()]),
});

const LockedWalletRowsSchema = z.array(LockedWalletRowSchema);

type LockedWalletRow = z.infer<typeof LockedWalletRowSchema>;

const HOLDEM_REFERENCE_TYPE = "holdem_table";
const DEFAULT_HOLDEM_RAKE_BPS = 500;
const DEFAULT_HOLDEM_RAKE_CAP_AMOUNT = "8.00";
const DEFAULT_HOLDEM_RAKE_NO_FLOP_NO_DROP = true;
const DEFAULT_HOLDEM_DISCONNECT_GRACE_SECONDS = 30;
const DEFAULT_HOLDEM_SEAT_LEASE_SECONDS = 300;
const DEFAULT_HOLDEM_TIME_BANK_MS = 30_000;

type HoldemTurnConfig = AppConfig & {
  holdemTurnTimeoutMs: number;
  holdemTimeoutWorkerBatchSize: number;
};

type HoldemSeatPresencePolicy = {
  disconnectGraceSeconds: number;
  seatLeaseSeconds: number;
};

type HoldemTimeBankPolicy = {
  defaultTimeBankMs: number;
};

const holdemTurnConfig = getConfigView<HoldemTurnConfig>();

const defaultTableName = () => `Hold'em ${new Date().toISOString().slice(11, 19)}`;

const parseAmount = (value: string, label: string) => {
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw badRequestError(`Invalid ${label} amount.`);
  }

  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw badRequestError(`Invalid ${label} amount.`);
  }
  return amount;
};

const assertBuyInWithinRange = (
  amount: ReturnType<typeof toDecimal>,
  state?: Pick<HoldemTableState, "minimumBuyIn" | "maximumBuyIn">,
) => {
  const minimum = toDecimal(state?.minimumBuyIn ?? HOLDEM_CONFIG.minimumBuyIn);
  const maximum = toDecimal(state?.maximumBuyIn ?? HOLDEM_CONFIG.maximumBuyIn);
  if (amount.lt(minimum) || amount.gt(maximum)) {
    throw conflictError("Buy-in amount is outside the allowed range.");
  }
};

type HoldemEventActor = "player" | "dealer" | "system";
type HoldemHandEventInput = {
  type: string;
  actor: HoldemEventActor;
  userId?: number | null;
  payload?: Record<string, unknown> | null;
};
type HoldemTableEventInput = {
  eventType: string;
  actor: HoldemEventActor;
  userId?: number | null;
  seatIndex?: number | null;
  handHistoryId?: number | null;
  phase?: string | null;
  payload?: Record<string, unknown> | null;
};
type PersistedHoldemTableEvent = HoldemTableEventInput & {
  eventIndex: number;
  createdAt: Date;
};

const cloneTableState = (state: HoldemTableState): HoldemTableState =>
  JSON.parse(JSON.stringify(state)) as HoldemTableState;

const isSettledHoldemState = (state: HoldemTableState) =>
  state.status === "waiting" && state.metadata.stage === "showdown";

const buildHoldemRoundId = (handHistoryId: number) =>
  buildRoundId({
    roundType: HOLDEM_ROUND_TYPE,
    roundEntityId: handHistoryId,
  });

const buildHoldemRiskTableId = (tableId: number) => `holdem:${tableId}`;

const listHoldemActiveParticipantUserIds = (state: HoldemTableState) =>
  state.seats
    .filter((seat) => seat.status === "active")
    .map((seat) => seat.userId)
    .filter((userId): userId is number => Number.isInteger(userId) && userId > 0)
    .sort((left, right) => left - right);

const recordHoldemCollusionSignals = async (params: {
  tableId: number;
  handHistoryId: number;
  handNumber: number;
  participantUserIds: number[];
}) => {
  const interaction = await recordTableInteraction(
    params.participantUserIds,
    buildHoldemRiskTableId(params.tableId),
  );
  if (!interaction || interaction.signaledPairCount <= 0) {
    return interaction;
  }

  const groupedSignals = new Map<
    number,
    {
      peerUserIds: Set<number>;
      score: number;
      pairSignals: Array<{
        peerUserId: number;
        sharedIp: boolean;
        sharedDevice: boolean;
        repeatedTable: boolean;
        interactionCount: number;
        suspicionScore: number;
        scoreDelta: number;
      }>;
    }
  >();

  for (const signal of interaction.pairSignals) {
    if (
      signal.scoreDelta <= 0 ||
      (!signal.sharedIp && !signal.sharedDevice && !signal.repeatedTable)
    ) {
      continue;
    }

    for (const [userId, peerUserId] of [
      [signal.userAId, signal.userBId],
      [signal.userBId, signal.userAId],
    ] as const) {
      const existing = groupedSignals.get(userId) ?? {
        peerUserIds: new Set<number>(),
        score: 0,
        pairSignals: [],
      };
      existing.peerUserIds.add(peerUserId);
      existing.score += signal.scoreDelta;
      existing.pairSignals.push({
        peerUserId,
        sharedIp: signal.sharedIp,
        sharedDevice: signal.sharedDevice,
        repeatedTable: signal.repeatedTable,
        interactionCount: signal.interactionCount,
        suspicionScore: signal.suspicionScore,
        scoreDelta: signal.scoreDelta,
      });
      groupedSignals.set(userId, existing);
    }
  }

  const roundId = buildHoldemRoundId(params.handHistoryId);
  await Promise.all(
    [...groupedSignals.entries()].map(([userId, signal]) =>
      recordSuspiciousActivity({
        userId,
        reason: "holdem_collusion_signal",
        score: signal.score,
        metadata: {
          source: "holdem_table_interaction",
          gameType: "holdem",
          tableId: params.tableId,
          riskTableId: interaction.tableId,
          roundId,
          handHistoryId: params.handHistoryId,
          handNumber: params.handNumber,
          interactionEventId: interaction.eventId,
          peerUserIds: [...signal.peerUserIds].sort((left, right) => left - right),
          pairSignals: signal.pairSignals,
        },
        freezeReason: "gameplay_lock",
        freezeScope: "gameplay_lock",
        freezeCategory: "risk",
      }),
    ),
  );

  return interaction;
};

const loadHoldemRakePolicy = async (
  executor: DbExecutor,
): Promise<HoldemRakePolicy> => {
  const rows = await getConfigRowsByKeys(executor, [
    HOLDEM_RAKE_BPS_KEY,
    HOLDEM_RAKE_CAP_AMOUNT_KEY,
    HOLDEM_RAKE_NO_FLOP_NO_DROP_KEY,
  ]);

  const [rakeBps, capAmount, noFlopNoDrop] = await Promise.all([
    getConfigDecimalFromRows(
      executor,
      rows,
      HOLDEM_RAKE_BPS_KEY,
      DEFAULT_HOLDEM_RAKE_BPS,
    ),
    getConfigDecimalFromRows(
      executor,
      rows,
      HOLDEM_RAKE_CAP_AMOUNT_KEY,
      DEFAULT_HOLDEM_RAKE_CAP_AMOUNT,
    ),
    getConfigBoolFromRows(
      executor,
      rows,
      HOLDEM_RAKE_NO_FLOP_NO_DROP_KEY,
      DEFAULT_HOLDEM_RAKE_NO_FLOP_NO_DROP,
    ),
  ]);

  return {
    rakeBps: Number(rakeBps.toFixed(0)),
    capAmount: toMoneyString(capAmount),
    noFlopNoDrop,
  };
};

const loadHoldemSeatPresencePolicy = async (
  executor: DbExecutor,
): Promise<HoldemSeatPresencePolicy> => {
  const rows = await getConfigRowsByKeys(executor, [
    HOLDEM_DISCONNECT_GRACE_SECONDS_KEY,
    HOLDEM_SEAT_LEASE_SECONDS_KEY,
  ]);

  const [disconnectGraceSeconds, seatLeaseSeconds] = await Promise.all([
    getConfigDecimalFromRows(
      executor,
      rows,
      HOLDEM_DISCONNECT_GRACE_SECONDS_KEY,
      DEFAULT_HOLDEM_DISCONNECT_GRACE_SECONDS,
    ),
    getConfigDecimalFromRows(
      executor,
      rows,
      HOLDEM_SEAT_LEASE_SECONDS_KEY,
      DEFAULT_HOLDEM_SEAT_LEASE_SECONDS,
    ),
  ]);

  return {
    disconnectGraceSeconds: Math.max(
      1,
      Number(disconnectGraceSeconds.toFixed(0)),
    ),
    seatLeaseSeconds: Math.max(1, Number(seatLeaseSeconds.toFixed(0))),
  };
};

const loadHoldemTimeBankPolicy = async (
  executor: DbExecutor,
): Promise<HoldemTimeBankPolicy> => {
  const rows = await getConfigRowsByKeys(executor, [HOLDEM_TIME_BANK_MS_KEY]);
  const defaultTimeBankMs = await getConfigDecimalFromRows(
    executor,
    rows,
    HOLDEM_TIME_BANK_MS_KEY,
    DEFAULT_HOLDEM_TIME_BANK_MS,
  );

  return {
    defaultTimeBankMs: Math.max(0, Number(defaultTimeBankMs.toFixed(0))),
  };
};

const normalizeTimeBankMs = (value: number) => Math.max(0, Math.floor(value));

const parseDateOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resetSeatTimeBank = (
  seat: HoldemTableState["seats"][number],
  defaultTimeBankMs: number,
) => {
  seat.metadata.timeBankRemainingMs = toDecimal(seat.stackAmount).gt(0)
    ? normalizeTimeBankMs(defaultTimeBankMs)
    : 0;
};

const applySeatPresenceTouch = (
  state: HoldemTableState,
  seatUserId: number,
  policy: HoldemSeatPresencePolicy,
  now = new Date(),
) => {
  const seat = state.seats.find((entry) => entry.userId === seatUserId) ?? null;
  if (!seat) {
    return null;
  }

  seat.presenceHeartbeatAt = now;
  seat.disconnectGraceExpiresAt = new Date(
    now.getTime() + policy.disconnectGraceSeconds * 1_000,
  );
  seat.seatLeaseExpiresAt = new Date(
    now.getTime() + policy.seatLeaseSeconds * 1_000,
  );
  seat.autoCashOutPending = false;
  if (
    seat.metadata.sittingOut &&
    seat.metadata.sitOutSource === "presence" &&
    toDecimal(seat.stackAmount).gt(0)
  ) {
    seat.metadata.sittingOut = false;
    seat.metadata.sitOutSource = null;
  }

  return seat;
};

const buildPresenceResponse = (
  state: HoldemTableState,
  seatUserId: number,
): HoldemPresenceResponse => {
  const seat = state.seats.find((entry) => entry.userId === seatUserId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem table.");
  }

  return {
    tableId: state.id,
    seatIndex: seat.seatIndex,
    sittingOut: seat.metadata.sittingOut,
    connectionState: resolveSeatPresenceState(seat) ?? "connected",
    disconnectGraceExpiresAt: seat.disconnectGraceExpiresAt ?? null,
    seatLeaseExpiresAt: seat.seatLeaseExpiresAt ?? null,
    autoCashOutPending: seat.autoCashOutPending ?? false,
  };
};

const buildRealtimeUpdate = (params: {
  state: HoldemTableState;
  tableEvents: PersistedHoldemTableEvent[];
  action?: HoldemAction | null;
  timedOut?: boolean;
}): HoldemRealtimeFanout => {
  const latestEvent =
    params.tableEvents[params.tableEvents.length - 1] ?? null;
  const handHistoryId =
    latestEvent?.handHistoryId ?? getActiveHandHistoryId(params.state) ?? null;

  return buildHoldemRealtimeFanout({
    state: params.state,
    update: {
      table: serializeHoldemRealtimeTable(params.state),
      handHistoryId,
      roundId: handHistoryId ? buildHoldemRoundId(handHistoryId) : null,
      actorSeatIndex: latestEvent?.seatIndex ?? null,
      action: params.action ?? null,
      timedOut: params.timedOut === true,
      eventTypes: params.tableEvents.map((event) => event.eventType),
    },
  });
};

const buildContributionMap = (state: HoldemTableState) =>
  new Map(
    state.seats.map((seat) => [
      seat.seatIndex,
      toDecimal(seat.totalCommittedAmount),
    ] as const),
  );

const buildParticipantSummaries = (params: {
  state: HoldemTableState;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) =>
  params.state.seats
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((seat) => {
      const stackBefore =
        params.stackBeforeByUserId.get(seat.userId) ?? toDecimal(seat.stackAmount);
      const stackAfter = toDecimal(seat.stackAmount);
      const contributionAmount =
        params.contributionBySeatIndex?.get(seat.seatIndex) ??
        toDecimal(seat.totalCommittedAmount);
      const payoutFloor = stackBefore.minus(contributionAmount);
      const payoutAmount = stackAfter.gt(payoutFloor)
        ? stackAfter.minus(payoutFloor)
        : toDecimal(0);

      return {
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        displayName: resolveSeatDisplayName(seat.userId, seat.userEmail),
        contributionAmount: toMoneyString(contributionAmount),
        payoutAmount: toMoneyString(payoutAmount),
        stackBefore: toMoneyString(stackBefore),
        stackAfter: toMoneyString(stackAfter),
        winner: seat.metadata.winner,
        status: seat.status,
        holeCards: seat.holeCards,
        bestHand: seat.metadata.bestHand,
        lastAction: seat.lastAction,
      };
    });

const buildHoldemHandSummary = (params: {
  state: HoldemTableState;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) => ({
  gameType: "holdem",
  tableId: params.state.id,
  tableName: params.state.name,
  handNumber: params.state.metadata.handNumber,
  status: isSettledHoldemState(params.state) ? "settled" : params.state.status,
  stage: params.state.metadata.stage,
  blinds: {
    smallBlind: toMoneyString(params.state.smallBlind),
    bigBlind: toMoneyString(params.state.bigBlind),
  },
  dealerSeatIndex: params.state.metadata.dealerSeatIndex,
  smallBlindSeatIndex: params.state.metadata.smallBlindSeatIndex,
  bigBlindSeatIndex: params.state.metadata.bigBlindSeatIndex,
  pendingActorSeatIndex: params.state.metadata.pendingActorSeatIndex,
  boardCards: params.state.metadata.communityCards,
  revealedSeatIndexes: params.state.metadata.revealedSeatIndexes,
  winnerSeatIndexes: params.state.metadata.winnerSeatIndexes,
  totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.state)),
  pots:
    params.state.metadata.resolvedPots.length > 0
      ? params.state.metadata.resolvedPots
      : null,
  participants: buildParticipantSummaries(params),
});

const resolveTotalRakeAmount = (state: HoldemTableState) =>
  state.metadata.resolvedPots.reduce(
    (sum, pot) => sum.plus(pot.rakeAmount ?? "0.00"),
    toDecimal(0),
  );

const getActiveHandHistoryId = (state: HoldemTableState) =>
  state.metadata.activeHandHistoryId;

const appendTableEvents = async (params: {
  tx: DbTransaction;
  tableId: number;
  events: HoldemTableEventInput[];
}) => {
  const { tx } = params;
  if (params.events.length === 0) {
    return [] satisfies PersistedHoldemTableEvent[];
  }

  const [row] = await tx
    .select({
      maxEventIndex: sql<number>`coalesce(max(${tableEvents.eventIndex}), -1)`,
    })
    .from(tableEvents)
    .where(
      and(
        eq(tableEvents.tableType, "holdem"),
        eq(tableEvents.tableId, params.tableId),
      ),
    );
  const nextEventIndex = Number(row?.maxEventIndex ?? -1) + 1;
  const createdAt = new Date();
  const values = params.events.map((event, index) => ({
    tableType: "holdem" as const,
    tableId: params.tableId,
    seatIndex: event.seatIndex ?? null,
    userId: event.userId ?? null,
    handHistoryId: event.handHistoryId ?? null,
    phase: event.phase ?? null,
    eventIndex: nextEventIndex + index,
    eventType: event.eventType,
    actor: event.actor,
    payload: event.payload ?? {},
    createdAt,
  }));

  await tx.insert(tableEvents).values(values);

  return values.map((event) => ({
    eventType: event.eventType,
    actor: event.actor,
    userId: event.userId,
    seatIndex: event.seatIndex,
    handHistoryId: event.handHistoryId,
    phase: event.phase,
    payload: event.payload as Record<string, unknown>,
    eventIndex: event.eventIndex,
    createdAt: event.createdAt,
  }));
};

const createHoldemHandHistory = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  startedByUserId: number;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
}) => {
  const { tx, state } = params;
  const now = new Date();
  const [createdHandHistory] = await tx
    .insert(handHistories)
    .values({
      roundType: HOLDEM_ROUND_TYPE,
      gameType: "holdem",
      tableId: state.id,
      referenceId: state.id,
      primaryUserId: params.startedByUserId,
      participantUserIds: state.seats.map((seat) => seat.userId),
      handNumber: state.metadata.handNumber,
      status: "active",
      summary: buildHoldemHandSummary({
        state,
        stackBeforeByUserId: params.stackBeforeByUserId,
      }),
      fairness: state.metadata.fairness,
      startedAt: now,
      settledAt: null,
      updatedAt: now,
    })
    .returning({
      id: handHistories.id,
    });

  if (!createdHandHistory) {
    throw conflictError("Failed to create holdem hand history.");
  }

  state.metadata.activeHandHistoryId = createdHandHistory.id;
  return createdHandHistory.id;
};

const loadHoldemHandHistoryOwnerUserId = async (
  tx: DbTransaction,
  handHistoryId: number,
) => {
  const [row] = await tx
    .select({
      primaryUserId: handHistories.primaryUserId,
    })
    .from(handHistories)
    .where(eq(handHistories.id, handHistoryId))
    .limit(1);

  if (!row?.primaryUserId) {
    throw internalInvariantError("Holdem hand history owner is missing.");
  }

  return row.primaryUserId;
};

const syncHoldemHandHistory = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  stackBeforeByUserId: Map<number, ReturnType<typeof toDecimal>>;
  contributionBySeatIndex?: Map<number, ReturnType<typeof toDecimal>>;
}) => {
  const nextRoundId = buildHoldemRoundId(params.handHistoryId);
  if (
    isSettledHoldemState(params.state) &&
    params.state.metadata.recentHands[0]?.handNumber === params.state.metadata.handNumber
  ) {
    params.state.metadata.recentHands[0].roundId = nextRoundId;
  }

  const settled = isSettledHoldemState(params.state);
  await params.tx
    .update(handHistories)
    .set({
      status: settled ? "settled" : "active",
      summary: buildHoldemHandSummary({
        state: params.state,
        stackBeforeByUserId: params.stackBeforeByUserId,
        contributionBySeatIndex: params.contributionBySeatIndex,
      }),
      fairness: params.state.metadata.fairness,
      settledAt: settled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(handHistories.id, params.handHistoryId));

  if (settled) {
    params.state.metadata.activeHandHistoryId = null;
  }
};

const buildTurnStartedEvent = (
  state: HoldemTableState,
): HoldemHandEventInput | null => {
  const pendingActorSeat = getPendingActorSeat(state);
  if (!pendingActorSeat) {
    return null;
  }

  return {
    type: "turn_started",
    actor: "system" as const,
    userId: pendingActorSeat.userId,
    payload: {
      handNumber: state.metadata.handNumber,
      stage: state.metadata.stage,
      seatIndex: pendingActorSeat.seatIndex,
      userId: pendingActorSeat.userId,
      turnDeadlineAt: pendingActorSeat.turnDeadlineAt,
      turnTimeBankStartsAt: state.metadata.turnTimeBankStartsAt,
      timeBankRemainingMs: pendingActorSeat.metadata.timeBankRemainingMs,
    },
  };
};

const appendHoldemHandEvents = async (params: {
  tx: DbTransaction;
  handHistoryId: number;
  historyUserId: number;
  tableId: number;
  phase: string | null;
  events: HoldemHandEventInput[];
}) => {
  if (params.events.length === 0) {
    return;
  }

  await appendRoundEvents(params.tx, {
    roundType: HOLDEM_ROUND_TYPE,
    roundEntityId: params.handHistoryId,
    userId: params.historyUserId,
    events: params.events.map((event) => ({
      type: event.type,
      actor: event.actor,
      payload: {
        tableId: params.tableId,
        handHistoryId: params.handHistoryId,
        phase: params.phase,
        ...event.payload,
      },
      userId: event.userId ?? null,
    })),
  });
};

const recordHandStartedEvents = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
}) => {
  const participants = params.state.seats
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((seat) => ({
      seatIndex: seat.seatIndex,
      userId: seat.userId,
      displayName: resolveSeatDisplayName(seat.userId, seat.userEmail),
    }));
  const blindSeats = params.state.seats.filter(
    (seat) => seat.lastAction === "Small blind" || seat.lastAction === "Big blind",
  );
  const events: HoldemHandEventInput[] = [
    {
      type: "hand_started",
      actor: "system" as const,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.state.metadata.handNumber,
        tableName: params.state.name,
        dealerSeatIndex: params.state.metadata.dealerSeatIndex,
        smallBlindSeatIndex: params.state.metadata.smallBlindSeatIndex,
        bigBlindSeatIndex: params.state.metadata.bigBlindSeatIndex,
        fairness: params.state.metadata.fairness,
        participants,
      },
    },
    {
      type: "hole_cards_dealt",
      actor: "dealer" as const,
      payload: {
        handNumber: params.state.metadata.handNumber,
        seats: params.state.seats.map((seat) => ({
          seatIndex: seat.seatIndex,
          userId: seat.userId,
          holeCards: seat.holeCards,
        })),
      },
    },
    ...blindSeats.map((seat) => ({
      type:
        seat.lastAction === "Small blind"
          ? "small_blind_posted"
          : "big_blind_posted",
      actor: "player" as const,
      userId: seat.userId,
      payload: {
        handNumber: params.state.metadata.handNumber,
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        amount: seat.committedAmount,
        stackAmount: seat.stackAmount,
      },
    })),
  ];

  const turnEvent = buildTurnStartedEvent(params.state);
  if (turnEvent) {
    events.push(turnEvent);
  }

  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.state.id,
    phase: params.state.metadata.stage,
    events,
  });
};

const recordHandTransitionEvents = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const actorSeat =
    params.beforeState.seats.find((seat) => seat.userId === params.actingUserId) ?? null;
  const actingSeatAfter =
    actorSeat === null
      ? null
      : params.afterState.seats.find(
          (seat) => seat.seatIndex === actorSeat.seatIndex,
        ) ?? null;
  const events: Array<{
    type: string;
    actor: HoldemEventActor;
    userId?: number | null;
    payload?: Record<string, unknown> | null;
  }> = [];

  if (params.timedOut && actorSeat) {
    events.push({
      type: "turn_timed_out",
      actor: "system",
      userId: actorSeat.userId,
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        seatIndex: actorSeat.seatIndex,
        userId: actorSeat.userId,
        timeoutAction: params.action,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  if (actorSeat) {
    events.push({
      type: "player_acted",
      actor: "player",
      userId: actorSeat.userId,
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        seatIndex: actorSeat.seatIndex,
        userId: actorSeat.userId,
        action: params.action,
        resultingStatus: actingSeatAfter?.status ?? null,
        stackAmount: actingSeatAfter?.stackAmount ?? actorSeat.stackAmount,
        committedAmount:
          actingSeatAfter?.committedAmount ?? actorSeat.committedAmount,
        totalCommittedAmount:
          actingSeatAfter?.totalCommittedAmount ?? actorSeat.totalCommittedAmount,
        lastAction: actingSeatAfter?.lastAction ?? actorSeat.lastAction,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  if (
    params.afterState.metadata.stage &&
    afterBoardCount > beforeBoardCount
  ) {
    events.push({
      type: "board_revealed",
      actor: "dealer",
      payload: {
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        newCards: params.afterState.metadata.communityCards.slice(beforeBoardCount),
        boardCards: params.afterState.metadata.communityCards,
      },
    });
  }

  const fairnessRevealSeed = params.afterState.metadata.fairness?.revealSeed;
  if (
    typeof fairnessRevealSeed === "string" &&
    fairnessRevealSeed.length > 0 &&
    params.beforeState.metadata.fairness?.revealSeed !== fairnessRevealSeed
  ) {
    events.push({
      type: "fairness_revealed",
      actor: "system",
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        fairness: params.afterState.metadata.fairness,
      },
    });
  }

  if (isSettledHoldemState(params.afterState)) {
    const roundId = buildHoldemRoundId(params.handHistoryId);
    events.push({
      type:
        params.afterState.metadata.revealedSeatIndexes.length > 1
          ? "showdown_resolved"
          : "hand_won_by_fold",
      actor: "system",
      payload: {
        roundId,
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        boardCards: params.afterState.metadata.communityCards,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        revealedSeatIndexes: params.afterState.metadata.revealedSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
        participants: buildParticipantSummaries({
          state: params.afterState,
          stackBeforeByUserId: new Map(
            params.beforeState.seats.map((seat) => [
              seat.userId,
              toDecimal(seat.stackAmount).plus(
                toDecimal(seat.totalCommittedAmount),
              ),
            ] as const),
          ),
          contributionBySeatIndex: buildContributionMap(params.beforeState),
        }),
      },
    });
    events.push({
      type: "hand_settled",
      actor: "system",
      payload: {
        roundId,
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
  } else {
    const turnEvent = buildTurnStartedEvent(params.afterState);
    if (turnEvent) {
      events.push(turnEvent);
    }
  }

  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.afterState.id,
    phase: params.afterState.metadata.stage,
    events,
  });
};

const recordTableTransitionEvents = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const actorSeat =
    params.beforeState.seats.find((seat) => seat.userId === params.actingUserId) ??
    null;
  const actingSeatAfter =
    actorSeat === null
      ? null
      : params.afterState.seats.find(
          (seat) => seat.seatIndex === actorSeat.seatIndex,
        ) ?? null;
  const events: HoldemTableEventInput[] = [];

  if (params.timedOut && actorSeat) {
    events.push({
      eventType: "turn_timed_out",
      actor: "system",
      userId: actorSeat.userId,
      seatIndex: actorSeat.seatIndex,
      handHistoryId: params.handHistoryId,
      phase: params.beforeState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        action: params.action,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  if (actorSeat) {
    events.push({
      eventType: "player_acted",
      actor: params.timedOut ? "system" : "player",
      userId: actorSeat.userId,
      seatIndex: actorSeat.seatIndex,
      handHistoryId: params.handHistoryId,
      phase: params.beforeState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        stage: params.beforeState.metadata.stage,
        action: params.action,
        stackAmount: actingSeatAfter?.stackAmount ?? actorSeat.stackAmount,
        committedAmount:
          actingSeatAfter?.committedAmount ?? actorSeat.committedAmount,
        totalCommittedAmount:
          actingSeatAfter?.totalCommittedAmount ?? actorSeat.totalCommittedAmount,
        lastAction: actingSeatAfter?.lastAction ?? actorSeat.lastAction,
        turnDeadlineAt: actorSeat.turnDeadlineAt,
        turnTimeBankStartsAt: params.beforeState.metadata.turnTimeBankStartsAt,
        timeBankConsumedMs: params.timeBankConsumedMs ?? 0,
        timeBankRemainingMs: actingSeatAfter?.metadata.timeBankRemainingMs ?? 0,
      },
    });
  }

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  if (
    params.afterState.metadata.stage !== null &&
    afterBoardCount > beforeBoardCount
  ) {
    events.push({
      eventType: "board_revealed",
      actor: "dealer",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        stage: params.afterState.metadata.stage,
        newCards: params.afterState.metadata.communityCards.slice(beforeBoardCount),
        boardCards: params.afterState.metadata.communityCards,
      },
    });
  }

  const fairnessRevealSeed = params.afterState.metadata.fairness?.revealSeed;
  if (
    typeof fairnessRevealSeed === "string" &&
    fairnessRevealSeed.length > 0 &&
    params.beforeState.metadata.fairness?.revealSeed !== fairnessRevealSeed
  ) {
    events.push({
      eventType: "fairness_revealed",
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        fairness: params.afterState.metadata.fairness,
      },
    });
  }

  if (isSettledHoldemState(params.afterState)) {
    const settledEventType =
      params.afterState.metadata.revealedSeatIndexes.length > 1
        ? "showdown_resolved"
        : "hand_won_by_fold";
    events.push({
      eventType: settledEventType,
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        revealedSeatIndexes: params.afterState.metadata.revealedSeatIndexes,
        boardCards: params.afterState.metadata.communityCards,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
    events.push({
      eventType: "hand_settled",
      actor: "system",
      handHistoryId: params.handHistoryId,
      phase: params.afterState.metadata.stage,
      payload: {
        roundId: buildHoldemRoundId(params.handHistoryId),
        handNumber: params.afterState.metadata.handNumber,
        winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        pots: params.afterState.metadata.resolvedPots,
        totalRakeAmount: toMoneyString(resolveTotalRakeAmount(params.afterState)),
      },
    });
  } else {
    const nextSeat = getPendingActorSeat(params.afterState);
    if (nextSeat) {
      events.push({
        eventType: "turn_started",
        actor: "system",
        userId: nextSeat.userId,
        seatIndex: nextSeat.seatIndex,
        handHistoryId: params.handHistoryId,
        phase: params.afterState.metadata.stage,
        payload: {
          roundId: buildHoldemRoundId(params.handHistoryId),
          handNumber: params.afterState.metadata.handNumber,
          stage: params.afterState.metadata.stage,
          turnDeadlineAt: nextSeat.turnDeadlineAt,
          turnTimeBankStartsAt: params.afterState.metadata.turnTimeBankStartsAt,
          timeBankRemainingMs: nextSeat.metadata.timeBankRemainingMs,
        },
      });
    }
  }

  return appendTableEvents({
    tx: params.tx,
    tableId: params.afterState.id,
    events,
  });
};

const persistHoldemTransition = async (params: {
  tx: DbTransaction;
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
  lockedWallets: Map<number, LockedWalletRow>;
  action: HoldemAction;
  actingUserId: number | null;
  timedOut?: boolean;
  timeBankConsumedMs?: number;
}) => {
  const handHistoryId =
    getActiveHandHistoryId(params.beforeState) ??
    getActiveHandHistoryId(params.afterState);
  if (!handHistoryId) {
    throw conflictError("Holdem hand history is missing for the active hand.");
  }

  const contributionBySeatIndex = buildContributionMap(params.beforeState);
  const historyUserId = await loadHoldemHandHistoryOwnerUserId(
    params.tx,
    handHistoryId,
  );
  const grossSettledState = isSettledHoldemState(params.afterState)
    ? cloneTableState(params.afterState)
    : null;
  const appliedRake = isSettledHoldemState(params.afterState)
    ? applyRakeToSettledState(
        params.afterState,
        await loadHoldemRakePolicy(params.tx),
      )
    : null;
  syncHoldemTurnDeadlines(params.afterState);

  await recordHandTransitionEvents({
    tx: params.tx,
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
    historyUserId,
    action: params.action,
    actingUserId: params.actingUserId,
    timedOut: params.timedOut,
    timeBankConsumedMs: params.timeBankConsumedMs,
  });

  await syncHoldemHandHistory({
    tx: params.tx,
    state: params.afterState,
    handHistoryId,
    stackBeforeByUserId: params.previousStacks,
    contributionBySeatIndex,
  });
  let persistedTableEvents = await recordTableTransitionEvents({
    tx: params.tx,
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
    action: params.action,
    actingUserId: params.actingUserId,
    timedOut: params.timedOut,
    timeBankConsumedMs: params.timeBankConsumedMs,
  });

  await syncSettledLockedBalances({
    tx: params.tx,
    state: params.afterState,
    grossSettledState,
    appliedRake,
    lockedWallets: params.lockedWallets,
    previousStacks: params.previousStacks,
    handHistoryId,
  });
  const autoCashOuts = await settlePendingSeatCashOuts({
    tx: params.tx,
    state: params.afterState,
    lockedWallets: params.lockedWallets,
  });
  if (autoCashOuts.length > 0) {
    const autoCashOutEvents = await appendTableEvents({
      tx: params.tx,
      tableId: params.afterState.id,
      events: autoCashOuts.map((entry) => ({
        eventType: "seat_auto_cashed_out",
        actor: "system" as const,
        userId: entry.userId,
        seatIndex: entry.seatIndex,
        payload: {
          tableName: params.afterState.name,
          cashOutAmount: entry.cashOutAmount,
          remainingSeatCount: params.afterState.seats.length,
        },
      })),
    });
    persistedTableEvents = [...persistedTableEvents, ...autoCashOutEvents];
  }
  await persistTableState(params.tx, params.afterState);

  return buildRealtimeUpdate({
    state: params.afterState,
    tableEvents: persistedTableEvents,
    action: params.action,
    timedOut: params.timedOut,
  });
};

const clearHoldemTurnState = (state: HoldemTableState) => {
  state.metadata.turnStartedAt = null;
  state.metadata.turnTimeBankStartsAt = null;
  state.metadata.turnTimeBankAllocatedMs = 0;
  for (const seat of state.seats) {
    seat.turnDeadlineAt = null;
  }
};

const getPendingActorSeat = (state: HoldemTableState) =>
  state.metadata.pendingActorSeatIndex === null
    ? null
    : state.seats.find(
        (seat) => seat.seatIndex === state.metadata.pendingActorSeatIndex,
      ) ?? null;

const resolveActiveTurnTimeBankSnapshot = (state: HoldemTableState) => {
  const pendingSeat =
    state.status !== "active" ? null : getPendingActorSeat(state);
  if (!pendingSeat?.turnDeadlineAt) {
    return null;
  }

  const deadlineAt = parseDateOrNull(pendingSeat.turnDeadlineAt);
  if (!deadlineAt) {
    return null;
  }

  const allocatedMs = normalizeTimeBankMs(
    state.metadata.turnTimeBankAllocatedMs ??
      pendingSeat.metadata.timeBankRemainingMs,
  );
  const timeBankStartsAt =
    parseDateOrNull(state.metadata.turnTimeBankStartsAt) ??
    new Date(deadlineAt.getTime() - allocatedMs);

  return {
    pendingSeat,
    deadlineAt,
    allocatedMs,
    timeBankStartsAt,
  };
};

const syncHoldemTurnDeadlines = (
  state: HoldemTableState,
  now = new Date(),
) => {
  const pendingSeat =
    state.status !== "active" || state.metadata.pendingActorSeatIndex === null
      ? null
      : state.seats.find(
          (seat) =>
            seat.seatIndex === state.metadata.pendingActorSeatIndex &&
            seat.status === "active",
        ) ?? null;

  if (!pendingSeat) {
    clearHoldemTurnState(state);
    return;
  }

  const snapshot = resolveActiveTurnTimeBankSnapshot(state);
  if (snapshot && snapshot.pendingSeat.id === pendingSeat.id) {
    state.metadata.turnTimeBankAllocatedMs = snapshot.allocatedMs;
    state.metadata.turnTimeBankStartsAt = snapshot.timeBankStartsAt;
    state.metadata.turnStartedAt =
      parseDateOrNull(state.metadata.turnStartedAt) ??
      new Date(
        snapshot.timeBankStartsAt.getTime() -
          holdemTurnConfig.holdemTurnTimeoutMs,
      );

    for (const seat of state.seats) {
      seat.turnDeadlineAt =
        seat.id === pendingSeat.id ? snapshot.deadlineAt : null;
    }
    return;
  }

  const remainingMs = normalizeTimeBankMs(pendingSeat.metadata.timeBankRemainingMs);
  const turnStartedAt = new Date(now);
  const timeBankStartsAt = new Date(
    turnStartedAt.getTime() + holdemTurnConfig.holdemTurnTimeoutMs,
  );
  const turnDeadlineAt = new Date(timeBankStartsAt.getTime() + remainingMs);

  state.metadata.turnStartedAt = turnStartedAt;
  state.metadata.turnTimeBankStartsAt = timeBankStartsAt;
  state.metadata.turnTimeBankAllocatedMs = remainingMs;
  pendingSeat.metadata.timeBankRemainingMs = remainingMs;

  for (const seat of state.seats) {
    seat.turnDeadlineAt = seat.id === pendingSeat.id ? turnDeadlineAt : null;
  }
};

const isHoldemTurnExpired = (state: HoldemTableState, now = new Date()) => {
  const seat = getPendingActorSeat(state);
  return Boolean(
    seat?.turnDeadlineAt &&
      new Date(seat.turnDeadlineAt).getTime() <= now.getTime(),
  );
};

const consumeHoldemTurnTimeBank = (
  state: HoldemTableState,
  seatIndex: number,
  params?: {
    now?: Date;
    consumeFull?: boolean;
  },
) => {
  const snapshot = resolveActiveTurnTimeBankSnapshot(state);
  if (!snapshot || snapshot.pendingSeat.seatIndex !== seatIndex) {
    return null;
  }

  const now = params?.now ?? new Date();
  const currentRemainingMs = normalizeTimeBankMs(
    snapshot.pendingSeat.metadata.timeBankRemainingMs,
  );
  const baselineConsumedMs = params?.consumeFull
    ? snapshot.allocatedMs
    : snapshot.deadlineAt.getTime() <= now.getTime()
      ? snapshot.allocatedMs
      : Math.max(
          0,
          Math.min(
            snapshot.allocatedMs,
            now.getTime() - snapshot.timeBankStartsAt.getTime(),
          ),
        );
  const consumedMs = Math.min(
    currentRemainingMs,
    snapshot.allocatedMs,
    baselineConsumedMs,
  );
  const remainingMs = normalizeTimeBankMs(currentRemainingMs - consumedMs);
  snapshot.pendingSeat.metadata.timeBankRemainingMs = remainingMs;

  return {
    consumedMs,
    remainingMs,
    timeBankStartsAt: snapshot.timeBankStartsAt,
  };
};

const processExpiredHoldemTurn = (
  state: HoldemTableState,
  now = new Date(),
) => {
  if (!isHoldemTurnExpired(state, now)) {
    return null;
  }

  const pendingSeat = getPendingActorSeat(state);
  if (!pendingSeat) {
    return null;
  }

  const timeoutAction = resolveHoldemTimeoutAction(state, pendingSeat.seatIndex);
  if (!timeoutAction) {
    clearHoldemTurnState(state);
    return null;
  }

  const timeBank = consumeHoldemTurnTimeBank(state, pendingSeat.seatIndex, {
    now,
    consumeFull: true,
  });
  actOnHoldemSeat(state, {
    seatIndex: pendingSeat.seatIndex,
    action: timeoutAction,
  });
  return {
    seatIndex: pendingSeat.seatIndex,
    action: timeoutAction,
    timeBankConsumedMs: timeBank?.consumedMs ?? 0,
  };
};

const ensureWalletRows = async (
  tx: DbTransaction,
  userIds: number[],
) => {
  for (const userId of userIds) {
    await tx.insert(userWallets).values({ userId }).onConflictDoNothing();
  }
};

const loadLockedWalletRows = async (
  tx: DbTransaction,
  userIds: number[],
): Promise<Map<number, LockedWalletRow>> => {
  if (userIds.length === 0) {
    return new Map();
  }

  await ensureWalletRows(tx, userIds);
  const result = await tx.execute(sql`
    SELECT user_id AS "userId",
           withdrawable_balance AS "withdrawableBalance",
           locked_balance AS "lockedBalance"
    FROM ${userWallets}
    WHERE user_id IN (${sql.join(
      userIds.map((userId) => sql`${userId}`),
      sql`, `,
    )})
    FOR UPDATE
  `);

  const rows = parseSqlRows(
    LockedWalletRowsSchema,
    result,
    "Invalid holdem wallet snapshot.",
  );
  return new Map(rows.map((row) => [row.userId, row]));
};

const loadTableRows = async (
  executor: DbExecutor,
  params?: { tableId?: number; lock?: boolean },
) => {
  const whereClause =
    params?.tableId !== undefined
      ? sql`WHERE id = ${params.tableId}`
      : sql``;
  const lockClause = params?.lock ? sql`FOR UPDATE` : sql``;
  const result = await executor.execute(sql`
    SELECT id,
           name,
           status,
           small_blind AS "smallBlind",
           big_blind AS "bigBlind",
           minimum_buy_in AS "minimumBuyIn",
           maximum_buy_in AS "maximumBuyIn",
           max_seats AS "maxSeats",
           metadata,
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM ${holdemTables}
    ${whereClause}
    ORDER BY id ASC
    ${lockClause}
  `);

  return parseSqlRows(
    HoldemTableRowsSchema,
    result,
    "Invalid holdem table row.",
  );
};

const loadSeatRows = async (
  executor: DbExecutor,
  params?: { tableId?: number; userId?: number; lock?: boolean },
) => {
  const conditions = [];
  if (params?.tableId !== undefined) {
    conditions.push(sql`s.table_id = ${params.tableId}`);
  }
  if (params?.userId !== undefined) {
    conditions.push(sql`s.user_id = ${params.userId}`);
  }
  const whereClause =
    conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;
  const lockClause = params?.lock ? sql`FOR UPDATE` : sql``;

  const result = await executor.execute(sql`
    SELECT s.id,
           s.table_id AS "tableId",
           s.seat_index AS "seatIndex",
           s.user_id AS "userId",
           u.email AS "userEmail",
           s.stack_amount AS "stackAmount",
           s.committed_amount AS "committedAmount",
           s.total_committed_amount AS "totalCommittedAmount",
           s.status,
           s.presence_heartbeat_at AS "presenceHeartbeatAt",
           s.disconnect_grace_expires_at AS "disconnectGraceExpiresAt",
           s.seat_lease_expires_at AS "seatLeaseExpiresAt",
           s.auto_cash_out_pending AS "autoCashOutPending",
           s.turn_deadline_at AS "turnDeadlineAt",
           s.hole_cards AS "holeCards",
           s.last_action AS "lastAction",
           s.metadata,
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
    FROM ${holdemTableSeats} s
    JOIN ${users} u ON u.id = s.user_id
    ${whereClause}
    ORDER BY s.seat_index ASC
    ${lockClause}
  `);

  return parseSqlRows(
    HoldemSeatRowsSchema,
    result,
    "Invalid holdem seat row.",
  );
};

const loadTableMessageRows = async (
  executor: DbExecutor,
  params: {
    tableId: number;
    limit?: number;
  },
) => {
  const result = await executor
    .select({
      id: holdemTableMessages.id,
      tableId: holdemTableMessages.tableId,
      userId: holdemTableMessages.userId,
      seatIndex: holdemTableMessages.seatIndex,
      userEmail: users.email,
      kind: holdemTableMessages.kind,
      text: holdemTableMessages.text,
      emoji: holdemTableMessages.emoji,
      createdAt: holdemTableMessages.createdAt,
    })
    .from(holdemTableMessages)
    .innerJoin(users, eq(users.id, holdemTableMessages.userId))
    .where(eq(holdemTableMessages.tableId, params.tableId))
    .orderBy(
      desc(holdemTableMessages.createdAt),
      desc(holdemTableMessages.id),
    )
    .limit(Math.max(1, params.limit ?? HOLDEM_TABLE_MESSAGE_LIMIT));

  return HoldemTableMessageRowsSchema.parse(result).reverse();
};

const loadTableState = async (
  executor: DbExecutor,
  tableId: number,
  options?: { lock?: boolean },
) => {
  const [tableRow] = await loadTableRows(executor, {
    tableId,
    lock: options?.lock,
  });
  if (!tableRow) {
    return null;
  }
  const seatRows = await loadSeatRows(executor, {
    tableId,
    lock: options?.lock,
  });
  return toTableState(tableRow, seatRows);
};

const findUserSeat = async (executor: DbExecutor, userId: number) => {
  const [seat] = await loadSeatRows(executor, { userId });
  return seat ?? null;
};

const persistTableState = async (tx: DbTransaction, state: HoldemTableState) => {
  const now = new Date();
  syncHoldemTurnDeadlines(state, now);
  state.updatedAt = now;

  await tx.execute(sql`
    UPDATE ${holdemTables}
    SET status = ${state.status},
        metadata = ${toJsonbLiteral(state.metadata)},
        updated_at = ${now}
    WHERE id = ${state.id}
  `);

  for (const seat of state.seats) {
    seat.updatedAt = now;
    await tx.execute(sql`
      UPDATE ${holdemTableSeats}
      SET stack_amount = ${toMoneyString(seat.stackAmount)},
          committed_amount = ${toMoneyString(seat.committedAmount)},
          total_committed_amount = ${toMoneyString(seat.totalCommittedAmount)},
          status = ${seat.status},
          presence_heartbeat_at = ${
            seat.presenceHeartbeatAt ? new Date(seat.presenceHeartbeatAt) : null
          },
          disconnect_grace_expires_at = ${
            seat.disconnectGraceExpiresAt
              ? new Date(seat.disconnectGraceExpiresAt)
              : null
          },
          seat_lease_expires_at = ${
            seat.seatLeaseExpiresAt ? new Date(seat.seatLeaseExpiresAt) : null
          },
          auto_cash_out_pending = ${seat.autoCashOutPending},
          turn_deadline_at = ${
            seat.turnDeadlineAt ? new Date(seat.turnDeadlineAt) : null
          },
          hole_cards = ${toJsonbLiteral(seat.holeCards)},
          last_action = ${seat.lastAction ?? null},
          metadata = ${toJsonbLiteral(seat.metadata)},
          updated_at = ${now}
      WHERE id = ${seat.id}
    `);
  }
};

const applyBuyInToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  const { tx, wallet, amount, tableId, tableName, seatIndex } = params;
  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  if (withdrawableBefore.lt(amount)) {
    throw conflictError("Insufficient withdrawable balance.");
  }
  const withdrawableAfter = withdrawableBefore.minus(amount);
  const lockedAfter = lockedBefore.plus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_buy_in",
    amount: toMoneyString(amount.negated()),
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType: "withdrawable",
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
    },
  });
};

const applyCashOutToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  const { tx, wallet, amount, tableId, tableName, seatIndex } = params;
  if (amount.lte(0)) {
    return;
  }
  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  if (lockedBefore.lt(amount)) {
    throw conflictError("Locked balance is lower than the table stack.");
  }
  const withdrawableAfter = withdrawableBefore.plus(amount);
  const lockedAfter = lockedBefore.minus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_cash_out",
    amount: toMoneyString(amount),
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType: "withdrawable",
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
    },
  });
};

const removeSeatAndCashOut = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  seatUserId: number;
  lockedWallets: Map<number, LockedWalletRow>;
}) => {
  const seat = params.state.seats.find((entry) => entry.userId === params.seatUserId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem table.");
  }

  const wallet = params.lockedWallets.get(seat.userId);
  if (!wallet) {
    throw notFoundError("Wallet not found.");
  }

  const stackAmount = toDecimal(seat.stackAmount);
  await params.tx.delete(holdemTableSeats).where(eq(holdemTableSeats.id, seat.id));
  await applyCashOutToWallet({
    tx: params.tx,
    wallet,
    amount: stackAmount,
    tableId: params.state.id,
    tableName: params.state.name,
    seatIndex: seat.seatIndex,
  });

  params.state.seats = params.state.seats.filter((entry) => entry.id !== seat.id);
  clearTableAfterCashout(params.state);
  if (params.state.status === "waiting") {
    params.state.metadata.activeHandHistoryId = null;
  }

  return {
    seat,
    stackAmount,
  };
};

const settlePendingSeatCashOuts = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  lockedWallets: Map<number, LockedWalletRow>;
}) => {
  const autoCashOuts: Array<{
    seatIndex: number;
    userId: number;
    cashOutAmount: string;
  }> = [];

  for (const seat of [...params.state.seats]) {
    if (!seat.autoCashOutPending || !canUserLeaveTable(params.state, seat.userId)) {
      continue;
    }

    const { seat: removedSeat, stackAmount } = await removeSeatAndCashOut({
      tx: params.tx,
      state: params.state,
      seatUserId: seat.userId,
      lockedWallets: params.lockedWallets,
    });
    autoCashOuts.push({
      seatIndex: removedSeat.seatIndex,
      userId: removedSeat.userId,
      cashOutAmount: toMoneyString(stackAmount),
    });
  }

  return autoCashOuts;
};

const syncSettledLockedBalances = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  grossSettledState?: HoldemTableState | null;
  appliedRake?: HoldemAppliedRake | null;
  lockedWallets: Map<number, LockedWalletRow>;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
  handHistoryId?: number | null;
}) => {
  const {
    tx,
    state,
    grossSettledState,
    appliedRake,
    lockedWallets,
    previousStacks,
    handHistoryId,
  } = params;
  const roundId = handHistoryId ? buildHoldemRoundId(handHistoryId) : null;
  const rakeBySeatIndex = new Map(
    (appliedRake?.seatRakeAmounts ?? []).map((entry) => [
      entry.seatIndex,
      toDecimal(entry.amount),
    ] as const),
  );
  for (const seat of state.seats) {
    const previousStack = previousStacks.get(seat.userId) ?? toDecimal(0);
    const grossSeat =
      grossSettledState?.seats.find((entry) => entry.seatIndex === seat.seatIndex) ?? seat;
    const grossDelta = toDecimal(grossSeat.stackAmount).minus(previousStack);
    const rakeAmount = rakeBySeatIndex.get(seat.seatIndex) ?? toDecimal(0);
    const nextStack = toDecimal(seat.stackAmount);
    const netDelta = nextStack.minus(previousStack);
    if (netDelta.eq(0) && rakeAmount.eq(0) && grossDelta.eq(0)) {
      continue;
    }

    const wallet = lockedWallets.get(seat.userId);
    if (!wallet) {
      throw notFoundError("Wallet not found for seated holdem user.");
    }
    let lockedBefore = toDecimal(wallet.lockedBalance);

    if (grossDelta.eq(0) === false) {
      const lockedAfterGross = lockedBefore.plus(grossDelta);
      if (lockedAfterGross.lt(0)) {
        throw conflictError(
          "Locked balance drifted below zero during holdem settlement.",
        );
      }

      await tx
        .update(userWallets)
        .set({
          lockedBalance: toMoneyString(lockedAfterGross),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, seat.userId));

      await tx.insert(ledgerEntries).values({
        userId: seat.userId,
        entryType: "holdem_hand_result",
        amount: toMoneyString(grossDelta),
        balanceBefore: toMoneyString(lockedBefore),
        balanceAfter: toMoneyString(lockedAfterGross),
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: state.id,
        metadata: {
          balanceType: "locked",
          handNumber: state.metadata.handNumber,
          handHistoryId,
          roundId,
          tableName: state.name,
        },
      });

      lockedBefore = lockedAfterGross;
    }

    if (rakeAmount.gt(0)) {
      const lockedAfterRake = lockedBefore.minus(rakeAmount);
      if (lockedAfterRake.lt(0)) {
        throw conflictError("Locked balance drifted below zero after holdem rake.");
      }

      await tx
        .update(userWallets)
        .set({
          lockedBalance: toMoneyString(lockedAfterRake),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, seat.userId));

      await tx.insert(ledgerEntries).values({
        userId: seat.userId,
        entryType: "holdem_rake",
        amount: toMoneyString(rakeAmount.negated()),
        balanceBefore: toMoneyString(lockedBefore),
        balanceAfter: toMoneyString(lockedAfterRake),
        referenceType: HOLDEM_REFERENCE_TYPE,
        referenceId: state.id,
        metadata: {
          balanceType: "locked",
          handNumber: state.metadata.handNumber,
          handHistoryId,
          roundId,
          tableName: state.name,
        },
      });

      lockedBefore = lockedAfterRake;
    }

    wallet.lockedBalance = toMoneyString(lockedBefore);
  }

  if (
    appliedRake &&
    toDecimal(appliedRake.totalRakeAmount).gt(0)
  ) {
    await applyHouseBankrollDelta(tx, appliedRake.totalRakeAmount, {
      entryType: "holdem_rake",
      referenceType: HOLDEM_REFERENCE_TYPE,
      referenceId: state.id,
      metadata: {
        handNumber: state.metadata.handNumber,
        handHistoryId,
        roundId,
        tableName: state.name,
      },
    });
  }
};

const loadSerializedTable = async (
  executor: DbExecutor,
  userId: number,
  tableId: number,
): Promise<HoldemTableResponse> => {
  const state = await loadTableState(executor, tableId);
  if (!state) {
    throw notFoundError("Holdem table not found.");
  }
  return {
    table: serializeHoldemTable(state, userId),
  };
};

const loadSerializedTableMessages = async (
  executor: DbExecutor,
  tableId: number,
): Promise<HoldemTableMessagesResponse> => {
  const [tableRow] = await loadTableRows(executor, { tableId });
  if (!tableRow) {
    throw notFoundError("Holdem table not found.");
  }

  const rows = await loadTableMessageRows(executor, {
    tableId,
    limit: HOLDEM_TABLE_MESSAGE_LIMIT,
  });

  return {
    tableId,
    messages: rows.map((row) => toHoldemTableMessage(row)),
  };
};

export async function processExpiredHoldemTurnForTable(tableId: number) {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      return null;
    }

    const previousStacks = new Map(
      state.seats.map((seat) => [seat.userId, toDecimal(seat.stackAmount)] as const),
    );
    const beforeState = cloneTableState(state);
    const timeout = processExpiredHoldemTurn(state, new Date());
    if (!timeout) {
      return null;
    }

    const lockedWallets = await loadLockedWalletRows(
      tx,
      state.seats.map((seat) => seat.userId),
    );
    const actingUserId =
      beforeState.seats.find((seat) => seat.seatIndex === timeout.seatIndex)?.userId ??
      null;
    const fanout = await persistHoldemTransition({
      tx,
      beforeState,
      afterState: state,
      previousStacks,
      lockedWallets,
      action: timeout.action,
      actingUserId,
      timedOut: true,
      timeBankConsumedMs: timeout.timeBankConsumedMs,
    });
    return {
      timeout,
      fanout,
    };
  });

  if (result?.fanout) {
    publishHoldemRealtimeUpdate(result.fanout);
  }

  return result?.timeout ?? null;
}

export async function processExpiredHoldemPresenceForTable(tableId: number) {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      return null;
    }

    const now = new Date();
    const events: HoldemTableEventInput[] = [];
    let changed = false;

    for (const seat of state.seats) {
      if (
        seat.disconnectGraceExpiresAt &&
        new Date(seat.disconnectGraceExpiresAt).getTime() <= now.getTime()
      ) {
        seat.disconnectGraceExpiresAt = null;
        seat.metadata.sittingOut = true;
        seat.metadata.sitOutSource = "presence";
        changed = true;
        events.push({
          eventType: "seat_disconnected",
          actor: "system",
          userId: seat.userId,
          seatIndex: seat.seatIndex,
          payload: {
            tableName: state.name,
            handNumber: state.metadata.handNumber,
            seatLeaseExpiresAt: seat.seatLeaseExpiresAt,
          },
        });
      }

      if (
        seat.seatLeaseExpiresAt &&
        new Date(seat.seatLeaseExpiresAt).getTime() <= now.getTime()
      ) {
        seat.seatLeaseExpiresAt = null;
        seat.disconnectGraceExpiresAt = null;
        seat.metadata.sittingOut = true;
        seat.metadata.sitOutSource = "presence";
        seat.autoCashOutPending = true;
        changed = true;
        events.push({
          eventType: "seat_lease_expired",
          actor: "system",
          userId: seat.userId,
          seatIndex: seat.seatIndex,
          payload: {
            tableName: state.name,
            handNumber: state.metadata.handNumber,
          },
        });
      }
    }

    if (
      !changed &&
      !state.seats.some(
        (seat) =>
          seat.autoCashOutPending && canUserLeaveTable(state, seat.userId),
      )
    ) {
      return null;
    }

    const lockedWallets = await loadLockedWalletRows(
      tx,
      state.seats.map((seat) => seat.userId),
    );
    const autoCashOuts = await settlePendingSeatCashOuts({
      tx,
      state,
      lockedWallets,
    });

    if (autoCashOuts.length > 0) {
      changed = true;
      events.push(
        ...autoCashOuts.map((entry) => ({
          eventType: "seat_auto_cashed_out" as const,
          actor: "system" as const,
          userId: entry.userId,
          seatIndex: entry.seatIndex,
          payload: {
            tableName: state.name,
            cashOutAmount: entry.cashOutAmount,
            remainingSeatCount: state.seats.length,
          },
        })),
      );
    }

    if (!changed) {
      return null;
    }

    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events,
    });
    await persistTableState(tx, state);

    return {
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: persistedTableEvents,
      }),
      processed: events.length,
    };
  });

  if (result?.fanout) {
    publishHoldemRealtimeUpdate(result.fanout);
  }

  return result?.processed ?? 0;
}

export async function runHoldemTimeoutCycle() {
  const turnCandidates = await db
    .select({
      tableId: holdemTableSeats.tableId,
    })
    .from(holdemTableSeats)
    .where(
      and(
        eq(holdemTableSeats.status, "active"),
        isNotNull(holdemTableSeats.turnDeadlineAt),
        lte(holdemTableSeats.turnDeadlineAt, new Date()),
      ),
    )
    .orderBy(asc(holdemTableSeats.turnDeadlineAt))
    .limit(holdemTurnConfig.holdemTimeoutWorkerBatchSize);
  const presenceCandidates = await db
    .select({
      tableId: holdemTableSeats.tableId,
    })
    .from(holdemTableSeats)
    .where(
      or(
        and(
          isNotNull(holdemTableSeats.disconnectGraceExpiresAt),
          lte(holdemTableSeats.disconnectGraceExpiresAt, new Date()),
        ),
        and(
          isNotNull(holdemTableSeats.seatLeaseExpiresAt),
          lte(holdemTableSeats.seatLeaseExpiresAt, new Date()),
        ),
        eq(holdemTableSeats.autoCashOutPending, true),
      ),
    )
    .orderBy(asc(holdemTableSeats.seatLeaseExpiresAt))
    .limit(holdemTurnConfig.holdemTimeoutWorkerBatchSize);

  const processedTableIds = new Set<number>();
  let timedOut = 0;
  let presenceUpdated = 0;

  for (const candidate of [...turnCandidates, ...presenceCandidates]) {
    if (processedTableIds.has(candidate.tableId)) {
      continue;
    }
    processedTableIds.add(candidate.tableId);
    const timeout = await processExpiredHoldemTurnForTable(candidate.tableId);
    if (timeout) {
      timedOut += 1;
    }
    const processedPresence = await processExpiredHoldemPresenceForTable(
      candidate.tableId,
    );
    if (processedPresence > 0) {
      presenceUpdated += processedPresence;
    }
  }

  return {
    scanned: processedTableIds.size,
    timedOut,
    presenceUpdated,
  };
}

export async function listHoldemTables(
  userId: number,
): Promise<HoldemTablesResponse> {
  const tableRows = await loadTableRows(db);
  const tables = [];
  let currentTableId: number | null = null;

  for (const tableRow of tableRows) {
    const seatRows = await loadSeatRows(db, { tableId: tableRow.id });
    const state = toTableState(tableRow, seatRows);
    if (state.seats.some((seat) => seat.userId === userId)) {
      currentTableId = state.id;
    }
    tables.push(serializeHoldemTableSummary(state, userId));
  }

  return {
    currentTableId,
    tables,
  };
}

export async function getHoldemTable(
  userId: number,
  tableId: number,
): Promise<HoldemTableResponse> {
  await processExpiredHoldemTurnForTable(tableId);
  await processExpiredHoldemPresenceForTable(tableId);
  return loadSerializedTable(db, userId, tableId);
}

export async function listHoldemTableMessages(
  userId: number,
  tableId: number,
): Promise<HoldemTableMessagesResponse> {
  void userId;
  await processExpiredHoldemPresenceForTable(tableId);
  return loadSerializedTableMessages(db, tableId);
}

export async function createHoldemTableMessage(
  userId: number,
  tableId: number,
  input: HoldemTableMessageRequest,
): Promise<HoldemTableMessage> {
  await processExpiredHoldemPresenceForTable(tableId);

  const message = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }

    const seat = state.seats.find((entry) => entry.userId === userId) ?? null;
    if (!seat) {
      throw conflictError("You must be seated to send table chat.");
    }

    const [created] = await tx
      .insert(holdemTableMessages)
      .values({
        tableId,
        userId,
        seatIndex: seat.seatIndex,
        kind: input.kind,
        text: input.kind === "chat" ? input.text?.trim() ?? null : null,
        emoji: input.kind === "emoji" ? input.emoji ?? null : null,
      })
      .returning({
        id: holdemTableMessages.id,
        tableId: holdemTableMessages.tableId,
        userId: holdemTableMessages.userId,
        seatIndex: holdemTableMessages.seatIndex,
        kind: holdemTableMessages.kind,
        text: holdemTableMessages.text,
        emoji: holdemTableMessages.emoji,
        createdAt: holdemTableMessages.createdAt,
      });

    if (!created) {
      throw conflictError("Failed to persist holdem table chat.");
    }

    return toHoldemTableMessage({
      ...created,
      userEmail: seat.userEmail ?? null,
    });
  });

  publishHoldemRealtimeTableMessage(message);
  return message;
}

export async function touchHoldemSeatPresence(
  userId: number,
  tableId: number,
): Promise<HoldemPresenceResponse> {
  await processExpiredHoldemPresenceForTable(tableId);

  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }

    const seatBefore =
      state.seats.find((seat) => seat.userId === userId) ?? null;
    if (!seatBefore) {
      throw conflictError("You are not seated at this holdem table.");
    }

    const previousConnectionState = resolveSeatPresenceState(seatBefore);
    const wasSittingOut = seatBefore.metadata.sittingOut;
    const wasPresenceSitOut = seatBefore.metadata.sitOutSource === "presence";
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const seat = applySeatPresenceTouch(state, userId, presencePolicy);
    if (!seat) {
      throw conflictError("You are not seated at this holdem table.");
    }

    const emitReconnectEvent =
      previousConnectionState !== "connected" || (wasSittingOut && wasPresenceSitOut);
    let tablePresenceEvents: PersistedHoldemTableEvent[] = [];

    if (emitReconnectEvent) {
      tablePresenceEvents = await appendTableEvents({
        tx,
        tableId: state.id,
        events: [
          {
            eventType: "seat_reconnected",
            actor: "system",
            userId,
            seatIndex: seat.seatIndex,
            payload: {
              tableName: state.name,
              handNumber: state.metadata.handNumber,
            },
          },
        ],
      });
    }

    await persistTableState(tx, state);

    return {
      response: buildPresenceResponse(state, userId),
      fanout:
        tablePresenceEvents.length > 0
          ? buildRealtimeUpdate({
              state,
              tableEvents: tablePresenceEvents,
            })
          : null,
    };
  });

  if (result.fanout) {
    publishHoldemRealtimeUpdate(result.fanout);
  }

  return result.response;
}

export async function setHoldemSeatMode(
  userId: number,
  tableId: number,
  params: { sittingOut: boolean },
): Promise<HoldemTableResponse> {
  await processExpiredHoldemPresenceForTable(tableId);

  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }

    const seat = state.seats.find((entry) => entry.userId === userId) ?? null;
    if (!seat) {
      throw conflictError("You are not seated at this holdem table.");
    }

    if (!params.sittingOut && toDecimal(seat.stackAmount).lte(0)) {
      throw conflictError("Buy in again before sitting back in.");
    }

    if (seat.metadata.sittingOut === params.sittingOut) {
      return {
        response: {
          table: serializeHoldemTable(state, userId),
        },
        fanout: null,
      };
    }

    if (params.sittingOut) {
      seat.metadata.sittingOut = true;
      seat.metadata.sitOutSource = "manual";
      seat.autoCashOutPending = false;
    } else {
      const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
      const refreshedSeat = applySeatPresenceTouch(state, userId, presencePolicy);
      if (!refreshedSeat) {
        throw conflictError("You are not seated at this holdem table.");
      }
      refreshedSeat.metadata.sittingOut = false;
      refreshedSeat.metadata.sitOutSource = null;
    }

    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events: [
        {
          eventType: params.sittingOut ? "seat_sitting_out" : "seat_sitting_in",
          actor: "player",
          userId,
          seatIndex: seat.seatIndex,
          payload: {
            tableName: state.name,
            handNumber: state.metadata.handNumber,
            status: state.status,
            effectiveNextHand:
              state.status === "active" && seat.status !== "waiting",
          },
        },
      ],
    });

    await persistTableState(tx, state);

    return {
      response: {
        table: serializeHoldemTable(state, userId),
      },
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: persistedTableEvents,
      }),
    };
  });

  if (result.fanout) {
    publishHoldemRealtimeUpdate(result.fanout);
  }

  return result.response;
}

export async function createHoldemTable(
  userId: number,
  params: { tableName?: string; buyInAmount: string },
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const existingSeat = await findUserSeat(tx, userId);
    if (existingSeat) {
      throw conflictError("Leave your current holdem table before opening another.");
    }

    const buyInAmount = parseAmount(params.buyInAmount, "buy-in");
    assertBuyInWithinRange(buyInAmount);
    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    const wallet = lockedWallets.get(userId);
    if (!wallet) {
      throw notFoundError("Wallet not found.");
    }
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const timeBankPolicy = await loadHoldemTimeBankPolicy(tx);
    const now = new Date();
    const disconnectGraceExpiresAt = new Date(
      now.getTime() + presencePolicy.disconnectGraceSeconds * 1_000,
    );
    const seatLeaseExpiresAt = new Date(
      now.getTime() + presencePolicy.seatLeaseSeconds * 1_000,
    );

    const [createdTable] = await tx
      .insert(holdemTables)
      .values({
        name: params.tableName?.trim() || defaultTableName(),
        status: "waiting",
        smallBlind: HOLDEM_CONFIG.smallBlind,
        bigBlind: HOLDEM_CONFIG.bigBlind,
        minimumBuyIn: HOLDEM_CONFIG.minimumBuyIn,
        maximumBuyIn: HOLDEM_CONFIG.maximumBuyIn,
        maxSeats: HOLDEM_CONFIG.maxSeats,
        metadata: null,
      })
      .returning();
    if (!createdTable) {
      throw conflictError("Failed to create holdem table.");
    }

    await applyBuyInToWallet({
      tx,
      wallet,
      amount: buyInAmount,
      tableId: createdTable.id,
      tableName: createdTable.name,
      seatIndex: 0,
    });

    await tx.insert(holdemTableSeats).values({
      tableId: createdTable.id,
      seatIndex: 0,
      userId,
      stackAmount: toMoneyString(buyInAmount),
      committedAmount: "0.00",
      totalCommittedAmount: "0.00",
      status: "waiting",
      presenceHeartbeatAt: now,
      disconnectGraceExpiresAt,
      seatLeaseExpiresAt,
      autoCashOutPending: false,
      holeCards: [],
      lastAction: null,
      metadata: {
        timeBankRemainingMs: timeBankPolicy.defaultTimeBankMs,
      },
    });

    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: createdTable.id,
      events: [
        {
          eventType: "table_created",
          actor: "player",
          userId,
          seatIndex: 0,
          payload: {
            tableName: createdTable.name,
            smallBlind: createdTable.smallBlind,
            bigBlind: createdTable.bigBlind,
            minimumBuyIn: createdTable.minimumBuyIn,
            maximumBuyIn: createdTable.maximumBuyIn,
            maxSeats: createdTable.maxSeats,
          },
        },
        {
          eventType: "seat_joined",
          actor: "player",
          userId,
          seatIndex: 0,
          payload: {
            tableName: createdTable.name,
            buyInAmount: toMoneyString(buyInAmount),
            stackAmount: toMoneyString(buyInAmount),
          },
        },
      ],
    });

    const response = await loadSerializedTable(tx, userId, createdTable.id);
    const state = await loadTableState(tx, createdTable.id);
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }

    return {
      response,
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: persistedTableEvents,
      }),
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  return result.response;
}

export async function joinHoldemTable(
  userId: number,
  tableId: number,
  params: { buyInAmount: string },
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const existingSeat = await findUserSeat(tx, userId);
    if (existingSeat) {
      throw conflictError("Leave your current holdem table before joining another.");
    }

    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }
    if (state.seats.length >= state.maxSeats) {
      throw conflictError("This holdem table is already full.");
    }

    const occupiedSeatIndexes = new Set(state.seats.map((seat) => seat.seatIndex));
    const seatIndex = Array.from({ length: state.maxSeats }, (_, index) => index).find(
      (index) => !occupiedSeatIndexes.has(index),
    );
    if (seatIndex === undefined) {
      throw conflictError("No open seats remain at this holdem table.");
    }

    const buyInAmount = parseAmount(params.buyInAmount, "buy-in");
    assertBuyInWithinRange(buyInAmount, state);
    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    const wallet = lockedWallets.get(userId);
    if (!wallet) {
      throw notFoundError("Wallet not found.");
    }
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const timeBankPolicy = await loadHoldemTimeBankPolicy(tx);
    const now = new Date();
    const disconnectGraceExpiresAt = new Date(
      now.getTime() + presencePolicy.disconnectGraceSeconds * 1_000,
    );
    const seatLeaseExpiresAt = new Date(
      now.getTime() + presencePolicy.seatLeaseSeconds * 1_000,
    );

    await applyBuyInToWallet({
      tx,
      wallet,
      amount: buyInAmount,
      tableId: state.id,
      tableName: state.name,
      seatIndex,
    });

    await tx.insert(holdemTableSeats).values({
      tableId: state.id,
      seatIndex,
      userId,
      stackAmount: toMoneyString(buyInAmount),
      committedAmount: "0.00",
      totalCommittedAmount: "0.00",
      status: "waiting",
      presenceHeartbeatAt: now,
      disconnectGraceExpiresAt,
      seatLeaseExpiresAt,
      autoCashOutPending: false,
      holeCards: [],
      lastAction: null,
      metadata: {
        timeBankRemainingMs: timeBankPolicy.defaultTimeBankMs,
      },
    });

    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events: [
        {
          eventType: "seat_joined",
          actor: "player",
          userId,
          seatIndex,
          payload: {
            tableName: state.name,
            buyInAmount: toMoneyString(buyInAmount),
            stackAmount: toMoneyString(buyInAmount),
            occupiedSeatCount: state.seats.length + 1,
          },
        },
      ],
    });

    const response = await loadSerializedTable(tx, userId, state.id);
    const nextState = await loadTableState(tx, state.id);
    if (!nextState) {
      throw notFoundError("Holdem table not found.");
    }

    return {
      response,
      fanout: buildRealtimeUpdate({
        state: nextState,
        tableEvents: persistedTableEvents,
      }),
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  return result.response;
}

export async function leaveHoldemTable(
  userId: number,
  tableId: number,
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }
    if (!canUserLeaveTable(state, userId)) {
      throw conflictError("Finish the active holdem hand before leaving the table.");
    }

    const seat = state.seats.find((entry) => entry.userId === userId) ?? null;
    if (!seat) {
      throw conflictError("You are not seated at this holdem table.");
    }

    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    const { stackAmount } = await removeSeatAndCashOut({
      tx,
      state,
      seatUserId: userId,
      lockedWallets,
    });
    await tx
      .update(holdemTables)
      .set({
        status: state.status,
        metadata: toJsonbLiteral(state.metadata),
        updatedAt: new Date(),
      })
      .where(eq(holdemTables.id, state.id));

    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events: [
        {
          eventType: "seat_left",
          actor: "player",
          userId,
          seatIndex: seat.seatIndex,
          payload: {
            tableName: state.name,
            cashOutAmount: toMoneyString(stackAmount),
            remainingSeatCount: state.seats.length,
          },
        },
      ],
    });

    return {
      response: {
        table: serializeHoldemTable(state, userId),
      },
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: persistedTableEvents,
      }),
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  return result.response;
}

export async function startHoldemTableHand(
  userId: number,
  tableId: number,
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }
    if (!state.seats.some((seat) => seat.userId === userId)) {
      throw conflictError("You must be seated to start a holdem hand.");
    }

    const previousStacks = new Map(
      state.seats.map((seat) => [seat.userId, toDecimal(seat.stackAmount)] as const),
    );
    const lockedWallets = await loadLockedWalletRows(
      tx,
      state.seats.map((seat) => seat.userId),
    );
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const timeBankPolicy = await loadHoldemTimeBankPolicy(tx);
    const fairnessSeed = await ensureFairnessSeed(tx);
    startHoldemHand(state, {
      fairnessSeed: {
        seed: fairnessSeed.seed,
        epoch: fairnessSeed.epoch,
        epochSeconds: fairnessSeed.epochSeconds,
        commitHash: fairnessSeed.commitHash,
      },
    });
    for (const seat of state.seats) {
      resetSeatTimeBank(seat, timeBankPolicy.defaultTimeBankMs);
    }
    syncHoldemTurnDeadlines(state);
    const handHistoryId = await createHoldemHandHistory({
      tx,
      state,
      startedByUserId: userId,
      stackBeforeByUserId: previousStacks,
    });
    await recordHandStartedEvents({
      tx,
      state,
      handHistoryId,
      historyUserId: userId,
    });
    applySeatPresenceTouch(state, userId, presencePolicy);
    const nextSeat = getPendingActorSeat(state);
    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events: [
        {
          eventType: "hand_started",
          actor: "system",
          handHistoryId,
          phase: state.metadata.stage,
          payload: {
            roundId: buildHoldemRoundId(handHistoryId),
            handNumber: state.metadata.handNumber,
            participantCount: state.seats.length,
          },
        },
        ...(nextSeat
          ? [
              {
                eventType: "turn_started",
                actor: "system" as const,
                userId: nextSeat.userId,
                seatIndex: nextSeat.seatIndex,
                handHistoryId,
                phase: state.metadata.stage,
                payload: {
                  roundId: buildHoldemRoundId(handHistoryId),
                  handNumber: state.metadata.handNumber,
                  stage: state.metadata.stage,
                  turnDeadlineAt: nextSeat.turnDeadlineAt,
                  turnTimeBankStartsAt: state.metadata.turnTimeBankStartsAt,
                  timeBankRemainingMs: nextSeat.metadata.timeBankRemainingMs,
                },
              },
            ]
          : []),
      ],
    });
    await syncSettledLockedBalances({
      tx,
      state,
      lockedWallets,
      previousStacks,
    });
    await persistTableState(tx, state);
    return {
      response: {
        table: serializeHoldemTable(state, userId),
      },
      collusionCapture: {
        tableId: state.id,
        handHistoryId,
        handNumber: state.metadata.handNumber,
        participantUserIds: listHoldemActiveParticipantUserIds(state),
      },
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: persistedTableEvents,
      }),
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  await recordHoldemCollusionSignals(result.collusionCapture);
  return result.response;
}

export async function actOnHoldem(
  userId: number,
  tableId: number,
  params: { action: HoldemAction; amount?: string },
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }

    const previousStacks = new Map(
      state.seats.map((seat) => [seat.userId, toDecimal(seat.stackAmount)] as const),
    );
    const lockedWallets = await loadLockedWalletRows(
      tx,
      state.seats.map((seat) => seat.userId),
    );
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const beforeState = cloneTableState(state);

    const timeout = processExpiredHoldemTurn(state, new Date());
    if (timeout) {
      const actingUserId =
        beforeState.seats.find((seat) => seat.seatIndex === timeout.seatIndex)
          ?.userId ?? null;
      const fanout = await persistHoldemTransition({
        tx,
        beforeState,
        afterState: state,
        previousStacks,
        lockedWallets,
        action: timeout.action,
        actingUserId,
        timedOut: true,
        timeBankConsumedMs: timeout.timeBankConsumedMs,
      });
      return {
        kind: "timeout" as const,
        fanout,
      };
    }

    const actingSeat = state.seats.find((seat) => seat.userId === userId) ?? null;
    const timeBank = actingSeat
      ? consumeHoldemTurnTimeBank(state, actingSeat.seatIndex, {
          now: new Date(),
        })
      : null;
    actOnHoldemTable(state, {
      userId,
      action: params.action,
      amount: params.amount,
    });
    applySeatPresenceTouch(state, userId, presencePolicy);

    const fanout = await persistHoldemTransition({
      tx,
      beforeState,
      afterState: state,
      previousStacks,
      lockedWallets,
      action: params.action,
      actingUserId: userId,
      timeBankConsumedMs: timeBank?.consumedMs ?? 0,
    });
    return {
      kind: "success" as const,
      response: {
        table: serializeHoldemTable(state, userId),
      },
      fanout,
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  if (result.kind === "timeout") {
    throw conflictError("Holdem turn timed out and the default action was applied.", {
      code: API_ERROR_CODES.HOLDEM_TURN_EXPIRED,
    });
  }

  return result.response;
}
