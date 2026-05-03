import type { AppState } from "../app-types";
import { formatApiMoney } from "../game-utils";
import { renderAppShell } from "./layout";
import { renderNotificationsView } from "./notifications-view";
import { renderPlayView } from "./play-view";
import { renderProfileView } from "./profile-view";
import { renderStoryView } from "./story-view";
import { renderWalletView } from "./wallet-view";

interface RenderAppOptions {
  state: AppState;
  displayCash: number;
}

export function renderApp(options: RenderAppOptions): string {
  let screenMarkup = renderPlayView(options.state.play, options.state.live);

  if (options.state.activeTab === "story") {
    screenMarkup = renderStoryView();
  } else if (options.state.activeTab === "wallet") {
    screenMarkup = renderWalletView({
      displayCash: options.displayCash,
      bestTake: options.state.bestTake,
      lastEnding: options.state.lastEnding,
      live: options.state.live,
    });
  } else if (options.state.activeTab === "notifications") {
    screenMarkup = renderNotificationsView({
      live: options.state.live,
    });
  } else if (options.state.activeTab === "profile") {
    screenMarkup = renderProfileView({
      runtimeMode: options.state.runtimeMode,
      runtimeMessage: options.state.runtimeMessage,
      runCount: options.state.runCount,
      eventLog: options.state.eventLog,
      live: options.state.live,
    });
  }

  const displayCashLabel =
    options.state.activeTab !== "play" && options.state.live.wallet
      ? formatApiMoney(options.state.live.wallet.balance.totalBalance)
      : undefined;

  return renderAppShell({
    activeTab: options.state.activeTab,
    playStage: options.state.play.stage,
    displayCash: options.displayCash,
    displayCashLabel,
    screenMarkup,
  });
}
