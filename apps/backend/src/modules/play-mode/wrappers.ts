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
  startResolvedBlackjack,
} from "../blackjack/service";
import {
  buildDrawPlayResponseFromResult,
  executeResolvedDrawPlayInTransaction,
} from "../draw/gacha";
import {
  createHoldemTable,
  joinHoldemTable,
} from "../holdem/service";
import {
  cancelPlayModeSession,
  loadPlayModeSnapshotForMode,
  loadUserPlayModeSnapshot,
  lockUserPlayModeState,
  saveUserPlayModeState,
  setUserPlayModePreference,
  settlePlayModeSession,
  startPlayModeSession,
} from "./service";

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
  const session = await db.transaction(async (tx) =>
    startPlayModeSession({
      tx,
      userId,
      gameKey: "draw",
      mode: prepared.snapshot.type,
      snapshot: prepared.snapshot,
      referenceType: "draw_request",
      metadata: {
        requestedCount: request.count,
        clientNonce: request.clientNonce ?? null,
      },
    }),
  );

  try {
    const result = await db.transaction((tx) =>
      executeResolvedDrawPlayInTransaction(tx, userId, request, prepared.snapshot),
    );
    const response = await buildDrawPlayResponseFromResult(result);

    await db.transaction(async (tx) => {
      if (session) {
        await settlePlayModeSession({
          tx,
          sessionId: session.id,
          snapshot: response.playMode,
          outcome: response.playMode.lastOutcome ?? "miss",
          metadata: {
            requestedCount: request.count,
            actualCount: response.count,
            totalCost: response.totalCost,
            totalReward: response.totalReward,
          },
        });
      }

      await saveUserPlayModeState({
        tx,
        rowId: prepared.rowId,
        snapshot: response.playMode,
      });
    });

    return response;
  } catch (error) {
    if (session) {
      await db.transaction(async (tx) => {
        await cancelPlayModeSession({
          tx,
          sessionId: session.id,
          snapshot: prepared.snapshot,
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
  const session = await db.transaction(async (tx) =>
    startPlayModeSession({
      tx,
      userId,
      gameKey: "blackjack",
      mode: prepared.snapshot.type,
      snapshot: prepared.snapshot,
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
      playMode: prepared.snapshot,
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
          snapshot: prepared.snapshot,
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
    toDecimal(buyInAmount).mul(snapshot.appliedMultiplier),
  );

export const createHoldemTableWithMode = async (
  userId: number,
  params: Pick<
    HoldemCreateTableRequest,
    "tableName" | "buyInAmount" | "tableType" | "maxSeats" | "tournament"
  >,
): Promise<HoldemTableResponse> => {
  const prepared = await preparePlayModeExecution({
    userId,
    gameKey: "holdem",
  });
  const effectiveBuyInAmount = scaleHoldemBuyInAmount(
    params.buyInAmount,
    prepared.snapshot,
  );
  const response = await createHoldemTable(userId, {
    tableName: params.tableName,
    buyInAmount: effectiveBuyInAmount,
    tableType: params.tableType,
    maxSeats: params.maxSeats,
    tournament: params.tournament,
  });

  await db.transaction(async (tx) => {
    await startPlayModeSession({
      tx,
      userId,
      gameKey: "holdem",
      mode: prepared.snapshot.type,
      snapshot: prepared.snapshot,
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
  const effectiveBuyInAmount = scaleHoldemBuyInAmount(
    params.buyInAmount,
    prepared.snapshot,
  );
  const response = await joinHoldemTable(userId, tableId, {
    buyInAmount: effectiveBuyInAmount,
  });

  await db.transaction(async (tx) => {
    await startPlayModeSession({
      tx,
      userId,
      gameKey: "holdem",
      mode: prepared.snapshot.type,
      snapshot: prepared.snapshot,
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
