import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  BlackjackAction,
  BlackjackFairness,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";

import { db } from "../../db";
import {
  conflictError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { ensureFairnessSeed, getFairnessCommit } from "../fairness/service";
import { getBlackjackConfig, getPoolSystemConfig } from "../system/service";
import {
  buildFairnessAlgorithmLabel,
  drawBlackjackDeck,
  resolveClientNonce,
  resolveStakeAmount,
  scoreBlackjackCards,
} from "./game";
import {
  advancePlayerHand,
  advanceResolvableHands,
  appendActionHistory,
  getActivePlayerHand,
  getAvailableActions,
  resolveInitialOutcome,
  serializeBlackjackGame,
  serializeBlackjackSummary,
  takeNextCard,
  toGameState,
} from "./blackjack-state";
import {
  applyStakeDebit,
  ensurePoolCanCover,
  getWalletBalanceForBlackjack,
  insertInitialGame,
  loadBlackjackGameRows,
  loadLockedBlackjackUser,
  persistGameState,
  settleGameByStatus,
  settleResolvedHands,
} from "./blackjack-persistence";

export { drawBlackjackDeck, scoreBlackjackCards } from "./game";

export async function getBlackjackOverview(
  userId: number,
): Promise<BlackjackOverviewResponse> {
  const [walletBalance, poolSystem, blackjackConfig] = await Promise.all([
    getWalletBalanceForBlackjack(userId),
    getPoolSystemConfig(db),
    getBlackjackConfig(db),
  ]);
  const [fairness, activeRows, recentRows] = await Promise.all([
    getFairnessCommit(db, Number(poolSystem.epochSeconds ?? 0)),
    loadBlackjackGameRows(db, { userId }),
    loadBlackjackGameRows(db, { userId, settledOnly: true }),
  ]);

  const activeGame = activeRows[0] ? toGameState(activeRows[0]) : null;
  const recentGames = recentRows.map((row) =>
    serializeBlackjackSummary(toGameState(row)),
  );
  const balance = toDecimal(walletBalance);

  return {
    balance: toMoneyString(balance),
    config: activeGame?.metadata.config ?? blackjackConfig,
    fairness,
    activeGame: activeGame ? serializeBlackjackGame(activeGame, balance) : null,
    recentGames,
  };
}

export async function startBlackjack(
  userId: number,
  options: {
    stakeAmount: string;
    clientNonce?: string | null;
  },
): Promise<BlackjackMutationResponse> {
  return db.transaction(async (tx) => {
    const user = await loadLockedBlackjackUser(tx, userId);
    if (!user) {
      throw notFoundError("User not found.");
    }

    const [existingGame] = await loadBlackjackGameRows(tx, {
      userId,
      lock: true,
    });
    if (existingGame) {
      throw conflictError(
        "Finish the active blackjack game before starting a new one.",
      );
    }

    const blackjackConfig = await getBlackjackConfig(tx);
    const minStakeAmount = toDecimal(blackjackConfig.minStake);
    const maxStakeAmount = toDecimal(blackjackConfig.maxStake);
    const naturalPayoutMultiplier = toDecimal(
      blackjackConfig.naturalPayoutMultiplier,
    );
    const stakeAmount = resolveStakeAmount(options.stakeAmount);
    if (stakeAmount.lt(minStakeAmount) || stakeAmount.gt(maxStakeAmount)) {
      throw conflictError("Stake amount is outside the allowed range.", {
        code: API_ERROR_CODES.STAKE_AMOUNT_OUT_OF_RANGE,
      });
    }

    const walletBefore = toDecimal(user.withdrawable_balance ?? 0);
    const wageredBefore = toDecimal(user.wagered_amount ?? 0);
    if (walletBefore.lt(stakeAmount)) {
      throw conflictError("Insufficient balance.", {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    await ensurePoolCanCover(tx, {
      additionalStake: stakeAmount,
      maximumPayout: stakeAmount.mul(naturalPayoutMultiplier),
    });

    const poolSystem = await getPoolSystemConfig(tx);
    const fairnessSeed = await ensureFairnessSeed(
      tx,
      Number(poolSystem.epochSeconds ?? 0),
    );
    const { clientNonce, nonceSource } = resolveClientNonce(
      options.clientNonce,
    );
    const { deck, rngDigest, deckDigest } = drawBlackjackDeck({
      seed: fairnessSeed.seed,
      userId,
      clientNonce,
    });
    const fairness: BlackjackFairness = {
      epoch: fairnessSeed.epoch,
      epochSeconds: fairnessSeed.epochSeconds,
      commitHash: fairnessSeed.commitHash,
      clientNonce,
      nonceSource,
      rngDigest,
      deckDigest,
      algorithm: buildFairnessAlgorithmLabel(blackjackConfig),
    };

    const playerCards = [deck[0], deck[2]];
    const dealerCards = [deck[1], deck[3]];
    const game = await insertInitialGame({
      tx,
      userId,
      stakeAmount,
      totalStake: stakeAmount,
      playerCards,
      dealerCards,
      deck,
      nextCardIndex: 4,
      config: blackjackConfig,
      fairness,
    });

    const { walletAfter } = await applyStakeDebit({
      tx,
      userId,
      referenceId: game.id,
      walletBefore,
      wageredBefore,
      stakeAmount,
      entryType: "blackjack_stake",
    });

    const initialStatus = resolveInitialOutcome(game);
    if (initialStatus !== "active") {
      const settled = await settleGameByStatus({
        tx,
        game,
        status: initialStatus,
        walletBalance: walletAfter,
      });
      return {
        balance: toMoneyString(settled.balance),
        game: serializeBlackjackGame(settled.game, settled.balance),
      };
    }

    return {
      balance: toMoneyString(walletAfter),
      game: serializeBlackjackGame(game, walletAfter),
    };
  });
}

export async function actOnBlackjack(
  userId: number,
  gameId: number,
  action: BlackjackAction,
): Promise<BlackjackMutationResponse> {
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
    if (activeRow.id !== gameId) {
      throw conflictError("Blackjack game is no longer active.");
    }

    const game = toGameState(activeRow);
    let walletBalance = toDecimal(user.withdrawable_balance ?? 0);
    let wageredAmount = toDecimal(user.wagered_amount ?? 0);

    const availableActions = getAvailableActions(game, walletBalance);
    if (!availableActions.includes(action)) {
      throw conflictError("That action is not available for the current hand.");
    }

    const persistOrSettleAfterAutoAdvance = async () => {
      const allHandsComplete = advanceResolvableHands(game, walletBalance);
      if (allHandsComplete) {
        const settled = await settleResolvedHands({
          tx,
          game,
          walletBalance,
        });
        return {
          balance: toMoneyString(settled.balance),
          game: serializeBlackjackGame(settled.game, settled.balance),
        };
      }

      await persistGameState(tx, game);
      return {
        balance: toMoneyString(walletBalance),
        game: serializeBlackjackGame(game, walletBalance),
      };
    };

    const activeHandIndex = game.metadata.activeHandIndex;
    const activeHand = getActivePlayerHand(game);
    if (activeHandIndex === null || !activeHand) {
      throw internalInvariantError("Blackjack active hand is missing.");
    }

    if (action === "hit") {
      const card = takeNextCard(game);
      activeHand.cards.push(card);
      const playerScore = scoreBlackjackCards(activeHand.cards);
      appendActionHistory(game, {
        action: "hit",
        actor: "player",
        card,
        handIndex: activeHandIndex,
        total: playerScore.total,
      });

      if (playerScore.bust || playerScore.total === 21) {
        return persistOrSettleAfterAutoAdvance();
      }

      await persistGameState(tx, game);
      return {
        balance: toMoneyString(walletBalance),
        game: serializeBlackjackGame(game, walletBalance),
      };
    }

    if (action === "double") {
      const stakeAmount = toDecimal(activeHand.stakeAmount);
      if (walletBalance.lt(stakeAmount)) {
        throw conflictError("Insufficient balance for double down.", {
          code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
        });
      }

      await ensurePoolCanCover(tx, {
        additionalStake: stakeAmount,
        maximumPayout: toDecimal(game.totalStake)
          .plus(stakeAmount)
          .mul(toDecimal(game.metadata.config.winPayoutMultiplier)),
      });

      const extraStake = await applyStakeDebit({
        tx,
        userId,
        referenceId: game.id,
        walletBefore: walletBalance,
        wageredBefore: wageredAmount,
        stakeAmount,
        entryType: "blackjack_double_down",
      });
      walletBalance = extraStake.walletAfter;
      wageredAmount = extraStake.wageredAfter;
      game.totalStake = toMoneyString(
        toDecimal(game.totalStake).plus(stakeAmount),
      );

      const card = takeNextCard(game);
      activeHand.stakeAmount = toMoneyString(
        toDecimal(activeHand.stakeAmount).plus(stakeAmount),
      );
      activeHand.cards.push(card);
      const playerScore = scoreBlackjackCards(activeHand.cards);
      appendActionHistory(game, {
        action: "double",
        actor: "player",
        card,
        handIndex: activeHandIndex,
        total: playerScore.total,
      });

      const allHandsComplete = advancePlayerHand(
        game,
        playerScore.bust ? "bust" : "stood",
      );
      if (allHandsComplete) {
        const settled = await settleResolvedHands({
          tx,
          game,
          walletBalance,
        });
        return {
          balance: toMoneyString(settled.balance),
          game: serializeBlackjackGame(settled.game, settled.balance),
        };
      }

      return persistOrSettleAfterAutoAdvance();
    }

    if (action === "split") {
      const stakeAmount = toDecimal(activeHand.stakeAmount);
      await ensurePoolCanCover(tx, {
        additionalStake: stakeAmount,
        maximumPayout: toDecimal(game.totalStake)
          .plus(stakeAmount)
          .mul(toDecimal(game.metadata.config.winPayoutMultiplier)),
      });

      const extraStake = await applyStakeDebit({
        tx,
        userId,
        referenceId: game.id,
        walletBefore: walletBalance,
        wageredBefore: wageredAmount,
        stakeAmount,
        entryType: "blackjack_split",
      });
      walletBalance = extraStake.walletAfter;
      wageredAmount = extraStake.wageredAfter;
      game.totalStake = toMoneyString(
        toDecimal(game.totalStake).plus(stakeAmount),
      );

      const [leftCard, rightCard] = activeHand.cards;
      if (!leftCard || !rightCard) {
        throw internalInvariantError("Blackjack split hand is missing cards.");
      }
      const leftDraw = takeNextCard(game);
      const rightDraw = takeNextCard(game);
      const splitStakeAmount = toMoneyString(stakeAmount);

      activeHand.cards = [leftCard, leftDraw];
      activeHand.stakeAmount = splitStakeAmount;
      activeHand.state = "active";
      activeHand.splitFromAces =
        leftCard.rank === "A" && rightCard.rank === "A";

      game.metadata.playerHands.splice(activeHandIndex + 1, 0, {
        cards: [rightCard, rightDraw],
        stakeAmount: splitStakeAmount,
        state: "waiting",
        splitFromAces: leftCard.rank === "A" && rightCard.rank === "A",
      });

      appendActionHistory(game, {
        action: "split",
        actor: "player",
        handIndex: activeHandIndex,
        total: scoreBlackjackCards(activeHand.cards).total,
      });
      appendActionHistory(game, {
        action: "split_draw",
        actor: "player",
        card: leftDraw,
        handIndex: activeHandIndex,
        total: scoreBlackjackCards(activeHand.cards).total,
      });
      appendActionHistory(game, {
        action: "split_draw",
        actor: "player",
        card: rightDraw,
        handIndex: activeHandIndex + 1,
        total: scoreBlackjackCards([rightCard, rightDraw]).total,
      });

      return persistOrSettleAfterAutoAdvance();
    }

    appendActionHistory(game, {
      action: "stand",
      actor: "player",
      handIndex: activeHandIndex,
      total: scoreBlackjackCards(activeHand.cards).total,
    });
    const allHandsComplete = advancePlayerHand(game, "stood");
    if (allHandsComplete) {
      const settled = await settleResolvedHands({
        tx,
        game,
        walletBalance,
      });
      return {
        balance: toMoneyString(settled.balance),
        game: serializeBlackjackGame(settled.game, settled.balance),
      };
    }

    return persistOrSettleAfterAutoAdvance();
  });
}
