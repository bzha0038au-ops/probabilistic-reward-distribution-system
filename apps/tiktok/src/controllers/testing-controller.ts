import type { AppState } from "../app-types";
import { getDisplayCash, getScratchableSlot } from "../state";

interface TestingWindow extends Window {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
}

interface TestingControllerOptions {
  state: AppState;
  getCurrentRouteHash: () => string;
  render: () => void;
}

export function syncTestingHooks(options: TestingControllerOptions): void {
  const gameWindow = window as TestingWindow;

  gameWindow.render_game_to_text = () =>
    JSON.stringify({
      origin: "top-left, x rightwards, y downwards",
      route: window.location.hash || options.getCurrentRouteHash(),
      activeTab: options.state.activeTab,
      stage: options.state.play.stage,
      scratchTotal: options.state.play.scratchTotal,
      displayCash: getDisplayCash(options.state.play),
      scratchableSlot: getScratchableSlot(options.state.play)?.id ?? null,
      revealedSlots: options.state.play.slots.filter((slot) => slot.revealed).map((slot) => slot.id),
      runCount: options.state.runCount,
      live: {
        authStatus: options.state.live.authStatus,
        dashboardStatus: options.state.live.dashboardStatus,
        drawStatus: options.state.live.drawStatus,
        hasSession: Boolean(options.state.live.session),
        hasWallet: Boolean(options.state.live.wallet),
        hasDrawOverview: Boolean(options.state.live.drawOverview),
        activityCount: options.state.live.activity.length,
        notificationCount: options.state.live.notifications.length,
        notificationUnreadCount: options.state.live.notificationSummary?.unreadCount ?? 0,
        notificationPreferenceCount: options.state.live.notificationPreferences.length,
        notificationStatus: options.state.live.notificationStatus,
        notificationFilter: options.state.live.notificationFilter,
        notificationUnreadOnly: options.state.live.notificationUnreadOnly,
        rewardMissionCount: options.state.live.rewardCenter?.missions.length ?? 0,
        sessionCount: options.state.live.sessions.length,
        lastDrawCount: options.state.live.lastDraw?.count ?? null,
        phoneVerified: Boolean(options.state.live.session?.user.phoneVerifiedAt),
        phoneStatus: options.state.live.phoneStatus,
        mfaEnabled: options.state.live.mfaSummary?.mfaEnabled ?? false,
        hasMfaEnrollment: Boolean(options.state.live.mfaEnrollment),
        mfaStatus: options.state.live.mfaStatus,
      },
    });

  gameWindow.advanceTime = () => {
    options.render();
  };
}
