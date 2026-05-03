import type { AppRoute, AppState, PlayStage } from "../app-types";
import { getPlayRoute } from "../routes";
import { createPlayStateForStage } from "../state";

interface PlayStateControllerOptions {
  state: AppState;
}

export interface PlayStateController {
  getFallbackStage: () => PlayStage;
  getCurrentRoute: () => AppRoute;
  applyRoute: (route: AppRoute) => void;
}

export function createPlayStateController(options: PlayStateControllerOptions): PlayStateController {
  const { state } = options;

  return {
    getFallbackStage: () => state.play.stage,
    getCurrentRoute: () => (state.activeTab !== "play" ? { tab: state.activeTab } : getPlayRoute(state.play.stage)),
    applyRoute: (route) => {
      state.activeTab = route.tab;
      if (route.tab !== "play") {
        return;
      }

      const targetStage = route.stage ?? state.play.stage;
      if (state.play.stage === targetStage) {
        return;
      }

      state.play = createPlayStateForStage(targetStage, {
        runCount: state.runCount,
        current: state.play,
      });
    },
  };
}
