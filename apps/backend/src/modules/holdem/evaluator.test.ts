import { describe, expect, it } from "vitest";
import type { HoldemCard } from "@reward/shared-types/holdem";

import {
  compareHoldemBestHands,
  evaluateBestHoldemHand,
} from "./evaluator";

const card = (rank: HoldemCard["rank"], suit: HoldemCard["suit"]): HoldemCard => ({
  rank,
  suit,
});

describe("holdem evaluator", () => {
  it("picks the best five-card hand from seven cards", () => {
    const bestHand = evaluateBestHoldemHand([
      card("A", "spades"),
      card("K", "spades"),
      card("Q", "spades"),
      card("J", "spades"),
      card("10", "spades"),
      card("2", "diamonds"),
      card("2", "clubs"),
    ]);

    expect(bestHand.category).toBe("straight_flush");
    expect(bestHand.cards).toHaveLength(5);
    expect(bestHand.cards.every((entry) => entry.suit === "spades")).toBe(true);
    expect(bestHand.cards.map((entry) => entry.rank)).toEqual([
      "A",
      "K",
      "Q",
      "J",
      "10",
    ]);
  });

  it("breaks equal made hands by kicker strength", () => {
    const aceKing = evaluateBestHoldemHand([
      card("A", "spades"),
      card("A", "hearts"),
      card("K", "clubs"),
      card("9", "diamonds"),
      card("7", "spades"),
      card("4", "clubs"),
      card("2", "hearts"),
    ]);
    const aceQueen = evaluateBestHoldemHand([
      card("A", "diamonds"),
      card("A", "clubs"),
      card("Q", "spades"),
      card("9", "clubs"),
      card("7", "hearts"),
      card("4", "diamonds"),
      card("2", "spades"),
    ]);

    expect(aceKing.category).toBe("one_pair");
    expect(aceQueen.category).toBe("one_pair");
    expect(compareHoldemBestHands(aceKing, aceQueen)).toBeGreaterThan(0);
    expect(compareHoldemBestHands(aceQueen, aceKing)).toBeLessThan(0);
  });
});
