import { describe, expect, it } from "vitest";

import { buildRoundId, parseRoundId } from "./round-id";

describe("hand history round id helpers", () => {
  it("builds and parses supported round ids", () => {
    const blackjackRoundId = buildRoundId({
      roundType: "blackjack",
      roundEntityId: 42,
    });
    const quickEightRoundId = buildRoundId({
      roundType: "quick_eight",
      roundEntityId: 7,
    });
    const holdemRoundId = buildRoundId({
      roundType: "holdem",
      roundEntityId: 15,
    });

    expect(blackjackRoundId).toBe("blackjack:42");
    expect(quickEightRoundId).toBe("quick_eight:7");
    expect(holdemRoundId).toBe("holdem:15");
    expect(parseRoundId(blackjackRoundId)).toEqual({
      roundType: "blackjack",
      roundEntityId: 42,
    });
    expect(parseRoundId(quickEightRoundId)).toEqual({
      roundType: "quick_eight",
      roundEntityId: 7,
    });
    expect(parseRoundId(holdemRoundId)).toEqual({
      roundType: "holdem",
      roundEntityId: 15,
    });
  });

  it("rejects malformed round ids", () => {
    expect(() => parseRoundId("")).toThrow("Invalid round id.");
    expect(() => parseRoundId("blackjack")).toThrow("Invalid round id.");
    expect(() => parseRoundId("unknown:1")).toThrow("Invalid round id.");
    expect(() => parseRoundId("quick_eight:0")).toThrow("Invalid round id.");
  });
});
