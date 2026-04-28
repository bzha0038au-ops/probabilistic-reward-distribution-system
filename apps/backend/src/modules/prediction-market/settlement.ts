import Decimal from "decimal.js";

import { internalInvariantError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";

export type SettlementPosition = {
  id: number;
  userId: number;
  outcomeKey: string;
  stakeAmount: string;
};

export type SettlementPositionResult = {
  id: number;
  userId: number;
  payoutAmount: string;
  status: "won" | "lost" | "refunded";
};

export type PariMutuelSettlementResult = {
  mode: "payout" | "refund_no_winners";
  totalPoolAmount: string;
  winningPoolAmount: string;
  positionResults: SettlementPositionResult[];
};

export const resolvePariMutuelSettlement = (params: {
  positions: SettlementPosition[];
  winningOutcomeKey: string;
}): PariMutuelSettlementResult => {
  const totalPool = params.positions.reduce(
    (sum, position) => sum.plus(position.stakeAmount),
    toDecimal(0),
  );
  const winningPositions = params.positions.filter(
    (position) => position.outcomeKey === params.winningOutcomeKey,
  );
  const winningPool = winningPositions.reduce(
    (sum, position) => sum.plus(position.stakeAmount),
    toDecimal(0),
  );

  if (winningPositions.length === 0 || winningPool.lte(0)) {
    return {
      mode: "refund_no_winners",
      totalPoolAmount: toMoneyString(totalPool),
      winningPoolAmount: "0.00",
      positionResults: params.positions.map((position) => ({
        id: position.id,
        userId: position.userId,
        payoutAmount: toMoneyString(position.stakeAmount),
        status: "refunded",
      })),
    };
  }

  const exactPayouts = winningPositions.map((position) => {
    const exact = toDecimal(position.stakeAmount).mul(totalPool).div(winningPool);
    const roundedDown = exact.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    return {
      id: position.id,
      userId: position.userId,
      exact,
      roundedDown,
      remainder: exact.minus(roundedDown),
    };
  });

  const settledWinningPool = exactPayouts.reduce(
    (sum, position) => sum.plus(position.roundedDown),
    toDecimal(0),
  );
  let centsRemaining = totalPool.minus(settledWinningPool).mul(100).toNumber();

  if (!Number.isInteger(centsRemaining) || centsRemaining < 0) {
    throw internalInvariantError("Prediction market payout rounding failed.");
  }

  const extraCentsByPositionId = new Map<number, number>();
  const rankedRemainders = [...exactPayouts].sort((left, right) => {
    const remainderComparison = right.remainder.comparedTo(left.remainder);
    if (remainderComparison !== 0) {
      return remainderComparison;
    }

    return left.id - right.id;
  });

  while (centsRemaining > 0) {
    for (const position of rankedRemainders) {
      extraCentsByPositionId.set(
        position.id,
        (extraCentsByPositionId.get(position.id) ?? 0) + 1,
      );
      centsRemaining -= 1;
      if (centsRemaining === 0) {
        break;
      }
    }
  }

  const positionResults: SettlementPositionResult[] = params.positions.map(
    (position) => {
      const winning = position.outcomeKey === params.winningOutcomeKey;
      if (!winning) {
        return {
          id: position.id,
          userId: position.userId,
          payoutAmount: "0.00",
          status: "lost",
        };
      }

      const winningPosition = exactPayouts.find(
        (candidate) => candidate.id === position.id,
      );
      if (!winningPosition) {
        throw internalInvariantError("Winning prediction market position missing.");
      }

      const payoutAmount = winningPosition.roundedDown.plus(
        toDecimal((extraCentsByPositionId.get(position.id) ?? 0) / 100),
      );

      return {
        id: position.id,
        userId: position.userId,
        payoutAmount: toMoneyString(payoutAmount),
        status: "won",
      };
    },
  );

  return {
    mode: "payout",
    totalPoolAmount: toMoneyString(totalPool),
    winningPoolAmount: toMoneyString(winningPool),
    positionResults,
  };
};
