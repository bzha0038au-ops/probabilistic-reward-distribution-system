import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeMock = vi.hoisted(() => vi.fn());
const createRateLimiterMock = vi.hoisted(() =>
  vi.fn(() => ({
    consume: consumeMock,
  })),
);
const loggerInfoMock = vi.hoisted(() => vi.fn());
const insertReturningMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  client: {},
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        returning: insertReturningMock,
      }),
    })),
  },
}));

vi.mock("../../realtime", () => ({
  publishRealtimeToUser: vi.fn(async () => undefined),
}));

vi.mock("../../shared/logger", () => ({
  logger: {
    info: loggerInfoMock,
    warning: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../shared/config", () => ({
  getConfigView: vi.fn(() => ({
    nodeEnv: "test",
    authNotificationEmailThrottleMax: 3,
    authNotificationEmailThrottleWindowMs: 900_000,
    authNotificationSmsThrottleMax: 3,
    authNotificationSmsThrottleWindowMs: 600_000,
    authNotificationAlertThrottleMax: 2,
    authNotificationAlertThrottleWindowMs: 3_600_000,
    authNotificationMaxAttempts: 6,
    authNotificationRetryBaseMs: 1_000,
    authNotificationRetryMaxMs: 60_000,
    authNotificationRequestTimeoutMs: 5_000,
    authSmtpHost: "",
    authEmailFrom: "",
    authSmtpPort: 587,
    authSmtpSecure: false,
    authSmtpUser: "",
    authSmtpPass: "",
    authTwilioAccountSid: "",
    authTwilioAuthToken: "",
    authTwilioFromNumber: "",
    authTwilioMessagingServiceSid: "",
    authNotificationWebhookUrl: "",
  })),
}));

vi.mock("../../shared/rate-limit", () => ({
  createRateLimiter: createRateLimiterMock,
}));

import { queueNotificationDelivery } from "./notification-service";

describe("queueNotificationDelivery", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    createRateLimiterMock.mockClear();
    loggerInfoMock.mockReset();
    insertReturningMock.mockReset();
    insertReturningMock.mockResolvedValue([{ id: 1 }]);
    consumeMock.mockResolvedValue({
      allowed: true,
      resetAt: Date.now() + 60_000,
      limit: 3,
    });
  });

  it("skips recipient throttling for in-app deliveries", async () => {
    const delivery = await queueNotificationDelivery({
      kind: "withdrawal_status_changed",
      channel: "in_app",
      recipient: "user:42",
      subject: "Withdrawal updated",
      metadata: {
        withdrawalId: 42,
        status: "paid",
      },
      userId: 42,
      notificationRecordId: 7,
    });

    expect(delivery.id).toBe(1);
    expect(createRateLimiterMock).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("continues enforcing recipient throttling for email deliveries", async () => {
    const delivery = await queueNotificationDelivery({
      kind: "withdrawal_status_changed",
      channel: "email",
      recipient: "User@example.com",
      subject: "Withdrawal updated",
      metadata: {
        withdrawalId: 42,
        status: "paid",
      },
      userId: 42,
      notificationRecordId: 7,
    });

    expect(delivery.id).toBe(1);
    expect(createRateLimiterMock).toHaveBeenCalledTimes(1);
    expect(consumeMock).toHaveBeenCalledWith(
      "withdrawal_status_changed:user@example.com",
    );
  });
});
