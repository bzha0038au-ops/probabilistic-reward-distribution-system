import {
  NavigationContainer,
  StackActions,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import { createUserApiClient } from "@reward/user-core";
import {
  AppStack,
  type AppRoute,
  type AppStackParamList,
  appNavigationTheme,
  blackjackStatusLabels,
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
import { useQuickEight } from "./src/hooks/use-quick-eight";
import { useRewardCenter } from "./src/hooks/use-reward-center";
import { useUserSession } from "./src/hooks/use-user-session";
import { useWallet } from "./src/hooks/use-wallet";
import { getMobileAppCopy } from "./src/mobile-copy";
import { mobileStyles as styles } from "./src/mobile-styles";
import { getMobileRouteCopy } from "./src/route-copy";
import {
  AccountRouteContainer,
  BlackjackRouteContainer,
  FairnessRouteContainer,
  GachaRouteContainer,
  HomeRouteContainer,
  QuickEightRouteContainer,
  RewardsRouteContainer,
  SecurityRouteContainer,
  WalletRouteContainer,
} from "./src/screens";
import { VerificationCallout } from "./src/sections/verification-callout";
import { ToastBanner, type ToastTone } from "./src/ui";
import { WebviewQaHarness } from "./src/webview-qa-harness";
import { mobileDrawRarityTones, mobilePalette as palette } from "./src/theme";

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
  const handleUnauthorizedRef = useRef<
    ((message: string) => Promise<boolean>) | null
  >(null);
  const sessionBridgeRef = useRef<AuthFlowSessionBridge | null>(null);
  const apiRef = useRef(
    createUserApiClient({
      baseUrl: configuredApiBaseUrl,
      getAuthToken: () => authTokenRef.current,
    }),
  );
  const api = apiRef.current;

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
  const fairnessContent = getMobileFairnessCopy(fairnessLocale);
  const routeContent = getMobileRouteCopy(fairnessLocale);

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
    startBlackjack,
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
    resetDraw();
    resetQuickEight();
    resetBlackjack();
    resetRewardCenter();
    resetFairness();
    setAppRoute("home");
  }, [
    resetBlackjack,
    resetDraw,
    resetFairness,
    resetQuickEight,
    resetRewardCenter,
    resetWallet,
  ]);

  const {
    applyAuthLink,
    email,
    password,
    resetTokenInput,
    newPassword,
    verificationTokenInput,
    sendingVerification,
    setEmail,
    setPassword,
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
    await refreshSessions(overrides);
    await refreshRewardCenter(overrides);
  };

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    void hydrateAuthenticatedState(session);
  }, [session?.token]);

  const emailVerified = Boolean(session?.user.emailVerifiedAt);
  const routeNavigationLocked =
    playingDrawCount !== null ||
    playingQuickEight ||
    actingBlackjack !== null ||
    loadingBlackjack ||
    loadingFairnessCommit ||
    revealingFairness ||
    gachaAnimating ||
    claimingMissionId !== null;

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

    if (
      nextRoute === "security" &&
      session?.token &&
      visibleSessions.length === 0
    ) {
      await refreshSessions();
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
      email={email}
      password={password}
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
      onChangeResetTokenInput={setResetTokenInput}
      onChangeNewPassword={setNewPassword}
      onChangeVerificationTokenInput={setVerificationTokenInput}
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
      onRegister={() => void handleRegister()}
      onSeededLogin={() => void handleSeededLogin()}
      onRequestPasswordReset={() => void handleRequestPasswordReset()}
      onConfirmPasswordReset={() => void handleConfirmPasswordReset()}
      onConfirmEmailVerification={() => void handleConfirmEmailVerification()}
      onRequestEmailVerification={() => void handleRequestEmailVerification()}
    />
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
              playingQuickEight={playingQuickEight}
              formatTimestamp={formatTimestamp}
              summarizeUserAgent={summarizeUserAgent}
              onRefreshSessions={() => void refreshSessions()}
              onOpenResetPassword={() => setScreen("resetPassword")}
              onRevokeAllSessions={() => void revokeAllSessions()}
              onRevokeSession={(entry) => void revokeSession(entry)}
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
              drawCatalog={drawCatalog}
              featuredPrizes={featuredPrizes}
              multiDrawCount={multiDrawCount}
              lastDrawPlay={lastDrawPlay}
              highlightPrize={highlightPrize}
              playingDrawCount={playingDrawCount}
              playingQuickEight={playingQuickEight}
              loadingDrawCatalog={loadingDrawCatalog}
              submitting={submitting}
              emailVerified={emailVerified}
              gachaReels={gachaReels}
              gachaLockedReels={gachaLockedReels}
              gachaAnimating={gachaAnimating}
              gachaTone={gachaTone}
              formatAmount={formatAmount}
              shortenCommitHash={shortenCommitHash}
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
              formatAmount={formatAmount}
              loadingBlackjack={loadingBlackjack}
              actingBlackjack={actingBlackjack}
              emailVerified={emailVerified}
              fairnessLocale={fairnessLocale}
              fairnessEyebrow={fairnessContent.commitLive}
              blackjackOverview={blackjackOverview}
              blackjackStakeAmount={blackjackStakeAmount}
              onChangeStakeAmount={setBlackjackStakeAmount}
              onStartBlackjack={() => void startBlackjack()}
              onRefreshBlackjackOverview={() => void refreshBlackjackOverview()}
              onBlackjackAction={(action) => void actOnBlackjack(action)}
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
      <ScrollView contentContainerStyle={styles.container}>
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
