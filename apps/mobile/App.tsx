import {
  NavigationContainer,
  StackActions,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  CommunityThread,
  CommunityThreadDetailResponse,
  CommunityThreadMutationResponse,
} from "@reward/shared-types/community";
import type { CurrentLegalDocument } from "@reward/shared-types/legal";
import type { NotificationRecord } from "@reward/shared-types/notification";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import { createUserApiClient } from "@reward/user-core";
import {
  AppStack,
  type AppRoute,
  type AppStackParamList,
  appNavigationTheme,
  blackjackStatusLabels,
  buildWebUrl,
  configuredApiBaseUrl,
  drawRarityLabels,
  drawStatusLabels,
  drawStockLabels,
  formatAmount,
  formatOptionalTimestamp,
  formatTimestamp,
  platform,
  quickEightStatusLabels,
  type ScreenMode,
  shortenCommitHash,
  summarizeUserAgent,
  webviewQaEnabled,
} from "./src/app-support";
import {
  getMobileCommunityCopy,
  type MobileCommunityCopy,
} from "./src/community-copy";
import {
  getMobileFairnessCopy,
  resolveMobileFairnessLocale,
} from "./src/fairness";
import { MobileAuthCard } from "./src/auth/auth-card";
import {
  useAuthFlow,
  type AuthFlowSessionBridge,
} from "./src/hooks/use-auth-flow";
import { useBlackjack } from "./src/hooks/use-blackjack";
import { useDraw } from "./src/hooks/use-draw";
import { useFairness } from "./src/hooks/use-fairness";
import { useHoldem } from "./src/hooks/use-holdem";
import { useKycProfile } from "./src/hooks/use-kyc-profile";
import { usePredictionMarket } from "./src/hooks/use-prediction-market";
import { useQuickEight } from "./src/hooks/use-quick-eight";
import { useRewardCenter } from "./src/hooks/use-reward-center";
import { useUserSession } from "./src/hooks/use-user-session";
import { useWallet } from "./src/hooks/use-wallet";
import {
  buildLegalDocumentKey,
  MobileLegalAcceptanceCard,
} from "./src/legal/legal-acceptance-card";
import { getMobileDeviceFingerprint } from "./src/device-fingerprint";
import { getMobileAppCopy } from "./src/mobile-copy";
import { mobileStyles as styles } from "./src/mobile-styles";
import { getPlayModeCopy } from "./src/play-mode-copy";
import { registerForPushNotifications } from "./src/push-notifications";
import { getMobileRouteCopy } from "./src/route-copy";
import {
  AccountRouteContainer,
  BlackjackRouteContainer,
  CommunityRouteContainer,
  FairnessRouteContainer,
  GachaRouteContainer,
  HoldemRouteContainer,
  HomeRouteContainer,
  NotificationsRouteContainer,
  PredictionMarketRouteContainer,
  QuickEightRouteContainer,
  RewardsRouteContainer,
  SecurityRouteContainer,
  WalletRouteContainer,
} from "./src/screens";
import { VerificationCallout } from "./src/sections/verification-callout";
import { ToastBanner, type ToastTone } from "./src/ui";
import { WebviewQaHarness } from "./src/webview-qa-harness";
import { mobileDrawRarityTones, mobilePalette as palette } from "./src/theme";

function resolveCommunityErrorMessage(
  copy: MobileCommunityCopy,
  fallback?: string,
  code?: string,
  message?: string,
) {
  if (code === API_ERROR_CODES.COMMUNITY_CAPTCHA_REQUIRED) {
    return copy.captchaRequired;
  }

  if (code === API_ERROR_CODES.COMMUNITY_CAPTCHA_INVALID) {
    return copy.captchaInvalid;
  }

  if (code === API_ERROR_CODES.KYC_TIER_REQUIRED) {
    return message ?? copy.kycRequired;
  }

  if (code === API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND) {
    return copy.threadMissing;
  }

  if (code === API_ERROR_CODES.COMMUNITY_THREAD_LOCKED) {
    return message ?? copy.threadLocked;
  }

  if (code === API_ERROR_CODES.TOO_MANY_REQUESTS) {
    return message ?? copy.rateLimited;
  }

  return message ?? fallback ?? copy.loadFailed;
}

function resolveCommunityMutationNotice(
  copy: MobileCommunityCopy,
  response: CommunityThreadMutationResponse,
  kind: "thread" | "reply",
) {
  if (response.autoHidden) {
    return kind === "thread" ? copy.createHidden : copy.replyHidden;
  }

  if (response.reviewRequired) {
    return kind === "thread" ? copy.createQueued : copy.replyQueued;
  }

  return kind === "thread" ? copy.createSuccess : copy.replySuccess;
}

function NativeApp() {
  const [screen, setScreen] = useState<ScreenMode>("login");
  const [appRoute, setAppRoute] = useState<AppRoute>("home");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    tone: ToastTone;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigationRef = useNavigationContainerRef<AppStackParamList>();
  const authTokenRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFeedbackKeyRef = useRef<string | null>(null);
  const pushRegistrationTokenRef = useRef<string | null>(null);
  const handleUnauthorizedRef = useRef<
    ((message: string) => Promise<boolean>) | null
  >(null);
  const sessionBridgeRef = useRef<AuthFlowSessionBridge | null>(null);
  const apiRef = useRef(
    createUserApiClient({
      baseUrl: configuredApiBaseUrl,
      getAuthToken: () => authTokenRef.current,
      getExtraHeaders: async () => {
        // Risk enrichment should not block sign-in if secure storage is unavailable.
        const deviceFingerprint = await getMobileDeviceFingerprint().catch(
          () => null,
        );

        if (!deviceFingerprint) {
          return undefined;
        }

        return { "x-device-fingerprint": deviceFingerprint };
      },
    }),
  );
  const api = apiRef.current;
  const [legalDocuments, setLegalDocuments] = useState<CurrentLegalDocument[]>(
    [],
  );
  const [loadingLegalDocuments, setLoadingLegalDocuments] = useState(false);
  const [selectedLegalDocumentKeys, setSelectedLegalDocumentKeys] = useState<
    string[]
  >([]);
  const [acceptingLegal, setAcceptingLegal] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[] | null>(
    null,
  );
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [mutatingNotifications, setMutatingNotifications] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [communityThreads, setCommunityThreads] = useState<CommunityThread[] | null>(
    null,
  );
  const [selectedCommunityThreadId, setSelectedCommunityThreadId] = useState<
    number | null
  >(null);
  const [communityThreadDetail, setCommunityThreadDetail] =
    useState<CommunityThreadDetailResponse | null>(null);
  const [loadingCommunityThreads, setLoadingCommunityThreads] = useState(false);
  const [loadingCommunityThread, setLoadingCommunityThread] = useState(false);
  const [creatingCommunityThread, setCreatingCommunityThread] = useState(false);
  const [creatingCommunityReply, setCreatingCommunityReply] = useState(false);
  const [communityThreadTitle, setCommunityThreadTitle] = useState("");
  const [communityThreadBody, setCommunityThreadBody] = useState("");
  const [communityReplyBody, setCommunityReplyBody] = useState("");
  const [communityListError, setCommunityListError] = useState<string | null>(
    null,
  );
  const [communityDetailError, setCommunityDetailError] = useState<string | null>(
    null,
  );
  const [communityCreateError, setCommunityCreateError] = useState<string | null>(
    null,
  );
  const [communityReplyError, setCommunityReplyError] = useState<string | null>(
    null,
  );

  const resetFeedback = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  }, []);
  const showToast = useCallback((tone: ToastTone, nextMessage: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    const toastId = Date.now();
    setToast({
      id: toastId,
      tone,
      message: nextMessage,
    });

    toastTimeoutRef.current = setTimeout(
      () => {
        setToast((current) => (current?.id === toastId ? null : current));
        toastTimeoutRef.current = null;
      },
      tone === "error" ? 5200 : 3600,
    );
  }, []);
  const fairnessLocale = resolveMobileFairnessLocale();
  const appContent = getMobileAppCopy(fairnessLocale);
  const communityCopy = getMobileCommunityCopy(fairnessLocale);
  const fairnessContent = getMobileFairnessCopy(fairnessLocale);
  const playModeCopy = getPlayModeCopy(fairnessLocale);
  const routeContent = getMobileRouteCopy(fairnessLocale);
  const notificationRouteCopy =
    fairnessLocale === "zh-CN"
      ? {
          unreadLabel: "未读",
          refresh: "刷新",
          refreshing: "刷新中...",
          markAllRead: "全部已读",
          markRead: "标记已读",
          empty: "还没有通知。",
          newBadge: "新",
        }
      : {
          unreadLabel: "Unread",
          refresh: "Refresh",
          refreshing: "Refreshing...",
          markAllRead: "Mark all read",
          markRead: "Mark read",
          empty: "No notifications yet.",
          newBadge: "NEW",
        };
  const refreshLegalDocuments = useCallback(async () => {
    setLoadingLegalDocuments(true);
    const response = await api.getCurrentLegalDocuments();
    setLoadingLegalDocuments(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to load legal documents.");
      return false;
    }

    setLegalDocuments(response.data.items);
    setSelectedLegalDocumentKeys((current) => {
      const nextKeys = new Set(
        response.data.items.map((document) => buildLegalDocumentKey(document)),
      );
      return current.filter((key) => nextKeys.has(key));
    });
    return true;
  }, [api, setError]);
  const toggleLegalDocument = useCallback((key: string) => {
    setSelectedLegalDocumentKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  }, []);

  const {
    balance,
    refreshingBalance,
    refreshBalance,
    resetWallet,
    syncBalance,
  } = useWallet({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    setError,
  });
  const {
    kycProfile,
    loadingKycProfile,
    refreshKycProfile,
    resetKycProfile,
  } = useKycProfile({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    setError,
  });

  const refreshNotificationSummary = useCallback(async () => {
    const response = await api.getNotificationSummary();
    if (!response.ok) {
      setError(response.error?.message ?? "Failed to load notification summary.");
      return false;
    }

    setNotificationUnreadCount(response.data.unreadCount);
    return true;
  }, [api, setError]);

  const refreshNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    const [listResponse, summaryResponse] = await Promise.all([
      api.listNotifications({ limit: 50 }),
      api.getNotificationSummary(),
    ]);
    setLoadingNotifications(false);

    if (!listResponse.ok) {
      setError(listResponse.error?.message ?? "Failed to load notifications.");
      return false;
    }
    if (!summaryResponse.ok) {
      setError(
        summaryResponse.error?.message ?? "Failed to load notification summary.",
      );
      return false;
    }

    setNotifications(listResponse.data.items);
    setNotificationUnreadCount(summaryResponse.data.unreadCount);
    return true;
  }, [api, setError]);

  const resetCommunityState = useCallback(() => {
    setCommunityThreads(null);
    setSelectedCommunityThreadId(null);
    setCommunityThreadDetail(null);
    setLoadingCommunityThreads(false);
    setLoadingCommunityThread(false);
    setCreatingCommunityThread(false);
    setCreatingCommunityReply(false);
    setCommunityThreadTitle("");
    setCommunityThreadBody("");
    setCommunityReplyBody("");
    setCommunityListError(null);
    setCommunityDetailError(null);
    setCommunityCreateError(null);
    setCommunityReplyError(null);
  }, []);

  const refreshCommunityThreadDetail = useCallback(
    async (threadId: number) => {
      setSelectedCommunityThreadId(threadId);
      setLoadingCommunityThread(true);
      setCommunityDetailError(null);
      const response = await api.getCommunityThread(threadId, 1, 50);
      setLoadingCommunityThread(false);

      if (!response.ok) {
        setCommunityThreadDetail(null);
        setCommunityDetailError(
          resolveCommunityErrorMessage(
            communityCopy,
            communityCopy.loadThreadFailed,
            response.error?.code,
            response.error?.message,
          ),
        );
        return false;
      }

      setCommunityThreadDetail(response.data);
      setSelectedCommunityThreadId(threadId);
      return true;
    },
    [api, communityCopy],
  );

  const refreshCommunityThreads = useCallback(
    async (preferredThreadId: number | null = null) => {
      setLoadingCommunityThreads(true);
      setCommunityListError(null);
      const response = await api.listCommunityThreads(1, 20);
      setLoadingCommunityThreads(false);

      if (!response.ok) {
        setCommunityThreads([]);
        setSelectedCommunityThreadId(null);
        setCommunityThreadDetail(null);
        setCommunityListError(
          resolveCommunityErrorMessage(
            communityCopy,
            communityCopy.loadFailed,
            response.error?.code,
            response.error?.message,
          ),
        );
        return false;
      }

      const items = response.data.items;
      setCommunityThreads(items);

      const nextThreadId =
        preferredThreadId && items.some((thread) => thread.id === preferredThreadId)
          ? preferredThreadId
          : items[0]?.id ?? null;

      if (!nextThreadId) {
        setSelectedCommunityThreadId(null);
        setCommunityThreadDetail(null);
        setCommunityDetailError(null);
        return true;
      }

      setSelectedCommunityThreadId(nextThreadId);
      return refreshCommunityThreadDetail(nextThreadId);
    },
    [api, communityCopy, refreshCommunityThreadDetail],
  );

  const syncPushRegistration = useCallback(async () => {
    const registration = await registerForPushNotifications();
    if (!registration.token || !registration.platform) {
      if (__DEV__) {
        console.warn(
          "[push] Skipping device registration:",
          registration.reason ?? "push_registration_failed",
        );
      }
      return false;
    }
    if (pushRegistrationTokenRef.current === registration.token) {
      return true;
    }

    const response = await api.registerNotificationPushDevice({
      token: registration.token,
      platform: registration.platform,
    });
    if (!response.ok) {
      if (__DEV__) {
        console.warn(
          "[push] Backend registration failed:",
          response.error?.message ?? "push_registration_failed",
        );
      }
      return false;
    }

    pushRegistrationTokenRef.current = registration.token;
    return true;
  }, [api]);

  const markNotificationRead = useCallback(
    async (notificationId: number) => {
      setMutatingNotifications(true);
      const response = await api.markNotificationRead(notificationId);
      setMutatingNotifications(false);

      if (!response.ok) {
        setError(response.error?.message ?? "Failed to update notification.");
        return false;
      }

      setNotifications((current) =>
        current?.map((item) => (item.id === notificationId ? response.data : item)) ??
        current,
      );
      setNotificationUnreadCount((current) => Math.max(current - 1, 0));
      return true;
    },
    [api, setError],
  );

  const markAllNotificationsRead = useCallback(async () => {
    setMutatingNotifications(true);
    const response = await api.markAllNotificationsRead();
    setMutatingNotifications(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to update notifications.");
      return false;
    }

    if (response.data.updatedCount > 0) {
      await refreshNotifications();
    }
    return true;
  }, [api, refreshNotifications, setError]);

  const {
    claimingMissionId,
    claimReward,
    loadingRewardCenter,
    refreshRewardCenter,
    resetRewardCenter,
    rewardCenter,
  } = useRewardCenter({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    resetFeedback,
    setError,
    setMessage,
  });

  const {
    clearQuickEightSelection,
    playQuickEight,
    playingQuickEight,
    quickEightMatchedSet,
    quickEightResult,
    quickEightSelection,
    quickEightStakeAmount,
    resetQuickEight,
    setQuickEightStakeAmount,
    toggleQuickEightNumber,
    visibleQuickEightDrawnNumbers,
  } = useQuickEight({
    api,
    handleUnauthorizedRef,
    refreshBalance,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
  });

  const {
    drawCatalog,
    featuredPrizes,
    gachaAnimating,
    gachaLockedReels,
    gachaReels,
    gachaTone,
    highlightPrize,
    lastDrawPlay,
    loadingDrawCatalog,
    multiDrawCount,
    playDraw,
    playingDrawCount,
    refreshDrawCatalog,
    resetDraw,
    setDrawPlayMode,
    updatingDrawPlayMode,
  } = useDraw({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
    syncBalance,
  });

  const {
    actingBlackjack,
    actOnBlackjack,
    blackjackOverview,
    blackjackStakeAmount,
    loadingBlackjack,
    refreshBlackjackOverview,
    resetBlackjack,
    setBlackjackStakeAmount,
    setBlackjackPlayMode,
    startBlackjack,
    updatingBlackjackPlayMode,
  } = useBlackjack({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
    syncBalance,
  });

  const {
    actingHoldem,
    actOnHoldemTable,
    closeHoldemReplay,
    createHoldemTable,
    getHoldemEvidenceBundle,
    holdemActionAmount,
    holdemBuyInAmount,
    holdemCreateMaxSeats,
    holdemCreateTableType,
    holdemTournamentPayoutPlaces,
    holdemTournamentStartingStackAmount,
    holdemPlayMode,
    holdemReplayError,
    holdemRealtimeStatus,
    holdemTableName,
    holdemTableMessages,
    holdemTables,
    joinHoldemTable,
    leaveHoldemTable,
    loadingHoldemMessages,
    loadingHoldemReplay,
    loadingHoldemLobby,
    loadingHoldemTable,
    openHoldemReplay,
    refreshHoldemLobby,
    refreshHoldemTable,
    resetHoldem,
    sendHoldemTableMessage,
    sendingHoldemMessage,
    selectedHoldemReplay,
    selectedHoldemReplayRoundId,
    selectedHoldemTable,
    setHoldemActionAmount,
    setHoldemBuyInAmount,
    setHoldemCreateMaxSeats,
    setHoldemCreateTableType,
    setHoldemTournamentPayoutPlaces,
    setHoldemTournamentStartingStackAmount,
    setHoldemPlayMode,
    setHoldemSeatMode,
    setHoldemTableName,
    setSelectedHoldemTableId,
    startHoldemTable,
    updatingHoldemPlayMode,
  } = useHoldem({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    enabled: screen === "app" && appRoute === "holdem",
    observabilitySurface: platform,
    realtimeBaseUrl: configuredApiBaseUrl,
    refreshBalance,
    resetFeedback,
    setError,
  });

  const {
    loadingPredictionMarket,
    loadingPredictionMarketHistory,
    loadingPredictionMarkets,
    placingPredictionPosition,
    goToNextPredictionMarketHistoryPage,
    goToPreviousPredictionMarketHistoryPage,
    placePredictionPosition,
    predictionMarketHistory,
    predictionMarketHistoryPage,
    predictionMarketHistoryStatus,
    predictionMarketPositionCount,
    predictionMarketStakeAmount,
    predictionMarkets,
    refreshPredictionMarketHistory,
    refreshPredictionMarkets,
    resetPredictionMarket,
    selectPredictionMarket,
    selectPredictionMarketHistoryStatus,
    selectedPredictionMarket,
    selectedPredictionMarketId,
    selectedPredictionOutcomeKey,
    setPredictionMarketStakeAmount,
    setSelectedPredictionOutcomeKey,
  } = usePredictionMarket({
    api,
    authTokenRef,
    handleUnauthorizedRef,
    enabled: screen === "app" && appRoute === "predictionMarket",
    refreshBalance,
    resetFeedback,
    setError,
    setMessage,
  });

  const {
    fairnessCommit,
    fairnessReveal,
    fairnessRevealEpoch,
    fairnessVerification,
    loadingFairnessCommit,
    revealingFairness,
    refreshFairnessCommit,
    revealFairness,
    resetFairness,
    setFairnessRevealEpoch,
  } = useFairness({
    api,
    copy: fairnessContent,
    resetFeedback,
    setMessage,
    setError,
  });

  const resetSessionExperienceCore = useCallback(() => {
    resetWallet();
    resetKycProfile();
    resetDraw();
    resetQuickEight();
    resetPredictionMarket();
    resetBlackjack();
    resetHoldem();
    resetRewardCenter();
    resetFairness();
    setAppRoute("home");
  }, [
    resetBlackjack,
    resetDraw,
    resetFairness,
    resetHoldem,
    resetKycProfile,
    resetPredictionMarket,
    resetQuickEight,
    resetRewardCenter,
    resetWallet,
  ]);

  const {
    applyAuthLink,
    email,
    password,
    birthDate,
    resetTokenInput,
    newPassword,
    verificationTokenInput,
    sendingVerification,
    setEmail,
    setPassword,
    setBirthDate,
    setResetTokenInput,
    setNewPassword,
    setVerificationTokenInput,
    resetAuthInputs,
    handleLogin,
    handleSeededLogin,
    handleRegister,
    handleRequestPasswordReset,
    handleConfirmPasswordReset,
    handleConfirmEmailVerification,
    handleRequestEmailVerification,
  } = useAuthFlow({
    api,
    sessionBridgeRef,
    refreshRewardCenter: () => refreshRewardCenter(),
    onResetSessionExperience: resetSessionExperienceCore,
    resetFeedback,
    setScreen,
    setMessage,
    setError,
    setSubmitting,
  });

  const resetSessionExperience = useCallback(() => {
    resetSessionExperienceCore();
    resetAuthInputs();
  }, [resetAuthInputs, resetSessionExperienceCore]);

  const {
    session,
    currentSession,
    loadingSessions,
    restoringSession,
    visibleSessions,
    startAuthenticatedSession,
    clearSession,
    handleUnauthorized,
    reconcileSession,
    refreshCurrentSession,
    refreshSessions,
    revokeAllSessions,
    revokeSession,
    signOut,
  } = useUserSession({
    api,
    authTokenRef,
    applyAuthLink,
    onResetSessionExperience: resetSessionExperience,
    resetFeedback,
    setScreen,
    setMessage,
    setError,
    setSubmitting,
  });

  sessionBridgeRef.current = {
    session,
    startAuthenticatedSession,
    clearSession,
    reconcileSession,
    refreshCurrentSession: (baseSession) => refreshCurrentSession(baseSession),
    handleUnauthorized,
  };

  useEffect(() => {
    handleUnauthorizedRef.current = handleUnauthorized;
  }, [handleUnauthorized]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const feedbackMessage = error ?? message;
    const feedbackTone: ToastTone | null = error
      ? "error"
      : message
        ? "success"
        : null;

    if (!feedbackMessage || !feedbackTone) {
      lastFeedbackKeyRef.current = null;
      return;
    }

    const feedbackKey = `${feedbackTone}:${feedbackMessage}`;
    if (lastFeedbackKeyRef.current === feedbackKey) {
      return;
    }

    lastFeedbackKeyRef.current = feedbackKey;
    showToast(feedbackTone, feedbackMessage);
  }, [error, message, showToast]);

  const hydrateAuthenticatedState = async (
    baseSession: NonNullable<typeof session>,
  ) => {
    const overrides = { authToken: baseSession.token };
    const nextSession = await refreshCurrentSession(baseSession, overrides);
    if (!nextSession) {
      return;
    }

    await refreshBalance(overrides);
    await refreshKycProfile(overrides);
    await refreshSessions(overrides);
    await refreshRewardCenter(overrides);
    await syncPushRegistration();
    await refreshNotificationSummary();
  };

  useEffect(() => {
    if (!session?.token) {
      setNotifications(null);
      setNotificationUnreadCount(0);
      resetCommunityState();
      pushRegistrationTokenRef.current = null;
      return;
    }

    void hydrateAuthenticatedState(session);
  }, [
    refreshKycProfile,
    refreshNotificationSummary,
    resetCommunityState,
    session?.token,
    syncPushRegistration,
  ]);

  const legalAcceptanceRequired = Boolean(session?.legal?.requiresAcceptance);
  const pendingLegalDocumentKeys =
    session?.legal?.items
      .filter((item) => item.accepted === false)
      .map((item) => buildLegalDocumentKey(item)) ?? [];
  const pendingLegalDocuments = legalDocuments.filter((document) =>
    pendingLegalDocumentKeys.includes(buildLegalDocumentKey(document)),
  );

  useEffect(() => {
    if (screen !== "register" && !legalAcceptanceRequired) {
      return;
    }

    void refreshLegalDocuments();
  }, [legalAcceptanceRequired, refreshLegalDocuments, screen]);

  const emailVerified = Boolean(session?.user.emailVerifiedAt);
  const handleRegisterWithLegal = useCallback(async () => {
    resetFeedback();

    if (
      legalDocuments.length > 0 &&
      legalDocuments.some(
        (document) =>
          !selectedLegalDocumentKeys.includes(buildLegalDocumentKey(document)),
      )
    ) {
      setError(appContent.auth.legal.required);
      return;
    }

    await handleRegister(
      legalDocuments.map((document) => ({
        slug: document.slug,
        version: document.version,
      })),
    );
  }, [
    appContent.auth.legal.required,
    handleRegister,
    legalDocuments,
    resetFeedback,
    selectedLegalDocumentKeys,
    setError,
  ]);
  const handleAcceptUpdatedLegalDocuments = useCallback(async () => {
    if (!session) {
      return;
    }

    resetFeedback();

    if (
      pendingLegalDocuments.some(
        (document) =>
          !selectedLegalDocumentKeys.includes(buildLegalDocumentKey(document)),
      )
    ) {
      setError(appContent.legalGate.required);
      return;
    }

    setAcceptingLegal(true);
    const response = await api.acceptCurrentLegalDocuments({
      acceptances: pendingLegalDocuments.map((document) => ({
        slug: document.slug,
        version: document.version,
      })),
    });
    setAcceptingLegal(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to accept legal documents.");
      return;
    }

    await reconcileSession(session, { legal: response.data });
    setSelectedLegalDocumentKeys([]);
    setMessage(appContent.legalGate.success);
  }, [
    api,
    appContent.legalGate.required,
    appContent.legalGate.success,
    pendingLegalDocuments,
    reconcileSession,
    resetFeedback,
    selectedLegalDocumentKeys,
    session,
    setError,
    setMessage,
  ]);
  const handleOpenKycVerification = useCallback(async () => {
    resetFeedback();

    const url = buildWebUrl("/app/verification");
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setError("Unable to open the hosted verification page on this device.");
        return;
      }

      await Linking.openURL(url);
    } catch {
      setError("Unable to open the hosted verification page on this device.");
    }
  }, [resetFeedback, setError]);
  const handleOpenCommunityWeb = useCallback(async () => {
    const url = buildWebUrl("/app/community");

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showToast("error", communityCopy.openWebFailed);
        return;
      }

      await Linking.openURL(url);
    } catch {
      showToast("error", communityCopy.openWebFailed);
    }
  }, [communityCopy.openWebFailed, showToast]);
  const selectCommunityThread = useCallback(
    async (threadId: number) => {
      setCommunityCreateError(null);
      setCommunityReplyError(null);
      await refreshCommunityThreadDetail(threadId);
    },
    [refreshCommunityThreadDetail],
  );
  const createCommunityThread = useCallback(async () => {
    const title = communityThreadTitle.trim();
    const body = communityThreadBody.trim();

    setCommunityCreateError(null);

    if (!title) {
      setCommunityCreateError(communityCopy.titleRequired);
      return;
    }

    if (!body) {
      setCommunityCreateError(communityCopy.bodyRequired);
      return;
    }

    setCreatingCommunityThread(true);
    const response = await api.createCommunityThread({
      title,
      body,
    });
    setCreatingCommunityThread(false);

    if (!response.ok) {
      const message = resolveCommunityErrorMessage(
        communityCopy,
        communityCopy.createFailed,
        response.error?.code,
        response.error?.message,
      );
      setCommunityCreateError(message);
      showToast("error", message);
      return;
    }

    const notice = resolveCommunityMutationNotice(
      communityCopy,
      response.data,
      "thread",
    );
    setCommunityThreadTitle("");
    setCommunityThreadBody("");
    showToast(
      response.data.reviewRequired || response.data.autoHidden ? "info" : "success",
      notice,
    );
    await refreshCommunityThreads(
      response.data.autoHidden
        ? selectedCommunityThreadId
        : response.data.thread.id,
    );
  }, [
    api,
    communityCopy,
    communityThreadBody,
    communityThreadTitle,
    refreshCommunityThreads,
    selectedCommunityThreadId,
    showToast,
  ]);
  const createCommunityReply = useCallback(async () => {
    if (!selectedCommunityThreadId) {
      return;
    }

    const body = communityReplyBody.trim();
    setCommunityReplyError(null);

    if (!body) {
      setCommunityReplyError(communityCopy.replyRequired);
      return;
    }

    setCreatingCommunityReply(true);
    const response = await api.createCommunityPost(selectedCommunityThreadId, {
      body,
    });
    setCreatingCommunityReply(false);

    if (!response.ok) {
      const message = resolveCommunityErrorMessage(
        communityCopy,
        communityCopy.replyFailed,
        response.error?.code,
        response.error?.message,
      );
      setCommunityReplyError(message);
      showToast("error", message);
      if (response.error?.code === API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND) {
        await refreshCommunityThreads();
      }
      return;
    }

    const notice = resolveCommunityMutationNotice(
      communityCopy,
      response.data,
      "reply",
    );
    setCommunityReplyBody("");
    showToast(
      response.data.reviewRequired || response.data.autoHidden ? "info" : "success",
      notice,
    );
    await refreshCommunityThreads(selectedCommunityThreadId);
  }, [
    api,
    communityCopy,
    communityReplyBody,
    refreshCommunityThreads,
    selectedCommunityThreadId,
    showToast,
  ]);
  const routeNavigationLocked =
    playingDrawCount !== null ||
    playingQuickEight ||
    actingHoldem !== null ||
    placingPredictionPosition ||
    actingBlackjack !== null ||
    loadingBlackjack ||
    loadingFairnessCommit ||
    revealingFairness ||
    gachaAnimating ||
    claimingMissionId !== null ||
    creatingCommunityThread ||
    creatingCommunityReply;

  const syncAppRouteFromNavigation = () => {
    const currentRoute = navigationRef.getCurrentRoute()?.name;
    if (currentRoute && currentRoute !== appRoute) {
      setAppRoute(currentRoute);
    }
  };

  const navigateAppRoute = (nextRoute: AppRoute) => {
    if (!navigationRef.isReady()) {
      setAppRoute(nextRoute);
      return;
    }

    const currentRoute = navigationRef.getCurrentRoute()?.name;
    if (!currentRoute || currentRoute === nextRoute) {
      return;
    }

    if (nextRoute === "home") {
      if (navigationRef.canGoBack()) {
        navigationRef.dispatch(StackActions.popToTop());
      } else {
        navigationRef.navigate("home");
      }
      return;
    }

    if (currentRoute === "home") {
      navigationRef.navigate(nextRoute);
      return;
    }

    navigationRef.dispatch(StackActions.replace(nextRoute));
  };

  const openAppRoute = async (nextRoute: AppRoute) => {
    if (routeNavigationLocked || nextRoute === appRoute) {
      return;
    }

    resetFeedback();

    if (nextRoute === "gacha" && !drawCatalog && session?.token) {
      await refreshDrawCatalog();
    }

    if (nextRoute === "account" && session?.token && !currentSession) {
      await refreshCurrentSession(session);
    }

    if (nextRoute === "rewards" && !rewardCenter && session?.token) {
      await refreshRewardCenter();
    }

    if (nextRoute === "community" && session?.token && communityThreads === null) {
      await refreshCommunityThreads();
    }

    if (
      nextRoute === "security" &&
      session?.token &&
      visibleSessions.length === 0
    ) {
      await refreshSessions();
    }
    if (nextRoute === "security" && session?.token && !kycProfile) {
      await refreshKycProfile();
    }

    if (nextRoute === "notifications" && session?.token) {
      await refreshNotifications();
    }

    if (nextRoute === "holdem" && session?.token) {
      await refreshHoldemLobby();
    }

    if (nextRoute === "predictionMarket" && session?.token) {
      await refreshPredictionMarkets();
    }

    if (nextRoute === "blackjack" && session?.token) {
      await refreshBlackjackOverview();
    }

    if (nextRoute === "fairness" && !fairnessCommit) {
      await refreshFairnessCommit();
    }

    setAppRoute(nextRoute);
    navigateAppRoute(nextRoute);
  };

  const verificationCallout = emailVerified ? null : (
    <VerificationCallout
      copy={appContent.verificationCallout}
      sendingVerification={sendingVerification}
      onRequestVerification={() => void handleRequestEmailVerification()}
      onOpenVerification={() => setScreen("verifyEmail")}
    />
  );

  const authCard = (
    <MobileAuthCard
      screen={screen}
      copy={appContent.auth}
      legalDocuments={legalDocuments}
      loadingLegalDocuments={loadingLegalDocuments}
      selectedLegalDocumentKeys={selectedLegalDocumentKeys}
      email={email}
      password={password}
      birthDate={birthDate}
      resetTokenInput={resetTokenInput}
      newPassword={newPassword}
      verificationTokenInput={verificationTokenInput}
      submitting={submitting}
      sendingVerification={sendingVerification}
      signedIn={Boolean(session?.token)}
      emailVerified={emailVerified}
      showSeededLogin={__DEV__ && screen === "login"}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onChangeBirthDate={setBirthDate}
      onChangeResetTokenInput={setResetTokenInput}
      onChangeNewPassword={setNewPassword}
      onChangeVerificationTokenInput={setVerificationTokenInput}
      onToggleLegalDocument={toggleLegalDocument}
      onShowLogin={() => {
        resetFeedback();
        setScreen("login");
      }}
      onShowRegister={() => {
        resetFeedback();
        setScreen("register");
      }}
      onShowForgotPassword={() => setScreen("forgotPassword")}
      onShowResetPassword={() => setScreen("resetPassword")}
      onShowVerifyEmail={() => setScreen("verifyEmail")}
      onReturn={() => setScreen(session?.token ? "app" : "login")}
      onLogin={() => void handleLogin()}
      onRegister={() => void handleRegisterWithLegal()}
      onSeededLogin={() => void handleSeededLogin()}
      onRequestPasswordReset={() => void handleRequestPasswordReset()}
      onConfirmPasswordReset={() => void handleConfirmPasswordReset()}
      onConfirmEmailVerification={() => void handleConfirmEmailVerification()}
      onRequestEmailVerification={() => void handleRequestEmailVerification()}
    />
  );

  const renderNotificationBell = () => (
    <Pressable
      onPress={() => void openAppRoute("notifications")}
      disabled={routeNavigationLocked}
      accessibilityRole="button"
      accessibilityLabel={routeContent.labels.notifications}
      testID="app-notifications-bell-button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        opacity: routeNavigationLocked ? 0.55 : 1,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 18 }}>🔔</Text>
      {notificationUnreadCount > 0 ? (
        <View
          style={{
            minWidth: 20,
            borderRadius: 999,
            backgroundColor: palette.accent,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              color: palette.background,
              fontSize: 11,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            {notificationUnreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  const renderAppNavigator = () => (
    <NavigationContainer
      key={session?.sessionId ?? session?.user.id ?? "mobile-app"}
      ref={navigationRef}
      theme={appNavigationTheme}
      onReady={syncAppRouteFromNavigation}
      onStateChange={syncAppRouteFromNavigation}
    >
      <AppStack.Navigator
        initialRouteName={appRoute}
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: palette.background },
          gestureEnabled: !routeNavigationLocked,
          headerStyle: { backgroundColor: palette.panel },
          headerTintColor: palette.text,
          headerTitleStyle: { fontWeight: "700" },
          headerRight: renderNotificationBell,
        }}
      >
        <AppStack.Screen
          name="home"
          options={{ title: routeContent.labels.home }}
        >
          {() => (
            <HomeRouteContainer
              styles={styles}
              hero={appContent.appHero}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              title={routeContent.homeSectionTitle}
              subtitle={routeContent.homeSectionSubtitle}
              cards={routeContent.cards}
              navigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="account"
          options={{ title: routeContent.labels.account }}
        >
          {() => (
            <AccountRouteContainer
              styles={styles}
              hero={routeContent.heroes.account}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              copy={appContent.signedIn}
              platform={platform}
              email={session?.user.email ?? appContent.signedIn.unknownUser}
              role={session?.user.role ?? appContent.signedIn.unknownRole}
              emailVerified={emailVerified}
              currentSessionActive={Boolean(currentSession?.current)}
              formattedBalance={formatAmount(balance)}
              refreshingBalance={refreshingBalance}
              loadingSessions={loadingSessions}
              submitting={submitting}
              loadingDrawCatalog={loadingDrawCatalog}
              playingDrawCount={playingDrawCount}
              playingQuickEight={playingQuickEight}
              verificationCallout={verificationCallout}
              onRefreshBalance={() => void refreshBalance()}
              onRefreshSessions={() => void refreshSessions()}
              onSignOut={() => void signOut()}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="wallet"
          options={{ title: routeContent.labels.wallet }}
        >
          {() => (
            <WalletRouteContainer
              styles={styles}
              hero={routeContent.heroes.wallet}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              copy={appContent.wallet}
              formattedBalance={formatAmount(balance)}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="rewards"
          options={{ title: routeContent.labels.rewards }}
        >
          {() => (
            <RewardsRouteContainer
              styles={styles}
              hero={routeContent.heroes.rewards}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              copy={appContent.rewardCenter}
              rewardCenter={rewardCenter}
              loadingRewardCenter={loadingRewardCenter}
              claimingMissionId={claimingMissionId}
              submitting={submitting}
              playingDrawCount={playingDrawCount}
              playingQuickEight={playingQuickEight}
              formatAmount={formatAmount}
              formatOptionalTimestamp={formatOptionalTimestamp}
              onRefreshRewardCenter={() => void refreshRewardCenter()}
              onClaimReward={(missionId) => void claimReward(missionId)}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="community"
          options={{ title: routeContent.labels.community }}
        >
          {() => (
            <CommunityRouteContainer
              styles={styles}
              hero={routeContent.heroes.community}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              title={routeContent.labels.community}
              subtitle={routeContent.heroes.community.subtitle}
              copy={communityCopy}
              threads={communityThreads}
              selectedThreadId={selectedCommunityThreadId}
              threadDetail={communityThreadDetail}
              loadingThreads={loadingCommunityThreads}
              loadingThread={loadingCommunityThread}
              creatingThread={creatingCommunityThread}
              creatingReply={creatingCommunityReply}
              createError={communityCreateError}
              replyError={communityReplyError}
              listError={communityListError}
              detailError={communityDetailError}
              threadTitleInput={communityThreadTitle}
              threadBodyInput={communityThreadBody}
              replyBodyInput={communityReplyBody}
              formatTimestamp={(value) => formatOptionalTimestamp(value ?? null) ?? "—"}
              onRefresh={() => void refreshCommunityThreads(selectedCommunityThreadId)}
              onOpenWebCommunity={() => void handleOpenCommunityWeb()}
              onSelectThread={(threadId) => void selectCommunityThread(threadId)}
              onChangeThreadTitle={setCommunityThreadTitle}
              onChangeThreadBody={setCommunityThreadBody}
              onCreateThread={() => void createCommunityThread()}
              onChangeReplyBody={setCommunityReplyBody}
              onCreateReply={() => void createCommunityReply()}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="security"
          options={{ title: routeContent.labels.security }}
        >
          {() => (
            <SecurityRouteContainer
              styles={styles}
              hero={routeContent.heroes.security}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              copy={appContent.sessionSecurity}
              currentSession={currentSession}
              visibleSessions={visibleSessions}
              loadingSessions={loadingSessions}
              kycProfile={kycProfile}
              loadingKycProfile={loadingKycProfile}
              playingQuickEight={playingQuickEight}
              formatTimestamp={formatTimestamp}
              formatOptionalTimestamp={formatOptionalTimestamp}
              summarizeUserAgent={summarizeUserAgent}
              onRefreshSessions={() => void refreshSessions()}
              onRefreshKycProfile={() => void refreshKycProfile()}
              onOpenKycVerification={() => void handleOpenKycVerification()}
              onOpenResetPassword={() => setScreen("resetPassword")}
              onRevokeAllSessions={() => void revokeAllSessions()}
              onRevokeSession={(entry) => void revokeSession(entry)}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="notifications"
          options={{ title: routeContent.labels.notifications }}
        >
          {() => (
            <NotificationsRouteContainer
              styles={styles}
              hero={routeContent.heroes.notifications}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              title={routeContent.labels.notifications}
              subtitle={routeContent.heroes.notifications.subtitle}
              copy={notificationRouteCopy}
              unreadCount={notificationUnreadCount}
              notifications={notifications}
              loading={loadingNotifications}
              mutating={mutatingNotifications}
              formatTimestamp={(value) =>
                formatOptionalTimestamp(value ?? null) ?? "—"
              }
              onRefresh={() => void refreshNotifications()}
              onMarkAllRead={() => void markAllNotificationsRead()}
              onMarkRead={(notificationId) => void markNotificationRead(notificationId)}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="gacha"
          options={{ title: routeContent.labels.gacha }}
        >
          {() => (
            <GachaRouteContainer
              styles={styles}
              hero={routeContent.heroes.gacha}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              currentRoute={appRoute}
              routeLabels={routeContent.labels}
              routeNavigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
              verificationCallout={verificationCallout}
              screenCopy={routeContent.screens.gacha}
              fairnessRefreshingLabel={fairnessContent.refreshing}
              balance={balance}
              playModeCopy={playModeCopy}
              drawCatalog={drawCatalog}
              featuredPrizes={featuredPrizes}
              multiDrawCount={multiDrawCount}
              lastDrawPlay={lastDrawPlay}
              highlightPrize={highlightPrize}
              playingDrawCount={playingDrawCount}
              playingQuickEight={playingQuickEight}
              loadingDrawCatalog={loadingDrawCatalog}
              updatingDrawPlayMode={updatingDrawPlayMode}
              submitting={submitting}
              emailVerified={emailVerified}
              gachaReels={gachaReels}
              gachaLockedReels={gachaLockedReels}
              gachaAnimating={gachaAnimating}
              gachaTone={gachaTone}
              formatAmount={formatAmount}
              shortenCommitHash={shortenCommitHash}
              onChangeDrawPlayMode={(type) => void setDrawPlayMode(type)}
              onPlayDraw={(count) => void playDraw(count)}
              onRefreshDrawCatalog={() => void refreshDrawCatalog()}
              drawRarityLabels={drawRarityLabels}
              drawRarityTones={mobileDrawRarityTones}
              drawStockLabels={drawStockLabels}
              drawStatusLabels={drawStatusLabels}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="quickEight"
          options={{ title: routeContent.labels.quickEight }}
        >
          {() => (
            <QuickEightRouteContainer
              styles={styles}
              hero={routeContent.heroes.quickEight}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              currentRoute={appRoute}
              routeLabels={routeContent.labels}
              routeNavigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
              verificationCallout={verificationCallout}
              screenCopy={routeContent.screens.quickEight}
              balance={balance}
              formatAmount={formatAmount}
              emailVerified={emailVerified}
              playingQuickEight={playingQuickEight}
              playingDrawCount={playingDrawCount}
              quickEightSelection={quickEightSelection}
              quickEightStakeAmount={quickEightStakeAmount}
              quickEightResult={quickEightResult}
              visibleQuickEightDrawnNumbers={visibleQuickEightDrawnNumbers}
              quickEightMatchedSet={quickEightMatchedSet}
              fairnessLocale={fairnessLocale}
              fairnessEyebrow={fairnessContent.commitLive}
              quickEightStatusLabels={quickEightStatusLabels}
              onToggleNumber={toggleQuickEightNumber}
              onClearSelection={() => clearQuickEightSelection()}
              onChangeStakeAmount={setQuickEightStakeAmount}
              onPlayQuickEight={() => void playQuickEight()}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="predictionMarket"
          options={{ title: routeContent.labels.predictionMarket }}
        >
          {() => (
            <PredictionMarketRouteContainer
              styles={styles}
              hero={routeContent.heroes.predictionMarket}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              currentRoute={appRoute}
              routeLabels={routeContent.labels}
              routeNavigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
              verificationCallout={verificationCallout}
              screenCopy={routeContent.screens.predictionMarket}
              balance={balance}
              formatAmount={formatAmount}
              formatOptionalTimestamp={formatOptionalTimestamp}
              emailVerified={emailVerified}
              predictionMarkets={predictionMarkets}
              selectedPredictionMarket={selectedPredictionMarket}
              selectedPredictionMarketId={selectedPredictionMarketId}
              selectedPredictionOutcomeKey={selectedPredictionOutcomeKey}
              predictionMarketStakeAmount={predictionMarketStakeAmount}
              predictionMarketHistory={predictionMarketHistory}
              predictionMarketHistoryPage={predictionMarketHistoryPage}
              predictionMarketHistoryStatus={predictionMarketHistoryStatus}
              predictionMarketPositionCount={predictionMarketPositionCount}
              loadingPredictionMarkets={loadingPredictionMarkets}
              loadingPredictionMarket={loadingPredictionMarket}
              loadingPredictionMarketHistory={loadingPredictionMarketHistory}
              placingPredictionPosition={placingPredictionPosition}
              onRefreshPredictionMarkets={() => void refreshPredictionMarkets()}
              onRefreshPredictionMarketHistory={() =>
                void refreshPredictionMarketHistory()
              }
              onSelectPredictionMarket={selectPredictionMarket}
              onSelectPredictionMarketHistoryStatus={
                selectPredictionMarketHistoryStatus
              }
              onSelectPredictionOutcome={setSelectedPredictionOutcomeKey}
              onChangePredictionMarketStake={setPredictionMarketStakeAmount}
              onPreviousPredictionMarketHistoryPage={
                goToPreviousPredictionMarketHistoryPage
              }
              onNextPredictionMarketHistoryPage={goToNextPredictionMarketHistoryPage}
              onPlacePredictionPosition={() => void placePredictionPosition()}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="holdem"
          options={{ title: routeContent.labels.holdem }}
        >
          {() => (
            <HoldemRouteContainer
              styles={styles}
              hero={routeContent.heroes.holdem}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              currentRoute={appRoute}
              routeLabels={routeContent.labels}
              routeNavigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
              verificationCallout={verificationCallout}
              screenCopy={routeContent.screens.holdem}
              balance={balance}
              playModeCopy={playModeCopy}
              formatAmount={formatAmount}
              emailVerified={emailVerified}
              holdemPlayMode={holdemPlayMode}
              updatingHoldemPlayMode={updatingHoldemPlayMode}
              holdemTables={holdemTables}
              selectedHoldemTable={selectedHoldemTable}
              selectedHoldemReplayRoundId={selectedHoldemReplayRoundId}
              selectedHoldemReplay={selectedHoldemReplay}
              loadingHoldemLobby={loadingHoldemLobby}
              loadingHoldemTable={loadingHoldemTable}
              loadingHoldemReplay={loadingHoldemReplay}
              holdemReplayError={holdemReplayError}
              actingHoldem={actingHoldem}
              holdemTableName={holdemTableName}
              holdemBuyInAmount={holdemBuyInAmount}
              holdemCreateTableType={holdemCreateTableType}
              holdemCreateMaxSeats={holdemCreateMaxSeats}
              holdemTournamentStartingStackAmount={
                holdemTournamentStartingStackAmount
              }
              holdemTournamentPayoutPlaces={holdemTournamentPayoutPlaces}
              holdemRealtimeStatus={holdemRealtimeStatus}
              holdemActionAmount={holdemActionAmount}
              holdemTableMessages={holdemTableMessages}
              loadingHoldemMessages={loadingHoldemMessages}
              sendingHoldemMessage={sendingHoldemMessage}
              onChangeHoldemTableName={setHoldemTableName}
              onChangeHoldemBuyInAmount={setHoldemBuyInAmount}
              onChangeHoldemCreateTableType={setHoldemCreateTableType}
              onChangeHoldemCreateMaxSeats={setHoldemCreateMaxSeats}
              onChangeHoldemTournamentStartingStackAmount={
                setHoldemTournamentStartingStackAmount
              }
              onChangeHoldemTournamentPayoutPlaces={
                setHoldemTournamentPayoutPlaces
              }
              onChangeHoldemActionAmount={setHoldemActionAmount}
              onChangeHoldemPlayMode={(type) => void setHoldemPlayMode(type)}
              onSelectHoldemTable={setSelectedHoldemTableId}
              onCreateHoldemTable={() => void createHoldemTable()}
              onJoinHoldemTable={(tableId) => void joinHoldemTable(tableId)}
              onLeaveHoldemTable={(tableId) => void leaveHoldemTable(tableId)}
    onSetHoldemSeatMode={(tableId, sittingOut) =>
                void setHoldemSeatMode(tableId, sittingOut)
              }
              onStartHoldemTable={(tableId) => void startHoldemTable(tableId)}
              onRefreshHoldemLobby={() => void refreshHoldemLobby()}
              onRefreshHoldemTable={(tableId) => void refreshHoldemTable(tableId)}
              onActOnHoldemTable={(tableId, action) =>
                void actOnHoldemTable(tableId, action)
              }
              onSendHoldemChatMessage={(tableId, text) =>
                sendHoldemTableMessage(tableId, {
                  kind: "chat",
                  text,
                })
              }
              onSendHoldemEmoji={(tableId, emoji) =>
                sendHoldemTableMessage(tableId, {
                  kind: "emoji",
                  emoji,
                })
              }
              onOpenHoldemReplay={(roundId) => void openHoldemReplay(roundId)}
              onCloseHoldemReplay={closeHoldemReplay}
              loadHoldemEvidenceBundle={getHoldemEvidenceBundle}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="blackjack"
          options={{ title: routeContent.labels.blackjack }}
        >
          {() => (
            <BlackjackRouteContainer
              styles={styles}
              hero={routeContent.heroes.blackjack}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              currentRoute={appRoute}
              routeLabels={routeContent.labels}
              routeNavigationLocked={routeNavigationLocked}
              onOpenRoute={(route) => void openAppRoute(route)}
              verificationCallout={verificationCallout}
              screenCopy={routeContent.screens.blackjack}
              balance={balance}
              playModeCopy={playModeCopy}
              formatAmount={formatAmount}
              loadingBlackjack={loadingBlackjack}
              updatingBlackjackPlayMode={updatingBlackjackPlayMode}
              actingBlackjack={actingBlackjack}
              emailVerified={emailVerified}
              fairnessLocale={fairnessLocale}
              fairnessEyebrow={fairnessContent.commitLive}
              blackjackOverview={blackjackOverview}
              blackjackStakeAmount={blackjackStakeAmount}
              onChangeBlackjackPlayMode={(type) => void setBlackjackPlayMode(type)}
              onChangeStakeAmount={setBlackjackStakeAmount}
              onStartBlackjack={() => void startBlackjack()}
              onRefreshBlackjackOverview={() => void refreshBlackjackOverview()}
              onBlackjackAction={(gameId, action) =>
                void actOnBlackjack(gameId, action)
              }
              blackjackStatusLabels={blackjackStatusLabels}
            />
          )}
        </AppStack.Screen>
        <AppStack.Screen
          name="fairness"
          options={{ title: routeContent.labels.fairness }}
        >
          {() => (
            <FairnessRouteContainer
              styles={styles}
              hero={routeContent.heroes.fairness}
              apiBaseUrl={configuredApiBaseUrl}
              message={message}
              error={error}
              locale={fairnessLocale}
              commit={fairnessCommit}
              reveal={fairnessReveal}
              verification={fairnessVerification}
              revealEpoch={fairnessRevealEpoch}
              onChangeRevealEpoch={setFairnessRevealEpoch}
              onBack={() => void openAppRoute("home")}
              onRefresh={() => void refreshFairnessCommit()}
              onReveal={() => void revealFairness()}
              loadingCommit={loadingFairnessCommit}
              revealing={revealingFairness}
              navigationLocked={routeNavigationLocked}
            />
          )}
        </AppStack.Screen>
      </AppStack.Navigator>
    </NavigationContainer>
  );
  const toastOverlay = toast ? (
    <ToastBanner
      key={toast.id}
      message={toast.message}
      tone={toast.tone}
      onDismiss={dismissToast}
      testID="app-toast-banner"
    />
  ) : null;

  if (restoringSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.bootSplash}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.bootTitle}>
            {appContent.restoringSession.title}
          </Text>
          <Text style={styles.bootSubtitle}>
            {appContent.restoringSession.subtitle}
          </Text>
        </View>
        {toastOverlay}
      </SafeAreaView>
    );
  }

  if (screen === "app" && session) {
    if (legalAcceptanceRequired) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.hero}>
              <Text style={styles.kicker}>{appContent.appHero.kicker}</Text>
              <Text style={styles.title}>{appContent.legalGate.title}</Text>
              <Text style={styles.subtitle}>
                {appContent.legalGate.subtitle}
              </Text>
              <Text style={styles.endpoint}>
                {appContent.appHero.endpointLabel}: {configuredApiBaseUrl}
              </Text>
            </View>

            <MobileLegalAcceptanceCard
              copy={appContent.legalGate}
              documents={legalDocuments}
              pendingDocumentKeys={pendingLegalDocumentKeys}
              selectedDocumentKeys={selectedLegalDocumentKeys}
              loading={loadingLegalDocuments}
              submitting={acceptingLegal}
              onToggleDocument={toggleLegalDocument}
              onRefresh={() => void refreshLegalDocuments()}
              onSubmit={() => void handleAcceptUpdatedLegalDocuments()}
            />
          </ScrollView>
          {toastOverlay}
        </SafeAreaView>
      );
    }

    return (
      <View style={styles.safeArea}>
        {renderAppNavigator()}
        {toastOverlay}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>{appContent.appHero.kicker}</Text>
          <Text style={styles.title}>{appContent.appHero.title}</Text>
          <Text style={styles.subtitle}>{appContent.appHero.authSubtitle}</Text>
          <Text style={styles.endpoint}>
            {appContent.appHero.endpointLabel}: {configuredApiBaseUrl}
          </Text>
        </View>

        {authCard}
      </ScrollView>
      {toastOverlay}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {webviewQaEnabled ? <WebviewQaHarness styles={styles} /> : <NativeApp />}
    </SafeAreaProvider>
  );
}
