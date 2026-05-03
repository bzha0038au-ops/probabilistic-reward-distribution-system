import { describe, expect, it, vi } from "vitest";

import type {
  CurrentUserSessionResponse,
  AcceptedResponse,
  PhoneVerificationResponse,
  SessionBulkRevocationResponse,
  UserMfaDisableResponse,
  UserMfaEnrollmentResponse,
  UserMfaStatusResponse,
  UserMfaVerifyResponse,
  UserSessionsResponse,
  SessionRevocationResponse,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import type { EconomyLedgerResponse } from "@reward/shared-types/economy";
import type { DrawOverviewResponse, DrawPlayResponse } from "@reward/shared-types/draw";
import type {
  RewardCenterResponse,
  RewardMissionClaimResponse,
} from "@reward/shared-types/gamification";
import type {
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationRecord,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type { WalletBalanceResponse } from "@reward/shared-types/user";
import type { ApiResult } from "@reward/user-core";

import { createLiveDataController } from "../../src/controllers/live-data-controller";
import { createInitialAppStateWithLiveSeed } from "../../src/state";

type BrowserUserClient = Parameters<typeof createLiveDataController>[0]["client"] extends infer T
  ? NonNullable<T>
  : never;

const storedProgress = {
  bestTake: 40,
  runCount: 0,
  lastEnding: "Nobody has played yet.",
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 7,
    email: "demo@reward.local",
    role: "user",
    emailVerifiedAt: "2026-05-01T09:00:00.000Z",
    phoneVerifiedAt: null,
  },
  session: {
    sessionId: "session-1",
    kind: "user",
    role: "user",
    ip: null,
    userAgent: null,
    createdAt: "2026-05-01T09:00:00.000Z",
    lastSeenAt: "2026-05-04T09:00:00.000Z",
    expiresAt: "2026-05-05T09:00:00.000Z",
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

const verifiedCurrentSession: CurrentUserSessionResponse = {
  ...currentSession,
  user: {
    ...currentSession.user,
    phoneVerifiedAt: "2026-05-04T10:05:00.000Z",
  },
};

const mfaStatusDisabled: UserMfaStatusResponse = {
  mfaEnabled: false,
  largeWithdrawalThreshold: "200.00",
};

const mfaStatusEnabled: UserMfaStatusResponse = {
  mfaEnabled: true,
  largeWithdrawalThreshold: "200.00",
};

const mfaEnrollment: UserMfaEnrollmentResponse = {
  secret: "BASE32SECRET",
  otpauthUrl: "otpauth://totp/Reward:demo@reward.local?secret=BASE32SECRET&issuer=Reward",
  enrollmentToken: "enrollment-token-1",
};

const walletBalance: WalletBalanceResponse = {
  balance: {
    withdrawableBalance: "48.00",
    bonusBalance: "12.00",
    lockedBalance: "3.00",
    totalBalance: "63.00",
  },
  assets: [],
  legacy: {
    withdrawableBalance: "48.00",
    bonusBalance: "12.00",
    lockedBalance: "3.00",
    totalBalance: "63.00",
  },
};

const drawOverview: DrawOverviewResponse = {
  drawEnabled: true,
  balance: "63.00",
  drawCost: "2.00",
  maxBatchCount: 5,
  recommendedBatchCount: 3,
  pity: {
    enabled: true,
    currentStreak: 2,
    threshold: 10,
    boostPct: 12,
    maxBoostPct: 25,
    active: false,
    drawsUntilBoost: 8,
  },
  playMode: {
    type: "standard",
    appliedMultiplier: 1,
    nextMultiplier: 1,
    streak: 0,
    lastOutcome: null,
    carryActive: false,
    pendingPayoutAmount: "0.00",
    pendingPayoutCount: 0,
    snowballCarryAmount: "0.00",
    snowballEnvelopeAmount: "0.00",
  },
  fairness: {
    epoch: 4,
    epochSeconds: 900,
    commitHash: "commit-1",
  },
  prizes: [
    {
      id: 1,
      name: "Lucky Bun",
      rewardAmount: "5.00",
      displayRarity: "common",
      stock: 50,
      stockState: "available",
      isFeatured: false,
    },
  ],
  featuredPrizes: [
    {
      id: 2,
      name: "Moonlight Hamper",
      rewardAmount: "25.00",
      displayRarity: "epic",
      stock: 3,
      stockState: "low",
      isFeatured: true,
    },
  ],
};

const drawPlay: DrawPlayResponse = {
  requestedCount: 1,
  count: 1,
  totalCost: "2.00",
  totalReward: "5.00",
  winCount: 1,
  endingBalance: "66.00",
  highestRarity: "common",
  pity: {
    enabled: true,
    currentStreak: 0,
    threshold: 10,
    boostPct: 12,
    maxBoostPct: 25,
    active: false,
    drawsUntilBoost: 10,
  },
  playMode: {
    type: "standard",
    appliedMultiplier: 1,
    nextMultiplier: 1,
    streak: 1,
    lastOutcome: "win",
    carryActive: false,
    pendingPayoutAmount: "0.00",
    pendingPayoutCount: 0,
    snowballCarryAmount: "0.00",
    snowballEnvelopeAmount: "0.00",
  },
  results: [],
};

const economyLedger: EconomyLedgerResponse = [
  {
    id: 101,
    userId: 7,
    assetCode: "B_LUCK",
    entryType: "draw_reward",
    amount: "5.00",
    balanceBefore: "61.00",
    balanceAfter: "66.00",
    referenceType: "draw_record",
    referenceId: 999,
    actorType: "system",
    actorId: null,
    sourceApp: "frontend",
    deviceFingerprint: null,
    requestId: "req-1",
    idempotencyKey: null,
    metadata: null,
    createdAt: "2026-05-04T10:00:00.000Z",
  },
];

const sessionsResponse: UserSessionsResponse = {
  items: [
    currentSession.session,
    {
      sessionId: "session-2",
      kind: "user",
      role: "user",
      ip: "127.0.0.1",
      userAgent: "Safari",
      createdAt: "2026-05-01T08:00:00.000Z",
      lastSeenAt: "2026-05-04T08:55:00.000Z",
      expiresAt: "2026-05-05T08:55:00.000Z",
      current: false,
    },
  ],
};

const rewardCenter: RewardCenterResponse = {
  summary: {
    bonusBalance: "12.00",
    streakDays: 3,
    todayDailyClaimed: false,
    availableMissionCount: 1,
    claimedMissionCount: 2,
  },
  missions: [
    {
      id: "daily-checkin",
      title: "Daily Check-in",
      description: "Open the app and touch the reward counter.",
      cadence: "daily",
      status: "ready",
      rewardAmount: "3.00",
      bonusUnlockWagerRatio: null,
      progressCurrent: 1,
      progressTarget: 1,
      claimable: true,
      autoAwarded: false,
      claimedAt: null,
      resetsAt: "2026-05-05T00:00:00.000Z",
    },
  ],
};

const notifications: NotificationRecord[] = [
  {
    id: 301,
    userId: 7,
    kind: "security_alert",
    title: "New device detected",
    body: "A fresh Safari session signed in from Sydney.",
    data: null,
    readAt: null,
    createdAt: "2026-05-04T10:10:00.000Z",
    updatedAt: "2026-05-04T10:10:00.000Z",
  },
  {
    id: 302,
    userId: 7,
    kind: "withdrawal_status_changed",
    title: "Withdrawal settled",
    body: "Your $48 withdrawal cleared manual review.",
    data: null,
    readAt: "2026-05-04T09:45:00.000Z",
    createdAt: "2026-05-04T09:30:00.000Z",
    updatedAt: "2026-05-04T09:45:00.000Z",
  },
];

const notificationListResponse: NotificationListResponse = {
  items: notifications,
};

const notificationSummary: NotificationSummary = {
  unreadCount: 1,
  latestCreatedAt: "2026-05-04T10:10:00.000Z",
};

const notificationPreferences: NotificationPreferencesResponse = {
  items: [
    {
      id: 1,
      userId: 7,
      kind: "security_alert",
      channel: "email",
      enabled: true,
      createdAt: "2026-05-01T09:00:00.000Z",
      updatedAt: "2026-05-01T09:00:00.000Z",
    },
    {
      id: 2,
      userId: 7,
      kind: "security_alert",
      channel: "sms",
      enabled: false,
      createdAt: "2026-05-01T09:00:00.000Z",
      updatedAt: "2026-05-01T09:00:00.000Z",
    },
    {
      id: 3,
      userId: 7,
      kind: "withdrawal_status_changed",
      channel: "email",
      enabled: true,
      createdAt: "2026-05-01T09:00:00.000Z",
      updatedAt: "2026-05-01T09:00:00.000Z",
    },
  ],
};

function okResult<T>(data: T): ApiResult<T> {
  return {
    ok: true,
    data,
    requestId: "req-1",
    traceId: "trace-1",
    status: 200,
  };
}

function createClientMock(overrides: Partial<BrowserUserClient> = {}): BrowserUserClient {
  return {
    createSession: vi.fn<BrowserUserClient["createSession"]>().mockResolvedValue(
      okResult<UserSessionResponse>({
        token: "token-1",
        expiresAt: Date.now() + 3600_000,
        sessionId: "session-1",
        user: currentSession.user,
        legal: currentSession.legal,
      }),
    ),
    getCurrentSession: vi.fn<BrowserUserClient["getCurrentSession"]>().mockResolvedValue(okResult(currentSession)),
    deleteCurrentSession: vi.fn<BrowserUserClient["deleteCurrentSession"]>().mockResolvedValue(
      okResult<SessionRevocationResponse>({
        revoked: true,
        scope: "current",
        sessionId: "session-1",
      }),
    ),
    listSessions: vi.fn<BrowserUserClient["listSessions"]>().mockResolvedValue(okResult(sessionsResponse)),
    revokeSession: vi.fn<BrowserUserClient["revokeSession"]>().mockResolvedValue(
      okResult<SessionRevocationResponse>({
        revoked: true,
        scope: "single",
        sessionId: "session-2",
      }),
    ),
    revokeAllSessions: vi.fn<BrowserUserClient["revokeAllSessions"]>().mockResolvedValue(
      okResult<SessionBulkRevocationResponse>({
        revokedCount: 2,
        scope: "all",
      }),
    ),
    requestEmailVerification: vi.fn<BrowserUserClient["requestEmailVerification"]>().mockResolvedValue(
      okResult<AcceptedResponse>({ accepted: true }),
    ),
    requestPhoneVerification: vi.fn<BrowserUserClient["requestPhoneVerification"]>().mockResolvedValue(
      okResult<AcceptedResponse>({ accepted: true }),
    ),
    confirmPhoneVerification: vi.fn<BrowserUserClient["confirmPhoneVerification"]>().mockResolvedValue(
      okResult<PhoneVerificationResponse>({
        verified: true,
        phone: "+61400000000",
      }),
    ),
    getUserMfaStatus: vi.fn<BrowserUserClient["getUserMfaStatus"]>().mockResolvedValue(
      okResult<UserMfaStatusResponse>(mfaStatusDisabled),
    ),
    createUserMfaEnrollment: vi.fn<BrowserUserClient["createUserMfaEnrollment"]>().mockResolvedValue(
      okResult<UserMfaEnrollmentResponse>(mfaEnrollment),
    ),
    verifyUserMfa: vi.fn<BrowserUserClient["verifyUserMfa"]>().mockResolvedValue(
      okResult<UserMfaVerifyResponse>({
        mfaEnabled: true,
      }),
    ),
    disableUserMfa: vi.fn<BrowserUserClient["disableUserMfa"]>().mockResolvedValue(
      okResult<UserMfaDisableResponse>({
        mfaEnabled: false,
      }),
    ),
    getWalletBalance: vi.fn<BrowserUserClient["getWalletBalance"]>().mockResolvedValue(okResult(walletBalance)),
    getEconomyLedger: vi.fn<BrowserUserClient["getEconomyLedger"]>().mockResolvedValue(okResult(economyLedger)),
    listNotifications: vi.fn<BrowserUserClient["listNotifications"]>().mockResolvedValue(
      okResult(notificationListResponse),
    ),
    getNotificationSummary: vi.fn<BrowserUserClient["getNotificationSummary"]>().mockResolvedValue(
      okResult(notificationSummary),
    ),
    markNotificationRead: vi.fn<BrowserUserClient["markNotificationRead"]>().mockResolvedValue(
      okResult({
        ...notifications[0],
        readAt: "2026-05-04T10:12:00.000Z",
        updatedAt: "2026-05-04T10:12:00.000Z",
      }),
    ),
    markAllNotificationsRead: vi.fn<BrowserUserClient["markAllNotificationsRead"]>().mockResolvedValue(
      okResult({ updatedCount: 1 }),
    ),
    listNotificationPreferences: vi.fn<BrowserUserClient["listNotificationPreferences"]>().mockResolvedValue(
      okResult(notificationPreferences),
    ),
    updateNotificationPreferences: vi.fn<BrowserUserClient["updateNotificationPreferences"]>().mockResolvedValue(
      okResult({
        items: notificationPreferences.items.map((entry) =>
          entry.kind === "security_alert" && entry.channel === "sms"
            ? { ...entry, enabled: true, updatedAt: "2026-05-04T10:15:00.000Z" }
            : entry,
        ),
      }),
    ),
    getRewardCenter: vi.fn<BrowserUserClient["getRewardCenter"]>().mockResolvedValue(okResult(rewardCenter)),
    claimRewardMission: vi.fn<BrowserUserClient["claimRewardMission"]>().mockResolvedValue(
      okResult<RewardMissionClaimResponse>({
        missionId: "daily-checkin",
        grantedAmount: "3.00",
      }),
    ),
    getDrawOverview: vi.fn<BrowserUserClient["getDrawOverview"]>().mockResolvedValue(okResult(drawOverview)),
    playDraw: vi.fn<BrowserUserClient["playDraw"]>().mockResolvedValue(okResult(drawPlay)),
    ...overrides,
  };
}

describe("live-data-controller", () => {
  it("creates a session and syncs wallet plus draw overview", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
    });
    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock();

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.submitLogin("demo@reward.local", "secret");

    expect(state.live.authToken).toBe("token-1");
    expect(state.live.session?.user.email).toBe("demo@reward.local");
    expect(state.live.wallet?.balance.totalBalance).toBe("63.00");
    expect(state.live.drawOverview?.drawCost).toBe("2.00");
    expect(state.live.activity).toHaveLength(1);
    expect(state.live.notifications).toHaveLength(2);
    expect(state.live.notificationSummary?.unreadCount).toBe(1);
    expect(state.live.notificationPreferences).toHaveLength(3);
    expect(state.live.sessions).toHaveLength(2);
    expect(state.live.rewardCenter?.missions).toHaveLength(1);
    expect(state.live.dashboardStatus).toBe("ready");
    expect(storage.getItem("token")).toBe("token-1");
    expect(storage.getItem("email")).toBe("demo@reward.local");
    expect(recordBeat).toHaveBeenCalledWith("Live session opened for demo@reward.local.");
  });

  it("plays the live draw and records the latest settlement", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      getDrawOverview: vi.fn<BrowserUserClient["getDrawOverview"]>().mockResolvedValue(
        okResult({
          ...drawOverview,
          balance: "66.00",
          pity: drawPlay.pity,
        }),
      ),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.playLiveDraw();

    expect(state.live.lastDraw?.endingBalance).toBe("66.00");
    expect(state.live.drawMessage).toContain("ending on $66");
    expect(state.live.drawOverview?.balance).toBe("66.00");
    expect(state.live.activity).toHaveLength(1);
    expect(state.live.dashboardStatus).toBe("ready");
    expect(recordBeat).toHaveBeenCalledWith("Live draw settled 1 win for $5.");
  });

  it("can resend email verification and claim reward missions", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;
    state.live.rewardCenter = rewardCenter;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      createSession: vi.fn<BrowserUserClient["createSession"]>(),
      deleteCurrentSession: vi.fn<BrowserUserClient["deleteCurrentSession"]>(),
      playDraw: vi.fn<BrowserUserClient["playDraw"]>(),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.sendVerificationEmail();
    await controller.claimRewardMission("daily-checkin");

    expect(client.requestEmailVerification).toHaveBeenCalledWith({ resend: true });
    expect(client.claimRewardMission).toHaveBeenCalledWith("daily-checkin");
    expect(state.live.rewardCenter?.missions).toHaveLength(1);
    expect(recordBeat).toHaveBeenCalledWith("Verification email re-issued from the live profile panel.");
    expect(recordBeat).toHaveBeenCalledWith("Reward mission daily-checkin claimed for $3.");
  });

  it("can mark a notification as read and update the unread counter", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.notifications = notifications;
    state.live.notificationSummary = notificationSummary;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock();

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.markNotificationRead(301);

    expect(client.markNotificationRead).toHaveBeenCalledWith(301);
    expect(state.live.notifications[0]?.readAt).toBe("2026-05-04T10:12:00.000Z");
    expect(state.live.notificationSummary?.unreadCount).toBe(0);
    expect(recordBeat).toHaveBeenCalledWith(
      "Notification 301 marked as read from the live profile panel.",
    );
  });

  it("can mark all notifications as read and toggle delivery preferences", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.notifications = notifications;
    state.live.notificationSummary = notificationSummary;
    state.live.notificationPreferences = notificationPreferences.items;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      listNotifications: vi.fn<BrowserUserClient["listNotifications"]>().mockResolvedValue(
        okResult({
          items: notifications.map((entry) =>
            entry.id === 301
              ? { ...entry, readAt: "2026-05-04T10:20:00.000Z", updatedAt: "2026-05-04T10:20:00.000Z" }
              : entry,
          ),
        }),
      ),
      getNotificationSummary: vi.fn<BrowserUserClient["getNotificationSummary"]>().mockResolvedValue(
        okResult({
          unreadCount: 0,
          latestCreatedAt: notificationSummary.latestCreatedAt,
        }),
      ),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.markAllNotificationsRead();
    await controller.updateNotificationPreference("security_alert", "sms", true);

    expect(client.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(client.updateNotificationPreferences).toHaveBeenCalledWith({
      items: [{ kind: "security_alert", channel: "sms", enabled: true }],
    });
    expect(state.live.notificationSummary?.unreadCount).toBe(0);
    expect(
      state.live.notificationPreferences.find(
        (entry) => entry.kind === "security_alert" && entry.channel === "sms",
      )?.enabled,
    ).toBe(true);
    expect(recordBeat).toHaveBeenCalledWith(
      "Marked 1 notification as read from the live profile panel.",
    );
    expect(recordBeat).toHaveBeenCalledWith(
      "Notification delivery for security_alert/sms switched on from the live profile panel.",
    );
  });

  it("can request and confirm phone verification", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      getCurrentSession: vi.fn<BrowserUserClient["getCurrentSession"]>().mockResolvedValue(okResult(verifiedCurrentSession)),
      createSession: vi.fn<BrowserUserClient["createSession"]>(),
      deleteCurrentSession: vi.fn<BrowserUserClient["deleteCurrentSession"]>(),
      playDraw: vi.fn<BrowserUserClient["playDraw"]>(),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.sendPhoneVerificationCode("+61400000000");
    await controller.confirmPhoneVerification("123456");

    expect(client.requestPhoneVerification).toHaveBeenCalledWith({ phone: "+61400000000" });
    expect(client.confirmPhoneVerification).toHaveBeenCalledWith({
      phone: "+61400000000",
      code: "123456",
    });
    expect(state.live.phoneDraft).toBe("+61400000000");
    expect(state.live.phoneCodeDraft).toBe("");
    expect(state.live.session?.user.phoneVerifiedAt).toBe("2026-05-04T10:05:00.000Z");
    expect(state.live.phoneStatus).toBe("ready");
    expect(recordBeat).toHaveBeenCalledWith("Phone verification code sent to +61400000000.");
    expect(recordBeat).toHaveBeenCalledWith("Phone verification completed for +61400000000.");
  });

  it("can enroll and verify MFA", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      getUserMfaStatus: vi.fn<BrowserUserClient["getUserMfaStatus"]>().mockResolvedValue(
        okResult<UserMfaStatusResponse>(mfaStatusEnabled),
      ),
      createSession: vi.fn<BrowserUserClient["createSession"]>(),
      deleteCurrentSession: vi.fn<BrowserUserClient["deleteCurrentSession"]>(),
      playDraw: vi.fn<BrowserUserClient["playDraw"]>(),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.beginMfaEnrollment();

    expect(client.createUserMfaEnrollment).toHaveBeenCalledTimes(1);
    expect(state.live.mfaEnrollment?.enrollmentToken).toBe("enrollment-token-1");
    expect(state.live.mfaStatus).toBe("ready");

    await controller.verifyMfaEnrollment("123456");

    expect(client.verifyUserMfa).toHaveBeenCalledWith({
      enrollmentToken: "enrollment-token-1",
      totpCode: "123456",
    });
    expect(state.live.mfaEnrollment).toBeNull();
    expect(state.live.mfaCodeDraft).toBe("");
    expect(state.live.mfaSummary?.mfaEnabled).toBe(true);
    expect(recordBeat).toHaveBeenCalledWith("MFA enrollment secret issued from the profile security panel.");
    expect(recordBeat).toHaveBeenCalledWith("MFA enabled from the profile security panel.");
  });

  it("can disable MFA with a TOTP code", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;
    state.live.mfaSummary = mfaStatusEnabled;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      getUserMfaStatus: vi.fn<BrowserUserClient["getUserMfaStatus"]>().mockResolvedValue(
        okResult<UserMfaStatusResponse>(mfaStatusDisabled),
      ),
      createSession: vi.fn<BrowserUserClient["createSession"]>(),
      deleteCurrentSession: vi.fn<BrowserUserClient["deleteCurrentSession"]>(),
      playDraw: vi.fn<BrowserUserClient["playDraw"]>(),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.disableMfa("654321");

    expect(client.disableUserMfa).toHaveBeenCalledWith({
      totpCode: "654321",
    });
    expect(state.live.mfaCodeDraft).toBe("");
    expect(state.live.mfaSummary?.mfaEnabled).toBe(false);
    expect(recordBeat).toHaveBeenCalledWith("MFA disabled from the profile security panel.");
  });

  it("revokes the current live session and clears local auth state", async () => {
    const storage = new MemoryStorage();
    storage.setItem("token", "token-1");
    storage.setItem("email", "demo@reward.local");

    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.sessions = sessionsResponse.items;
    state.live.wallet = walletBalance;
    state.live.drawOverview = drawOverview;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      revokeSession: vi.fn<BrowserUserClient["revokeSession"]>().mockResolvedValue(
        okResult<SessionRevocationResponse>({
          revoked: true,
          scope: "current",
          sessionId: "session-1",
        }),
      ),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.revokeSession("session-1", true);

    expect(client.revokeSession).toHaveBeenCalledWith("session-1");
    expect(state.live.authToken).toBeNull();
    expect(state.live.session).toBeNull();
    expect(state.live.sessions).toHaveLength(0);
    expect(state.live.wallet).toBeNull();
    expect(state.live.dashboardStatus).toBe("idle");
    expect(storage.getItem("token")).toBeNull();
    expect(storage.getItem("email")).toBe("demo@reward.local");
    expect(recordBeat).toHaveBeenCalledWith("Current live session revoked from the profile security panel.");
  });

  it("revokes another session and refreshes the dashboard list", async () => {
    const storage = new MemoryStorage();
    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.sessions = sessionsResponse.items;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const refreshedSessions: UserSessionsResponse = {
      items: [currentSession.session],
    };
    const client = createClientMock({
      listSessions: vi.fn<BrowserUserClient["listSessions"]>().mockResolvedValue(okResult(refreshedSessions)),
      revokeSession: vi.fn<BrowserUserClient["revokeSession"]>().mockResolvedValue(
        okResult<SessionRevocationResponse>({
          revoked: true,
          scope: "single",
          sessionId: "session-2",
        }),
      ),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.revokeSession("session-2", false);

    expect(client.revokeSession).toHaveBeenCalledWith("session-2");
    expect(state.live.sessions).toHaveLength(1);
    expect(state.live.sessions[0]?.sessionId).toBe("session-1");
    expect(state.live.authToken).toBe("token-1");
    expect(state.live.dashboardStatus).toBe("ready");
    expect(recordBeat).toHaveBeenCalledWith("Live session session-2 revoked from the profile security panel.");
  });

  it("revokes all sessions and clears the current live connection", async () => {
    const storage = new MemoryStorage();
    storage.setItem("token", "token-1");
    storage.setItem("email", "demo@reward.local");

    const state = createInitialAppStateWithLiveSeed("", storedProgress, {
      apiBaseUrl: "/api/user",
      authToken: "token-1",
      rememberedEmail: "demo@reward.local",
    });
    state.live.session = currentSession;
    state.live.sessions = sessionsResponse.items;

    const render = vi.fn();
    const recordBeat = vi.fn();
    const client = createClientMock({
      revokeAllSessions: vi.fn<BrowserUserClient["revokeAllSessions"]>().mockResolvedValue(
        okResult<SessionBulkRevocationResponse>({
          revokedCount: 2,
          scope: "all",
        }),
      ),
    });

    const controller = createLiveDataController({
      state,
      storage,
      authTokenStorageKey: "token",
      rememberedEmailStorageKey: "email",
      render,
      recordBeat,
      client,
    });

    await controller.revokeAllSessions();

    expect(client.revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(state.live.authToken).toBeNull();
    expect(state.live.session).toBeNull();
    expect(state.live.sessions).toHaveLength(0);
    expect(storage.getItem("token")).toBeNull();
    expect(recordBeat).toHaveBeenCalledWith("Revoked 2 live sessions from the profile security panel.");
  });
});
