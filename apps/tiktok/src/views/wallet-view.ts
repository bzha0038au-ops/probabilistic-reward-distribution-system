import type { LiveDataState } from "../app-types";
import { WALLET_ITEMS } from "../game-content";
import { escapeHtml, formatApiMoney, formatMoney, formatTimestamp } from "../game-utils";

interface WalletViewOptions {
  displayCash: number;
  bestTake: number;
  lastEnding: string;
  live: LiveDataState;
}

export function renderWalletView(options: WalletViewOptions): string {
  const heroAmount = options.live.wallet
    ? formatApiMoney(options.live.wallet.balance.totalBalance)
    : formatMoney(options.displayCash);

  return `
    <div class="view info-view">
      <div class="wallet-hero">
        <div class="wallet-hero__amount">${heroAmount}</div>
        <p>${
          options.live.wallet
            ? "This is your real backend wallet, pulled through the same user-core client the frontend uses."
            : "Money only feels like oxygen while it is still in your hand."
        }</p>
      </div>
      <section class="wallet-list">
        ${
          options.live.wallet
            ? renderLiveWalletRows(options.live)
            : WALLET_ITEMS.map(
                (item) => `
                  <article class="wallet-item">
                    <div>
                      <div class="wallet-item__label">${item.label}</div>
                      <p>${item.detail}</p>
                    </div>
                    <strong>${item.value}</strong>
                  </article>
                `,
              ).join("")
        }
      </section>
      ${renderLiveDrawSummary(options.live)}
      ${renderActivityFeed(options.live)}
      <article class="debt-card">
        <div class="debt-card__row">
          <span>Best take so far</span>
          <strong>${formatMoney(options.bestTake)}</strong>
        </div>
        <div class="debt-card__row">
          <span>Last ending</span>
          <strong>${options.lastEnding}</strong>
        </div>
      </article>
    </div>
  `;
}

function renderLiveWalletRows(live: LiveDataState): string {
  if (!live.wallet) {
    return "";
  }

  const rows = [
    {
      label: "Withdrawable",
      detail: "Cash balance currently available to the user account.",
      value: formatApiMoney(live.wallet.balance.withdrawableBalance),
    },
    {
      label: "Bonus balance",
      detail: "Prize or promotional value still sitting inside bonus funds.",
      value: formatApiMoney(live.wallet.balance.bonusBalance),
    },
    {
      label: "Locked balance",
      detail: "Funds that cannot move yet because another rule still owns them.",
      value: formatApiMoney(live.wallet.balance.lockedBalance),
    },
    {
      label: "Draw cost",
      detail: live.drawOverview
        ? "Current cost per live pull from the shared draw engine."
        : "Pull draw odds to populate the current live cost.",
      value: live.drawOverview ? formatApiMoney(live.drawOverview.drawCost) : "Offline",
    },
    {
      label: "Pity meter",
      detail: live.drawOverview
        ? renderPityDetail(live)
        : "Sign in and sync to read current pity compensation.",
      value: live.drawOverview ? `${live.drawOverview.pity.currentStreak}/${live.drawOverview.pity.threshold}` : "Offline",
    },
  ];

  return rows
    .map(
      (item) => `
        <article class="wallet-item">
          <div>
            <div class="wallet-item__label">${item.label}</div>
            <p>${escapeHtml(item.detail)}</p>
          </div>
          <strong>${item.value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderLiveDrawSummary(live: LiveDataState): string {
  if (!live.lastDraw) {
    return `
      <article class="runtime-card">
        <div class="runtime-card__title">Latest Live Draw</div>
        <p>${escapeHtml(live.drawMessage)}</p>
      </article>
    `;
  }

  return `
    <article class="runtime-card">
      <div class="runtime-card__title">Latest Live Draw</div>
      <div class="detail-list">
        <div class="detail-row"><span>Total reward</span><strong>${formatApiMoney(live.lastDraw.totalReward)}</strong></div>
        <div class="detail-row"><span>Ending balance</span><strong>${formatApiMoney(live.lastDraw.endingBalance)}</strong></div>
        <div class="detail-row"><span>Win count</span><strong>${live.lastDraw.winCount}</strong></div>
        <div class="detail-row"><span>Highest rarity</span><strong>${escapeHtml(live.lastDraw.highestRarity ?? "none")}</strong></div>
      </div>
      <p>${escapeHtml(live.drawMessage)}</p>
    </article>
  `;
}

function renderPityDetail(live: LiveDataState): string {
  if (!live.drawOverview) {
    return "Pity data is still offline.";
  }

  if (!live.drawOverview.pity.enabled) {
    return "Compensation is disabled for this pool right now.";
  }

  if (live.drawOverview.pity.active) {
    return `Boost active at +${live.drawOverview.pity.maxBoostPct}%.`;
  }

  if (live.drawOverview.pity.drawsUntilBoost !== null) {
    return `${live.drawOverview.pity.drawsUntilBoost} more pull${live.drawOverview.pity.drawsUntilBoost === 1 ? "" : "s"} until boost.`;
  }

  return "Pity is armed but no countdown is available.";
}

function renderActivityFeed(live: LiveDataState): string {
  if (!live.wallet) {
    return "";
  }

  if (live.activity.length === 0) {
    return `
      <article class="runtime-card">
        <div class="runtime-card__title">Recent Activity</div>
        <p>No economy ledger rows came back yet.</p>
      </article>
    `;
  }

  return `
    <article class="runtime-card">
      <div class="runtime-card__title">Recent Activity</div>
      <div class="activity-list">
        ${live.activity
          .map(
            (entry) => `
              <div class="activity-item">
                <div class="activity-item__head">
                  <strong>${escapeHtml(entry.entryType.replaceAll("_", " "))}</strong>
                  <span>${escapeHtml(entry.assetCode)}</span>
                </div>
                <div class="activity-item__meta">
                  <span>${escapeHtml(formatTimestamp(toTimestamp(entry.createdAt)))}</span>
                  <strong>${formatSignedAmount(entry.amount)}</strong>
                </div>
                <p>${escapeHtml(renderActivityReference(entry.referenceType, entry.referenceId))}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderActivityReference(referenceType: string | null | undefined, referenceId: number | null | undefined): string {
  if (!referenceType) {
    return "Ledger entry recorded without a linked reference.";
  }

  if (referenceId === null || referenceId === undefined) {
    return `Reference: ${referenceType}`;
  }

  return `Reference: ${referenceType} #${referenceId}`;
}

function formatSignedAmount(amount: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return amount;
  }

  return `${parsed > 0 ? "+" : ""}${formatApiMoney(amount, amount)}`;
}

function toTimestamp(value: string | Date | null | undefined): string | null | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? undefined;
}
