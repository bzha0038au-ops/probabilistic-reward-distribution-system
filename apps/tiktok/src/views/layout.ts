import type { AppTab, PlayStage } from "../app-types";
import { formatMoney } from "../game-utils";
import { iconBell, iconBook, iconController, iconPlay, iconProfile, iconWallet } from "./icons";

interface AppShellOptions {
  activeTab: AppTab;
  playStage: PlayStage;
  displayCash: number;
  displayCashLabel?: string;
  screenMarkup: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <div class="app-shell stage-${options.playStage}">
      <header class="topbar">
        <span class="topbar__icon">${iconController()}</span>
        <span class="topbar__brand">LAST CHANCE</span>
        <span class="cash-pill">${options.displayCashLabel ?? formatMoney(options.displayCash)}</span>
      </header>
      <section class="screen">
        ${options.screenMarkup}
      </section>
      <nav class="bottom-nav">
        ${renderNavItem(options.activeTab, "play", "Play", iconPlay())}
        ${renderNavItem(options.activeTab, "story", "Story", iconBook())}
        ${renderNavItem(options.activeTab, "wallet", "Wallet", iconWallet())}
        ${renderNavItem(options.activeTab, "notifications", "Alerts", iconBell())}
        ${renderNavItem(options.activeTab, "profile", "Profile", iconProfile())}
      </nav>
    </div>
  `;
}

function renderNavItem(activeTab: AppTab, tab: AppTab, label: string, icon: string): string {
  const activeClass = activeTab === tab ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item";

  return `
    <button class="${activeClass}" data-action="switch-tab" data-tab="${tab}">
      <span class="bottom-nav__icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
}
