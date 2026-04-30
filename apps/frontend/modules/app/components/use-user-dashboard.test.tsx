// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { userDashboardCopy } from "./user-dashboard-copy";
import { useUserDashboard } from "./use-user-dashboard";

const browserUserApiClientMock = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getWalletBalance: vi.fn(),
  getEconomyLedger: vi.fn(),
  getRewardCenter: vi.fn(),
  listSessions: vi.fn(),
}));

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 42,
    email: "user@example.com",
    role: "user",
    emailVerifiedAt: "2026-04-01T00:00:00.000Z",
    phoneVerifiedAt: "2026-04-02T00:00:00.000Z",
  },
  session: {
    sessionId: "session-42",
    kind: "user",
    role: "user",
    ip: null,
    userAgent: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    lastSeenAt: "2026-04-28T00:00:00.000Z",
    expiresAt: "2026-05-28T00:00:00.000Z",
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

describe("useUserDashboard", () => {
  beforeEach(() => {
    browserUserApiClientMock.getCurrentSession.mockResolvedValue(
      ok(currentSession),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the overview view off wallet and payments endpoints", async () => {
    const { result } = renderHook(() =>
      useUserDashboard({
        initialCurrentSession: currentSession,
        copy: userDashboardCopy.en,
        view: "overview",
      }),
    );

    await waitFor(() => {
      expect(result.current.dashboardLoading).toBe(false);
    });

    expect(browserUserApiClientMock.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(browserUserApiClientMock.getWalletBalance).not.toHaveBeenCalled();
    expect(browserUserApiClientMock.getEconomyLedger).not.toHaveBeenCalled();
    expect(browserUserApiClientMock.getRewardCenter).not.toHaveBeenCalled();
    expect(browserUserApiClientMock.listSessions).not.toHaveBeenCalled();
  });

  it("loads wallet activity from the economy ledger for the wallet view", async () => {
    browserUserApiClientMock.getWalletBalance.mockResolvedValue(
      ok({
        balance: {
          withdrawableBalance: "40.00",
          bonusBalance: "5.00",
          lockedBalance: "10.00",
          totalBalance: "55.00",
        },
        assets: [],
        legacy: {
          withdrawableBalance: "40.00",
          bonusBalance: "5.00",
          lockedBalance: "10.00",
          totalBalance: "55.00",
        },
      }),
    );
    browserUserApiClientMock.getEconomyLedger.mockResolvedValue(
      ok([
        {
          id: 11,
          userId: 42,
          assetCode: "B_LUCK",
          entryType: "prediction_market_payout",
          amount: "5.63",
          balanceBefore: "100.00",
          balanceAfter: "105.63",
          referenceType: "prediction_market",
          referenceId: 12,
          actorType: "system",
          actorId: null,
          sourceApp: "backend.prediction_market",
          deviceFingerprint: null,
          requestId: null,
          idempotencyKey: null,
          metadata: null,
          createdAt: "2026-04-29T11:00:00.000Z",
        },
      ]),
    );

    const { result } = renderHook(() =>
      useUserDashboard({
        initialCurrentSession: currentSession,
        copy: userDashboardCopy.en,
        view: "wallet",
      }),
    );

    await waitFor(() => {
      expect(result.current.dashboardLoading).toBe(false);
    });

    expect(result.current.walletBalance).toBe("55.00");
    expect(result.current.activityEntries).toEqual([
      expect.objectContaining({
        id: "economy:11",
        source: "economy",
        assetCode: "B_LUCK",
        entryType: "prediction_market_payout",
      }),
    ]);
    expect(browserUserApiClientMock.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(browserUserApiClientMock.getWalletBalance).toHaveBeenCalledTimes(1);
    expect(browserUserApiClientMock.getEconomyLedger).toHaveBeenCalledWith({
      limit: 8,
    });
    expect(browserUserApiClientMock.getRewardCenter).not.toHaveBeenCalled();
    expect(browserUserApiClientMock.listSessions).not.toHaveBeenCalled();
  });
});
