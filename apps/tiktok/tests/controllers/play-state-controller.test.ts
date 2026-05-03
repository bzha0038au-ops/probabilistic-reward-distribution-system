import { describe, expect, it } from "vitest";

import type { StoredProgress } from "../../src/app-types";
import { createPlayStateController } from "../../src/controllers/play-state-controller";
import { createInitialAppState, createTicketPlayState } from "../../src/state";

const storedProgress: StoredProgress = {
  bestTake: 40,
  runCount: 0,
  lastEnding: "Nobody has played yet.",
};

describe("play-state-controller", () => {
  it("derives the current route from the active tab and stage", () => {
    const state = createInitialAppState("", storedProgress);
    const controller = createPlayStateController({ state });

    expect(controller.getCurrentRoute()).toEqual({ tab: "play", stage: "intro" });

    state.activeTab = "story";
    expect(controller.getCurrentRoute()).toEqual({ tab: "story" });
  });

  it("rebuilds a play stage snapshot from a route", () => {
    const state = createInitialAppState("", storedProgress);
    state.runCount = 2;
    const controller = createPlayStateController({ state });

    controller.applyRoute({ tab: "play", stage: "decision" });

    expect(state.activeTab).toBe("play");
    expect(state.play.stage).toBe("decision");
    expect(state.play.scratchTotal).toBe(40);
    expect(
      state.play.slots.filter((slot) => slot.revealed).map((slot) => slot.id),
    ).toEqual([0, 1]);
  });

  it("switches non-play tabs without clobbering the play snapshot", () => {
    const state = createInitialAppState("", storedProgress);
    state.runCount = 1;
    state.play = createTicketPlayState(1);
    const controller = createPlayStateController({ state });

    controller.applyRoute({ tab: "wallet" });

    expect(state.activeTab).toBe("wallet");
    expect(state.play.stage).toBe("ticket");
    expect(state.play.scratchTotal).toBe(0);
  });
});
