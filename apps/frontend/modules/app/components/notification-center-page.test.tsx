// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationRecord } from "@reward/shared-types/notification";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { NotificationCenterPage } from "./notification-center-page";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getNotificationSummary: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const buildNotification = (
  id: number,
  overrides?: Partial<NotificationRecord>,
): NotificationRecord => ({
  id,
  userId: 7,
  kind: "kyc_status_changed",
  title: `Notification ${id}`,
  body: `Body ${id}`,
  data: null,
  readAt: null,
  createdAt: `2026-05-04T0${id}:00:00.000Z`,
  updatedAt: `2026-05-04T0${id}:00:00.000Z`,
  ...overrides,
});

const notifications: NotificationRecord[] = [
  buildNotification(1, {
    kind: "kyc_status_changed",
    title: "You received Epic Pack from Gacha Draw!",
    body: "Daily reward drop is ready.",
  }),
  buildNotification(2, {
    kind: "holdem_table_invite",
    title: "Texas Hold'em",
    body: "You won 1,250 credits!",
  }),
  buildNotification(3, {
    kind: "prediction_market_settled",
    title: "Market Update",
    body: "BTC is trending up.",
    readAt: "2026-05-04T03:30:00.000Z",
  }),
  buildNotification(4, {
    kind: "security_alert",
    title: "Security Alert",
    body: "New login detected.",
  }),
];

function renderNotificationCenter() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <NotificationCenterPage />
    </I18nProvider>,
  );
}

describe("NotificationCenterPage", () => {
  beforeEach(() => {
    browserUserApiClientMock.listNotifications.mockResolvedValue(
      ok({ items: notifications }),
    );
    browserUserApiClientMock.getNotificationSummary.mockResolvedValue(
      ok({ unreadCount: 3, latestCreatedAt: notifications[0]?.createdAt ?? null }),
    );
    browserUserApiClientMock.markNotificationRead.mockImplementation(
      async (notificationId: number) =>
        ok({
          ...notifications.find((item) => item.id === notificationId)!,
          readAt: "2026-05-04T08:00:00.000Z",
        }),
    );
    browserUserApiClientMock.markAllNotificationsRead.mockResolvedValue(
      ok({ updatedCount: 3 }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("filters the list to market notifications when the market tab is selected", async () => {
    const user = userEvent.setup();

    renderNotificationCenter();

    await screen.findByTestId("notification-item-1");

    await user.click(screen.getByTestId("notifications-filter-market"));

    await waitFor(() => {
      expect(screen.queryByTestId("notification-item-1")).toBeNull();
      expect(screen.queryByTestId("notification-item-2")).toBeNull();
      expect(screen.queryByTestId("notification-item-4")).toBeNull();
      expect(screen.queryByTestId("notification-item-3")).not.toBeNull();
    });
  });

  it("marks an unread item as read when the notification row is clicked", async () => {
    const user = userEvent.setup();

    renderNotificationCenter();

    const item = await screen.findByTestId("notification-item-1");

    await user.click(item);

    await waitFor(() => {
      expect(browserUserApiClientMock.markNotificationRead).toHaveBeenCalledWith(1);
      expect(within(item).queryByText("Unread")).toBeNull();
      expect(within(item).queryByText("Read")).not.toBeNull();
    });
  });
});
