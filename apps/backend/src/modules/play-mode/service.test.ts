import { describe, expect, it } from "vitest";

import {
  createDefaultPlayModeSnapshot,
  resolveRequestedPlayMode,
  resolveSettledPlayMode,
} from "./service";

describe("play mode service", () => {
  it("keeps dual_bet as a fixed multiplier wrapper", () => {
    const active = resolveRequestedPlayMode({
      requestedMode: { type: "dual_bet" },
    });

    expect(active).toMatchObject({
      type: "dual_bet",
      appliedMultiplier: 2,
      nextMultiplier: 2,
      carryActive: false,
    });

    expect(
      resolveSettledPlayMode({
        snapshot: active,
        outcome: "win",
      }),
    ).toMatchObject({
      type: "dual_bet",
      appliedMultiplier: 2,
      nextMultiplier: 2,
      lastOutcome: "win",
    });
  });

  it("arms deferred_double after a loss and applies it on the next request", () => {
    const initial = resolveRequestedPlayMode({
      requestedMode: { type: "deferred_double" },
    });
    const settled = resolveSettledPlayMode({
      snapshot: initial,
      outcome: "lose",
    });

    expect(settled).toMatchObject({
      type: "deferred_double",
      appliedMultiplier: 1,
      nextMultiplier: 2,
      carryActive: true,
      lastOutcome: "lose",
    });

    const next = resolveRequestedPlayMode({
      storedMode: settled.type,
      storedState: settled,
    });

    expect(next).toMatchObject({
      type: "deferred_double",
      appliedMultiplier: 2,
      nextMultiplier: 2,
      carryActive: true,
    });
  });

  it("restores deferred_double from stringified storage payloads", () => {
    const next = resolveRequestedPlayMode({
      storedMode: "deferred_double",
      storedState: JSON.stringify({
        type: "deferred_double",
        appliedMultiplier: 1,
        nextMultiplier: 2,
        streak: 1,
        lastOutcome: "lose",
        carryActive: true,
      }),
    });

    expect(next).toMatchObject({
      type: "deferred_double",
      appliedMultiplier: 2,
      nextMultiplier: 2,
      carryActive: true,
      lastOutcome: "lose",
    });
  });

  it("increments and resets snowball multipliers as outcomes change", () => {
    const initial = resolveRequestedPlayMode({
      requestedMode: { type: "snowball" },
    });
    const afterFirstWin = resolveSettledPlayMode({
      snapshot: initial,
      outcome: "win",
    });
    const secondRound = resolveRequestedPlayMode({
      storedMode: afterFirstWin.type,
      storedState: afterFirstWin,
    });
    const afterSecondWin = resolveSettledPlayMode({
      snapshot: secondRound,
      outcome: "win",
    });
    const afterMiss = resolveSettledPlayMode({
      snapshot: resolveRequestedPlayMode({
        storedMode: afterSecondWin.type,
        storedState: afterSecondWin,
      }),
      outcome: "miss",
    });

    expect(afterFirstWin).toMatchObject({
      type: "snowball",
      nextMultiplier: 2,
      streak: 1,
      carryActive: true,
    });
    expect(afterSecondWin).toMatchObject({
      type: "snowball",
      nextMultiplier: 3,
      streak: 2,
      carryActive: true,
    });
    expect(afterMiss).toMatchObject({
      type: "snowball",
      nextMultiplier: 1,
      streak: 0,
      carryActive: false,
      lastOutcome: "miss",
    });
  });

  it("falls back to standard mode defaults when no state exists", () => {
    expect(createDefaultPlayModeSnapshot()).toEqual({
      type: "standard",
      appliedMultiplier: 1,
      nextMultiplier: 1,
      streak: 0,
      lastOutcome: null,
      carryActive: false,
    });
  });
});
