import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  holdemTableMessages,
  holdemTableSeats,
  holdemTables,
  userWallets,
  users,
} from "@reward/database";
import { and, asc, desc, eq, isNotNull, lte, or, sql } from "@reward/database/orm";
import {
  buildHoldemRealtimeTableTopic,
  HOLDEM_CONFIG,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  type HoldemAction,
  type HoldemCreateTableRequest,
  type HoldemLinkedGroup,
  type HoldemTableBotsRequest,
  type HoldemTableMessage,
  type HoldemTableMessageRequest,
  type HoldemTableMessagesResponse,
  type HoldemPresenceResponse,
  type HoldemTableResponse,
  type HoldemTableType,
  type HoldemTablesResponse,
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
import { hashPassword } from "../auth/password";
import { ensureFairnessSeed } from "../fairness/service";
import {
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
  loadPlayModeSessionById,
  loadPlayModeSessionsByParent,
  lockUserPlayModeState,
  resolveSettledPlayMode,
  saveUserPlayModeState,
  settlePlayModeSession,
} from "../play-mode/service";
import { applySettledPlayModePayoutPolicy } from "../play-mode/deferred-payouts";
import {
  publishHoldemRealtimeTableMessage,
  publishHoldemRealtimeUpdate,
} from "./realtime";
import {
  actOnHoldemSeat,
  actOnHoldemTable,
  canUserLeaveTable,
  clearTableAfterCashout,
  resolveHoldemActionAvailability,
  resolveHoldemTimeoutAction,
  serializeHoldemTable,
  serializeHoldemTableSummary,
  startHoldemHand,
  type HoldemRakePolicy,
} from "./engine";
import {
  HoldemTableMetadataSchema,
  HoldemTableMessageRowsSchema,
  HoldemSeatRowsSchema,
  HoldemTableRowsSchema,
  type DbExecutor,
  isBotSeat,
  parseSqlRows,
  resolveSeatPresenceState,
  toHoldemTableMessage,
  toJsonbLiteral,
  toTableState,
  type HoldemTableState,
} from "./model";
import {
  HOLDEM_REFERENCE_TYPE,
  assertBotSeatMutationAllowed,
  assertBuyInWithinRange,
  assertHoldemBotTableInvariant,
  buildHoldemRiskTableId,
  buildHoldemRoundId,
  buildHoldemTableRef,
  cloneTableState,
  countHoldemActiveSeats,
  countBotSeats,
  countHumanSeats,
  ensureTournamentMetadata,
  getPendingActorSeat,
  isCashTableType,
  isTournamentTable,
  parseAmount,
  resolveCreateBotCount,
  resolveHoldemCreateMaxSeats,
  resolveHoldemCreateTableType,
  resolveHoldemFundingSource,
  resolveTournamentStartingStackAmount,
  syncTournamentStandings,
  type HoldemTableEventInput,
  type LockedWalletRow,
  type PersistedHoldemTableEvent,
} from "./service-shared";
import {
  appendTableEvents,
  buildHoldemDealerEvent,
  buildRealtimeUpdate,
  createHoldemHandHistory,
  persistHoldemDealerEvents,
  persistHoldemTransition,
  publishHoldemDealerTransition,
  recordHandStartedEvents,
  resolveHoldemDealerPromptPace,
  type HoldemPersistedTransition,
} from "./hand-events";
import {
  applyBuyInToWallet,
  applyTournamentBuyInToWallet,
  removeSeatAndCashOut,
  removeTournamentSeatAndRefund,
  settlePendingSeatCashOuts,
  syncSettledLockedBalances,
} from "./wallet-settlement";
import { evaluateBestHoldemHand } from "./evaluator";

const LockedWalletRowSchema = z.object({
  userId: z.number().int().positive(),
  withdrawableBalance: z.union([z.string(), z.number()]),
  bonusBalance: z.union([z.string(), z.number()]),
  lockedBalance: z.union([z.string(), z.number()]),
});

const LockedWalletRowsSchema = z.array(LockedWalletRowSchema);
const DEFAULT_HOLDEM_RAKE_BPS = 500;
const DEFAULT_HOLDEM_RAKE_CAP_AMOUNT = "8.00";
const DEFAULT_HOLDEM_RAKE_NO_FLOP_NO_DROP = true;
const DEFAULT_HOLDEM_DISCONNECT_GRACE_SECONDS = 30;
const DEFAULT_HOLDEM_SEAT_LEASE_SECONDS = 300;
const DEFAULT_HOLDEM_TIME_BANK_MS = 30_000;
const HOLDEM_BOT_BEHAVIOR_VERSION = "casual-v1";
const HOLD_EM_BOT_RUNNER_MAX_ACTIONS = 24;
const HOLD_EM_BOT_NAME_POOL = [
  "Atlas",
  "Nova",
  "Echo",
  "Blaze",
  "Mira",
  "Kite",
  "Onyx",
  "Jade",
  "Sable",
  "Pico",
  "Vega",
  "Rook",
] as const;

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
const activeHoldemBotRunnerTableIds = new Set<number>();
const activeHoldemBotRunnerTasks = new Map<number, Promise<void>>();
const activeHoldemAsyncTasks = new Set<Promise<unknown>>();

const trackHoldemAsyncTask = <T>(task: Promise<T>) => {
  activeHoldemAsyncTasks.add(task);
  void task.finally(() => {
    activeHoldemAsyncTasks.delete(task);
  });
  return task;
};

export async function awaitHoldemAsyncWorkForTests() {
  while (activeHoldemAsyncTasks.size > 0) {
    await Promise.allSettled([...activeHoldemAsyncTasks]);
  }
}

const defaultTableName = () => `Hold'em ${new Date().toISOString().slice(11, 19)}`;

const HoldemPlayModeSessionMetadataSchema = z.object({
  baseBuyInAmount: z.string().optional(),
  effectiveBuyInAmount: z.string().optional(),
  tableId: z.number().int().positive().optional(),
  tableName: z.string().optional(),
  groupId: z.string().nullable().optional(),
  executionIndex: z.number().int().positive().optional(),
  executionCount: z.number().int().positive().optional(),
});

const resolveHoldemSessionSnapshot = (
  value: unknown,
  fallback: import("@reward/shared-types/play-mode").PlayModeSnapshot,
) => {
  const parsed = PlayModeSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const maybeFinalizeGroupedHoldemPlayMode = async (params: {
  tx: DbTransaction;
  userId: number;
  parentSessionId: number;
  fallbackSnapshot: import("@reward/shared-types/play-mode").PlayModeSnapshot;
}) => {
  const parentSession = await loadPlayModeSessionById(params.tx, {
    sessionId: params.parentSessionId,
  });
  if (!parentSession) {
    return null;
  }

  const childSessions = await loadPlayModeSessionsByParent(params.tx, {
    parentSessionId: params.parentSessionId,
  });
  if (childSessions.length === 0 || childSessions.some((session) => session.status === "active")) {
    return null;
  }

  let totalEffectiveBuyInAmount = toDecimal(0);
  let totalCashOutAmount = toDecimal(0);
  for (const session of childSessions) {
    const metadataParsed = HoldemPlayModeSessionMetadataSchema.safeParse(
      session.metadata ?? {},
    );
    const effectiveBuyInRaw = metadataParsed.success
      ? metadataParsed.data.effectiveBuyInAmount
      : null;
    const cashOutRaw =
      metadataParsed.success && typeof session.metadata === "object" && session.metadata
        ? Reflect.get(session.metadata, "cashOutAmount")
        : null;
    if (typeof effectiveBuyInRaw !== "string" || typeof cashOutRaw !== "string") {
      return null;
    }

    totalEffectiveBuyInAmount = totalEffectiveBuyInAmount.plus(effectiveBuyInRaw);
    totalCashOutAmount = totalCashOutAmount.plus(cashOutRaw);
  }

  const parentSnapshot = resolveHoldemSessionSnapshot(
    parentSession.snapshot,
    params.fallbackSnapshot,
  );
  const outcome = resolveHoldemPlayModeOutcome(
    totalCashOutAmount,
    totalEffectiveBuyInAmount,
  );
  const settledSnapshot = resolveSettledPlayMode({
    snapshot: parentSnapshot,
    outcome,
  });

  await settlePlayModeSession({
    tx: params.tx,
    sessionId: parentSession.id,
    snapshot: settledSnapshot,
    outcome,
    metadata: {
      totalEffectiveBuyInAmount: toMoneyString(totalEffectiveBuyInAmount),
      totalCashOutAmount: toMoneyString(totalCashOutAmount),
      childSessionCount: childSessions.length,
    },
  });

  const storedPlayMode = await lockUserPlayModeState(params.tx, params.userId, "holdem");
  if (storedPlayMode) {
    await saveUserPlayModeState({
      tx: params.tx,
      rowId: storedPlayMode.id,
      snapshot: settledSnapshot,
    });
  }

  return settledSnapshot;
};

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
  balanceType: "bonus" | "withdrawable";
}) => {
  const activeSession = await loadActivePlayModeSession(params.tx, {
    userId: params.userId,
    gameKey: "holdem",
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    includeChildSessions: true,
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
  const adjustedSnapshot = await applySettledPlayModePayoutPolicy({
    tx: params.tx,
    userId: params.userId,
    gameKey: "holdem",
    outcome,
    settledSnapshot,
    netPayoutAmount: toMoneyString(
      Decimal.max(params.cashOutAmount.minus(effectiveBuyInAmount), 0),
    ),
    balanceType: params.balanceType,
    sessionId: activeSession.id,
    sourceReferenceType: HOLDEM_REFERENCE_TYPE,
    sourceReferenceId: params.tableId,
  });

  await settlePlayModeSession({
    tx: params.tx,
    sessionId: activeSession.id,
    snapshot: adjustedSnapshot,
    outcome,
    referenceType: HOLDEM_REFERENCE_TYPE,
    referenceId: params.tableId,
    metadata: {
      ...(metadataParsed.success ? metadataParsed.data : {}),
      cashOutAmount: toMoneyString(params.cashOutAmount),
    },
  });

  if (!activeSession.parentSessionId) {
    const storedPlayMode = await lockUserPlayModeState(
      params.tx,
      params.userId,
      "holdem",
    );
    if (storedPlayMode) {
      await saveUserPlayModeState({
        tx: params.tx,
        rowId: storedPlayMode.id,
        snapshot: adjustedSnapshot,
      });
    }
    return adjustedSnapshot;
  }

  return (
    (await maybeFinalizeGroupedHoldemPlayMode({
      tx: params.tx,
      userId: params.userId,
      parentSessionId: activeSession.parentSessionId,
      fallbackSnapshot: snapshotParsed.data,
    })) ?? snapshotParsed.data
  );
};

const resolveHoldemBotDisplayName = (
  existingBotCount: number,
  seatIndex: number,
) => {
  const name = HOLD_EM_BOT_NAME_POOL[existingBotCount % HOLD_EM_BOT_NAME_POOL.length];
  return `Bot ${name ?? `Seat ${seatIndex + 1}`}`;
};

const createHoldemBotUser = async (tx: DbTransaction, displayName: string) => {
  const emailSlug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const [user] = await tx
    .insert(users)
    .values({
      email: `${emailSlug || "holdem-bot"}-${randomUUID()}@bots.reward.local`,
      passwordHash: hashPassword(randomUUID()),
      role: "user",
      birthDate: null,
      registrationCountryCode: null,
      countryTier: "unknown",
      countryResolvedAt: null,
      userPoolBalance: "0",
    })
    .returning();
  if (!user) {
    throw conflictError("Failed to provision a holdem bot user.");
  }

  await tx.insert(userWallets).values({ userId: user.id }).onConflictDoNothing();
  return user;
};

const listHoldemActiveParticipantUserIds = (state: HoldemTableState) =>
  state.seats
    .filter((seat) => seat.status === "active" && !isBotSeat(seat))
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

const emitAsyncHoldemDealerLanguageEvent = (params: {
  tableId: number;
  handHistoryId: number;
  historyUserId: number;
  phase: string | null;
  scenario: string;
  summary: Record<string, unknown>;
  seatIndex?: number | null;
}) => {
  const task = (async () => {
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

  trackHoldemAsyncTask(task);
};

const publishPersistedHoldemDealerTransition = (
  tableId: number,
  transition: HoldemPersistedTransition,
) =>
  publishHoldemDealerTransition({
    tableId,
    transition,
    publishHoldemRealtimeUpdate,
    publishDealerRealtimeToTopic,
    emitAsyncHoldemDealerLanguageEvent,
  });

const persistHoldemTransitionWithDeps = (
  params: Omit<
    Parameters<typeof persistHoldemTransition>[0],
    | "loadLockedWalletRows"
    | "settleHoldemPlayModeSessionIfPresent"
    | "removeBotSeats"
    | "persistTableState"
    | "syncHoldemTurnDeadlines"
    | "resolveHoldemRakePolicySnapshot"
  >,
) =>
  persistHoldemTransition({
    ...params,
    loadLockedWalletRows,
    settleHoldemPlayModeSessionIfPresent,
    removeBotSeats,
    persistTableState,
    syncHoldemTurnDeadlines,
    resolveHoldemRakePolicySnapshot,
  });

const clearHoldemTurnState = (state: HoldemTableState) => {
  state.metadata.turnStartedAt = null;
  state.metadata.turnTimeBankStartsAt = null;
  state.metadata.turnTimeBankAllocatedMs = 0;
  for (const seat of state.seats) {
    seat.turnDeadlineAt = null;
  }
};

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

const HOLD_EM_BOT_RANK_STRENGTH: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const HOLD_EM_BOT_HAND_CATEGORY_STRENGTH: Record<string, number> = {
  high_card: 18,
  one_pair: 42,
  two_pair: 64,
  three_of_a_kind: 76,
  straight: 84,
  flush: 88,
  full_house: 92,
  four_of_a_kind: 96,
  straight_flush: 99,
};

const resolveHoldemBotPreflopStrength = (
  seat: HoldemTableState["seats"][number],
) => {
  const [firstCard, secondCard] = seat.holeCards;
  if (!firstCard || !secondCard) {
    return 35;
  }
  const firstRank = HOLD_EM_BOT_RANK_STRENGTH[firstCard.rank] ?? 0;
  const secondRank = HOLD_EM_BOT_RANK_STRENGTH[secondCard.rank] ?? 0;
  const highRank = Math.max(firstRank, secondRank);
  const lowRank = Math.min(firstRank, secondRank);
  const gap = highRank - lowRank;
  let score = 18 + highRank * 2 + lowRank;

  if (firstCard.rank === secondCard.rank) {
    score += 28 + highRank * 2;
  }
  if (firstCard.suit === secondCard.suit) {
    score += 6;
  }
  if (gap <= 1) {
    score += 4;
  }
  if (highRank >= 11 && lowRank >= 10) {
    score += 8;
  }
  if (highRank === 14 && lowRank >= 10) {
    score += 6;
  }

  return Math.min(score, 98);
};

const resolveHoldemBotStrength = (state: HoldemTableState, seat: HoldemTableState["seats"][number]) => {
  if (state.metadata.communityCards.length < 3) {
    return resolveHoldemBotPreflopStrength(seat);
  }

  const bestHand = evaluateBestHoldemHand([
    ...seat.holeCards,
    ...state.metadata.communityCards,
  ]);
  return HOLD_EM_BOT_HAND_CATEGORY_STRENGTH[bestHand.category] ?? 20;
};

const resolveHoldemBotBetAmount = (params: {
  availability: NonNullable<ReturnType<typeof resolveHoldemActionAvailability>>;
  aggression: number;
}) => {
  const minimumBetTo = toDecimal(params.availability.minimumBetTo);
  const maximumRaiseTo = params.availability.maximumRaiseTo
    ? toDecimal(params.availability.maximumRaiseTo)
    : minimumBetTo;
  const desiredAmount = minimumBetTo.mul(params.aggression >= 85 ? 3 : 2);
  return toMoneyString(
    Decimal.min(
      maximumRaiseTo,
      Decimal.max(minimumBetTo, desiredAmount),
    ),
  );
};

const resolveHoldemBotRaiseAmount = (params: {
  availability: NonNullable<ReturnType<typeof resolveHoldemActionAvailability>>;
  aggression: number;
}) => {
  const minimumRaiseTo = params.availability.minimumRaiseTo
    ? toDecimal(params.availability.minimumRaiseTo)
    : null;
  const maximumRaiseTo = params.availability.maximumRaiseTo
    ? toDecimal(params.availability.maximumRaiseTo)
    : null;
  if (!minimumRaiseTo || !maximumRaiseTo) {
    return null;
  }
  const desiredAmount =
    params.aggression >= 90
      ? minimumRaiseTo.plus(toDecimal(params.availability.currentBet))
      : minimumRaiseTo;
  return toMoneyString(
    Decimal.min(
      maximumRaiseTo,
      Decimal.max(minimumRaiseTo, desiredAmount),
    ),
  );
};

const resolveAutomatedHoldemBotAction = (params: {
  state: HoldemTableState;
  seat: HoldemTableState["seats"][number];
}) => {
  const availability = resolveHoldemActionAvailability(
    params.state,
    params.seat.seatIndex,
  );
  if (!availability) {
    throw conflictError("No holdem action is available for the pending bot seat.");
  }

  const toCall = toDecimal(availability.toCall);
  const stack = toDecimal(params.seat.stackAmount);
  const strength = resolveHoldemBotStrength(params.state, params.seat);
  const callPressure =
    stack.plus(toCall).gt(0)
      ? toCall.div(stack.plus(toCall)).toNumber()
      : 1;

  if (toCall.eq(0)) {
    if (availability.actions.includes("bet") && strength >= 68) {
      return {
        action: "bet" as const,
        amount: resolveHoldemBotBetAmount({
          availability,
          aggression: strength,
        }),
      };
    }
    return {
      action: "check" as const,
    };
  }

  if (
    strength >= 92 &&
    availability.actions.includes("all_in") &&
    (callPressure >= 0.2 || stack.lte(toCall.mul(2)))
  ) {
    return {
      action: "all_in" as const,
    };
  }

  if (strength >= 74 && availability.actions.includes("raise")) {
    return {
      action: "raise" as const,
      amount: resolveHoldemBotRaiseAmount({
        availability,
        aggression: strength,
      }) ?? availability.minimumRaiseTo ?? undefined,
    };
  }

  if (strength < 26 && availability.actions.includes("fold")) {
    return {
      action: "fold" as const,
    };
  }

  if (strength < 42 && callPressure >= 0.28 && availability.actions.includes("fold")) {
    return {
      action: "fold" as const,
    };
  }

  if (availability.actions.includes("call")) {
    return {
      action: "call" as const,
    };
  }

  if (availability.actions.includes("check")) {
    return {
      action: "check" as const,
    };
  }

  if (availability.actions.includes("fold")) {
    return {
      action: "fold" as const,
    };
  }

  if (availability.actions.includes("all_in")) {
    return {
      action: "all_in" as const,
    };
  }

  throw conflictError("Unable to resolve an automated holdem bot action.");
};

const runAutomatedHoldemBotTurns = async (tableId: number) => {
  const existingTask = activeHoldemBotRunnerTasks.get(tableId);
  if (existingTask) {
    await existingTask;
    return;
  }

  const task = trackHoldemAsyncTask(
    (async () => {
      activeHoldemBotRunnerTableIds.add(tableId);

      try {
        for (
          let actionCount = 0;
          actionCount < HOLD_EM_BOT_RUNNER_MAX_ACTIONS;
          actionCount += 1
        ) {
          const transition = await db.transaction(async (tx) => {
            const state = await loadTableState(tx, tableId, { lock: true });
            if (!state) {
              return null;
            }
            assertHoldemBotTableInvariant(state);

            const pendingSeat = getPendingActorSeat(state);
            if (!pendingSeat || !isBotSeat(pendingSeat) || state.status !== "active") {
              return null;
            }

            const previousStacks = new Map(
              state.seats.map((seat) => [seat.userId, toDecimal(seat.stackAmount)] as const),
            );
            const lockedWallets = await loadLockedWalletRows(
              tx,
              state.seats.map((seat) => seat.userId),
            );
            const beforeState = cloneTableState(state);
            const timeout = processExpiredHoldemTurn(state, new Date());
            if (timeout) {
              return persistHoldemTransitionWithDeps({
                tx,
                beforeState,
                afterState: state,
                previousStacks,
                lockedWallets,
                action: timeout.action,
                actingUserId: pendingSeat.userId,
                timedOut: true,
                timeBankConsumedMs: timeout.timeBankConsumedMs,
              });
            }

            const decision = resolveAutomatedHoldemBotAction({
              state,
              seat: pendingSeat,
            });
            actOnHoldemSeat(state, {
              seatIndex: pendingSeat.seatIndex,
              action: decision.action,
              amount: decision.amount,
            });
            return persistHoldemTransitionWithDeps({
              tx,
              beforeState,
              afterState: state,
              previousStacks,
              lockedWallets,
              action: decision.action,
              actingUserId: pendingSeat.userId,
            });
          });

          if (!transition) {
            break;
          }

          publishPersistedHoldemDealerTransition(tableId, transition);
        }
      } catch (error) {
        logger.warning("holdem bot runner failed", {
          err: error,
          tableId,
        });
      } finally {
        activeHoldemBotRunnerTableIds.delete(tableId);
        activeHoldemBotRunnerTasks.delete(tableId);
      }
    })(),
  );

  activeHoldemBotRunnerTasks.set(tableId, task);
  await task;
};

const scheduleAutomatedHoldemBotTurns = (tableId: number) => {
  void runAutomatedHoldemBotTurns(tableId);
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

const findUserSeats = async (executor: DbExecutor, userId: number) =>
  loadSeatRows(executor, { userId });

const assertHoldemSeatCapacity = async (params: {
  executor: DbExecutor;
  userId: number;
  maxExistingSeatCount: number;
}) => {
  const seats = await findUserSeats(params.executor, params.userId);
  if (seats.length <= params.maxExistingSeatCount) {
    return seats;
  }

  if (params.maxExistingSeatCount <= 0) {
    throw conflictError("Leave your current holdem table before opening another.");
  }

  throw conflictError("This play mode already has the maximum active holdem tables.");
};

const seatHoldemBots = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  count: number;
  buyInAmount: ReturnType<typeof toDecimal>;
  ownerUserId: number;
}) => {
  assertBotSeatMutationAllowed({
    state: params.state,
    requestedCount: params.count,
  });
  const buyInAmountString = toMoneyString(params.buyInAmount);
  assertBuyInWithinRange(params.buyInAmount, params.state);
  const presencePolicy = await loadHoldemSeatPresencePolicy(params.tx);
  const timeBankPolicy = await loadHoldemTimeBankPolicy(params.tx);
  const now = new Date();
  const disconnectGraceExpiresAt = new Date(
    now.getTime() + presencePolicy.disconnectGraceSeconds * 1_000,
  );
  const seatLeaseExpiresAt = new Date(
    now.getTime() + presencePolicy.seatLeaseSeconds * 1_000,
  );
  const occupiedSeatIndexes = new Set(params.state.seats.map((seat) => seat.seatIndex));
  const nextOpenSeatIndexes = Array.from(
    { length: params.state.maxSeats },
    (_, index) => index,
  ).filter((seatIndex) => !occupiedSeatIndexes.has(seatIndex));

  if (nextOpenSeatIndexes.length < params.count) {
    throw conflictError("Not enough open seats remain for the requested holdem bots.");
  }

  const botEvents: HoldemTableEventInput[] = [];
  const existingBotCount = countBotSeats(params.state);
  for (let index = 0; index < params.count; index += 1) {
    const seatIndex = nextOpenSeatIndexes[index];
    if (seatIndex === undefined) {
      throw internalInvariantError("Failed to resolve an open holdem bot seat.");
    }
    const displayName = resolveHoldemBotDisplayName(existingBotCount + index, seatIndex);
    const botUser = await createHoldemBotUser(params.tx, displayName);
    await params.tx.insert(holdemTableSeats).values({
      tableId: params.state.id,
      seatIndex,
      userId: botUser.id,
      linkedGroupId: params.state.metadata.linkedGroup?.groupId ?? null,
      stackAmount: buyInAmountString,
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
        sittingOut: false,
        sitOutSource: null,
        timeBankRemainingMs: timeBankPolicy.defaultTimeBankMs,
        winner: false,
        bestHand: null,
        bot: {
          enabled: true,
          displayName,
          behaviorVersion: HOLDEM_BOT_BEHAVIOR_VERSION,
          ownerUserId: params.ownerUserId,
        },
        tournament: null,
      },
    });
    params.state.seats.push({
      id: Number.NaN,
      tableId: params.state.id,
      seatIndex,
      userId: botUser.id,
      userEmail: botUser.email,
      stackAmount: buyInAmountString,
      committedAmount: "0.00",
      totalCommittedAmount: "0.00",
      status: "waiting",
      presenceHeartbeatAt: now,
      disconnectGraceExpiresAt,
      seatLeaseExpiresAt,
      autoCashOutPending: false,
      turnDeadlineAt: null,
      holeCards: [],
      lastAction: null,
      metadata: {
        sittingOut: false,
        sitOutSource: null,
        timeBankRemainingMs: timeBankPolicy.defaultTimeBankMs,
        winner: false,
        bestHand: null,
        bot: {
          enabled: true,
          displayName,
          behaviorVersion: HOLDEM_BOT_BEHAVIOR_VERSION,
          ownerUserId: params.ownerUserId,
        },
        tournament: null,
      },
      createdAt: now,
      updatedAt: now,
    });
    botEvents.push({
      eventType: "seat_joined",
      actor: "system",
      userId: botUser.id,
      seatIndex,
      payload: {
        tableName: params.state.name,
        buyInAmount: buyInAmountString,
        stackAmount: buyInAmountString,
        occupiedSeatCount: params.state.seats.length,
        tableType: params.state.metadata.tableType,
        balanceType: "bot_virtual_stack",
        isBot: true,
        displayName,
      },
    });
  }

  params.state.seats.sort((left, right) => left.seatIndex - right.seatIndex);
  const refreshedState = await loadTableState(params.tx, params.state.id, { lock: true });
  if (!refreshedState) {
    throw notFoundError("Holdem table not found.");
  }
  params.state.seats = refreshedState.seats;
  params.state.updatedAt = refreshedState.updatedAt;
  params.state.metadata = refreshedState.metadata;
  return botEvents;
};

const removeBotSeats = async (params: {
  tx: DbTransaction;
  state: HoldemTableState;
  predicate: (seat: HoldemTableState["seats"][number]) => boolean;
}) => {
  const botSeats = params.state.seats.filter(
    (seat) => isBotSeat(seat) && params.predicate(seat),
  );
  if (botSeats.length === 0) {
    return [];
  }

  for (const seat of botSeats) {
    await params.tx.delete(holdemTableSeats).where(eq(holdemTableSeats.id, seat.id));
  }
  const removedSeatIds = new Set(botSeats.map((seat) => seat.id));
  params.state.seats = params.state.seats.filter((seat) => !removedSeatIds.has(seat.id));
  clearTableAfterCashout(params.state);
  if (params.state.status === "waiting") {
    params.state.metadata.activeHandHistoryId = null;
  }
  return botSeats;
};

export const persistTableState = async (
  tx: DbTransaction,
  state: HoldemTableState,
) => {
  assertHoldemBotTableInvariant(state);
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

const loadSerializedTable = async (
  executor: DbExecutor,
  userId: number,
  tableId: number,
): Promise<HoldemTableResponse> => {
  const state = await loadTableState(executor, tableId);
  if (!state) {
    throw notFoundError("Holdem table not found.");
  }
  const linkedTableIds = state.metadata.linkedGroup?.tableIds ?? [];
  if (linkedTableIds.length <= 1) {
    return buildHoldemTableResponse(serializeHoldemTable(state, userId));
  }

  const groupedStates: HoldemTableState[] = [];
  for (const linkedTableId of linkedTableIds) {
    if (linkedTableId === state.id) {
      groupedStates.push(state);
      continue;
    }

    const linkedState = await loadTableState(executor, linkedTableId);
    if (linkedState) {
      groupedStates.push(linkedState);
    }
  }

  groupedStates.sort((left, right) => {
    const leftPrimaryTableId = left.metadata.linkedGroup?.primaryTableId ?? left.id;
    const rightPrimaryTableId = right.metadata.linkedGroup?.primaryTableId ?? right.id;
    if (leftPrimaryTableId !== rightPrimaryTableId) {
      return leftPrimaryTableId - rightPrimaryTableId;
    }

    const leftExecutionIndex = left.metadata.linkedGroup?.executionIndex ?? 1;
    const rightExecutionIndex = right.metadata.linkedGroup?.executionIndex ?? 1;
    if (leftExecutionIndex !== rightExecutionIndex) {
      return leftExecutionIndex - rightExecutionIndex;
    }

    return left.id - right.id;
  });

  const tables = groupedStates.map((groupedState) =>
    serializeHoldemTable(groupedState, userId),
  );
  const primaryTableId = state.metadata.linkedGroup?.primaryTableId ?? state.id;
  const primaryTable =
    tables.find((table) => table.id === primaryTableId) ??
    tables.find((table) => table.id === state.id) ??
    tables[0];
  if (!primaryTable) {
    throw notFoundError("Holdem table not found.");
  }

  return buildHoldemTableResponse(primaryTable, tables);
};

const buildHoldemTableResponse = (
  table: HoldemTableResponse["table"],
  tables: HoldemTableResponse["tables"] = [table],
): HoldemTableResponse => ({
  table,
  tables,
});

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
    const transition = await persistHoldemTransitionWithDeps({
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
    publishPersistedHoldemDealerTransition(tableId, result.transition);
    scheduleAutomatedHoldemBotTurns(tableId);
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
      if (isBotSeat(seat)) {
        seat.autoCashOutPending = false;
        seat.metadata.sittingOut = false;
        seat.metadata.sitOutSource = null;
        continue;
      }

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
            !isBotSeat(seat) &&
            seat.autoCashOutPending &&
            canUserLeaveTable(state, seat.userId),
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
          removeBotSeats,
          settleHoldemPlayModeSessionIfPresent,
        })
      : [];
    if (countHumanSeats(state) === 0) {
      const removedBots = await removeBotSeats({
        tx,
        state,
        predicate: () => true,
      });
      if (removedBots.length > 0) {
        changed = true;
      }
    }

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
  const activeTables: Array<{
    id: number;
    primaryTableId: number;
    executionIndex: number;
  }> = [];

  for (const tableRow of tableRows) {
    const seatRows = await loadSeatRows(db, { tableId: tableRow.id });
    const state = toTableState(tableRow, seatRows);
    if (state.seats.some((seat) => seat.userId === userId)) {
      activeTables.push({
        id: state.id,
        primaryTableId: state.metadata.linkedGroup?.primaryTableId ?? state.id,
        executionIndex: state.metadata.linkedGroup?.executionIndex ?? 1,
      });
    }
    tables.push(serializeHoldemTableSummary(state, userId));
  }

  activeTables.sort((left, right) => {
    if (left.primaryTableId !== right.primaryTableId) {
      return left.primaryTableId - right.primaryTableId;
    }
    if (left.executionIndex !== right.executionIndex) {
      return left.executionIndex - right.executionIndex;
    }
    return left.id - right.id;
  });
  const activeTableIds = activeTables.map((entry) => entry.id);

  return {
    currentTableId: activeTableIds[0] ?? null,
    activeTableIds,
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
          ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
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
        ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
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

export const createHoldemTableInTransaction = async (
  tx: DbTransaction,
  userId: number,
  params: Pick<
    HoldemCreateTableRequest,
    "tableName" | "buyInAmount" | "tableType" | "maxSeats" | "botCount" | "tournament"
  >,
  options?: {
    linkedGroup?: HoldemLinkedGroup | null;
    maxExistingSeatCount?: number;
  },
) => {
  await assertHoldemSeatCapacity({
    executor: tx,
    userId,
    maxExistingSeatCount: options?.maxExistingSeatCount ?? 0,
  });

  const tableType = resolveHoldemCreateTableType(params);
  const botCount = resolveCreateBotCount({
    botCount: params.botCount,
    maxSeats: params.maxSeats,
    tableType,
  });
  if (tableType !== "tournament" && params.tournament) {
    throw badRequestError("Tournament config requires a tournament table type.");
  }
  const maxSeats = resolveHoldemCreateMaxSeats(params);
  if (botCount > Math.max(0, maxSeats - 1)) {
    throw badRequestError("Holdem bot count exceeds the available seats at this table.");
  }
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
        linkedGroup: options?.linkedGroup ?? null,
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
    linkedGroupId: options?.linkedGroup?.groupId ?? null,
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

  const state = await loadTableState(tx, createdTable.id, { lock: true });
  if (!state) {
    throw notFoundError("Holdem table not found.");
  }
  const botSeatEvents =
    botCount > 0
      ? await seatHoldemBots({
          tx,
          state,
          count: botCount,
          buyInAmount,
          ownerUserId: userId,
        })
      : [];

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
          linkedGroup: options?.linkedGroup ?? null,
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
      ...botSeatEvents,
    ],
  });
  if (isTournamentTable(state)) {
    syncTournamentStandings(state);
    await persistTableState(tx, state);
  }

  return {
    state,
    response: buildHoldemTableResponse(serializeHoldemTable(state, userId)),
    fanout: buildRealtimeUpdate({
      state,
      tableEvents: persistedTableEvents,
    }),
  };
};

export async function createHoldemTable(
  userId: number,
  params: Pick<
    HoldemCreateTableRequest,
    "tableName" | "buyInAmount" | "tableType" | "maxSeats" | "botCount" | "tournament"
  >,
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) =>
    createHoldemTableInTransaction(tx, userId, params),
  );

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
      linkedGroupId: state.metadata.linkedGroup?.groupId ?? null,
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
        ...buildHoldemTableResponse(serializeHoldemTable(nextState, userId)),
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

export async function addHoldemBots(
  userId: number,
  tableId: number,
  params: HoldemTableBotsRequest,
): Promise<HoldemTableResponse> {
  const result = await db.transaction(async (tx) => {
    const state = await loadTableState(tx, tableId, { lock: true });
    if (!state) {
      throw notFoundError("Holdem table not found.");
    }
    const requestingSeat = state.seats.find((seat) => seat.userId === userId) ?? null;
    if (!requestingSeat) {
      throw conflictError("You must be seated to add holdem bot players.");
    }
    if (isBotSeat(requestingSeat)) {
      throw conflictError("Bot seats cannot manage holdem bot players.");
    }

    const buyInAmount = parseAmount(params.buyInAmount, "buy-in");
    const botSeatEvents = await seatHoldemBots({
      tx,
      state,
      count: params.count,
      buyInAmount,
      ownerUserId: userId,
    });
    const persistedTableEvents = await appendTableEvents({
      tx,
      tableId: state.id,
      events: botSeatEvents,
    });
    await persistTableState(tx, state);

    return {
      response: {
        ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
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
        settleHoldemPlayModeSessionIfPresent,
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
        settleHoldemPlayModeSessionIfPresent,
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

    if (countHumanSeats(state) === 0) {
      await removeBotSeats({
        tx,
        state,
        predicate: () => true,
      });
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
        ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
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
      buildHoldemDealerEvent({
        state,
        handHistoryId,
        kind: "action",
        actionCode: "stage_opened",
        text: "Dealer opens the preflop.",
        metadata: {
          handNumber: state.metadata.handNumber,
          stage: state.metadata.stage,
        },
      }),
      ...(nextSeat
        ? [
            buildHoldemDealerEvent({
              state,
              handHistoryId,
              kind: "pace_hint",
              actionCode: "prompt_next_actor",
              pace: resolveHoldemDealerPromptPace({
                state,
                seat: nextSeat,
              }),
              seatIndex: nextSeat.seatIndex,
              text:
                countHoldemActiveSeats(state) <= 2
                  ? `Short-handed table. Action is on seat #${nextSeat.seatIndex + 1}.`
                  : `Action is on seat #${nextSeat.seatIndex + 1}.`,
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
        ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
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
  scheduleAutomatedHoldemBotTurns(tableId);
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
      const transition = await persistHoldemTransitionWithDeps({
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

    const transition = await persistHoldemTransitionWithDeps({
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
        ...buildHoldemTableResponse(serializeHoldemTable(state, userId)),
      },
      transition,
    };
  });

  publishPersistedHoldemDealerTransition(tableId, result.transition);
  scheduleAutomatedHoldemBotTurns(tableId);
  if (result.kind === "timeout") {
    throw conflictError("Holdem turn timed out and the default action was applied.", {
      code: API_ERROR_CODES.HOLDEM_TURN_EXPIRED,
    });
  }

  return result.response;
}
