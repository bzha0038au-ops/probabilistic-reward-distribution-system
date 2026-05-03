import type { LiveDataState } from "../app-types";
import { escapeHtml, formatTimestamp } from "../game-utils";
import {
  filterNotifications,
  getNotificationCategory,
  getNotificationChannelLabel,
  getNotificationCounts,
  getNotificationKindLabel,
  groupNotificationPreferences,
  notificationFilterOrder,
} from "./notification-helpers";

interface NotificationsViewOptions {
  live: LiveDataState;
}

export function renderNotificationsView(options: NotificationsViewOptions): string {
  const live = options.live;
  const counts = getNotificationCounts(live.notifications);
  const unreadCount = live.notificationSummary?.unreadCount ?? live.notifications.filter((item) => !item.readAt).length;
  const filtered = filterNotifications(
    live.notifications,
    live.notificationFilter,
    live.notificationUnreadOnly,
  );
  const unreadQueue = live.notifications.filter((item) => !item.readAt).slice(0, 3);
  const preferenceGroups = groupNotificationPreferences(live.notificationPreferences);

  return `
    <div class="view info-view">
      <section class="runtime-card notification-hero">
        <div class="runtime-card__head">
          <div>
            <div class="runtime-card__title">Command Center</div>
            <p>Player-facing alerts, security calls, and settlement updates in one shared queue.</p>
          </div>
          <span class="meta-pill">${unreadCount} unread</span>
        </div>
        <div class="status-line">
          <span class="status-pill status-pill--${live.notificationStatus}">${labelForStatus(live.notificationStatus)}</span>
          <span class="meta-pill">${
            live.notificationSummary?.latestCreatedAt
              ? `latest ${escapeHtml(formatTimestamp(live.notificationSummary.latestCreatedAt))}`
              : "feed quiet"
          }</span>
        </div>
        <p>${escapeHtml(live.notificationMessage)}</p>
        <div class="notification-summary-grid">
          <article class="notification-summary-chip notification-summary-chip--security">
            <span>Security</span>
            <strong>${counts.security}</strong>
          </article>
          <article class="notification-summary-chip notification-summary-chip--market">
            <span>Market</span>
            <strong>${counts.market}</strong>
          </article>
          <article class="notification-summary-chip notification-summary-chip--games">
            <span>Games</span>
            <strong>${counts.games}</strong>
          </article>
          <article class="notification-summary-chip notification-summary-chip--rewards">
            <span>Rewards</span>
            <strong>${counts.rewards}</strong>
          </article>
        </div>
        <div class="button-row">
          <button class="secondary-cta secondary-cta--small" data-action="refresh-notifications"${
            live.notificationMutating ? " disabled" : ""
          }>${live.notificationMutating ? "SYNCING..." : "Refresh Feed"}</button>
          <button class="secondary-cta secondary-cta--small" data-action="mark-all-notifications-read"${
            live.notificationMutating || unreadCount === 0 ? " disabled" : ""
          }>Mark All Read</button>
        </div>
      </section>
      <section class="runtime-card">
        <div class="runtime-card__head">
          <div>
            <div class="runtime-card__title">Action Queue</div>
            <p>Unread items that still need a player response.</p>
          </div>
          <span class="meta-pill">${unreadQueue.length} pending</span>
        </div>
        <div class="notification-queue-list">
          ${
            unreadQueue.length
              ? unreadQueue
                  .map(
                    (item) => `
                      <article class="notification-queue-item">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>${escapeHtml(getNotificationKindLabel(item.kind))}</span>
                      </article>
                    `,
                  )
                  .join("")
              : "<p>All visible alerts are already handled.</p>"
          }
        </div>
      </section>
      <section class="runtime-card">
        <div class="runtime-card__head">
          <div>
            <div class="runtime-card__title">Alert Feed</div>
            <p>Filter the feed by risk lane, then drill into the visible queue.</p>
          </div>
          <span class="meta-pill">${filtered.length} visible</span>
        </div>
        <div class="notification-filter-row">
          ${notificationFilterOrder
            .map(
              (filter) => `
                <button
                  class="notification-filter-chip${
                    live.notificationFilter === filter ? " notification-filter-chip--active" : ""
                  }"
                  data-action="set-notification-filter"
                  data-filter="${filter}"
                >${escapeHtml(getFilterLabel(filter))} ${
                  filter === "all" ? counts.all : counts[filter]
                }</button>
              `,
            )
            .join("")}
          <button
            class="notification-filter-chip${
              live.notificationUnreadOnly ? " notification-filter-chip--active" : ""
            }"
            data-action="toggle-notification-unread-only"
          >${live.notificationUnreadOnly ? "Unread Only On" : "Unread Only Off"}</button>
        </div>
        <div class="notification-list">
          ${
            filtered.length
              ? filtered.map((item) => renderNotificationItem(item, live.notificationMutating)).join("")
              : "<p>No notifications in this filter yet.</p>"
          }
        </div>
      </section>
      <section class="runtime-card">
        <div class="runtime-card__head">
          <div>
            <div class="runtime-card__title">Delivery Rules</div>
            <p>These toggles write back to the shared notification-preferences contract used by frontend.</p>
          </div>
          <span class="meta-pill">${live.notificationPreferences.filter((entry) => entry.enabled).length} enabled</span>
        </div>
        <div class="status-line">
          <span class="status-pill status-pill--${live.notificationStatus}">${labelForStatus(live.notificationStatus)}</span>
          <span class="meta-pill">${live.notificationPreferences.length} rules</span>
        </div>
        <p>${escapeHtml(live.notificationMessage)}</p>
        <div class="notification-preference-list">
          ${
            preferenceGroups.length
              ? preferenceGroups
                  .map((group) => renderNotificationPreferenceGroup(group.kind, group.items, live.notificationMutating))
                  .join("")
              : "<p>No notification preference rules returned yet.</p>"
          }
        </div>
      </section>
    </div>
  `;
}

function labelForStatus(status: LiveDataState["notificationStatus"]): string {
  switch (status) {
    case "loading":
      return "Syncing";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function getFilterLabel(filter: LiveDataState["notificationFilter"]): string {
  switch (filter) {
    case "all":
      return "All";
    case "rewards":
      return "Rewards";
    case "games":
      return "Games";
    case "market":
      return "Market";
    case "security":
      return "Security";
  }
}

function renderNotificationItem(
  item: LiveDataState["notifications"][number],
  disabled: boolean,
): string {
  const category = getNotificationCategory(item.kind);
  const unread = !item.readAt;

  return `
    <article class="notification-item notification-item--${category}${unread ? " notification-item--unread" : ""}">
      <div class="notification-item__top">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(getNotificationKindLabel(item.kind))}</span>
        </div>
        <span class="meta-pill">${unread ? "Unread" : "Read"}</span>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <div class="notification-item__meta">
        <span>${escapeHtml(formatTimestamp(item.createdAt))}</span>
        ${
          unread
            ? `<button class="secondary-cta secondary-cta--small" data-action="mark-notification-read" data-notification-id="${item.id}"${
                disabled ? " disabled" : ""
              }>Mark Read</button>`
            : "<span>Handled</span>"
        }
      </div>
    </article>
  `;
}

function renderNotificationPreferenceGroup(
  kind: LiveDataState["notificationPreferences"][number]["kind"],
  items: LiveDataState["notificationPreferences"],
  disabled: boolean,
): string {
  return `
    <article class="notification-pref-group">
      <div class="notification-pref-group__top">
        <strong>${escapeHtml(getNotificationKindLabel(kind))}</strong>
        <span>${items.filter((entry) => entry.enabled).length}/${items.length} channels on</span>
      </div>
      <div class="notification-toggle-grid">
        ${items
          .map(
            (entry) => `
              <button
                class="notification-toggle${entry.enabled ? " notification-toggle--enabled" : ""}"
                data-action="toggle-notification-preference"
                data-kind="${escapeHtml(entry.kind)}"
                data-channel="${escapeHtml(entry.channel)}"
                data-enabled="${entry.enabled ? "true" : "false"}"${
                  disabled ? " disabled" : ""
                }
              >
                <span>${escapeHtml(getNotificationChannelLabel(entry.channel))}</span>
                <strong>${entry.enabled ? "ON" : "OFF"}</strong>
              </button>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}
