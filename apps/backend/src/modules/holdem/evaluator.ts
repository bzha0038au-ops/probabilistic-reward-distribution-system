import type {
  HoldemBestHand,
  HoldemCard,
  HoldemCardRank,
  HoldemHandCategory,
} from "@reward/shared-types/holdem";

const categoryStrength = {
  high_card: 0,
  one_pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
} as const satisfies Record<HoldemHandCategory, number>;

const categoryLabels = {
  high_card: "High card",
  one_pair: "One pair",
  two_pair: "Two pair",
  three_of_a_kind: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  full_house: "Full house",
  four_of_a_kind: "Four of a kind",
  straight_flush: "Straight flush",
} as const satisfies Record<HoldemHandCategory, string>;

const rankValueMap: Record<HoldemCardRank, number> = {
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

export type HoldemBestHandEvaluation = HoldemBestHand & {
  strength: readonly [number, ...number[]];
};

const getRankValue = (rank: HoldemCardRank) => rankValueMap[rank];

const compareNumbersDescending = (left: number, right: number) => right - left;

const compareStrength = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue === rightValue) {
      continue;
    }
    return leftValue > rightValue ? 1 : -1;
  }
  return 0;
};

const resolveStraightHighCard = (rankValues: number[]) => {
  const uniqueValues = [...new Set(rankValues)].sort(compareNumbersDescending);
  if (uniqueValues.length !== 5) {
    return null;
  }

  if (uniqueValues[0] === 14) {
    const wheel = [5, 4, 3, 2];
    const wheelMatches = wheel.every((value, index) => uniqueValues[index + 1] === value);
    if (wheelMatches) {
      return 5;
    }
  }

  for (let index = 0; index < uniqueValues.length - 1; index += 1) {
    if (uniqueValues[index] - uniqueValues[index + 1] !== 1) {
      return null;
    }
  }

  return uniqueValues[0] ?? null;
};

const buildStrength = (
  category: HoldemHandCategory,
  ...kickers: number[]
): readonly [number, ...number[]] => [
  categoryStrength[category],
  ...kickers,
];

const evaluateFiveCardHand = (cards: HoldemCard[]): HoldemBestHandEvaluation => {
  const ranks = cards.map((card) => getRankValue(card.rank));
  const sortedRanks = [...ranks].sort(compareNumbersDescending);
  const isFlush = cards.every((card) => card.suit === cards[0]?.suit);
  const straightHighCard = resolveStraightHighCard(sortedRanks);

  const groups = [...new Map<number, number>()];
  for (const value of ranks) {
    const existing = groups.findIndex(([rankValue]) => rankValue === value);
    if (existing >= 0) {
      groups[existing]![1] += 1;
    } else {
      groups.push([value, 1]);
    }
  }

  const groupedRanks = groups
    .slice()
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1];
      }
      return right[0] - left[0];
    });

  const [firstGroup, secondGroup] = groupedRanks;

  if (isFlush && straightHighCard !== null) {
    return {
      category: "straight_flush",
      label: categoryLabels.straight_flush,
      cards,
      strength: buildStrength("straight_flush", straightHighCard),
    };
  }

  if (firstGroup?.[1] === 4) {
    const kicker = groupedRanks.find((group) => group[1] === 1)?.[0] ?? 0;
    return {
      category: "four_of_a_kind",
      label: categoryLabels.four_of_a_kind,
      cards,
      strength: buildStrength("four_of_a_kind", firstGroup[0], kicker),
    };
  }

  if (firstGroup?.[1] === 3 && secondGroup?.[1] === 2) {
    return {
      category: "full_house",
      label: categoryLabels.full_house,
      cards,
      strength: buildStrength("full_house", firstGroup[0], secondGroup[0]),
    };
  }

  if (isFlush) {
    return {
      category: "flush",
      label: categoryLabels.flush,
      cards,
      strength: buildStrength("flush", ...sortedRanks),
    };
  }

  if (straightHighCard !== null) {
    return {
      category: "straight",
      label: categoryLabels.straight,
      cards,
      strength: buildStrength("straight", straightHighCard),
    };
  }

  if (firstGroup?.[1] === 3) {
    const kickers = groupedRanks
      .filter((group) => group[1] === 1)
      .map((group) => group[0])
      .sort(compareNumbersDescending);
    return {
      category: "three_of_a_kind",
      label: categoryLabels.three_of_a_kind,
      cards,
      strength: buildStrength("three_of_a_kind", firstGroup[0], ...kickers),
    };
  }

  if (firstGroup?.[1] === 2 && secondGroup?.[1] === 2) {
    const pairValues = groupedRanks
      .filter((group) => group[1] === 2)
      .map((group) => group[0])
      .sort(compareNumbersDescending);
    const kicker = groupedRanks.find((group) => group[1] === 1)?.[0] ?? 0;
    return {
      category: "two_pair",
      label: categoryLabels.two_pair,
      cards,
      strength: buildStrength("two_pair", ...pairValues, kicker),
    };
  }

  if (firstGroup?.[1] === 2) {
    const kickers = groupedRanks
      .filter((group) => group[1] === 1)
      .map((group) => group[0])
      .sort(compareNumbersDescending);
    return {
      category: "one_pair",
      label: categoryLabels.one_pair,
      cards,
      strength: buildStrength("one_pair", firstGroup[0], ...kickers),
    };
  }

  return {
    category: "high_card",
    label: categoryLabels.high_card,
    cards,
    strength: buildStrength("high_card", ...sortedRanks),
  };
};

const enumerateFiveCardCombos = (cards: HoldemCard[]) => {
  const combinations: HoldemCard[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            if (combo.every(Boolean)) {
              combinations.push(combo as HoldemCard[]);
            }
          }
        }
      }
    }
  }
  return combinations;
};

export const compareHoldemBestHands = (
  left: HoldemBestHandEvaluation,
  right: HoldemBestHandEvaluation,
) => compareStrength(left.strength, right.strength);

export const evaluateBestHoldemHand = (
  cards: HoldemCard[],
): HoldemBestHandEvaluation => {
  if (cards.length < 5) {
    throw new Error("Texas Hold'em evaluation requires at least 5 cards.");
  }

  const combinations =
    cards.length === 5 ? [cards] : enumerateFiveCardCombos(cards);

  let best = evaluateFiveCardHand(combinations[0] ?? cards.slice(0, 5));
  for (let index = 1; index < combinations.length; index += 1) {
    const next = evaluateFiveCardHand(combinations[index] ?? []);
    if (compareStrength(next.strength, best.strength) > 0) {
      best = next;
    }
  }

  return best;
};
