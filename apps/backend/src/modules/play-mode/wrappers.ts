import type { DrawPlayRequest, DrawPlayResponse } from "@reward/shared-types/draw";
import type {
  BlackjackMutationResponse,
  BlackjackStartRequest,
} from "@reward/shared-types/blackjack";
import type {
  HoldemCreateTableRequest,
  HoldemTableResponse,
} from "@reward/shared-types/holdem";
import type {
  PlayModeGameKey,
  PlayModeRequest,
  PlayModeSnapshot,
  PlayModeStateResponse,
  PlayModeType,
} from "@reward/shared-types/play-mode";

import { db } from "../../db";
import { conflictError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  runBlackjackDealerSideEffects,
  startResolvedBlackjack,
  startResolvedBlackjackInTransaction,
} from "../blackjack/service";
import { serializeBlackjackGame } from "../blackjack/blackjack-state";
import { persistGameState } from "../blackjack/blackjack-persistence";
import {
  buildDrawPlayResponseFromResult,
  classifyDrawPlayModeOutcome,
  executeResolvedDrawPlayInTransaction,
  type ResolvedDrawPlayResult,
} from "../draw/gacha";
import {
  createHoldemTable,
  createHoldemTableInTransaction,
  joinHoldemTable,
  persistTableState,
} from "../holdem/service";
import {
  buildHoldemRealtimeFanout,
  publishHoldemRealtimeUpdate,
} from "../holdem/realtime";
import { serializeHoldemRealtimeTable, serializeHoldemTable } from "../holdem/engine";
import type { HoldemTableState } from "../holdem/model";
import {
  cancelPlayModeSession,
  loadPlayModeSnapshotForMode,
  loadUserPlayModeSnapshot,
  lockUserPlayModeState,
  resolveSettledPlayMode,
  saveUserPlayModeState,
  setUserPlayModePreference,
  settlePlayModeSession,
  startPlayModeSession,
} from "./service";
import { releasePendingDeferredPayoutsForMode } from "./deferred-payouts";
import { applySettledPlayModePayoutPolicy } from "./deferred-payouts";

const DUAL_BET_EXECUTION_COUNT = 2;

const resolveRequestedType = (
  requestedMode: PlayModeRequest | null | undefined,
  storedMode: PlayModeType | null | undefined,
) => requestedMode?.type ?? storedMode ?? "standard";

const preparePlayModeExecution = async (params: {
  userId: number;
  gameKey: PlayModeGameKey;
  requestedMode?: PlayModeRequest | null;
}) =>
  db.transaction(async (tx) => {
    const row = await lockUserPlayModeState(tx, params.userId, params.gameKey);
    if (!row) {
      throw conflictError("Play mode preference is unavailable.");
    }

    const mode = resolveRequestedType(params.requestedMode, row.mode);
    const snapshot = await loadPlayModeSnapshotForMode(tx, {
      userId: params.userId,
      gameKey: params.gameKey,
      mode,
    });

    await saveUserPlayModeState({
      tx,
      rowId: row.id,
      snapshot,
    });

    return {
      rowId: row.id,
      snapshot,
    };
  });

const persistSettledPreference = async (params: {
  rowId: number;
  snapshot: PlayModeSnapshot;
}) => {
  await db.transaction(async (tx) => {
    await saveUserPlayModeState({
      tx,
      rowId: params.rowId,
      snapshot: params.snapshot,
    });
  });
};

const buildDualBetClientNonce = (
  clientNonce: string | null | undefined,
  executionIndex: number,
) => {
  const normalized = clientNonce?.trim();
  if (!normalized) {
    return null;
  }

  const prefix = `leg-${executionIndex}/${DUAL_BET_EXECUTION_COUNT}:`;
  const maxBaseLength = Math.max(1, 128 - prefix.length);
  return `${prefix}${normalized.slice(0, maxBaseLength)}`;
};

const clearPendingPayoutSnapshot = (
  snapshot: PlayModeSnapshot,
): PlayModeSnapshot => ({
  ...snapshot,
  carryActive: false,
  pendingPayoutAmount: "0.00",
  pendingPayoutCount: 0,
  snowballCarryAmount: "0.00",
  snowballEnvelopeAmount: "0.00",
});

const refreshSnapshotAfterPendingRelease = async (params: {
  userId: number;
  gameKey: PlayModeGameKey;
  rowId: number;
  snapshot: PlayModeSnapshot;
}) => {
  if (
    params.snapshot.type !== "deferred_double" ||
    params.snapshot.pendingPayoutCount <= 0
  ) {
    return params.snapshot;
  }

  return db.transaction(async (tx) => {
    const released = await releasePendingDeferredPayoutsForMode({
      tx,
      userId: params.userId,
      gameKey: params.gameKey,
      mode: params.snapshot.type,
    });
    if (released.count <= 0) {
      return params.snapshot;
    }

    const nextSnapshot = clearPendingPayoutSnapshot(params.snapshot);
    await saveUserPlayModeState({
      tx,
      rowId: params.rowId,
      snapshot: nextSnapshot,
    });
    return nextSnapshot;
  });
};

const summarizeDrawPlayResult = (result: ResolvedDrawPlayResult) => {
  const totalCost = result.records.reduce(
    (sum, record) => sum.plus(record.drawCost),
    toDecimal(0),
  );
  const totalReward = result.records.reduce(
    (sum, record) => sum.plus(record.rewardAmount),
    toDecimal(0),
  );

  return {
    actualCount: result.records.length,
    totalCost: toMoneyString(totalCost),
    totalReward: toMoneyString(totalReward),
    outcome: classifyDrawPlayModeOutcome(result.records),
  };
};

const mergeDrawPlayResults = (params: {
  requestedCount: number;
  snapshot: PlayModeSnapshot;
  results: ResolvedDrawPlayResult[];
}): ResolvedDrawPlayResult => {
  const records = params.results.flatMap((result) => result.records);
  const latestResult = params.results.at(-1);
  const outcome = classifyDrawPlayModeOutcome(records);

  return {
    requestedCount: params.requestedCount,
    records,
    endingBalance: latestResult?.endingBalance ?? "0.00",
    pityState: latestResult?.pityState ?? {
      enabled: false,
      currentStreak: 0,
      threshold: 0,
      boostPct: 0,
      maxBoostPct: 0,
      active: false,
      drawsUntilBoost: null,
    },
    playMode: resolveSettledPlayMode({
      snapshot: params.snapshot,
      outcome,
    }),
  };
};

export const getUserPlayModeState = async (
  userId: number,
  gameKey: PlayModeGameKey,
): Promise<PlayModeStateResponse> => ({
  gameKey,
  snapshot: await loadUserPlayModeSnapshot(db, userId, gameKey),
});

export const updateUserPlayModeState = async (
  userId: number,
  gameKey: PlayModeGameKey,
  payload: PlayModeRequest,
): Promise<PlayModeStateResponse> => ({
  gameKey,
  snapshot: await setUserPlayModePreference({
    db,
    userId,
    gameKey,
    mode: payload.type,
  }),
});

export const executeDrawPlayWithMode = async (
  userId: number,
  request: DrawPlayRequest,
): Promise<DrawPlayResponse> => {
  const prepared = await preparePlayModeExecution({
    userId,
    gameKey: "draw",
    requestedMode: request.playMode ?? null,
  });
  const snapshot = await refreshSnapshotAfterPendingRelease({
    userId,
    gameKey: "draw",
    rowId: prepared.rowId,
    snapshot: prepared.snapshot,
  });
  if (snapshot.type === "dual_bet") {
    const result = await db.transaction(async (tx) => {
      const parentSession = await startPlayModeSession({
        tx,
        userId,
        gameKey: "draw",
        mode: snapshot.type,
        snapshot,
        referenceType: "draw_request",
        metadata: {
          requestedCount: request.count,
          clientNonce: request.clientNonce ?? null,
          wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
        },
      });

      const legResults: ResolvedDrawPlayResult[] = [];
      const legMetadata: Array<{
        sessionId: number | null;
        executionIndex: number;
        requestedCount: number;
        actualCount: number;
        totalCost: string;
        totalReward: string;
        clientNonce: string | null;
        outcome: import("@reward/shared-types/play-mode").PlayModeOutcome;
      }> = [];

      for (
        let executionIndex = 1;
        executionIndex <= DUAL_BET_EXECUTION_COUNT;
        executionIndex += 1
      ) {
        const executionClientNonce = buildDualBetClientNonce(
          request.clientNonce,
          executionIndex,
        );
        const legSession = await startPlayModeSession({
          tx,
          userId,
          gameKey: "draw",
          mode: snapshot.type,
          snapshot,
          parentSessionId: parentSession?.id ?? null,
          referenceType: "draw_request",
          executionIndex,
          metadata: {
            requestedCount: request.count,
            clientNonce: executionClientNonce,
            wrapperExecutionIndex: executionIndex,
            wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
          },
        });
        const legResult = await executeResolvedDrawPlayInTransaction(
          tx,
          userId,
          {
            ...request,
            clientNonce: executionClientNonce,
          },
          snapshot,
        );
        const legSummary = summarizeDrawPlayResult(legResult);

        if (legSession) {
          await settlePlayModeSession({
            tx,
            sessionId: legSession.id,
            snapshot: legResult.playMode,
            outcome: legSummary.outcome,
            metadata: {
              requestedCount: request.count,
              actualCount: legSummary.actualCount,
              totalCost: legSummary.totalCost,
              totalReward: legSummary.totalReward,
              wageringRequirementDelta: legSummary.totalCost,
              clientNonce: executionClientNonce,
              wrapperExecutionIndex: executionIndex,
              wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
            },
          });
        }

        legResults.push(legResult);
        legMetadata.push({
          sessionId: legSession?.id ?? null,
          executionIndex,
          requestedCount: request.count,
          actualCount: legSummary.actualCount,
          totalCost: legSummary.totalCost,
          totalReward: legSummary.totalReward,
          clientNonce: executionClientNonce,
          outcome: legSummary.outcome,
        });
      }

      const mergedResult = mergeDrawPlayResults({
        requestedCount: request.count,
        snapshot,
        results: legResults,
      });
      const mergedSummary = summarizeDrawPlayResult(mergedResult);

      if (parentSession) {
        await settlePlayModeSession({
          tx,
          sessionId: parentSession.id,
          snapshot: mergedResult.playMode,
          outcome: mergedSummary.outcome,
          metadata: {
            requestedCount: request.count,
            actualCount: mergedSummary.actualCount,
            totalCost: mergedSummary.totalCost,
            totalReward: mergedSummary.totalReward,
            wageringRequirementDelta: mergedSummary.totalCost,
            clientNonce: request.clientNonce ?? null,
            wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
            legs: legMetadata,
          },
        });
      }

      await saveUserPlayModeState({
        tx,
        rowId: prepared.rowId,
        snapshot: mergedResult.playMode,
      });

      return mergedResult;
    });

    return buildDrawPlayResponseFromResult(result);
  }

  const session = await db.transaction(async (tx) =>
    startPlayModeSession({
      tx,
      userId,
      gameKey: "draw",
      mode: snapshot.type,
      snapshot,
      referenceType: "draw_request",
      metadata: {
        requestedCount: request.count,
        clientNonce: request.clientNonce ?? null,
      },
    }),
  );

  try {
    const result = await db.transaction(async (tx) => {
      const settled = await executeResolvedDrawPlayInTransaction(
        tx,
        userId,
        request,
        snapshot,
      );
      const totalReward = settled.records.reduce(
        (sum, record) => sum.plus(record.rewardAmount),
        toDecimal(0),
      );
      const playMode = await applySettledPlayModePayoutPolicy({
        tx,
        userId,
        gameKey: "draw",
        outcome: settled.playMode.lastOutcome ?? "miss",
        settledSnapshot: settled.playMode,
        netPayoutAmount: toMoneyString(totalReward),
        // Legacy play-mode schema still calls this "bonus", but draw maps it
        // to the B_LUCK asset in deferred-payouts.
        balanceType: "bonus",
        sessionId: session?.id ?? null,
        sourceReferenceType: "draw_record",
        sourceReferenceId: settled.records.at(-1)?.id ?? null,
      });

      if (session) {
        await settlePlayModeSession({
          tx,
          sessionId: session.id,
          snapshot: playMode,
          outcome: playMode.lastOutcome ?? "miss",
          metadata: {
            requestedCount: request.count,
            actualCount: settled.records.length,
            totalCost: toMoneyString(
              settled.records.reduce(
                (sum, record) => sum.plus(record.drawCost),
                toDecimal(0),
              ),
            ),
            totalReward: toMoneyString(totalReward),
          },
        });
      }

      await saveUserPlayModeState({
        tx,
        rowId: prepared.rowId,
        snapshot: playMode,
      });
      return {
        ...settled,
        playMode,
      };
    });

    return buildDrawPlayResponseFromResult(result);
  } catch (error) {
    if (session) {
      await db.transaction(async (tx) => {
        await cancelPlayModeSession({
          tx,
          sessionId: session.id,
          snapshot,
          metadata: {
            requestedCount: request.count,
            cancelled: true,
          },
        });
      });
    }
    throw error;
  }
};

export const startBlackjackWithMode = async (
  userId: number,
  request: BlackjackStartRequest,
): Promise<BlackjackMutationResponse> => {
  const prepared = await preparePlayModeExecution({
    userId,
    gameKey: "blackjack",
    requestedMode: request.playMode ?? null,
  });
  const snapshot = await refreshSnapshotAfterPendingRelease({
    userId,
    gameKey: "blackjack",
    rowId: prepared.rowId,
    snapshot: prepared.snapshot,
  });
  if (snapshot.type === "dual_bet") {
    const result = await db.transaction(async (tx) => {
      const parentSession = await startPlayModeSession({
        tx,
        userId,
        gameKey: "blackjack",
        mode: snapshot.type,
        snapshot,
        referenceType: "blackjack_game",
        metadata: {
          requestedStakeAmount: request.stakeAmount,
          clientNonce: request.clientNonce ?? null,
          wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
        },
      });
      const childSessions = await Promise.all(
        Array.from(
          { length: DUAL_BET_EXECUTION_COUNT },
          (_, index) =>
            startPlayModeSession({
              tx,
              userId,
              gameKey: "blackjack",
              mode: snapshot.type,
              snapshot,
              parentSessionId: parentSession?.id ?? null,
              referenceType: "blackjack_game",
              executionIndex: index + 1,
              metadata: {
                requestedStakeAmount: request.stakeAmount,
                clientNonce: buildDualBetClientNonce(
                  request.clientNonce,
                  index + 1,
                ),
                wrapperExecutionIndex: index + 1,
                wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
              },
            }),
        ),
      );
      const linkedGroupId = `blackjack-dual-bet:${parentSession?.id ?? userId}`;
      const legResults = [];

      for (let index = 0; index < DUAL_BET_EXECUTION_COUNT; index += 1) {
        const childSession = childSessions[index];
        const executionIndex = index + 1;
        const legResult = await startResolvedBlackjackInTransaction(tx, userId, {
          stakeAmount: request.stakeAmount,
          clientNonce: buildDualBetClientNonce(
            request.clientNonce,
            executionIndex,
          ),
          playMode: snapshot,
          playModeSessionId: childSession?.id ?? null,
          linkedGroup: {
            groupId: linkedGroupId,
            executionIndex,
            executionCount: DUAL_BET_EXECUTION_COUNT,
          },
        });
        legResults.push(legResult);
      }

      const orderedGames = legResults
        .map((result) => result.game)
        .sort(
          (left, right) =>
            (left.metadata.linkedGroup?.executionIndex ?? 1) -
            (right.metadata.linkedGroup?.executionIndex ?? 1),
        );
      const primaryGameId = orderedGames[0]?.id ?? null;
      const gameIds = orderedGames.map((game) => game.id);
      for (const game of orderedGames) {
        game.metadata.linkedGroup = {
          groupId: linkedGroupId,
          primaryGameId,
          gameIds,
          executionIndex: game.metadata.linkedGroup?.executionIndex ?? 1,
          executionCount: DUAL_BET_EXECUTION_COUNT,
        };
        await persistGameState(tx, game);
      }

      const latestLegResult = legResults.at(-1);
      if (!latestLegResult) {
        throw conflictError("Dual-bet blackjack could not be created.");
      }

      const endingBalance = latestLegResult.response.balance;
      const serializedGames = orderedGames.map((game) =>
        serializeBlackjackGame(game, toDecimal(endingBalance)),
      );

      return {
        response: {
          balance: endingBalance,
          playMode: latestLegResult.response.playMode,
          games: serializedGames,
          game: serializedGames[0] ?? latestLegResult.response.game,
        },
        legResults,
      };
    });

    for (const legResult of result.legResults) {
      runBlackjackDealerSideEffects({
        userId,
        response: legResult.response,
        dealerEvents: legResult.dealerEvents,
        dealerLanguageTask: legResult.dealerLanguageTask,
      });
    }

    return result.response;
  }

  const session = await db.transaction(async (tx) =>
    startPlayModeSession({
      tx,
      userId,
      gameKey: "blackjack",
      mode: snapshot.type,
      snapshot,
      referenceType: "blackjack_game",
      metadata: {
        requestedStakeAmount: request.stakeAmount,
        clientNonce: request.clientNonce ?? null,
      },
    }),
  );

  try {
    const response = await startResolvedBlackjack(userId, {
      stakeAmount: request.stakeAmount,
      clientNonce: request.clientNonce ?? null,
      playMode: snapshot,
      playModeSessionId: session?.id ?? null,
    });

    if (response.game.status !== "active") {
      await persistSettledPreference({
        rowId: prepared.rowId,
        snapshot: response.playMode,
      });
    }

    return response;
  } catch (error) {
    if (session) {
      await db.transaction(async (tx) => {
        await cancelPlayModeSession({
          tx,
          sessionId: session.id,
          snapshot,
          metadata: {
            requestedStakeAmount: request.stakeAmount,
            cancelled: true,
          },
        });
      });
    }
    throw error;
  }
};

const scaleHoldemBuyInAmount = (
  buyInAmount: string,
  snapshot: PlayModeSnapshot,
) =>
  toMoneyString(
    toDecimal(buyInAmount).mul(
      snapshot.type === "dual_bet" ? 1 : snapshot.appliedMultiplier,
    ),
  );

const buildDualBetHoldemTableName = (
  tableName: string | null | undefined,
  executionIndex: number,
) => {
  const baseName = tableName?.trim() || "Hold'em";
  return `${baseName} [${executionIndex}/${DUAL_BET_EXECUTION_COUNT}]`;
};

const buildHoldemDualBetFanout = (params: {
  state: HoldemTableState;
  eventTypes: string[];
}) =>
  buildHoldemRealtimeFanout({
    state: params.state,
    update: {
      table: serializeHoldemRealtimeTable(params.state),
      handHistoryId: null,
      roundId: null,
      actorSeatIndex: 0,
      action: null,
      timedOut: false,
      eventTypes: params.eventTypes,
    },
  });

export const createHoldemTableWithMode = async (
  userId: number,
  params: Pick<
    HoldemCreateTableRequest,
    "tableName" | "buyInAmount" | "tableType" | "maxSeats" | "botCount" | "tournament"
  >,
): Promise<HoldemTableResponse> => {
  const prepared = await preparePlayModeExecution({
    userId,
    gameKey: "holdem",
  });
  const snapshot = await refreshSnapshotAfterPendingRelease({
    userId,
    gameKey: "holdem",
    rowId: prepared.rowId,
    snapshot: prepared.snapshot,
  });
  const effectiveBuyInAmount = scaleHoldemBuyInAmount(
    params.buyInAmount,
    snapshot,
  );

  if (snapshot.type === "dual_bet") {
    const result = await db.transaction(async (tx) => {
      const parentSession = await startPlayModeSession({
        tx,
        userId,
        gameKey: "holdem",
        mode: snapshot.type,
        snapshot,
        referenceType: "holdem_table",
        metadata: {
          baseBuyInAmount: params.buyInAmount,
          effectiveBuyInAmount,
          tableName: params.tableName?.trim() || null,
          tableType: params.tableType ?? "cash",
          maxSeats: params.maxSeats ?? null,
          wrapperExecutionCount: DUAL_BET_EXECUTION_COUNT,
        },
      });
      const groupId = `holdem-dual-bet:${parentSession?.id ?? userId}`;

      const leftTable = await createHoldemTableInTransaction(
        tx,
        userId,
        {
          ...params,
          tableName: buildDualBetHoldemTableName(params.tableName, 1),
          buyInAmount: effectiveBuyInAmount,
        },
        {
          linkedGroup: {
            groupId,
            primaryTableId: null,
            tableIds: [],
            executionIndex: 1,
            executionCount: DUAL_BET_EXECUTION_COUNT,
          },
          maxExistingSeatCount: 0,
        },
      );
      const leftSession = await startPlayModeSession({
        tx,
        userId,
        gameKey: "holdem",
        mode: snapshot.type,
        snapshot,
        parentSessionId: parentSession?.id ?? null,
        referenceType: "holdem_table",
        referenceId: leftTable.state.id,
        executionIndex: 1,
        metadata: {
          baseBuyInAmount: params.buyInAmount,
          effectiveBuyInAmount,
          tableId: leftTable.state.id,
          tableName: leftTable.state.name,
          groupId,
          executionIndex: 1,
          executionCount: DUAL_BET_EXECUTION_COUNT,
        },
      });

      const rightTable = await createHoldemTableInTransaction(
        tx,
        userId,
        {
          ...params,
          tableName: buildDualBetHoldemTableName(params.tableName, 2),
          buyInAmount: effectiveBuyInAmount,
        },
        {
          linkedGroup: {
            groupId,
            primaryTableId: null,
            tableIds: [],
            executionIndex: 2,
            executionCount: DUAL_BET_EXECUTION_COUNT,
          },
          maxExistingSeatCount: 1,
        },
      );
      const rightSession = await startPlayModeSession({
        tx,
        userId,
        gameKey: "holdem",
        mode: snapshot.type,
        snapshot,
        parentSessionId: parentSession?.id ?? null,
        referenceType: "holdem_table",
        referenceId: rightTable.state.id,
        executionIndex: 2,
        metadata: {
          baseBuyInAmount: params.buyInAmount,
          effectiveBuyInAmount,
          tableId: rightTable.state.id,
          tableName: rightTable.state.name,
          groupId,
          executionIndex: 2,
          executionCount: DUAL_BET_EXECUTION_COUNT,
        },
      });

      const primaryTableId = leftTable.state.id;
      const tableIds = [leftTable.state.id, rightTable.state.id];
      for (const state of [leftTable.state, rightTable.state]) {
        state.metadata.linkedGroup = {
          groupId,
          primaryTableId,
          tableIds,
          executionIndex: state.metadata.linkedGroup?.executionIndex ?? 1,
          executionCount: DUAL_BET_EXECUTION_COUNT,
        };
        await persistTableState(tx, state);
      }

      const tables = [
        serializeHoldemTable(leftTable.state, userId),
        serializeHoldemTable(rightTable.state, userId),
      ];

      return {
        response: {
          table: tables[0] ?? leftTable.response.table,
          tables,
        } satisfies HoldemTableResponse,
        fanouts: [
          buildHoldemDualBetFanout({
            state: leftTable.state,
            eventTypes: leftTable.fanout.publicUpdate.eventTypes,
          }),
          buildHoldemDualBetFanout({
            state: rightTable.state,
            eventTypes: rightTable.fanout.publicUpdate.eventTypes,
          }),
        ],
      };
    });

    for (const fanout of result.fanouts) {
      publishHoldemRealtimeUpdate(fanout);
    }

    return result.response;
  }

  const response = await createHoldemTable(userId, {
    tableName: params.tableName,
    buyInAmount: effectiveBuyInAmount,
    tableType: params.tableType,
    maxSeats: params.maxSeats,
    botCount: params.botCount,
    tournament: params.tournament,
  });

  await db.transaction(async (tx) => {
    await startPlayModeSession({
      tx,
      userId,
      gameKey: "holdem",
      mode: snapshot.type,
      snapshot,
      referenceType: "holdem_table",
      referenceId: response.table.id,
      metadata: {
        baseBuyInAmount: params.buyInAmount,
        effectiveBuyInAmount,
        tableId: response.table.id,
        tableName: response.table.name,
        tableType: response.table.tableType,
        maxSeats: response.table.maxSeats,
      },
    });
  });

  return response;
};

export const joinHoldemTableWithMode = async (
  userId: number,
  tableId: number,
  params: { buyInAmount: string },
): Promise<HoldemTableResponse> => {
  const prepared = await preparePlayModeExecution({
    userId,
    gameKey: "holdem",
  });
  const snapshot = await refreshSnapshotAfterPendingRelease({
    userId,
    gameKey: "holdem",
    rowId: prepared.rowId,
    snapshot: prepared.snapshot,
  });
  if (snapshot.type === "dual_bet") {
    throw conflictError(
      "Holdem dual bet is only supported when opening linked tables.",
    );
  }
  const effectiveBuyInAmount = scaleHoldemBuyInAmount(
    params.buyInAmount,
    snapshot,
  );
  const response = await joinHoldemTable(userId, tableId, {
    buyInAmount: effectiveBuyInAmount,
  });

  await db.transaction(async (tx) => {
    await startPlayModeSession({
      tx,
      userId,
      gameKey: "holdem",
      mode: snapshot.type,
      snapshot,
      referenceType: "holdem_table",
      referenceId: response.table.id,
      metadata: {
        baseBuyInAmount: params.buyInAmount,
        effectiveBuyInAmount,
        tableId: response.table.id,
        tableName: response.table.name,
      },
    });
  });

  return response;
};
