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

  it("keeps deferred_double at x1 and restores pending payout carry from storage", () => {
    const next = resolveRequestedPlayMode({
      storedMode: "deferred_double",
      storedState: JSON.stringify({
        type: "deferred_double",
        appliedMultiplier: 1,
        nextMultiplier: 2,
        streak: 0,
        lastOutcome: "lose",
        carryActive: false,
        pendingPayoutAmount: "18.50",
        pendingPayoutCount: 2,
        snowballCarryAmount: "0.00",
        snowballEnvelopeAmount: "0.00",
      }),
    });

    expect(next).toMatchObject({
      type: "deferred_double",
      appliedMultiplier: 1,
      nextMultiplier: 1,
      carryActive: true,
      pendingPayoutAmount: "18.50",
      pendingPayoutCount: 2,
      lastOutcome: "lose",
    });
  });

  it("increments and resets snowball streaks without applying stake multipliers", () => {
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
      appliedMultiplier: 1,
      nextMultiplier: 2,
      streak: 1,
      carryActive: false,
    });
    expect(afterSecondWin).toMatchObject({
      type: "snowball",
      appliedMultiplier: 1,
      nextMultiplier: 3,
      streak: 2,
      carryActive: false,
    });
    expect(afterMiss).toMatchObject({
      type: "snowball",
      appliedMultiplier: 1,
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
      pendingPayoutAmount: "0.00",
      pendingPayoutCount: 0,
      snowballCarryAmount: "0.00",
      snowballEnvelopeAmount: "0.00",
    });
  });
});
