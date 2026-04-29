import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
const queueNotificationDeliveryMock = vi.hoisted(() => vi.fn());
const loggerDebugMock = vi.hoisted(() => vi.fn());
const loggerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("../../shared/logger", () => ({
  logger: {
    debug: loggerDebugMock,
    warning: loggerWarningMock,
  },
}));

vi.mock("../auth/notification-service", () => ({
  normalizeEmail: vi.fn((value: string) => value.trim().toLowerCase()),
  normalizePhone: vi.fn((value: string) => value.trim()),
  queueNotificationDelivery: queueNotificationDeliveryMock,
}));

import { sendUserNotification } from "./service";

const missingPushDevicesError = {
  cause: {
    code: "42P01",
    message: 'relation "notification_push_devices" does not exist',
  },
};

const buildTransaction = () => ({
  select: vi.fn((fields: Record<string, unknown>) => {
    if ("channel" in fields && "enabled" in fields) {
      return {
        from: () => ({
          where: async () => [],
        }),
      };
    }

    if ("token" in fields && "platform" in fields) {
      return {
        from: () => ({
          where: () => ({
            orderBy: async () => {
              throw missingPushDevicesError;
            },
          }),
        }),
      };
    }

    throw new Error(`Unexpected select fields: ${Object.keys(fields).join(",")}`);
  }),
  insert: vi.fn(() => ({
    values: () => ({
      returning: async () => [{ id: 77 }],
    }),
  })),
});

describe("sendUserNotification", () => {
  beforeEach(() => {
    transactionMock.mockReset();
    queueNotificationDeliveryMock.mockReset();
    loggerDebugMock.mockReset();
    loggerWarningMock.mockReset();
  });

  it("falls back when notification_push_devices is unavailable", async () => {
    const tx = buildTransaction();
    transactionMock.mockImplementation(async (callback) => callback(tx));
    queueNotificationDeliveryMock.mockImplementation(async (payload) => ({
      id: payload.channel === "in_app" ? 1 : 2,
      ...payload,
    }));

    const result = await sendUserNotification({
      userId: 42,
      email: "user@example.com",
      kind: "kyc_status_changed",
      title: "KYC approved",
      body: "Your verification was approved.",
      channels: ["in_app", "email", "push"],
      data: {
        status: "approved",
      },
    });

    expect(result.deliveries).toHaveLength(2);
    expect(queueNotificationDeliveryMock).toHaveBeenCalledTimes(2);
    expect(queueNotificationDeliveryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: "in_app",
        recipient: "user:42",
      }),
      tx,
    );
    expect(queueNotificationDeliveryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        channel: "email",
        recipient: "user@example.com",
      }),
      tx,
    );
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "notification relation unavailable; using compatibility fallback",
      {
        tableName: "notification_push_devices",
      },
    );
    expect(loggerWarningMock).not.toHaveBeenCalled();
  });
});
