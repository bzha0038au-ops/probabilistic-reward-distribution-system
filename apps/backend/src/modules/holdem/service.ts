import Decimal from "decimal.js";
import { z } from "zod";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { DealerEvent } from "@reward/shared-types/dealer";
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
  buildHoldemRealtimeTableTopic,
  HOLDEM_CONFIG,
  HOLDEM_DEFAULT_CASUAL_MAX_SEATS,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  type HoldemAction,
  type HoldemCreateTableRequest,
  type HoldemTableMessage,
  type HoldemTableMessageRequest,
  type HoldemTableMessagesResponse,
  type HoldemPresenceResponse,
  type HoldemTableResponse,
  type HoldemTableType,
  type HoldemTablesResponse,
  type HoldemTournamentCreateConfig,
  type HoldemTournamentPayout,
  type HoldemTournamentStanding,
} from "@reward/shared-types/holdem";
import {
  PlayModeSnapshotSchema,
  type PlayModeOutcome,
} from "@reward/shared-types/play-mode";

import { db, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { getConfigView, type AppConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { ensureFairnessSeed } from "../fairness/service";
import { appendRoundEvents } from "../hand-history/service";
import { HOLDEM_ROUND_TYPE, buildRoundId } from "../hand-history/round-id";
import { applyHouseBankrollDelta, applyPrizePoolDelta } from "../house/service";
import {
  appendDealerFeedEvent,
  buildDealerEvent,
  maybeGenerateDealerLanguageEvent,
  publishDealerRealtimeToTopic,
} from "../dealer-bot/service";
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
  loadActivePlayModeSession,
  lockUserPlayModeState,
  resolveSettledPlayMode,
  saveUserPlayModeState,
  settlePlayModeSession,
} from "../play-mode/service";
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
  HoldemTableMetadataSchema,
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
  bonusBalance: z.union([z.string(), z.number()]),
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
const DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT = "1000.00";

type HoldemTurnConfig = AppConfig & {
  holdemTurnTimeoutMs: number;
  holdemTimeoutWorkerBatchSize: number;
};

type HoldemSeatPresencePolicy = {
  disconnectGraceSeconds: number;
  seatLeaseSeconds: number;
};

type HoldemTableFundingSource = "withdrawable" | "bonus";

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

const HoldemPlayModeSessionMetadataSchema = z.object({
  baseBuyInAmount: z.string().optional(),
  effectiveBuyInAmount: z.string().optional(),
  tableId: z.number().int().positive().optional(),
  tableName: z.string().optional(),
});

const resolveHoldemPlayModeOutcome = (
  cashOutAmount: ReturnType<typeof toDecimal>,
  effectiveBuyInAmount: ReturnType<typeof toDecimal>,
): PlayModeOutcome => {
  const comparison = cashOutAmount.cmp(effectiveBuyInAmount);
  if (comparison > 0) {
    return "win";
  }
  if (comparison < 0) {
    return "lose";
  }
  return "push";
};

const settleHoldemPlayModeSessionIfPresent = async (params: {
  tx: DbTransaction;
  userId: number;
  tableId: number;
  cashOutAmount: ReturnType<typeof toDecimal>;
}) => {
  const activeSession = await loadActivePlayModeSession(params.tx, {
    userId: params.userId,
    gameKey: "holdem",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
  });
  if (!activeSession) {
    return null;
  }

  const snapshotParsed = PlayModeSnapshotSchema.safeParse(activeSession.snapshot);
  const metadataParsed = HoldemPlayModeSessionMetadataSchema.safeParse(
    activeSession.metadata ?? {},
  );
  const effectiveBuyInRaw = metadataParsed.success
    ? metadataParsed.data.effectiveBuyInAmount
    : null;
  if (!snapshotParsed.success || !effectiveBuyInRaw) {
    return null;
  }

  const effectiveBuyInAmount = toDecimal(effectiveBuyInRaw);
  const outcome = resolveHoldemPlayModeOutcome(
    params.cashOutAmount,
    effectiveBuyInAmount,
  );
  const settledSnapshot = resolveSettledPlayMode({
    snapshot: snapshotParsed.data,
    outcome,
  });

  const storedPlayMode = await lockUserPlayModeState(params.tx, params.userId, "holdem");
  if (storedPlayMode) {
    await saveUserPlayModeState({
      tx: params.tx,
      rowId: storedPlayMode.id,
      snapshot: settledSnapshot,
    });
  }

  await settlePlayModeSession({
    tx: params.tx,
    sessionId: activeSession.id,
    snapshot: settledSnapshot,
    outcome,
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      ...(metadataParsed.success ? metadataParsed.data : {}),
      cashOutAmount: toMoneyString(params.cashOutAmount),
    },
  });

  return settledSnapshot;
};

type HoldemTournamentMetadata = NonNullable<
  HoldemTableState["metadata"]["tournament"]
>;
type HoldemSeatTournamentMetadata = NonNullable<
  HoldemTableState["seats"][number]["metadata"]["tournament"]
>;

const isTournamentTable = (state: Pick<HoldemTableState, "metadata">) =>
  state.metadata.tableType === "tournament";

const isCashTableType = (tableType: HoldemTableType) => tableType === "cash";

const isCasualTableType = (tableType: HoldemTableType) => tableType === "casual";

const ensureTournamentMetadata = (
  state: Pick<HoldemTableState, "metadata">,
): HoldemTournamentMetadata => {
  const tournament = state.metadata.tournament;
  if (!isTournamentTable(state) || !tournament) {
    throw conflictError("This holdem table is not a tournament.");
  }

  return tournament;
};

const resolveHoldemCreateTableType = (
  params: Pick<HoldemCreateTableRequest, "tableType">,
): HoldemTableType => params.tableType ?? "cash";

const resolveHoldemCreateMaxSeats = (
  params: Pick<HoldemCreateTableRequest, "tableType" | "maxSeats">,
) =>
  params.maxSeats ??
  (isCasualTableType(resolveHoldemCreateTableType(params))
    ? HOLDEM_DEFAULT_CASUAL_MAX_SEATS
    : HOLDEM_CONFIG.maxSeats);

const resolveHoldemFundingSource = (
  tableType: HoldemTableType,
): HoldemTableFundingSource =>
  isCasualTableType(tableType) ? "bonus" : "withdrawable";

const resolveTournamentStartingStackAmount = (
  config?: HoldemTournamentCreateConfig,
) =>
  toMoneyString(
    parseAmount(
      config?.startingStackAmount ?? DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT,
      "tournament starting stack",
    ),
  );

const resolveTournamentPayoutPlaces = (
  registeredCount: number,
  requestedPayoutPlaces?: number | null,
) => {
  const safeRegisteredCount = Math.max(0, registeredCount);
  if (safeRegisteredCount <= 1) {
    return 1;
  }

  const defaultPlaces =
    safeRegisteredCount <= 2 ? 1 : safeRegisteredCount <= 5 ? 2 : 3;
  const requested = requestedPayoutPlaces ?? defaultPlaces;
  return Math.max(1, Math.min(safeRegisteredCount, 3, requested));
};

const getTournamentPayoutRatios = (payoutPlaces: number) => {
  const safePayoutPlaces = Math.max(1, Math.min(3, Math.floor(payoutPlaces)));
  switch (safePayoutPlaces) {
    case 1:
      return [10_000];
    case 2:
      return [6_500, 3_500];
    default:
      return [5_000, 3_000, 2_000];
  }
};

const distributeTournamentPayouts = (
  prizePoolAmount: string,
  payoutPlaces: number,
) => {
  const total = toDecimal(prizePoolAmount);
  const basisPoints = getTournamentPayoutRatios(payoutPlaces);
  let remaining = total;

  return basisPoints.map((ratio, index) => {
    const amount =
      index === basisPoints.length - 1
        ? remaining
        : total
            .mul(ratio)
            .div(10_000)
            .toDecimalPlaces(2, Decimal.ROUND_DOWN);
    remaining = remaining.minus(amount);
    return toMoneyString(amount);
  });
};

const ensureSeatTournamentMetadata = (
  seat: HoldemTableState["seats"][number],
): HoldemSeatTournamentMetadata => {
  const tournament = seat.metadata.tournament;
  if (!tournament) {
    throw conflictError("Tournament seat metadata is missing.");
  }

  return tournament;
};

const upsertTournamentStanding = (
  tournament: HoldemTournamentMetadata,
  standing: HoldemTournamentStanding,
) => {
  const existingIndex = tournament.standings.findIndex(
    (entry) => entry.userId === standing.userId,
  );
  if (existingIndex >= 0) {
    tournament.standings[existingIndex] = standing;
    return;
  }

  tournament.standings.push(standing);
};

const buildTournamentStandingForSeat = (
  seat: HoldemTableState["seats"][number],
): HoldemTournamentStanding => {
  const tournamentSeat = ensureSeatTournamentMetadata(seat);
  return {
    userId: seat.userId,
    displayName: resolveSeatDisplayName(seat.userId, seat.userEmail),
    seatIndex: seat.seatIndex,
    stackAmount: toMoneyString(seat.stackAmount),
    active: toDecimal(seat.stackAmount).gt(0) && tournamentSeat.finishingPlace === null,
    finishingPlace: tournamentSeat.finishingPlace,
    eliminatedAt: tournamentSeat.eliminatedAt,
    prizeAmount: tournamentSeat.prizeAmount,
  };
};

const sortTournamentStandings = (standings: HoldemTournamentStanding[]) =>
  standings.sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.active && right.active) {
      const stackComparison = toDecimal(right.stackAmount).cmp(left.stackAmount);
      if (stackComparison !== 0) {
        return stackComparison;
      }
      return (left.seatIndex ?? 0) - (right.seatIndex ?? 0);
    }

    if (
      left.finishingPlace !== null &&
      right.finishingPlace !== null &&
      left.finishingPlace !== right.finishingPlace
    ) {
      return left.finishingPlace - right.finishingPlace;
    }

    return (left.seatIndex ?? 0) - (right.seatIndex ?? 0);
  });

const syncTournamentStandings = (state: HoldemTableState) => {
  if (!isTournamentTable(state)) {
    return;
  }

  const tournament = ensureTournamentMetadata(state);
  for (const seat of state.seats) {
    upsertTournamentStanding(tournament, buildTournamentStandingForSeat(seat));
  }
  sortTournamentStandings(tournament.standings);
  tournament.registeredCount = tournament.standings.length;
  tournament.prizePoolAmount = toMoneyString(
    toDecimal(tournament.buyInAmount).mul(tournament.registeredCount),
  );
  tournament.payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
};

const removeTournamentStanding = (
  state: HoldemTableState,
  userId: number,
) => {
  if (!isTournamentTable(state)) {
    return;
  }

  const tournament = ensureTournamentMetadata(state);
  tournament.standings = tournament.standings.filter(
    (entry) => entry.userId !== userId,
  );
  tournament.registeredCount = tournament.standings.length;
  tournament.prizePoolAmount = toMoneyString(
    toDecimal(tournament.buyInAmount).mul(tournament.registeredCount),
  );
  if (tournament.registeredCount <= 0) {
    tournament.payoutPlaces = null;
    return;
  }

  tournament.payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
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
type PersistedHoldemTableEvent = {
  eventType: string;
  actor: HoldemEventActor;
  userId: number | null;
  seatIndex: number | null;
  handHistoryId: number | null;
  phase: string | null;
  payload: Record<string, unknown>;
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
const buildHoldemTableRef = (tableId: number) => `holdem:${tableId}`;

const mapDealerEventToHoldemEventType = (event: DealerEvent) => {
  switch (event.kind) {
    case "action":
      return "dealer_action";
    case "message":
      return "dealer_message";
    case "pace_hint":
      return "dealer_pace_hint";
  }
};

const appendDealerEventsToHoldemState = (
  state: HoldemTableState,
  events: DealerEvent[],
) => {
  for (const event of events) {
    state.metadata.dealerEvents = appendDealerFeedEvent(
      state.metadata.dealerEvents,
      event,
    );
  }
};

const buildHoldemDealerEvent = (params: {
  state: HoldemTableState;
  handHistoryId: number;
  kind: DealerEvent["kind"];
  actionCode?: string | null;
  pace?: DealerEvent["pace"];
  phase?: string | null;
  seatIndex?: number | null;
  text: string;
  metadata?: Record<string, unknown> | null;
  source?: DealerEvent["source"];
}) =>
  buildDealerEvent({
    kind: params.kind,
    source: params.source ?? "rule",
    gameType: "holdem",
    tableId: params.state.id,
    tableRef: buildHoldemTableRef(params.state.id),
    roundId: buildHoldemRoundId(params.handHistoryId),
    referenceId: params.handHistoryId,
    phase: params.phase ?? params.state.metadata.stage,
    seatIndex: params.seatIndex ?? null,
    actionCode: params.actionCode ?? null,
    pace: params.pace ?? null,
    text: params.text,
    metadata: params.metadata ?? null,
  });

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

const resolveHoldemRakePolicySnapshot = async (
  executor: DbExecutor,
  state: HoldemTableState,
): Promise<HoldemRakePolicy | null> => {
  if (state.metadata.tableType !== "cash") {
    return null;
  }

  return state.metadata.rakePolicy ?? (await loadHoldemRakePolicy(executor));
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

const persistHoldemDealerEvents = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
  events: DealerEvent[];
}) => {
  if (params.events.length === 0) {
    return [] satisfies PersistedHoldemTableEvent[];
  }

  appendDealerEventsToHoldemState(params.state, params.events);
  await appendHoldemHandEvents({
    tx: params.tx,
    handHistoryId: params.handHistoryId,
    historyUserId: params.historyUserId,
    tableId: params.state.id,
    phase: params.phase,
    events: params.events.map((event) => ({
      type: mapDealerEventToHoldemEventType(event),
      actor: "dealer" as const,
      payload: {
        dealerEvent: event,
      },
    })),
  });

  return appendTableEvents({
    tx: params.tx,
    tableId: params.state.id,
    events: params.events.map((event) => ({
      eventType: mapDealerEventToHoldemEventType(event),
      actor: "dealer" as const,
      handHistoryId: params.handHistoryId,
      phase: params.phase,
      seatIndex: event.seatIndex ?? null,
      payload: {
        dealerEvent: event,
      },
    })),
  });
};

const emitAsyncHoldemDealerLanguageEvent = (params: {
  tableId: number;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
  scenario: string;
  summary: Record<string, unknown>;
  seatIndex?: number | null;
}) => {
  void (async () => {
    const event = await maybeGenerateDealerLanguageEvent({
      scenario: params.scenario,
      locale: "",
      gameType: "holdem",
      tableId: params.tableId,
      tableRef: buildHoldemTableRef(params.tableId),
      roundId: buildHoldemRoundId(params.handHistoryId),
      referenceId: params.handHistoryId,
      phase: params.phase,
      seatIndex: params.seatIndex ?? null,
      summary: params.summary,
    });
    if (!event) {
      return;
    }

    const persisted = await db.transaction(async (tx) => {
      const state = await loadTableState(tx, params.tableId, { lock: true });
      if (!state) {
        return null;
      }

      await persistHoldemDealerEvents({
        tx,
        state,
        handHistoryId: params.handHistoryId,
        historyUserId: params.historyUserId,
        phase: params.phase,
        events: [event],
      });
      await persistTableState(tx, state);
      return event;
    });

    if (persisted) {
      publishDealerRealtimeToTopic(
        buildHoldemRealtimeTableTopic(params.tableId),
        persisted,
      );
    }
  })().catch((error) => {
    logger.warning("holdem dealer bot async emission failed", {
      err: error,
      tableId: params.tableId,
      handHistoryId: params.handHistoryId,
      scenario: params.scenario,
    });
  });
};

const buildHoldemTransitionDealerEvents = (params: {
  beforeState: HoldemTableState;
  afterState: HoldemTableState;
  handHistoryId: number;
}) => {
  const events: DealerEvent[] = [];
  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;

  if (
    params.afterState.metadata.stage !== null &&
    afterBoardCount > beforeBoardCount
  ) {
    const newCards = params.afterState.metadata.communityCards
      .slice(beforeBoardCount)
      .map((card) => `${card.rank}${card.suit[0]?.toUpperCase() ?? ""}`);
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "board_revealed",
        text: `Dealer reveals ${newCards.join(" ")} on the ${params.afterState.metadata.stage}.`,
        metadata: {
          boardCards: params.afterState.metadata.communityCards,
        },
      }),
    );
  }

  if (isSettledHoldemState(params.afterState)) {
    events.push(
      buildHoldemDealerEvent({
        state: params.afterState,
        handHistoryId: params.handHistoryId,
        kind: "action",
        actionCode: "hand_settled",
        text: `Pot awarded to seat${params.afterState.metadata.winnerSeatIndexes.length === 1 ? "" : "s"} ${params.afterState.metadata.winnerSeatIndexes
          .map((seatIndex) => `#${seatIndex + 1}`)
          .join(", ")}.`,
        metadata: {
          winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
        },
      }),
    );
  } else {
    const nextSeat = getPendingActorSeat(params.afterState);
    if (nextSeat) {
      events.push(
        buildHoldemDealerEvent({
          state: params.afterState,
          handHistoryId: params.handHistoryId,
          kind: "pace_hint",
          actionCode: "prompt_next_actor",
          pace: "normal",
          seatIndex: nextSeat.seatIndex,
          text: `Action is on seat #${nextSeat.seatIndex + 1}.`,
          metadata: {
            turnDeadlineAt: nextSeat.turnDeadlineAt,
          },
        }),
      );
    }
  }

  return events;
};

const publishHoldemDealerTransition = (
  tableId: number,
  transition: {
    dealerEvents: DealerEvent[];
    dealerLanguageTask:
      | {
          scenario: string;
          summary: Record<string, unknown>;
        }
      | null;
    fanout: HoldemRealtimeFanout;
    handHistoryId: number;
    historyUserId: number;
    phase: string | null;
  },
) => {
  publishHoldemRealtimeUpdate(transition.fanout);
  for (const dealerEvent of transition.dealerEvents) {
    publishDealerRealtimeToTopic(
      buildHoldemRealtimeTableTopic(tableId),
      dealerEvent,
    );
  }

  if (!transition.dealerLanguageTask) {
    return;
  }

  emitAsyncHoldemDealerLanguageEvent({
    tableId,
    handHistoryId: transition.handHistoryId,
    historyUserId: transition.historyUserId,
    phase: transition.phase,
    scenario: transition.dealerLanguageTask.scenario,
    summary: transition.dealerLanguageTask.summary,
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
  const appliedRakePolicy = isSettledHoldemState(params.afterState)
    ? await resolveHoldemRakePolicySnapshot(params.tx, params.afterState)
    : null;
  const appliedRake = appliedRakePolicy
    ? applyRakeToSettledState(params.afterState, appliedRakePolicy)
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
  let persistedTableEvents: PersistedHoldemTableEvent[] =
    await recordTableTransitionEvents({
    tx: params.tx,
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
    action: params.action,
    actingUserId: params.actingUserId,
    timedOut: params.timedOut,
    timeBankConsumedMs: params.timeBankConsumedMs,
  });
  const dealerRuleEvents = buildHoldemTransitionDealerEvents({
    beforeState: params.beforeState,
    afterState: params.afterState,
    handHistoryId,
  });
  const dealerTableEvents = await persistHoldemDealerEvents({
    tx: params.tx,
    state: params.afterState,
    handHistoryId,
    historyUserId,
    phase: params.afterState.metadata.stage,
    events: dealerRuleEvents,
  });
  persistedTableEvents = [...persistedTableEvents, ...dealerTableEvents];

  if (!isTournamentTable(params.afterState)) {
    await syncSettledLockedBalances({
      tx: params.tx,
      state: params.afterState,
      grossSettledState,
      appliedRake,
      lockedWallets: params.lockedWallets,
      previousStacks: params.previousStacks,
      handHistoryId,
    });
  }
  if (isSettledHoldemState(params.afterState) && isTournamentTable(params.afterState)) {
    const tournamentEvents = await settleTournamentAfterHand({
      tx: params.tx,
      state: params.afterState,
      wallets: params.lockedWallets,
      previousStacks: params.previousStacks,
    });
    persistedTableEvents = [...persistedTableEvents, ...tournamentEvents];
  }
  const autoCashOuts = isTournamentTable(params.afterState)
    ? []
    : await settlePendingSeatCashOuts({
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

  const beforeBoardCount = params.beforeState.metadata.communityCards.length;
  const afterBoardCount = params.afterState.metadata.communityCards.length;
  const dealerLanguageTask =
    afterBoardCount > beforeBoardCount
      ? {
          scenario: "holdem_board_revealed",
          summary: {
            handNumber: params.afterState.metadata.handNumber,
            stage: params.afterState.metadata.stage,
            newBoardCards: params.afterState.metadata.communityCards.slice(
              beforeBoardCount,
            ),
            boardCards: params.afterState.metadata.communityCards,
          },
        }
      : isSettledHoldemState(params.afterState)
        ? {
            scenario: "holdem_hand_settled",
            summary: {
              handNumber: params.afterState.metadata.handNumber,
              winnerSeatIndexes: params.afterState.metadata.winnerSeatIndexes,
              boardCards: params.afterState.metadata.communityCards,
            },
          }
        : null;

  return {
    dealerEvents: dealerRuleEvents,
    dealerLanguageTask,
    fanout: buildRealtimeUpdate({
      state: params.afterState,
      tableEvents: persistedTableEvents,
      action: params.action,
      timedOut: params.timedOut,
    }),
    handHistoryId,
    historyUserId,
    phase: params.afterState.metadata.stage,
  };
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
           bonus_balance AS "bonusBalance",
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
  const nowIso = now.toISOString();
  syncHoldemTurnDeadlines(state, now);
  state.updatedAt = now;

  await tx.execute(sql`
    UPDATE ${holdemTables}
    SET status = ${state.status},
        metadata = ${toJsonbLiteral(state.metadata)},
        updated_at = ${nowIso}
    WHERE id = ${state.id}
  `);

  for (const seat of state.seats) {
    seat.updatedAt = now;
    const presenceHeartbeatAt = seat.presenceHeartbeatAt
      ? new Date(seat.presenceHeartbeatAt).toISOString()
      : null;
    const disconnectGraceExpiresAt = seat.disconnectGraceExpiresAt
      ? new Date(seat.disconnectGraceExpiresAt).toISOString()
      : null;
    const seatLeaseExpiresAt = seat.seatLeaseExpiresAt
      ? new Date(seat.seatLeaseExpiresAt).toISOString()
      : null;
    const turnDeadlineAt = seat.turnDeadlineAt
      ? new Date(seat.turnDeadlineAt).toISOString()
      : null;
    await tx.execute(sql`
      UPDATE ${holdemTableSeats}
      SET stack_amount = ${toMoneyString(seat.stackAmount)},
          committed_amount = ${toMoneyString(seat.committedAmount)},
          total_committed_amount = ${toMoneyString(seat.totalCommittedAmount)},
          status = ${seat.status},
          presence_heartbeat_at = ${presenceHeartbeatAt},
          disconnect_grace_expires_at = ${disconnectGraceExpiresAt},
          seat_lease_expires_at = ${seatLeaseExpiresAt},
          auto_cash_out_pending = ${seat.autoCashOutPending},
          turn_deadline_at = ${turnDeadlineAt},
          hole_cards = ${toJsonbLiteral(seat.holeCards)},
          last_action = ${seat.lastAction ?? null},
          metadata = ${toJsonbLiteral(seat.metadata)},
          updated_at = ${nowIso}
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
  tableType: HoldemTableType;
  balanceType: HoldemTableFundingSource;
}) => {
  const {
    tx,
    wallet,
    amount,
    tableId,
    tableName,
    seatIndex,
    tableType,
    balanceType,
  } = params;
  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const bonusBefore = toDecimal(wallet.bonusBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  const sourceBefore =
    balanceType === "bonus" ? bonusBefore : withdrawableBefore;
  if (sourceBefore.lt(amount)) {
    throw conflictError(
      balanceType === "bonus"
        ? "Insufficient bonus balance."
        : "Insufficient withdrawable balance.",
    );
  }
  const withdrawableAfter =
    balanceType === "withdrawable"
      ? withdrawableBefore.minus(amount)
      : withdrawableBefore;
  const bonusAfter =
    balanceType === "bonus" ? bonusBefore.minus(amount) : bonusBefore;
  const lockedAfter = lockedBefore.plus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      bonusBalance: toMoneyString(bonusAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_buy_in",
    amount: toMoneyString(amount.negated()),
    balanceBefore: toMoneyString(sourceBefore),
    balanceAfter: toMoneyString(
      balanceType === "bonus" ? bonusAfter : withdrawableAfter,
    ),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType,
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
      tableType,
    },
  });

  wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
  wallet.bonusBalance = toMoneyString(bonusAfter);
  wallet.lockedBalance = toMoneyString(lockedAfter);
};

const applyTournamentWithdrawableDelta = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  delta: ReturnType<typeof toDecimal>;
  entryType:
    | "holdem_tournament_buy_in"
    | "holdem_tournament_refund"
    | "holdem_tournament_payout";
  tableId: number;
  tableName: string;
  seatIndex: number | null;
  metadata?: Record<string, unknown>;
}) => {
  const withdrawableBefore = toDecimal(params.wallet.withdrawableBalance);
  const withdrawableAfter = withdrawableBefore.plus(params.delta);
  if (withdrawableAfter.lt(0)) {
    throw conflictError("Insufficient withdrawable balance.");
  }

  await params.tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, params.wallet.userId));

  await params.tx.insert(ledgerEntries).values({
    userId: params.wallet.userId,
    entryType: params.entryType,
    amount: toMoneyString(params.delta),
    balanceBefore: toMoneyString(withdrawableBefore),
    balanceAfter: toMoneyString(withdrawableAfter),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      balanceType: "withdrawable",
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      ...(params.metadata ?? {}),
    },
  });

  params.wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
};

const applyTournamentRefundToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount,
    entryType: "holdem_tournament_refund",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
  });
  await applyPrizePoolDelta(params.tx, params.amount.negated(), {
    entryType: "holdem_tournament_pool_refund",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
    },
  });
};

const applyTournamentBuyInToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number;
}) => {
  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount.negated(),
    entryType: "holdem_tournament_buy_in",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
  });
  await applyPrizePoolDelta(params.tx, params.amount, {
    entryType: "holdem_tournament_pool_buy_in",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
    },
  });
};

const applyTournamentPayoutToWallet = async (params: {
  tx: DbTransaction;
  wallet: LockedWalletRow;
  amount: ReturnType<typeof toDecimal>;
  tableId: number;
  tableName: string;
  seatIndex: number | null;
  place: number;
}) => {
  if (params.amount.lte(0)) {
    return;
  }

  await applyTournamentWithdrawableDelta({
    tx: params.tx,
    wallet: params.wallet,
    delta: params.amount,
    entryType: "holdem_tournament_payout",
    tableId: params.tableId,
    tableName: params.tableName,
    seatIndex: params.seatIndex,
    metadata: {
      place: params.place,
    },
  });
  await applyPrizePoolDelta(params.tx, params.amount.negated(), {
    entryType: "holdem_tournament_pool_payout",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      tableName: params.tableName,
      seatIndex: params.seatIndex,
      tableType: "tournament",
      place: params.place,
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
  tableType: HoldemTableType;
  balanceType: HoldemTableFundingSource;
}) => {
  const {
    tx,
    wallet,
    amount,
    tableId,
    tableName,
    seatIndex,
    tableType,
    balanceType,
  } = params;
  if (amount.lte(0)) {
    return;
  }
  const withdrawableBefore = toDecimal(wallet.withdrawableBalance);
  const bonusBefore = toDecimal(wallet.bonusBalance);
  const lockedBefore = toDecimal(wallet.lockedBalance);
  if (lockedBefore.lt(amount)) {
    throw conflictError("Locked balance is lower than the table stack.");
  }
  const withdrawableAfter =
    balanceType === "withdrawable"
      ? withdrawableBefore.plus(amount)
      : withdrawableBefore;
  const bonusAfter =
    balanceType === "bonus" ? bonusBefore.plus(amount) : bonusBefore;
  const lockedAfter = lockedBefore.minus(amount);

  await tx
    .update(userWallets)
    .set({
      withdrawableBalance: toMoneyString(withdrawableAfter),
      bonusBalance: toMoneyString(bonusAfter),
      lockedBalance: toMoneyString(lockedAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, wallet.userId));

  await tx.insert(ledgerEntries).values({
    userId: wallet.userId,
    entryType: "holdem_cash_out",
    amount: toMoneyString(amount),
    balanceBefore: toMoneyString(
      balanceType === "bonus" ? bonusBefore : withdrawableBefore,
    ),
    balanceAfter: toMoneyString(
      balanceType === "bonus" ? bonusAfter : withdrawableAfter,
    ),
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: tableId,
    metadata: {
      balanceType,
      lockedBefore: toMoneyString(lockedBefore),
      lockedAfter: toMoneyString(lockedAfter),
      tableName,
      seatIndex,
      tableType,
    },
  });

  wallet.withdrawableBalance = toMoneyString(withdrawableAfter);
  wallet.bonusBalance = toMoneyString(bonusAfter);
  wallet.lockedBalance = toMoneyString(lockedAfter);
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
    tableType: params.state.metadata.tableType,
    balanceType: resolveHoldemFundingSource(params.state.metadata.tableType),
  });
  await settleHoldemPlayModeSessionIfPresent({
    tx: params.tx,
    userId: seat.userId,
    tableId: params.state.id,
    cashOutAmount: stackAmount,
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

const removeTournamentSeatAndRefund = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  seatUserId: number;
  wallets: Map<number, LockedWalletRow>;
}) => {
  ensureTournamentMetadata(params.state);
  const seat = params.state.seats.find((entry) => entry.userId === params.seatUserId) ?? null;
  if (!seat) {
    throw conflictError("You are not seated at this holdem tournament.");
  }

  const wallet = params.wallets.get(seat.userId);
  if (!wallet) {
    throw notFoundError("Wallet not found.");
  }

  const seatTournament = ensureSeatTournamentMetadata(seat);
  const refundAmount = toDecimal(seatTournament.entryBuyInAmount);

  await params.tx.delete(holdemTableSeats).where(eq(holdemTableSeats.id, seat.id));
  await applyTournamentRefundToWallet({
    tx: params.tx,
    wallet,
    amount: refundAmount,
    tableId: params.state.id,
    tableName: params.state.name,
    seatIndex: seat.seatIndex,
  });
  await settleHoldemPlayModeSessionIfPresent({
    tx: params.tx,
    userId: seat.userId,
    tableId: params.state.id,
    cashOutAmount: refundAmount,
  });

  params.state.seats = params.state.seats.filter((entry) => entry.id !== seat.id);
  removeTournamentStanding(params.state, seat.userId);

  return {
    seat,
    refundAmount,
  };
};

const buildTournamentPayoutPlan = (state: HoldemTableState) => {
  const tournament = ensureTournamentMetadata(state);
  const payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
  tournament.payoutPlaces = payoutPlaces;

  return distributeTournamentPayouts(
    tournament.prizePoolAmount,
    payoutPlaces,
  ).map((amount, index) => ({
    place: index + 1,
    amount,
  }));
};

const upsertTournamentPayout = (
  tournament: HoldemTournamentMetadata,
  payout: HoldemTournamentPayout,
) => {
  const existingIndex = tournament.payouts.findIndex(
    (entry) => entry.place === payout.place,
  );
  if (existingIndex >= 0) {
    tournament.payouts[existingIndex] = payout;
    return;
  }

  tournament.payouts.push(payout);
  tournament.payouts.sort((left, right) => left.place - right.place);
};

const findTournamentStandingByPlace = (
  tournament: HoldemTournamentMetadata,
  place: number,
) =>
  tournament.standings.find((entry) => entry.finishingPlace === place) ?? null;

const settleTournamentAfterHand = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  wallets: Map<number, LockedWalletRow>;
  previousStacks: Map<number, ReturnType<typeof toDecimal>>;
}) => {
  const tournament = ensureTournamentMetadata(params.state);
  const awardedAt = new Date();
  const bustedSeats = params.state.seats
    .filter((seat) => {
      const seatTournament = ensureSeatTournamentMetadata(seat);
      return (
        toDecimal(seat.stackAmount).lte(0) &&
        seatTournament.finishingPlace === null
      );
    })
    .sort((left, right) => {
      const leftPreviousStack = params.previousStacks.get(left.userId) ?? toDecimal(0);
      const rightPreviousStack =
        params.previousStacks.get(right.userId) ?? toDecimal(0);
      const stackComparison = leftPreviousStack.cmp(rightPreviousStack);
      if (stackComparison !== 0) {
        return stackComparison;
      }

      return left.seatIndex - right.seatIndex;
    });

  const activeSeats = params.state.seats.filter((seat) => {
    const seatTournament = ensureSeatTournamentMetadata(seat);
    return (
      toDecimal(seat.stackAmount).gt(0) &&
      seatTournament.finishingPlace === null
    );
  });

  if (bustedSeats.length === 0) {
    syncTournamentStandings(params.state);
    return [];
  }

  const tournamentEvents: HoldemTableEventInput[] = [];
  let finishingPlace = activeSeats.length + bustedSeats.length;
  for (const seat of bustedSeats) {
    const seatTournament = ensureSeatTournamentMetadata(seat);
    seatTournament.finishingPlace = finishingPlace;
    seatTournament.eliminatedAt = awardedAt;
    seatTournament.prizeAmount = null;
    upsertTournamentStanding(
      tournament,
      buildTournamentStandingForSeat(seat),
    );
    tournamentEvents.push({
      eventType: "tournament_player_eliminated",
      actor: "system",
      userId: seat.userId,
      seatIndex: seat.seatIndex,
      payload: {
        tableName: params.state.name,
        handNumber: params.state.metadata.handNumber,
        finishingPlace,
      },
    });
    finishingPlace -= 1;
  }

  if (activeSeats.length <= 1) {
    const championSeat = activeSeats[0] ?? null;
    if (!championSeat) {
      throw internalInvariantError(
        "Holdem tournament settled without an active champion seat.",
      );
    }

    const championTournament = ensureSeatTournamentMetadata(championSeat);
    championTournament.finishingPlace = 1;
    championTournament.prizeAmount = null;
    upsertTournamentStanding(
      tournament,
      buildTournamentStandingForSeat(championSeat),
    );

    const payoutPlan = buildTournamentPayoutPlan(params.state);
    const payoutRecipients = payoutPlan
      .map((entry) => {
        const standing = findTournamentStandingByPlace(tournament, entry.place);
        return standing
          ? {
              standing,
              place: entry.place,
              amount: entry.amount,
            }
          : null;
      })
      .filter(
        (
          entry,
        ): entry is {
          standing: HoldemTournamentStanding;
          place: number;
          amount: string;
        } => entry !== null,
      );
    const missingWalletUserIds = payoutRecipients
      .map((entry) => entry.standing.userId)
      .filter(
        (userId): userId is number =>
          userId !== null && Number.isInteger(userId) && !params.wallets.has(userId),
      );
    if (missingWalletUserIds.length > 0) {
      const additionalWallets = await loadLockedWalletRows(
        params.tx,
        missingWalletUserIds,
      );
      for (const [userId, wallet] of additionalWallets.entries()) {
        params.wallets.set(userId, wallet);
      }
    }

    tournament.payouts = [];
    for (const payoutRecipient of payoutRecipients) {
      payoutRecipient.standing.prizeAmount = payoutRecipient.amount;
      const currentSeat =
        params.state.seats.find(
          (seat) => seat.userId === payoutRecipient.standing.userId,
        ) ?? null;
      if (currentSeat) {
        const currentSeatTournament = ensureSeatTournamentMetadata(currentSeat);
        currentSeatTournament.prizeAmount = payoutRecipient.amount;
      }

      if (payoutRecipient.standing.userId !== null) {
        const wallet = params.wallets.get(payoutRecipient.standing.userId);
        if (!wallet) {
          throw notFoundError("Wallet not found.");
        }

        await applyTournamentPayoutToWallet({
          tx: params.tx,
          wallet,
          amount: toDecimal(payoutRecipient.amount),
          tableId: params.state.id,
          tableName: params.state.name,
          seatIndex: payoutRecipient.standing.seatIndex,
          place: payoutRecipient.place,
        });
      }

      upsertTournamentPayout(tournament, {
        place: payoutRecipient.place,
        userId: payoutRecipient.standing.userId,
        displayName: payoutRecipient.standing.displayName,
        amount: payoutRecipient.amount,
        awardedAt,
      });
      tournamentEvents.push({
        eventType: "tournament_payout_awarded",
        actor: "system",
        userId: payoutRecipient.standing.userId,
        seatIndex: payoutRecipient.standing.seatIndex,
        payload: {
          tableName: params.state.name,
          handNumber: params.state.metadata.handNumber,
          place: payoutRecipient.place,
          amount: payoutRecipient.amount,
        },
      });
    }

    for (const standing of tournament.standings) {
      if (standing.userId === null) {
        continue;
      }

      await settleHoldemPlayModeSessionIfPresent({
        tx: params.tx,
        userId: standing.userId,
        tableId: params.state.id,
        cashOutAmount: toDecimal(standing.prizeAmount ?? 0),
      });
    }

    for (const seat of [...params.state.seats]) {
      await params.tx
        .delete(holdemTableSeats)
        .where(eq(holdemTableSeats.id, seat.id));
    }
    params.state.seats = [];
    clearTableAfterCashout(params.state);
    tournament.status = "completed";
    tournament.completedAt = awardedAt;
    syncTournamentStandings(params.state);
    tournamentEvents.push({
      eventType: "tournament_completed",
      actor: "system",
      payload: {
        tableName: params.state.name,
        prizePoolAmount: tournament.prizePoolAmount,
        payoutPlaces: tournament.payoutPlaces,
      },
    });

    return appendTableEvents({
      tx: params.tx,
      tableId: params.state.id,
      events: tournamentEvents,
    });
  }

  for (const seat of bustedSeats) {
    await params.tx
      .delete(holdemTableSeats)
      .where(eq(holdemTableSeats.id, seat.id));
  }
  const bustedSeatIds = new Set(bustedSeats.map((seat) => seat.id));
  params.state.seats = params.state.seats.filter(
    (seat) => !bustedSeatIds.has(seat.id),
  );
  tournament.completedAt = null;
  syncTournamentStandings(params.state);

  return appendTableEvents({
    tx: params.tx,
    tableId: params.state.id,
    events: tournamentEvents,
  });
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
          tableType: state.metadata.tableType,
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
          tableType: state.metadata.tableType,
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
        tableType: state.metadata.tableType,
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
    const transition = await persistHoldemTransition({
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
      transition,
    };
  });

  if (result?.transition) {
    publishHoldemDealerTransition(tableId, result.transition);
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
    const shouldProcessAutoCashOuts = !isTournamentTable(state);
    const events: HoldemTableEventInput[] = [];
    let changed = false;

    for (const seat of state.seats) {
      if (!shouldProcessAutoCashOuts && seat.autoCashOutPending) {
        seat.autoCashOutPending = false;
        changed = true;
      }

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
        seat.autoCashOutPending = shouldProcessAutoCashOuts;
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
      (!shouldProcessAutoCashOuts ||
        !state.seats.some(
          (seat) =>
            seat.autoCashOutPending && canUserLeaveTable(state, seat.userId),
        ))
    ) {
      return null;
    }

    const lockedWallets = await loadLockedWalletRows(
      tx,
      state.seats.map((seat) => seat.userId),
    );
    const autoCashOuts = shouldProcessAutoCashOuts
      ? await settlePendingSeatCashOuts({
          tx,
          state,
          lockedWallets,
        })
      : [];

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

export async function getHoldemTableType(
  tableId: number,
): Promise<HoldemTableType | null> {
  const [tableRow] = await loadTableRows(db, { tableId });
  if (!tableRow) {
    return null;
  }

  return HoldemTableMetadataSchema.parse(tableRow.metadata ?? {}).tableType;
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
  params: Pick<
    HoldemCreateTableRequest,
    "tableName" | "buyInAmount" | "tableType" | "maxSeats" | "tournament"
  >,
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const existingSeat = await findUserSeat(tx, userId);
    if (existingSeat) {
      throw conflictError("Leave your current holdem table before opening another.");
    }

    const tableType = resolveHoldemCreateTableType(params);
    if (tableType !== "tournament" && params.tournament) {
      throw badRequestError("Tournament config requires a tournament table type.");
    }
    const maxSeats = resolveHoldemCreateMaxSeats(params);
    const buyInAmount = parseAmount(params.buyInAmount, "buy-in");
    const buyInAmountString = toMoneyString(buyInAmount);
    const tournamentStartingStackAmount =
      tableType === "tournament"
        ? resolveTournamentStartingStackAmount(params.tournament)
        : null;
    const tournamentMetadata =
      tableType === "tournament"
        ? {
            status: "registering" as const,
            buyInAmount: buyInAmountString,
            startingStackAmount: tournamentStartingStackAmount,
            prizePoolAmount: "0.00",
            registeredCount: 0,
            payoutPlaces: params.tournament?.payoutPlaces ?? null,
            allowRebuy: false,
            allowCashOut: false,
            completedAt: null,
            standings: [],
            payouts: [],
          }
        : null;
    const minimumBuyIn =
      tableType === "tournament" ? buyInAmountString : HOLDEM_CONFIG.minimumBuyIn;
    const maximumBuyIn =
      tableType === "tournament" ? buyInAmountString : HOLDEM_CONFIG.maximumBuyIn;
    assertBuyInWithinRange(buyInAmount, {
      minimumBuyIn,
      maximumBuyIn,
    });
    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    const wallet = lockedWallets.get(userId);
    if (!wallet) {
      throw notFoundError("Wallet not found.");
    }
    const rakePolicy = isCashTableType(tableType)
      ? await loadHoldemRakePolicy(tx)
      : null;
    const balanceType = resolveHoldemFundingSource(tableType);
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
        minimumBuyIn,
        maximumBuyIn,
        maxSeats,
        metadata: {
          tableType,
          rakePolicy,
          tournament: tournamentMetadata,
        },
      })
      .returning();
    if (!createdTable) {
      throw conflictError("Failed to create holdem table.");
    }

    if (tableType === "tournament") {
      await applyTournamentBuyInToWallet({
        tx,
        wallet,
        amount: buyInAmount,
        tableId: createdTable.id,
        tableName: createdTable.name,
        seatIndex: 0,
      });
    } else {
      await applyBuyInToWallet({
        tx,
        wallet,
        amount: buyInAmount,
        tableId: createdTable.id,
        tableName: createdTable.name,
        seatIndex: 0,
        tableType,
        balanceType,
      });
    }

    await tx.insert(holdemTableSeats).values({
      tableId: createdTable.id,
      seatIndex: 0,
      userId,
      stackAmount: tournamentStartingStackAmount ?? buyInAmountString,
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
        tournament:
          tableType === "tournament"
            ? {
                entryBuyInAmount: buyInAmountString,
                registeredAt: now,
                eliminatedAt: null,
                finishingPlace: null,
                prizeAmount: null,
              }
            : null,
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
            tableType,
            rakePolicy,
            smallBlind: createdTable.smallBlind,
            bigBlind: createdTable.bigBlind,
            minimumBuyIn: createdTable.minimumBuyIn,
            maximumBuyIn: createdTable.maximumBuyIn,
            maxSeats: createdTable.maxSeats,
            balanceType,
          },
        },
        {
          eventType: "seat_joined",
          actor: "player",
          userId,
          seatIndex: 0,
          payload: {
            tableName: createdTable.name,
            buyInAmount: buyInAmountString,
            stackAmount: tournamentStartingStackAmount ?? buyInAmountString,
          },
        },
      ],
    });

    const state = await loadTableState(tx, createdTable.id, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }
    if (isTournamentTable(state)) {
      syncTournamentStandings(state);
      await persistTableState(tx, state);
    }

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
    const tournament = isTournamentTable(state)
      ? ensureTournamentMetadata(state)
      : null;
    if (tournament && tournament.status !== "registering") {
      throw conflictError("Registration for this holdem tournament is closed.");
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
    const buyInAmountString = toMoneyString(buyInAmount);
    if (tournament && buyInAmountString !== tournament.buyInAmount) {
      throw conflictError("Tournament buy-in must match the table buy-in.");
    }
    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    const wallet = lockedWallets.get(userId);
    if (!wallet) {
      throw notFoundError("Wallet not found.");
    }
    const balanceType = resolveHoldemFundingSource(state.metadata.tableType);
    const presencePolicy = await loadHoldemSeatPresencePolicy(tx);
    const timeBankPolicy = await loadHoldemTimeBankPolicy(tx);
    const now = new Date();
    const disconnectGraceExpiresAt = new Date(
      now.getTime() + presencePolicy.disconnectGraceSeconds * 1_000,
    );
    const seatLeaseExpiresAt = new Date(
      now.getTime() + presencePolicy.seatLeaseSeconds * 1_000,
    );

    if (tournament) {
      await applyTournamentBuyInToWallet({
        tx,
        wallet,
        amount: buyInAmount,
        tableId: state.id,
        tableName: state.name,
        seatIndex,
      });
    } else {
      await applyBuyInToWallet({
        tx,
        wallet,
        amount: buyInAmount,
        tableId: state.id,
        tableName: state.name,
        seatIndex,
        tableType: state.metadata.tableType,
        balanceType,
      });
    }

    await tx.insert(holdemTableSeats).values({
      tableId: state.id,
      seatIndex,
      userId,
      stackAmount: tournament?.startingStackAmount ?? buyInAmountString,
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
        tournament:
          tournament
            ? {
                entryBuyInAmount: buyInAmountString,
                registeredAt: now,
                eliminatedAt: null,
                finishingPlace: null,
                prizeAmount: null,
              }
            : null,
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
            buyInAmount: buyInAmountString,
            stackAmount: tournament?.startingStackAmount ?? buyInAmountString,
            occupiedSeatCount: state.seats.length + 1,
            tableType: state.metadata.tableType,
            balanceType,
          },
        },
      ],
    });

    const nextState = await loadTableState(tx, state.id, { lock: true });
    if (!nextState) {
      throw notFoundError("Holdem table not found.");
    }
    if (isTournamentTable(nextState)) {
      syncTournamentStandings(nextState);
      await persistTableState(tx, nextState);
    }

    return {
      response: {
        table: serializeHoldemTable(nextState, userId),
      },
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

    const seat = state.seats.find((entry) => entry.userId === userId) ?? null;
    if (!seat) {
      throw conflictError("You are not seated at this holdem table.");
    }

    const lockedWallets = await loadLockedWalletRows(tx, [userId]);
    let exitAmount: string;
    if (isTournamentTable(state)) {
      const tournament = ensureTournamentMetadata(state);
      if (tournament.status !== "registering") {
        throw conflictError("You cannot leave a running holdem tournament.");
      }

      const { refundAmount } = await removeTournamentSeatAndRefund({
        tx,
        state,
        seatUserId: userId,
        wallets: lockedWallets,
      });
      exitAmount = toMoneyString(refundAmount);
      await persistTableState(tx, state);
    } else {
      if (!canUserLeaveTable(state, userId)) {
        throw conflictError("Finish the active holdem hand before leaving the table.");
      }

      const { stackAmount } = await removeSeatAndCashOut({
        tx,
        state,
        seatUserId: userId,
        lockedWallets,
      });
      exitAmount = toMoneyString(stackAmount);
      await tx
        .update(holdemTables)
        .set({
          status: state.status,
          metadata: toJsonbLiteral(state.metadata),
          updatedAt: new Date(),
        })
        .where(eq(holdemTables.id, state.id));
    }

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
            cashOutAmount: exitAmount,
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
    if (isTournamentTable(state)) {
      const tournament = ensureTournamentMetadata(state);
      if (tournament.status === "completed") {
        throw conflictError("This holdem tournament is already complete.");
      }
      if (tournament.status === "registering") {
        tournament.status = "running";
        syncTournamentStandings(state);
      }
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
    const dealerRuleEvents = [
      buildHoldemDealerEvent({
        state,
        handHistoryId,
        kind: "action",
        actionCode: "cards_dealt",
        text: "Dealer puts the opening cards in the air.",
        metadata: {
          handNumber: state.metadata.handNumber,
        },
      }),
      ...(nextSeat
        ? [
            buildHoldemDealerEvent({
              state,
              handHistoryId,
              kind: "pace_hint",
              actionCode: "prompt_next_actor",
              pace: "normal",
              seatIndex: nextSeat.seatIndex,
              text: `Action is on seat #${nextSeat.seatIndex + 1}.`,
              metadata: {
                turnDeadlineAt: nextSeat.turnDeadlineAt,
              },
            }),
          ]
        : []),
    ];
    const dealerTableEvents = await persistHoldemDealerEvents({
      tx,
      state,
      handHistoryId,
      historyUserId: userId,
      phase: state.metadata.stage,
      events: dealerRuleEvents,
    });
    if (!isTournamentTable(state)) {
      await syncSettledLockedBalances({
        tx,
        state,
        lockedWallets,
        previousStacks,
      });
    }
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
      dealerEvents: dealerRuleEvents,
      fanout: buildRealtimeUpdate({
        state,
        tableEvents: [...persistedTableEvents, ...dealerTableEvents],
      }),
    };
  });

  publishHoldemRealtimeUpdate(result.fanout);
  for (const dealerEvent of result.dealerEvents) {
    publishDealerRealtimeToTopic(
      buildHoldemRealtimeTableTopic(tableId),
      dealerEvent,
    );
  }
  emitAsyncHoldemDealerLanguageEvent({
    tableId,
    handHistoryId: result.collusionCapture.handHistoryId,
    historyUserId: userId,
    phase: result.response.table.stage,
    scenario: "holdem_hand_started",
    summary: {
      handNumber: result.response.table.handNumber,
      stage: result.response.table.stage,
      occupiedSeats: result.response.table.seats.filter((seat) => seat.userId !== null)
        .length,
      potCount: result.response.table.pots.length,
    },
  });
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
      const transition = await persistHoldemTransition({
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
        transition,
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

    const transition = await persistHoldemTransition({
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
      transition,
    };
  });

  publishHoldemDealerTransition(tableId, result.transition);
  if (result.kind === "timeout") {
    throw conflictError("Holdem turn timed out and the default action was applied.", {
      code: API_ERROR_CODES.HOLDEM_TURN_EXPIRED,
    });
  }

  return result.response;
}
