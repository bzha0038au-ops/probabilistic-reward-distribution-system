import { describe, expect, it } from "vitest";
import type {
  DrawPrizePresentation,
  DrawResult,
} from "@reward/shared-types/draw";

import { buildPrizeSymbolMap, buildSlotFinale } from "./slot-machine";

const prizeCatalog: DrawPrizePresentation[] = [
  {
    id: 1,
    name: "Bronze Vault",
    rewardAmount: "8.00",
    displayRarity: "common",
    stock: 12,
    stockState: "available",
    isFeatured: false,
  },
  {
    id: 2,
    name: "Aurora Crown",
    rewardAmount: "88.00",
    displayRarity: "legendary",
    stock: 1,
    stockState: "low",
    isFeatured: true,
  },
  {
    id: 3,
    name: "Stellar Gem",
    rewardAmount: "28.00",
    displayRarity: "epic",
    stock: 4,
    stockState: "available",
    isFeatured: true,
  },
];

const createResult = (overrides: Partial<DrawResult>): DrawResult => ({
  id: 100,
  userId: 9,
  prizeId: null,
  drawCost: "2.00",
  rewardAmount: "0.00",
  status: "miss",
  createdAt: "2026-04-27T00:00:00.000Z",
  fairness: null,
  ...overrides,
});

describe("slot machine helpers", () => {
  it("maps the highest value prize to the crown symbol", () => {
    const symbolMap = buildPrizeSymbolMap(prizeCatalog);

    expect(symbolMap.get(2)).toBe("crown");
    expect(symbolMap.get(3)).toBe("gem");
    expect(symbolMap.get(1)).toBe("star");
  });

  it("builds a triple match on the center line for winning draws", () => {
    const finale = buildSlotFinale(
      createResult({
        status: "won",
        prizeId: 2,
        rewardAmount: "88.00",
        prize: prizeCatalog[1],
      }),
      prizeCatalog,
      () => 0.2,
    );

    expect(finale.centerLine).toEqual(["crown", "crown", "crown"]);
    expect(finale.tone).toBe("win");
    expect(finale.prize?.name).toBe("Aurora Crown");
  });

  it("builds a non-matching center line for misses", () => {
    const finale = buildSlotFinale(
      createResult({ status: "miss" }),
      prizeCatalog,
      () => 0.1,
    );

    expect(new Set(finale.centerLine).size).toBeGreaterThan(1);
    expect(finale.tone).toBe("near-miss");
  });

  it("uses a vault blocker for payout limited outcomes", () => {
    const finale = buildSlotFinale(
      createResult({ status: "payout_limited" }),
      prizeCatalog,
      () => 0.4,
    );

    expect(finale.centerLine).toEqual(["crown", "crown", "vault"]);
    expect(finale.tone).toBe("blocked");
  });
});
