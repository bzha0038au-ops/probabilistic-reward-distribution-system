import type {
  HandHistoryRoundId,
  HandHistoryRoundType,
} from "@reward/shared-types/hand-history";

import { badRequestError } from "../../shared/errors";

export const BLACKJACK_ROUND_TYPE = "blackjack" as const;
export const QUICK_EIGHT_ROUND_TYPE = "quick_eight" as const;
export const HOLDEM_ROUND_TYPE = "holdem" as const;

const SUPPORTED_ROUND_TYPES = new Set<HandHistoryRoundType>([
  BLACKJACK_ROUND_TYPE,
  QUICK_EIGHT_ROUND_TYPE,
  HOLDEM_ROUND_TYPE,
]);

export const buildRoundId = (params: {
  roundType: HandHistoryRoundType;
  roundEntityId: number;
}): HandHistoryRoundId =>
  `${params.roundType}:${params.roundEntityId}` as HandHistoryRoundId;

export const parseRoundId = (roundId: string) => {
  const [rawRoundType, rawRoundEntityId] = roundId.trim().split(":");
  const roundEntityId = Number(rawRoundEntityId);

  if (
    !rawRoundType ||
    !SUPPORTED_ROUND_TYPES.has(rawRoundType as HandHistoryRoundType) ||
    !Number.isInteger(roundEntityId) ||
    roundEntityId <= 0
  ) {
    throw badRequestError("Invalid round id.");
  }

  return {
    roundType: rawRoundType as HandHistoryRoundType,
    roundEntityId,
  };
};
