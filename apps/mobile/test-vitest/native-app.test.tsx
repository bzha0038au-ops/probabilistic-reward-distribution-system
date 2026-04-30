import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";

import { cleanupHooks, installTestDom, renderTestComponent } from "../test/test-dom";

const nativeAppMocks = vi.hoisted(() => {
  Object.defineProperty(globalThis, "__DEV__", {
    configurable: true,
    value: true,
    writable: true,
  });
  const navigationState = {
    currentRoute: "home",
  };

  return {
    api: {
      acceptCurrentLegalDocuments: vi.fn(),
      getCommunityThread: vi.fn(),
      getCurrentLegalDocuments: vi.fn(),
      getNotificationSummary: vi.fn(),
      listCommunityThreads: vi.fn(),
      listNotifications: vi.fn(),
      registerNotificationPushDevice: vi.fn(),
    },
    authFlow: {
      applyAuthLink: vi.fn(() => false),
      birthDate: "",
      email: "",
      handleConfirmEmailVerification: vi.fn(),
      handleConfirmPasswordReset: vi.fn(),
      handleLogin: vi.fn(),
      handleRegister: vi.fn(),
      handleRequestEmailVerification: vi.fn(),
      handleRequestPasswordReset: vi.fn(),
      handleSeededLogin: vi.fn(),
      newPassword: "",
      password: "",
      resetAuthInputs: vi.fn(),
      resetTokenInput: "",
      sendingVerification: false,
      setBirthDate: vi.fn(),
      setEmail: vi.fn(),
      setNewPassword: vi.fn(),
      setPassword: vi.fn(),
      setResetTokenInput: vi.fn(),
      setVerificationTokenInput: vi.fn(),
      verificationTokenInput: "",
    },
    community: {
      openWebFailed: "Open community web failed.",
      titleRequired: "Title required.",
      bodyRequired: "Body required.",
      createFailed: "Create failed.",
      replyRequired: "Reply required.",
      replyFailed: "Reply failed.",
      loadFailed: "Load failed.",
      loadThreadFailed: "Load thread failed.",
      createHidden: "Thread hidden.",
      createQueued: "Thread queued.",
      createSuccess: "Thread created.",
      replyHidden: "Reply hidden.",
      replyQueued: "Reply queued.",
      replySuccess: "Reply created.",
      captchaRequired: "Captcha required.",
      captchaInvalid: "Captcha invalid.",
      kycRequired: "KYC required.",
      threadMissing: "Thread missing.",
      threadLocked: "Thread locked.",
      rateLimited: "Rate limited.",
    },
    drawCatalog: null as unknown,
    fairness: {
      commitLive: "Commit live",
      refreshing: "Refreshing fairness",
    },
    fairnessCommit: null as unknown,
    kycProfile: null as unknown,
    playingDrawCount: null as number | null,
    navigation: {
      canGoBack: vi.fn(() => false),
      dispatch: vi.fn((action?: { payload?: { name?: string }; type?: string }) => {
        const nextName = action?.payload?.name;
        if (nextName) {
          navigationState.currentRoute = nextName;
        } else if (action?.type === "POP_TO_TOP") {
          navigationState.currentRoute = "home";
        }
      }),
      getCurrentRoute: vi.fn(() => ({
        name: navigationState.currentRoute,
      })),
      isReady: vi.fn(() => true),
      navigate: vi.fn((name: string) => {
        navigationState.currentRoute = name;
      }),
    },
    navigationState,
    refreshBalance: vi.fn(async () => true),
    refreshBlackjackOverview: vi.fn(async () => true),
    refreshCurrentSession: vi.fn(async (session: unknown) => session),
    refreshDrawCatalog: vi.fn(async () => true),
    refreshFairnessCommit: vi.fn(async () => true),
    refreshHoldemLobby: vi.fn(async () => true),
    refreshKycProfile: vi.fn(async () => true),
    refreshPredictionMarkets: vi.fn(async () => true),
    refreshRewardCenter: vi.fn(async () => true),
    refreshSessions: vi.fn(async () => true),
    resetBlackjack: vi.fn(),
    resetDraw: vi.fn(),
    resetFairness: vi.fn(),
    resetHoldem: vi.fn(),
    resetKycProfile: vi.fn(),
    resetPredictionMarket: vi.fn(),
    resetQuickEight: vi.fn(),
    resetRewardCenter: vi.fn(),
    resetWallet: vi.fn(),
    rewardCenter: null as unknown,
    routeCopy: {
      cards: [],
      heroes: {
        account: { subtitle: "Account subtitle" },
        blackjack: { subtitle: "Blackjack subtitle" },
        community: { subtitle: "Community subtitle" },
        fairness: { subtitle: "Fairness subtitle" },
        gacha: { subtitle: "Gacha subtitle" },
        holdem: { subtitle: "Holdem subtitle" },
        home: { subtitle: "Home subtitle" },
        notifications: { subtitle: "Notifications subtitle" },
        predictionMarket: { subtitle: "Prediction subtitle" },
        quickEight: { subtitle: "QuickEight subtitle" },
        rewards: { subtitle: "Rewards subtitle" },
        security: { subtitle: "Security subtitle" },
        wallet: { subtitle: "Wallet subtitle" },
      },
      homeSectionSubtitle: "Home subtitle",
      homeSectionTitle: "Home title",
      labels: {
        account: "Account",
        blackjack: "Blackjack",
        community: "Community",
        fairness: "Fairness",
        gacha: "Gacha",
        holdem: "Holdem",
        home: "Home",
        notifications: "Notifications",
        predictionMarket: "Prediction",
        quickEight: "QuickEight",
        rewards: "Rewards",
        security: "Security",
        wallet: "Wallet",
      },
      screens: {
        blackjack: {},
        gacha: {},
        holdem: {},
        predictionMarket: {},
        quickEight: {},
      },
    },
    userSession: {
      currentSession: null as
        | {
            current: boolean;
            sessionId: string;
          }
        | null,
      handleUnauthorized: vi.fn(async () => true),
      loadingSessions: false,
      refreshScreen: null as "app" | "login" | null,
      restoringSession: false,
      setScreen: null as ((screen: "app" | "login") => void) | null,
      session: null as
        | {
            expiresAt: number;
            legal: {
              items: Array<{ accepted: boolean; slug: string; version: string }>;
              requiresAcceptance: boolean;
            };
            sessionId: string;
            token: string;
            user: {
              email: string;
              emailVerifiedAt: string | null;
              id: number;
              phoneVerifiedAt: string | null;
              role: "user";
            };
          }
        | null,
      visibleSessions: [] as Array<{ current: boolean; sessionId: string }>,
    },
  };
});

vi.mock("react-native", () => ({
  ActivityIndicator: () => <div data-testid="activity-indicator" />,
  Linking: {
    canOpenURL: vi.fn(async () => true),
    openURL: vi.fn(async () => undefined),
  },
  Platform: {
    OS: "ios",
    select: <T,>(value: { android?: T; default?: T; ios?: T }) =>
      value.ios ?? value.default ?? value.android,
  },
  Pressable: ({
    children,
    disabled = false,
    onPress,
    testID,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button
      type="button"
      data-testid={testID}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  ScrollView: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SafeAreaView: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

vi.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="navigation-container">{children}</div>
  ),
  StackActions: {
    popToTop: vi.fn(() => ({ type: "POP_TO_TOP" })),
    replace: vi.fn((name: string) => ({ type: "REPLACE", payload: { name } })),
  },
  useNavigationContainerRef: () => nativeAppMocks.navigation,
}));

vi.mock("@reward/user-core", () => ({
  createUserApiClient: () => nativeAppMocks.api,
}));

vi.mock("../src/app-support", () => ({
  AppStack: {
    Navigator: ({
      children,
      initialRouteName,
      screenOptions,
    }: {
      children: ReactNode;
      initialRouteName?: string;
      screenOptions?: {
        headerRight?: () => ReactNode;
      };
    }) => (
      <div
        data-testid="app-stack"
        data-initial-route={initialRouteName ?? ""}
      >
        <div data-testid="app-stack-header">{screenOptions?.headerRight?.()}</div>
        {children}
      </div>
    ),
    Screen: ({
      children,
      name,
    }: {
      children?: ReactNode | (() => ReactNode);
      name: string;
    }) => (
      <div data-testid={`screen-${name}`}>
        {typeof children === "function" ? children() : children}
      </div>
    ),
  },
  appNavigationTheme: {},
  blackjackStatusLabels: {},
  buildWebUrl: (path: string) => `http://localhost:3000${path === "/" ? "" : path}`,
  configuredApiBaseUrl: "http://localhost:4000",
  drawRarityLabels: {},
  drawStatusLabels: {},
  drawStockLabels: {},
  formatAmount: (value: number) => String(value),
  formatOptionalTimestamp: (value: string | null) => value,
  formatTimestamp: (value: string | null) => value ?? "Unknown",
  platform: "ios",
  quickEightStatusLabels: {},
  shortenCommitHash: (value: string) => value,
  summarizeUserAgent: (value: string | null) => value ?? "Unknown",
  webviewQaEnabled: false,
}));

vi.mock("../src/community-copy", () => ({
  getMobileCommunityCopy: () => nativeAppMocks.community,
}));

vi.mock("../src/fairness", () => ({
  getMobileFairnessCopy: () => nativeAppMocks.fairness,
  resolveMobileFairnessLocale: () => "en",
}));

vi.mock("../src/mobile-copy", () => ({
  getMobileAppCopy: () => ({
    appHero: {
      authSubtitle: "Sign in to continue.",
      endpointLabel: "API",
      kicker: "Reward System",
      title: "Mobile shell",
    },
    auth: {
      legal: {
        required: "Accept all legal documents.",
      },
    },
    legalGate: {
      required: "Accept updated legal documents.",
      subtitle: "Review every updated document before continuing.",
      success: "Legal documents accepted.",
      title: "Accept the latest legal terms",
    },
    restoringSession: {
      subtitle: "Rehydrating secure session state.",
      title: "Restoring session",
    },
    rewardCenter: {},
    sessionSecurity: {},
    signedIn: {
      unknownRole: "Unknown role",
      unknownUser: "Unknown user",
    },
    verificationCallout: {
      body: "Verify your email.",
    },
    wallet: {},
  }),
}));

vi.mock("../src/play-mode-copy", () => ({
  getPlayModeCopy: () => ({}),
}));

vi.mock("../src/route-copy", () => ({
  getMobileRouteCopy: () => nativeAppMocks.routeCopy,
}));

vi.mock("../src/push-notifications", () => ({
  registerForPushNotifications: vi.fn(async () => ({
    platform: null,
    reason: "simulator_not_supported:test",
    token: null,
  })),
}));

vi.mock("../src/device-fingerprint", () => ({
  getMobileDeviceFingerprint: vi.fn(async () => null),
}));

vi.mock("../src/auth/auth-card", () => ({
  MobileAuthCard: ({ screen }: { screen: string }) => (
    <div data-testid="auth-card">{screen}</div>
  ),
}));

vi.mock("../src/legal/legal-acceptance-card", () => ({
  MobileLegalAcceptanceCard: ({
    pendingDocumentKeys,
  }: {
    pendingDocumentKeys: string[];
  }) => (
    <div data-testid="legal-card">{pendingDocumentKeys.join(",")}</div>
  ),
  buildLegalDocumentKey: (document: { slug: string; version: string }) =>
    `${document.slug}:${document.version}`,
}));

vi.mock("../src/sections/verification-callout", () => ({
  VerificationCallout: () => <div data-testid="verification-callout" />,
}));

vi.mock("../src/ui", () => ({
  ToastBanner: ({ message }: { message: string }) => (
    <div data-testid="toast-banner">{message}</div>
  ),
}));

vi.mock("../src/webview-qa-harness", () => ({
  WebviewQaHarness: () => <div data-testid="webview-qa-harness" />,
}));

vi.mock("../src/screens", () => ({
  AccountRouteContainer: () => <div />,
  BlackjackRouteContainer: () => <div />,
  CommunityRouteContainer: () => <div />,
  FairnessRouteContainer: ({ onBack }: { onBack?: () => void }) => (
    <button type="button" data-testid="back-home-fairness" onClick={onBack}>
      back-home
    </button>
  ),
  GachaRouteContainer: ({ onBack }: { onBack?: () => void }) => (
    <button type="button" data-testid="back-home-gacha" onClick={onBack}>
      back-home
    </button>
  ),
  HoldemRouteContainer: () => <div />,
  HomeRouteContainer: ({
    navigationLocked,
    onOpenRoute,
  }: {
    navigationLocked?: boolean;
    onOpenRoute: (
      route:
        | "account"
        | "community"
        | "gacha"
        | "security"
        | "notifications"
        | "rewards"
        | "holdem"
        | "predictionMarket"
        | "blackjack"
        | "fairness",
    ) => void;
  }) => (
    <div>
      {(
        [
          "account",
          "community",
          "gacha",
          "security",
          "notifications",
          "rewards",
          "holdem",
          "predictionMarket",
          "blackjack",
          "fairness",
        ] as const
      ).map((route) => (
        <button
          key={route}
          type="button"
          disabled={navigationLocked}
          data-testid={`open-route-${route}`}
          onClick={() => onOpenRoute(route)}
        >
          {route}
        </button>
      ))}
    </div>
  ),
  NotificationsRouteContainer: () => <div />,
  PredictionMarketRouteContainer: () => <div />,
  QuickEightRouteContainer: () => <div />,
  RewardsRouteContainer: () => <div />,
  SecurityRouteContainer: () => <div />,
  WalletRouteContainer: () => <div />,
}));

vi.mock("../src/hooks/use-auth-flow", () => ({
  useAuthFlow: () => nativeAppMocks.authFlow,
}));

vi.mock("../src/hooks/use-user-session", async () => {
  const React = await import("react");

  return {
    useUserSession: (options: { setScreen: (screen: "app" | "login") => void }) => {
      React.useEffect(() => {
        nativeAppMocks.userSession.setScreen = options.setScreen;
        if (nativeAppMocks.userSession.refreshScreen) {
          options.setScreen(nativeAppMocks.userSession.refreshScreen);
        }
      }, [options]);

      return {
        clearSession: vi.fn(),
        currentSession: nativeAppMocks.userSession.currentSession,
        handleUnauthorized: nativeAppMocks.userSession.handleUnauthorized,
        loadingSessions: nativeAppMocks.userSession.loadingSessions,
        reconcileSession: vi.fn(async (session: unknown) => session),
        refreshCurrentSession: nativeAppMocks.refreshCurrentSession,
        refreshSessions: nativeAppMocks.refreshSessions,
        restoringSession: nativeAppMocks.userSession.restoringSession,
        revokeAllSessions: vi.fn(),
        revokeSession: vi.fn(),
        session: nativeAppMocks.userSession.session,
        signOut: vi.fn(),
        startAuthenticatedSession: vi.fn(),
        visibleSessions: nativeAppMocks.userSession.visibleSessions,
      };
    },
  };
});

vi.mock("../src/hooks/use-wallet", () => ({
  useWallet: () => ({
    balance: 125,
    refreshBalance: nativeAppMocks.refreshBalance,
    refreshingBalance: false,
    resetWallet: nativeAppMocks.resetWallet,
    syncBalance: vi.fn(async () => true),
    wallet: null,
  }),
}));

vi.mock("../src/hooks/use-kyc-profile", () => ({
  useKycProfile: () => ({
    kycProfile: nativeAppMocks.kycProfile,
    loadingKycProfile: false,
    refreshKycProfile: nativeAppMocks.refreshKycProfile,
    resetKycProfile: nativeAppMocks.resetKycProfile,
  }),
}));

vi.mock("../src/hooks/use-reward-center", () => ({
  useRewardCenter: () => ({
    claimingMissionId: null,
    claimReward: vi.fn(),
    loadingRewardCenter: false,
    refreshRewardCenter: nativeAppMocks.refreshRewardCenter,
    resetRewardCenter: nativeAppMocks.resetRewardCenter,
    rewardCenter: nativeAppMocks.rewardCenter,
  }),
}));

vi.mock("../src/hooks/use-economy", () => ({
  useEconomy: () => ({
    giftEnergy: null,
    giftTransfers: [],
    ledgerEntries: [],
    loadingEconomy: false,
    refreshEconomy: vi.fn(async () => true),
    sendGift: vi.fn(async () => true),
    sendingGift: false,
  }),
}));

vi.mock("../src/hooks/use-iap", () => ({
  useIap: () => ({
    connected: false,
    giftPackProducts: [],
    iapProducts: [],
    loadingIapProducts: false,
    purchaseGiftPack: vi.fn(),
    purchaseVoucher: vi.fn(),
    purchasingSku: null,
    refreshIapProducts: vi.fn(async () => true),
    supported: false,
    syncPendingStorePurchases: vi.fn(async () => true),
    syncingPendingPurchases: false,
  }),
}));

vi.mock("../src/hooks/use-quick-eight", () => ({
  useQuickEight: () => ({
    clearQuickEightSelection: vi.fn(),
    playQuickEight: vi.fn(),
    playingQuickEight: false,
    quickEightMatchedSet: null,
    quickEightResult: null,
    quickEightSelection: [],
    quickEightStakeAmount: "",
    resetQuickEight: nativeAppMocks.resetQuickEight,
    setQuickEightStakeAmount: vi.fn(),
    toggleQuickEightNumber: vi.fn(),
    visibleQuickEightDrawnNumbers: [],
  }),
}));

vi.mock("../src/hooks/use-draw", () => ({
  useDraw: () => ({
    drawCatalog: nativeAppMocks.drawCatalog,
    featuredPrizes: [],
    gachaAnimating: false,
    gachaLockedReels: [],
    gachaReels: [],
    gachaTone: null,
    highlightPrize: null,
    lastDrawPlay: null,
    loadingDrawCatalog: false,
    multiDrawCount: 1,
    playDraw: vi.fn(),
    playingDrawCount: nativeAppMocks.playingDrawCount,
    refreshDrawCatalog: nativeAppMocks.refreshDrawCatalog,
    resetDraw: nativeAppMocks.resetDraw,
    setDrawPlayMode: vi.fn(),
    updatingDrawPlayMode: false,
  }),
}));

vi.mock("../src/hooks/use-blackjack", () => ({
  useBlackjack: () => ({
    actOnBlackjack: vi.fn(),
    actingBlackjack: null,
    blackjackOverview: null,
    blackjackStakeAmount: "",
    loadingBlackjack: false,
    refreshBlackjackOverview: nativeAppMocks.refreshBlackjackOverview,
    resetBlackjack: nativeAppMocks.resetBlackjack,
    setBlackjackPlayMode: vi.fn(),
    setBlackjackStakeAmount: vi.fn(),
    startBlackjack: vi.fn(),
    updatingBlackjackPlayMode: false,
  }),
}));

vi.mock("../src/hooks/use-holdem", () => ({
  useHoldem: () => ({
    actOnHoldemTable: vi.fn(),
    actingHoldem: null,
    closeHoldemReplay: vi.fn(),
    createHoldemTable: vi.fn(),
    getHoldemEvidenceBundle: vi.fn(),
    holdemActionAmount: "",
    holdemBuyInAmount: "",
    holdemCreateMaxSeats: 6,
    holdemCreateTableType: "cash",
    holdemPlayMode: "cash",
    holdemRealtimeStatus: "idle",
    holdemReplayError: null,
    holdemTableMessages: [],
    holdemTableName: "",
    holdemTables: [],
    holdemTournamentPayoutPlaces: 3,
    holdemTournamentStartingStackAmount: "",
    joinHoldemTable: vi.fn(),
    leaveHoldemTable: vi.fn(),
    loadingHoldemLobby: false,
    loadingHoldemMessages: false,
    loadingHoldemReplay: false,
    loadingHoldemTable: false,
    openHoldemReplay: vi.fn(),
    refreshHoldemLobby: nativeAppMocks.refreshHoldemLobby,
    refreshHoldemTable: vi.fn(async () => true),
    resetHoldem: nativeAppMocks.resetHoldem,
    selectedHoldemReplay: null,
    selectedHoldemReplayRoundId: null,
    selectedHoldemTable: null,
    sendHoldemTableMessage: vi.fn(),
    sendingHoldemMessage: false,
    setHoldemActionAmount: vi.fn(),
    setHoldemBuyInAmount: vi.fn(),
    setHoldemCreateMaxSeats: vi.fn(),
    setHoldemCreateTableType: vi.fn(),
    setHoldemPlayMode: vi.fn(),
    setHoldemSeatMode: vi.fn(),
    setHoldemTableName: vi.fn(),
    setHoldemTournamentPayoutPlaces: vi.fn(),
    setHoldemTournamentStartingStackAmount: vi.fn(),
    setSelectedHoldemTableId: vi.fn(),
    startHoldemTable: vi.fn(),
    updatingHoldemPlayMode: false,
  }),
}));

vi.mock("../src/hooks/use-prediction-market", () => ({
  usePredictionMarket: () => ({
    goToNextPredictionMarketHistoryPage: vi.fn(),
    goToPreviousPredictionMarketHistoryPage: vi.fn(),
    loadingPredictionMarket: false,
    loadingPredictionMarketHistory: false,
    loadingPredictionMarkets: false,
    placePredictionPosition: vi.fn(),
    placingPredictionPosition: false,
    predictionMarketHistory: [],
    predictionMarketHistoryPage: 1,
    predictionMarketHistoryStatus: "all",
    predictionMarketPositionCount: 0,
    predictionMarketStakeAmount: "",
    predictionMarkets: [],
    refreshPredictionMarketHistory: vi.fn(async () => true),
    refreshPredictionMarkets: nativeAppMocks.refreshPredictionMarkets,
    resetPredictionMarket: nativeAppMocks.resetPredictionMarket,
    selectPredictionMarket: vi.fn(),
    selectPredictionMarketHistoryStatus: vi.fn(),
    selectedPredictionMarket: null,
    selectedPredictionMarketId: null,
    selectedPredictionOutcomeKey: null,
    setPredictionMarketStakeAmount: vi.fn(),
    setSelectedPredictionOutcomeKey: vi.fn(),
  }),
}));

vi.mock("../src/hooks/use-fairness", () => ({
  useFairness: () => ({
    fairnessCommit: nativeAppMocks.fairnessCommit,
    fairnessReveal: null,
    fairnessRevealEpoch: "",
    fairnessVerification: null,
    loadingFairnessCommit: false,
    refreshFairnessCommit: nativeAppMocks.refreshFairnessCommit,
    resetFairness: nativeAppMocks.resetFairness,
    revealFairness: vi.fn(),
    revealingFairness: false,
    setFairnessRevealEpoch: vi.fn(),
  }),
}));

import { NativeApp } from "../App";

const teardownDom = installTestDom();

const flushEffects = async (times = 4) => {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

afterAll(() => {
  teardownDom();
});

afterEach(() => {
  cleanupHooks();
  vi.clearAllMocks();
});

describe("NativeApp", () => {
  beforeEach(() => {
    nativeAppMocks.api.acceptCurrentLegalDocuments.mockResolvedValue({
      data: {
        items: [],
        requiresAcceptance: false,
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.getCurrentLegalDocuments.mockResolvedValue({
      data: {
        items: [],
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.getCommunityThread.mockResolvedValue({
      data: {
        id: 7,
        posts: [],
        thread: {
          id: 7,
          title: "Thread 7",
        },
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.listCommunityThreads.mockResolvedValue({
      data: {
        items: [{ id: 7, title: "Thread 7" }],
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.getNotificationSummary.mockResolvedValue({
      data: {
        unreadCount: 4,
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.listNotifications.mockResolvedValue({
      data: {
        items: [{ id: 1, unread: true }],
      },
      ok: true,
      status: 200,
    });
    nativeAppMocks.api.registerNotificationPushDevice.mockResolvedValue({
      data: {
        ok: true,
      },
      ok: true,
      status: 200,
    });

    nativeAppMocks.fairnessCommit = null;
    nativeAppMocks.drawCatalog = null;
    nativeAppMocks.kycProfile = null;
    nativeAppMocks.playingDrawCount = null;
    nativeAppMocks.navigation.canGoBack.mockReturnValue(false);
    nativeAppMocks.navigation.isReady.mockReturnValue(true);
    nativeAppMocks.navigationState.currentRoute = "home";
    nativeAppMocks.userSession.currentSession = null;
    nativeAppMocks.userSession.handleUnauthorized.mockResolvedValue(true);
    nativeAppMocks.userSession.loadingSessions = false;
    nativeAppMocks.userSession.refreshScreen = null;
    nativeAppMocks.userSession.restoringSession = false;
    nativeAppMocks.userSession.setScreen = null;
    nativeAppMocks.userSession.session = null;
    nativeAppMocks.userSession.visibleSessions = [];
    nativeAppMocks.rewardCenter = null;
  });

  it("renders the restoring splash while secure session bootstrap is still running", async () => {
    nativeAppMocks.userSession.restoringSession = true;

    const view = renderTestComponent(<NativeApp />);

    await flushEffects();

    const html = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(html).toContain("Restoring session");
    expect(html).toContain("Rehydrating secure session state.");
    expect(document.querySelector('[data-testid="auth-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="navigation-container"]')).toBeNull();
    expect(view.container).toBeTruthy();
  });

  it("renders the auth shell when there is no active session", async () => {
    const view = renderTestComponent(<NativeApp />);

    await flushEffects();

    expect(document.querySelector('[data-testid="auth-card"]')?.textContent).toBe(
      "login",
    );
    expect(document.body.textContent).toContain("Mobile shell");
    expect(document.querySelector('[data-testid="legal-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="navigation-container"]')).toBeNull();
    expect(view.container).toBeTruthy();
  });

  it("hydrates authenticated state and renders the legal gate for pending acceptances", async () => {
    nativeAppMocks.userSession.currentSession = {
      current: true,
      sessionId: "server-session-1",
    };
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [
          {
            accepted: false,
            slug: "terms-of-service",
            version: "2026-04",
          },
        ],
        requiresAcceptance: true,
      },
      sessionId: "session-1",
      token: "auth-token-1",
      user: {
        email: "user@example.com",
        emailVerifiedAt: null,
        id: 42,
        phoneVerifiedAt: null,
        role: "user",
      },
    };
    nativeAppMocks.userSession.visibleSessions = [
      {
        current: true,
        sessionId: "server-session-1",
      },
    ];
    nativeAppMocks.api.getCurrentLegalDocuments.mockResolvedValue({
      data: {
        items: [
          {
            slug: "terms-of-service",
            version: "2026-04",
          },
        ],
      },
      ok: true,
      status: 200,
    });

    renderTestComponent(<NativeApp />);

    await flushEffects(6);

    expect(document.body.textContent).toContain("Accept the latest legal terms");
    expect(
      document.querySelector('[data-testid="legal-card"]')?.textContent,
    ).toContain("terms-of-service:2026-04");
    expect(nativeAppMocks.refreshCurrentSession).toHaveBeenCalledWith(
      nativeAppMocks.userSession.session,
      {
        authToken: "auth-token-1",
      },
    );
    expect(nativeAppMocks.refreshBalance).toHaveBeenCalledWith({
      authToken: "auth-token-1",
    });
    expect(nativeAppMocks.refreshKycProfile).toHaveBeenCalledWith({
      authToken: "auth-token-1",
    });
    expect(nativeAppMocks.refreshSessions).toHaveBeenCalledWith({
      authToken: "auth-token-1",
    });
    expect(nativeAppMocks.refreshRewardCenter).toHaveBeenCalledWith({
      authToken: "auth-token-1",
    });
    expect(nativeAppMocks.api.getNotificationSummary).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.api.getCurrentLegalDocuments).toHaveBeenCalled();
    expect(document.querySelector('[data-testid="navigation-container"]')).toBeNull();
  });

  it("renders the app navigator when the session is active and no legal gate blocks entry", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-2",
      token: "auth-token-2",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 99,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);

    await flushEffects(6);

    expect(document.querySelector('[data-testid="navigation-container"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="legal-card"]')).toBeNull();
  });

  it("preloads account, security, and notifications data when those routes open", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-3",
      token: "auth-token-3",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 100,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-account"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshCurrentSession).toHaveBeenCalledWith(
      nativeAppMocks.userSession.session,
    );

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-security"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshSessions).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.refreshKycProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-notifications"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.api.listNotifications).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(nativeAppMocks.api.getNotificationSummary).toHaveBeenCalledTimes(1);
  });

  it("renders the header notification bell with unread count and opens notifications on press", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-bell",
      token: "auth-token-bell",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 1001,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    const bellButton = document.querySelector(
      '[data-testid="app-notifications-bell-button"]',
    ) as HTMLButtonElement | null;

    expect(bellButton).not.toBeNull();
    expect(bellButton?.textContent).toContain("4");
    expect(bellButton?.disabled).toBe(false);

    vi.clearAllMocks();
    nativeAppMocks.navigation.canGoBack.mockReturnValue(false);
    nativeAppMocks.navigation.isReady.mockReturnValue(true);

    await act(async () => {
      bellButton?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.api.listNotifications).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(nativeAppMocks.api.getNotificationSummary).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.navigation.navigate).toHaveBeenCalledWith(
      "notifications",
    );
  });

  it("preloads community and live-game routes only when their route opens", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-4",
      token: "auth-token-4",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 101,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-community"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.api.listCommunityThreads).toHaveBeenCalledWith(1, 20);
    expect(nativeAppMocks.api.getCommunityThread).toHaveBeenCalledWith(7, 1, 50);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-holdem"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshHoldemLobby).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-predictionMarket"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshPredictionMarkets).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-blackjack"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshBlackjackOverview).toHaveBeenCalledTimes(1);
  });

  it("preloads rewards, gacha, and fairness lazily on first entry", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-5",
      token: "auth-token-5",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 102,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-rewards"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshRewardCenter).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-gacha"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshDrawCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-fairness"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(nativeAppMocks.refreshFairnessCommit).toHaveBeenCalledTimes(1);
  });

  it("skips cached route preloads when the required data is already in memory", async () => {
    nativeAppMocks.drawCatalog = {
      items: [],
    };
    nativeAppMocks.fairnessCommit = {
      commitHash: "abc123",
    };
    nativeAppMocks.kycProfile = {
      status: "verified",
    };
    nativeAppMocks.rewardCenter = {
      missions: [],
    };
    nativeAppMocks.userSession.currentSession = {
      current: true,
      sessionId: "current-session-1",
    };
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-6",
      token: "auth-token-6",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 103,
        phoneVerifiedAt: null,
        role: "user",
      },
    };
    nativeAppMocks.userSession.visibleSessions = [
      {
        current: true,
        sessionId: "current-session-1",
      },
    ];

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    for (const route of [
      "account",
      "security",
      "rewards",
      "gacha",
      "fairness",
    ] as const) {
      await act(async () => {
        (
          document.querySelector(
            `[data-testid="open-route-${route}"]`,
          ) as HTMLButtonElement | null
        )?.click();
      });
      await flushEffects();
    }

    expect(nativeAppMocks.refreshCurrentSession).not.toHaveBeenCalled();
    expect(nativeAppMocks.refreshSessions).not.toHaveBeenCalled();
    expect(nativeAppMocks.refreshKycProfile).not.toHaveBeenCalled();
    expect(nativeAppMocks.refreshRewardCenter).not.toHaveBeenCalled();
    expect(nativeAppMocks.refreshDrawCatalog).not.toHaveBeenCalled();
    expect(nativeAppMocks.refreshFairnessCommit).not.toHaveBeenCalled();
  });

  it("does not reload the community list after it has already been cached locally", async () => {
    nativeAppMocks.userSession.currentSession = {
      current: true,
      sessionId: "current-session-2",
    };
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-7",
      token: "auth-token-7",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 104,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-community"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.api.listCommunityThreads).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.api.getCommunityThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-account"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-community"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.api.listCommunityThreads).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.api.getCommunityThread).toHaveBeenCalledTimes(1);
  });

  it("surfaces notification preload failures without blocking navigation", async () => {
    nativeAppMocks.userSession.currentSession = {
      current: true,
      sessionId: "current-session-3",
    };
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-8",
      token: "auth-token-8",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 105,
        phoneVerifiedAt: null,
        role: "user",
      },
    };
    nativeAppMocks.api.listNotifications.mockResolvedValueOnce({
      error: {
        message: "Failed to load notifications.",
      },
      ok: false,
      status: 500,
    });

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-notifications"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.api.listNotifications).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(nativeAppMocks.api.getNotificationSummary).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.navigation.navigate).toHaveBeenCalledWith(
      "notifications",
    );
    expect(document.querySelector('[data-testid="toast-banner"]')?.textContent).toContain(
      "Failed to load notifications.",
    );
  });

  it("returns to the auth shell when an account preload forces an unauthorized reset", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-9",
      token: "auth-token-9",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 106,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();
    nativeAppMocks.userSession.refreshScreen = null;
    nativeAppMocks.refreshCurrentSession.mockImplementationOnce(async () => {
      nativeAppMocks.userSession.setScreen?.("login");
      return null;
    });

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-account"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.refreshCurrentSession).toHaveBeenCalledWith(
      nativeAppMocks.userSession.session,
    );
    expect(document.querySelector('[data-testid="auth-card"]')?.textContent).toBe(
      "login",
    );
    expect(document.querySelector('[data-testid="navigation-container"]')).toBeNull();
  });

  it("continues into gacha even when draw catalog preloading reports failure", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-10",
      token: "auth-token-10",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 107,
        phoneVerifiedAt: null,
        role: "user",
      },
    };
    nativeAppMocks.refreshDrawCatalog.mockResolvedValueOnce(false);

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();
    nativeAppMocks.refreshDrawCatalog.mockResolvedValueOnce(false);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-gacha"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.refreshDrawCatalog).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.navigation.navigate).toHaveBeenCalledWith("gacha");
  });

  it("pops to the home route when a nested screen requests home and the stack can go back", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-home-pop",
      token: "auth-token-home-pop",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 109,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-fairness"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    vi.clearAllMocks();
    nativeAppMocks.navigation.canGoBack.mockReturnValue(true);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="back-home-fairness"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.navigation.dispatch).toHaveBeenCalledWith({
      type: "POP_TO_TOP",
    });
    expect(nativeAppMocks.navigation.navigate).not.toHaveBeenCalledWith("home");
    expect(nativeAppMocks.navigationState.currentRoute).toBe("home");
  });

  it("falls back to a direct home navigation when no back stack is available", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-home-direct",
      token: "auth-token-home-direct",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 110,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-fairness"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    vi.clearAllMocks();
    nativeAppMocks.navigation.canGoBack.mockReturnValue(false);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="back-home-fairness"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.navigation.navigate).toHaveBeenCalledWith("home");
    expect(nativeAppMocks.navigation.dispatch).not.toHaveBeenCalled();
    expect(nativeAppMocks.navigationState.currentRoute).toBe("home");
  });

  it("updates local route state without imperative navigation when the navigation ref is not ready", async () => {
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-nav-not-ready",
      token: "auth-token-nav-not-ready",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 111,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();
    nativeAppMocks.navigation.isReady.mockReturnValue(false);

    await act(async () => {
      (
        document.querySelector(
          '[data-testid="open-route-gacha"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.refreshDrawCatalog).toHaveBeenCalledTimes(1);
    expect(nativeAppMocks.navigation.navigate).not.toHaveBeenCalled();
    expect(nativeAppMocks.navigation.dispatch).not.toHaveBeenCalled();
    expect(
      document
        .querySelector('[data-testid="app-stack"]')
        ?.getAttribute("data-initial-route"),
    ).toBe("gacha");
  });

  it("blocks route changes and preloads while route navigation is locked", async () => {
    nativeAppMocks.playingDrawCount = 1;
    nativeAppMocks.userSession.refreshScreen = "app";
    nativeAppMocks.userSession.session = {
      expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      legal: {
        items: [],
        requiresAcceptance: false,
      },
      sessionId: "session-11",
      token: "auth-token-11",
      user: {
        email: "user@example.com",
        emailVerifiedAt: "2026-04-30T00:00:00.000Z",
        id: 108,
        phoneVerifiedAt: null,
        role: "user",
      },
    };

    renderTestComponent(<NativeApp />);
    await flushEffects(6);

    vi.clearAllMocks();

    const button = document.querySelector(
      '[data-testid="open-route-gacha"]',
    ) as HTMLButtonElement | null;
    const bellButton = document.querySelector(
      '[data-testid="app-notifications-bell-button"]',
    ) as HTMLButtonElement | null;

    expect(button?.disabled).toBe(true);
    expect(bellButton?.disabled).toBe(true);

    await act(async () => {
      button?.click();
    });
    await act(async () => {
      bellButton?.click();
    });
    await flushEffects(6);

    expect(nativeAppMocks.refreshDrawCatalog).not.toHaveBeenCalled();
    expect(nativeAppMocks.api.listNotifications).not.toHaveBeenCalled();
    expect(nativeAppMocks.navigation.navigate).not.toHaveBeenCalled();
    expect(nativeAppMocks.navigation.dispatch).not.toHaveBeenCalled();
  });
});
