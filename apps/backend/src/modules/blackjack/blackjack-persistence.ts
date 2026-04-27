import { eq, sql } from "@reward/database/orm";
import type {
  BlackjackCard,
  BlackjackConfig,
  BlackjackFairness,
  BlackjackGameStatus,
} from "@reward/shared-types/blackjack";
import { blackjackGames, userWallets, users } from "@reward/database";

import { db, type DbTransaction } from "../../db";
import { persistenceError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import {
  applyTransactionalGamePayoutCredit,
  applyTransactionalGameStakeDebit,
  assertTransactionalGamePoolCoverage,
  loadTransactionalGamePoolSnapshot,
} from "../shared/transactional-game-runner";
import {
  BLACKJACK_REFERENCE_TYPE,
  BlackjackGameRowsSchema,
  LockedBlackjackUserRowsSchema,
  MAX_RECENT_GAMES,
  parseSqlRows,
  toJsonbLiteral,
  type DbExecutor,
  type BlackjackGameState,
  type LockedBlackjackUserRow,
} from "./game";
import {
  appendActionHistory,
  playDealerHand,
  resolveAggregateSettledStatus,
  resolveSettledHandOutcomes,
  resolveSettledStatusPayoutAmount,
  summarizePlayerTotals,
  syncLegacyPlayerCards,
  toGameState,
} from "./blackjack-state";

export const loadLockedBlackjackUser = async (
  tx: DbTransaction,
  userId: number,
): Promise<LockedBlackjackUserRow | null> => {
  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();

  const result = await tx.execute(sql`
    SELECT u.id,
           w.withdrawable_balance,
           w.wagered_amount
    FROM ${users} u
    JOIN ${userWallets} w ON w.user_id = u.id
    WHERE u.id = ${userId}
    FOR UPDATE
  `);

  const rows = parseSqlRows(
    LockedBlackjackUserRowsSchema,
    result,
    "Invalid blackjack user snapshot.",
  );

  return rows[0] ?? null;
};

export const loadBlackjackGameRows = async (
  executor: DbExecutor,
  params: { userId: number; settledOnly?: boolean; lock?: boolean },
) => {
  const { userId, settledOnly = false, lock = false } = params;
  const statusCondition = settledOnly
    ? sql`AND status <> 'active'`
    : sql`AND status = 'active'`;
  const lockClause = lock ? sql`FOR UPDATE` : sql``;
  const limit = settledOnly ? sql`LIMIT ${MAX_RECENT_GAMES}` : sql`LIMIT 1`;

  const result = await executor.execute(sql`
    SELECT id,
           user_id AS "userId",
           stake_amount AS "stakeAmount",
           total_stake AS "totalStake",
           payout_amount AS "payoutAmount",
           player_cards AS "playerCards",
           dealer_cards AS "dealerCards",
           deck,
           next_card_index AS "nextCardIndex",
           status,
           metadata,
           settled_at AS "settledAt",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM ${blackjackGames}
    WHERE user_id = ${userId}
      ${statusCondition}
    ORDER BY created_at DESC
    ${limit}
    ${lockClause}
  `);

  return parseSqlRows(
    BlackjackGameRowsSchema,
    result,
    "Invalid blackjack game row.",
  );
};

export const ensurePoolCanCover = async (
  tx: DbTransaction,
  params: {
    additionalStake?: ReturnType<typeof toDecimal>;
    maximumPayout: ReturnType<typeof toDecimal>;
  },
) => {
  const snapshot = await loadTransactionalGamePoolSnapshot(tx);
  assertTransactionalGamePoolCoverage(snapshot, params);
};

export const persistGameState = async (
  tx: DbTransaction,
  game: BlackjackGameState,
) => {
  const now = new Date();
  syncLegacyPlayerCards(game);
  game.updatedAt = now;

  await tx.execute(sql`
    UPDATE ${blackjackGames}
    SET stake_amount = ${toMoneyString(game.stakeAmount)},
        total_stake = ${toMoneyString(game.totalStake)},
        payout_amount = ${toMoneyString(game.payoutAmount)},
        player_cards = ${toJsonbLiteral(game.playerCards)},
        dealer_cards = ${toJsonbLiteral(game.dealerCards)},
        deck = ${toJsonbLiteral(game.deck)},
        next_card_index = ${game.nextCardIndex},
        status = ${game.status},
        metadata = ${toJsonbLiteral(game.metadata)},
        settled_at = ${game.settledAt ? new Date(game.settledAt) : null},
        updated_at = ${now}
    WHERE id = ${game.id}
  `);
};

export const applyStakeDebit = async (params: {
  tx: DbTransaction;
  userId: number;
  referenceId: number;
  walletBefore: ReturnType<typeof toDecimal>;
  wageredBefore: ReturnType<typeof toDecimal>;
  stakeAmount: ReturnType<typeof toDecimal>;
  entryType: string;
}) => {
  const {
    tx,
    userId,
    referenceId,
    walletBefore,
    wageredBefore,
    stakeAmount,
    entryType,
  } = params;
  return applyTransactionalGameStakeDebit({
    tx,
    userId,
    reference: {
      type: BLACKJACK_REFERENCE_TYPE,
      id: referenceId,
    },
    walletBefore,
    wageredBefore,
    stakeAmount,
    entryType,
    ledgerMetadata: null,
    houseMetadata: { userId },
  });
};

const applyPayoutCredit = async (params: {
  tx: DbTransaction;
  userId: number;
  referenceId: number;
  walletBefore: ReturnType<typeof toDecimal>;
  payoutAmount: ReturnType<typeof toDecimal>;
  status: BlackjackGameStatus;
}) => {
  const { tx, userId, referenceId, walletBefore, payoutAmount, status } =
    params;
  return applyTransactionalGamePayoutCredit({
    tx,
    userId,
    reference: {
      type: BLACKJACK_REFERENCE_TYPE,
      id: referenceId,
    },
    walletBefore,
    payoutAmount,
    entryType: "blackjack_payout",
    ledgerMetadata: { status },
    houseMetadata: { userId, status },
  });
};

export const settleGameByStatus = async (params: {
  tx: DbTransaction;
  game: BlackjackGameState;
  status: BlackjackGameStatus;
  walletBalance: ReturnType<typeof toDecimal>;
}) => {
  const { tx, game, status, walletBalance } = params;
  const payoutAmount = resolveSettledStatusPayoutAmount(
    status,
    toDecimal(game.stakeAmount),
    toDecimal(game.totalStake),
    game.metadata.config,
  );
  game.status = status;
  game.payoutAmount = toMoneyString(payoutAmount);
  game.settledAt = new Date();
  game.metadata.activeHandIndex = null;
  appendActionHistory(game, {
    action: "settle",
    actor: "system",
    total: summarizePlayerTotals(game).primaryTotal,
    status,
  });

  await persistGameState(tx, game);
  const nextWalletBalance = await applyPayoutCredit({
    tx,
    userId: game.userId,
    referenceId: game.id,
    walletBefore: walletBalance,
    payoutAmount,
    status,
  });

  return {
    balance: nextWalletBalance,
    game,
  };
};

export const settleResolvedHands = async (params: {
  tx: DbTransaction;
  game: BlackjackGameState;
  walletBalance: ReturnType<typeof toDecimal>;
}) => {
  const { tx, game, walletBalance } = params;
  const dealerScore = playDealerHand(game);
  const { outcomes } = resolveSettledHandOutcomes(game);
  const payoutAmount = outcomes.reduce(
    (sum, outcome) => sum.plus(outcome.payoutAmount),
    toDecimal(0),
  );
  const status = resolveAggregateSettledStatus(game, dealerScore, outcomes);

  game.status = status;
  game.payoutAmount = toMoneyString(payoutAmount);
  game.settledAt = new Date();
  game.metadata.activeHandIndex = null;
  appendActionHistory(game, {
    action: "settle",
    actor: "system",
    total: summarizePlayerTotals(game).primaryTotal,
    status,
  });

  await persistGameState(tx, game);
  const nextWalletBalance = await applyPayoutCredit({
    tx,
    userId: game.userId,
    referenceId: game.id,
    walletBefore: walletBalance,
    payoutAmount,
    status,
  });

  return {
    balance: nextWalletBalance,
    game,
  };
};

export const insertInitialGame = async (params: {
  tx: DbTransaction;
  userId: number;
  stakeAmount: ReturnType<typeof toDecimal>;
  totalStake: ReturnType<typeof toDecimal>;
  playerCards: BlackjackCard[];
  dealerCards: BlackjackCard[];
  deck: BlackjackCard[];
  nextCardIndex: number;
  config: BlackjackConfig;
  fairness: BlackjackFairness;
}) => {
  await params.tx.execute(sql`
    INSERT INTO ${blackjackGames} (
      user_id,
      stake_amount,
      total_stake,
      payout_amount,
      player_cards,
      dealer_cards,
      deck,
      next_card_index,
      status,
      metadata
    )
    VALUES (
      ${params.userId},
      ${toMoneyString(params.stakeAmount)},
      ${toMoneyString(params.totalStake)},
      ${"0.00"},
      ${toJsonbLiteral(params.playerCards)},
      ${toJsonbLiteral(params.dealerCards)},
      ${toJsonbLiteral(params.deck)},
      ${params.nextCardIndex},
      ${"active"},
      ${toJsonbLiteral({
        config: params.config,
        fairness: params.fairness,
        actionHistory: [{ action: "start", actor: "player" }],
        playerHands: [
          {
            cards: params.playerCards,
            stakeAmount: toMoneyString(params.stakeAmount),
            state: "active",
            splitFromAces: false,
          },
        ],
        activeHandIndex: 0,
      })}
    )
  `);

  const [created] = await loadBlackjackGameRows(params.tx, {
    userId: params.userId,
    lock: true,
  });

  if (!created) {
    throw persistenceError("Failed to create blackjack game.");
  }

  return toGameState(created);
};

export const getWalletBalanceForBlackjack = async (userId: number) => {
  await db.insert(userWallets).values({ userId }).onConflictDoNothing();

  const [wallet] = await db
    .select({ balance: userWallets.withdrawableBalance })
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .limit(1);

  return wallet?.balance ?? "0.00";
};
