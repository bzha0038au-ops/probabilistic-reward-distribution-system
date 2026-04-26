import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { AuthSessionSummary, DrawResult, UserSessionResponse } from '@reward/shared-types';
import {
  createUserApiClient,
  resolveLocalApiBaseUrl,
  type UserApiOverrides,
  type SupportedUserPlatform,
} from '@reward/user-core';

import { parseAuthLink, resolveAuthTokenInput } from './src/auth-links';
import {
  clearStoredUserSession,
  readStoredUserSession,
  writeStoredUserSession,
} from './src/session-storage';

type ScreenMode =
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'resetPassword'
  | 'verifyEmail'
  | 'app';
type WebRoute = '/' | '/login' | '/register' | '/app';

const palette = {
  background: '#08111f',
  panel: '#102038',
  panelMuted: '#152844',
  border: '#274166',
  accent: '#39d0ff',
  accentMuted: '#d6f6ff',
  text: '#f7fbff',
  textMuted: '#9ab2ce',
  danger: '#ff7d7d',
  success: '#6ae5b1',
  warning: '#ffd76a',
  input: '#0c1b30',
};

const platform =
  Platform.OS === 'android'
    ? 'android'
    : Platform.OS === 'ios'
      ? 'ios'
      : 'web';

const defaultApiBaseUrl = resolveLocalApiBaseUrl(
  platform as SupportedUserPlatform
);

const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || defaultApiBaseUrl;

const defaultWebBaseUrl =
  platform === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';

const configuredWebBaseUrl = (
  process.env.EXPO_PUBLIC_WEBVIEW_BASE_URL?.trim() || defaultWebBaseUrl
).replace(/\/+$/, '');

const webviewQaEnabled = process.env.EXPO_PUBLIC_WEBVIEW_QA === '1';
const seededEmail =
  process.env.EXPO_PUBLIC_WEBVIEW_SEED_EMAIL?.trim() ||
  'alice.manual@example.com';
const seededPassword =
  process.env.EXPO_PUBLIC_WEBVIEW_SEED_PASSWORD?.trim() || 'User123!';

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'email-address';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
        placeholder={props.placeholder}
        placeholderTextColor={palette.textMuted}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        keyboardType={props.keyboardType ?? 'default'}
        autoCorrect={false}
      />
    </View>
  );
}

function ActionButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
}) {
  const variant = props.variant ?? 'primary';

  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        props.compact ? styles.buttonCompact : null,
        variant === 'secondary'
          ? styles.buttonSecondary
          : variant === 'danger'
            ? styles.buttonDanger
            : styles.buttonPrimary,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === 'secondary' ? styles.buttonLabelSecondary : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function TextLink(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled}>
      <Text
        style={[
          styles.textLink,
          props.disabled ? styles.textLinkDisabled : null,
          props.tone === 'danger' ? styles.textLinkDanger : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function SectionCard(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.cardSubtitle}>{props.subtitle}</Text> : null}
      {props.children}
    </View>
  );
}

function buildWebUrl(path: WebRoute) {
  return `${configuredWebBaseUrl}${path === '/' ? '' : path}`;
}

function getAutoLoginScript() {
  const email = JSON.stringify(seededEmail);
  const password = JSON.stringify(seededPassword);

  return `
    (function () {
      const emailInput = document.querySelector('input[name="email"]');
      const passwordInput = document.querySelector('input[name="password"]');
      const form = document.querySelector('form');

      if (!emailInput || !passwordInput || !form) {
        return true;
      }

      emailInput.focus();
      emailInput.value = ${email};
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));

      passwordInput.focus();
      passwordInput.value = ${password};
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

      form.requestSubmit();
      return true;
    })();
  `;
}

function buildCurrentSessionFallback(session: UserSessionResponse): AuthSessionSummary {
  return {
    sessionId: session.sessionId ?? 'unknown',
    kind: 'user',
    role: session.user.role,
    ip: null,
    userAgent: null,
    createdAt: null,
    lastSeenAt: null,
    expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    current: true,
  };
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return 'Unknown';
  }

  return timestamp.toLocaleString();
}

function summarizeUserAgent(value: string | null) {
  if (!value) {
    return 'Unavailable';
  }

  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function isExplicitLinkInput(value: string) {
  const trimmed = value.trim();
  return trimmed.includes('://') || trimmed.startsWith('http');
}

function WebviewQaHarness() {
  const webViewRef = useRef<WebView>(null);
  const [currentRoute, setCurrentRoute] = useState<WebRoute>('/');
  const [lastLoadedUrl, setLastLoadedUrl] = useState(buildWebUrl('/'));
  const [status, setStatus] = useState('Loading landing page...');
  const [autoLoginPending, setAutoLoginPending] = useState(false);

  const currentUrl = buildWebUrl(currentRoute);

  const openRoute = (route: WebRoute) => {
    setCurrentRoute(route);
    setStatus(`Opening ${route}`);
  };

  const handleAutoLogin = () => {
    setAutoLoginPending(true);
    setCurrentRoute('/login');
    setStatus('Opening /login and injecting seeded credentials...');
  };

  const handleNavigationStateChange = (event: WebViewNavigation) => {
    setLastLoadedUrl(event.url);
  };

  const handleLoadEnd = () => {
    setStatus(`Loaded ${lastLoadedUrl}`);

    if (autoLoginPending && lastLoadedUrl.includes('/login')) {
      webViewRef.current?.injectJavaScript(getAutoLoginScript());
      setStatus('Injected credentials into /login and submitted the form.');
      setAutoLoginPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.webviewShell}>
        <View style={styles.webviewHeader}>
          <Text style={styles.kicker}>WebView QA</Text>
          <Text style={styles.webviewTitle}>
            Android/iOS container compatibility harness
          </Text>
          <Text style={styles.webviewMeta}>Base URL: {configuredWebBaseUrl}</Text>
          <Text style={styles.webviewMeta}>Latest URL: {lastLoadedUrl}</Text>
          <Text style={styles.webviewMeta}>Status: {status}</Text>
        </View>

        <View style={styles.webviewActions}>
          <ActionButton label="Landing" onPress={() => openRoute('/')} variant="secondary" />
          <ActionButton label="Login" onPress={() => openRoute('/login')} variant="secondary" />
          <ActionButton
            label="Register"
            onPress={() => openRoute('/register')}
            variant="secondary"
          />
          <ActionButton label="App" onPress={() => openRoute('/app')} variant="secondary" />
          <ActionButton label="Auto Login" onPress={handleAutoLogin} />
        </View>

        <View style={styles.webviewContainer}>
          <WebView
            key={currentUrl}
            ref={webViewRef}
            source={{ uri: currentUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadEnd={handleLoadEnd}
            onError={(event) => {
              setStatus(`Load error: ${event.nativeEvent.description}`);
            }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowsInlineMediaPlayback
            originWhitelist={['*']}
            style={styles.webview}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function NativeApp() {
  const [screen, setScreen] = useState<ScreenMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationTokenInput, setVerificationTokenInput] = useState('');
  const [session, setSession] = useState<UserSessionResponse | null>(null);
  const [currentSession, setCurrentSession] = useState<AuthSessionSummary | null>(null);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [balance, setBalance] = useState('0');
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [sendingVerification, setSendingVerification] = useState(false);
  const authTokenRef = useRef<string | null>(null);
  const apiRef = useRef(
    createUserApiClient({
      baseUrl: configuredApiBaseUrl,
      getAuthToken: () => authTokenRef.current,
    })
  );
  const api = apiRef.current;

  const updateSession = (nextSession: UserSessionResponse | null) => {
    authTokenRef.current = nextSession?.token ?? null;
    setSession(nextSession);
  };

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const persistSession = async (nextSession: UserSessionResponse) => {
    try {
      await writeStoredUserSession(nextSession);
    } catch {
      setError('Failed to persist the secure session on this device.');
    }
  };

  const clearLocalSession = async (nextMessage?: string) => {
    try {
      await clearStoredUserSession();
    } finally {
      updateSession(null);
      setCurrentSession(null);
      setSessions([]);
      setBalance('0');
      setDrawResult(null);
      setPassword('');
      setScreen('login');
      setError(null);
      setMessage(nextMessage ?? null);
    }
  };

  const reconcileSession = async (
    baseSession: UserSessionResponse,
    overrides: {
      sessionId?: string;
      emailVerifiedAt?: string | null;
      phoneVerifiedAt?: string | null;
    } = {}
  ) => {
    const nextSession: UserSessionResponse = {
      ...baseSession,
      sessionId: overrides.sessionId ?? baseSession.sessionId,
      user: {
        ...baseSession.user,
        emailVerifiedAt:
          overrides.emailVerifiedAt !== undefined
            ? overrides.emailVerifiedAt
            : baseSession.user.emailVerifiedAt,
        phoneVerifiedAt:
          overrides.phoneVerifiedAt !== undefined
            ? overrides.phoneVerifiedAt
            : baseSession.user.phoneVerifiedAt,
      },
    };

    updateSession(nextSession);
    await persistSession(nextSession);
    return nextSession;
  };

  const handleUnauthorized = async (nextMessage: string) => {
    await clearLocalSession(nextMessage);
    return true;
  };

  const resolveTokenForScreen = (
    rawValue: string,
    expectedScreen: 'resetPassword' | 'verifyEmail'
  ) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return '';
    }

    const linkIntent = parseAuthLink(trimmed);
    if (linkIntent) {
      if (linkIntent.screen !== expectedScreen) {
        setError(
          expectedScreen === 'resetPassword'
            ? 'This link opens email verification, not password reset.'
            : 'This link opens password reset, not email verification.'
        );
        return null;
      }

      return linkIntent.token;
    }

    if (isExplicitLinkInput(trimmed)) {
      setError('The link is missing a valid token.');
      return null;
    }

    return resolveAuthTokenInput(trimmed);
  };

  const applyAuthLink = (url: string) => {
    const intent = parseAuthLink(url);
    if (!intent) {
      return false;
    }

    resetFeedback();

    if (intent.screen === 'resetPassword') {
      setResetTokenInput(intent.token);
      setScreen('resetPassword');
      setMessage('Recovery link loaded. Set a new password to continue.');
      return true;
    }

    setVerificationTokenInput(intent.token);
    setScreen('verifyEmail');
    setMessage('Verification link loaded. Confirm the email to finish activation.');
    return true;
  };

  const refreshBalance = async (overrides: UserApiOverrides = {}) => {
    if (!(overrides.authToken ?? session?.token)) {
      return false;
    }

    setRefreshingBalance(true);
    const response = await api.getWalletBalance(overrides);

    if (!response.ok) {
      setRefreshingBalance(false);

      if (response.status === 401) {
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return false;
      }

      setError(response.error?.message ?? 'Failed to refresh wallet balance.');
      return false;
    }

    setBalance(response.data.balance);
    setRefreshingBalance(false);
    return true;
  };

  const refreshCurrentSession = async (
    baseSession: UserSessionResponse,
    overrides: UserApiOverrides = {}
  ) => {
    const response = await api.getCurrentSession(overrides);

    if (!response.ok) {
      if (response.status === 401) {
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return null;
      }

      setError(response.error?.message ?? 'Failed to restore the current session.');
      return null;
    }

    const nextSession = await reconcileSession(baseSession, {
      sessionId: response.data.session.sessionId,
      emailVerifiedAt: response.data.user.emailVerifiedAt,
      phoneVerifiedAt: response.data.user.phoneVerifiedAt,
    });
    setCurrentSession(response.data.session);

    return nextSession;
  };

  const refreshSessions = async (overrides: UserApiOverrides = {}) => {
    if (!(overrides.authToken ?? session?.token)) {
      return false;
    }

    setLoadingSessions(true);
    const response = await api.listSessions(overrides);

    if (!response.ok) {
      setLoadingSessions(false);

      if (response.status === 401) {
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return false;
      }

      setError(response.error?.message ?? 'Failed to load active sessions.');
      return false;
    }

    setSessions(response.data.items);
    setLoadingSessions(false);
    return true;
  };

  const hydrateAuthenticatedState = async (baseSession: UserSessionResponse) => {
    const overrides = { authToken: baseSession.token };
    const nextSession = await refreshCurrentSession(baseSession, overrides);
    if (!nextSession) {
      return;
    }

    await refreshBalance(overrides);
    await refreshSessions(overrides);
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const initialUrl = await Linking.getInitialURL();
      const initialLinkLoaded = initialUrl ? applyAuthLink(initialUrl) : false;

      const storedSession = await readStoredUserSession();
      if (!active) {
        return;
      }

      if (!storedSession) {
        if (!initialLinkLoaded) {
          setScreen('login');
        }
        setRestoringSession(false);
        return;
      }

      if (storedSession.expiresAt <= Math.floor(Date.now() / 1000)) {
        await clearStoredUserSession();
        if (!active) {
          return;
        }

        if (!initialLinkLoaded) {
          setScreen('login');
        }
        setMessage('Saved session expired. Sign in again.');
        setRestoringSession(false);
        return;
      }

      const response = await api.getCurrentSession({
        authToken: storedSession.token,
      });

      if (!active) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          await clearStoredUserSession();
        }
        if (!active) {
          return;
        }

        if (!initialLinkLoaded) {
          setScreen('login');
        }
        if (response.status === 401) {
          setMessage('Saved session was revoked or expired. Sign in again.');
        } else {
          setError(response.error?.message ?? 'Failed to restore the saved session.');
        }
        setRestoringSession(false);
        return;
      }

      const restoredSession: UserSessionResponse = {
        ...storedSession,
        sessionId: response.data.session.sessionId,
        user: response.data.user,
      };

      updateSession(restoredSession);
      setCurrentSession(response.data.session);
      await persistSession(restoredSession);
      if (!initialLinkLoaded) {
        setScreen('app');
      }
      setRestoringSession(false);
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      applyAuthLink(url);
    });

    void bootstrap();

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    void hydrateAuthenticatedState(session);
  }, [session?.token]);

  const normalizedEmail = email.trim().toLowerCase();
  const visibleSessions = sessions.length > 0 ? sessions : currentSession ? [currentSession] : [];
  const emailVerified = Boolean(session?.user.emailVerifiedAt);

  const handleLogin = async () => {
    resetFeedback();

    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    const response = await api.createSession({
      email: normalizedEmail,
      password,
    });

    if (!response.ok) {
      setError(response.error?.message ?? 'Login failed.');
      setSubmitting(false);
      return;
    }

    updateSession(response.data);
    setCurrentSession(buildCurrentSessionFallback(response.data));
    setSessions([]);
    setDrawResult(null);
    setPassword('');
    setScreen('app');
    setMessage('Signed in. Session is now stored securely on this device.');
    setSubmitting(false);
    await persistSession(response.data);
  };

  const handleRegister = async () => {
    resetFeedback();

    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    const response = await api.register({
      email: normalizedEmail,
      password,
    });

    if (!response.ok) {
      setError(response.error?.message ?? 'Registration failed.');
      setSubmitting(false);
      return;
    }

    setMessage('Account created. Check your inbox for the verification link.');
    setScreen('login');
    setSubmitting(false);
  };

  const handleRequestPasswordReset = async () => {
    resetFeedback();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setSubmitting(true);
    const response = await api.requestPasswordReset({ email: normalizedEmail });

    if (!response.ok) {
      setError(response.error?.message ?? 'Failed to request password reset.');
      setSubmitting(false);
      return;
    }

    setMessage('If the account exists, a reset link has been sent.');
    setScreen('forgotPassword');
    setSubmitting(false);
  };

  const handleConfirmPasswordReset = async () => {
    resetFeedback();

    const token = resolveTokenForScreen(resetTokenInput, 'resetPassword');
    if (!token || !newPassword) {
      if (!token) {
        return;
      }
      setError('A reset token and new password are required.');
      return;
    }

    setSubmitting(true);
    const response = await api.confirmPasswordReset({
      token,
      password: newPassword,
    });

    if (!response.ok) {
      setError(response.error?.message ?? 'Password reset failed.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setResetTokenInput('');
    setNewPassword('');
    await clearLocalSession('Password updated. Sign in with the new password.');
  };

  const handleConfirmEmailVerification = async () => {
    resetFeedback();

    const token = resolveTokenForScreen(verificationTokenInput, 'verifyEmail');
    if (!token) {
      if (verificationTokenInput.trim()) {
        return;
      }
      setError('A verification token is required.');
      return;
    }

    setSubmitting(true);
    const response = await api.confirmEmailVerification({ token });

    if (!response.ok) {
      setError(response.error?.message ?? 'Email verification failed.');
      setSubmitting(false);
      return;
    }

    if (session?.token) {
      const nextEmailVerifiedAt = new Date().toISOString();
      await reconcileSession(session, {
        emailVerifiedAt: nextEmailVerifiedAt,
      });
      await refreshCurrentSession({
        ...session,
        user: {
          ...session.user,
          emailVerifiedAt: nextEmailVerifiedAt,
        },
      });
      setScreen('app');
      setMessage(`Email verified for ${response.data.email}.`);
    } else {
      setScreen('login');
      setMessage(`Email verified for ${response.data.email}. You can sign in now.`);
    }

    setVerificationTokenInput('');
    setSubmitting(false);
  };

  const handleRequestEmailVerification = async () => {
    if (!session?.token) {
      setError('Sign in before requesting another verification email.');
      return;
    }

    resetFeedback();
    setSendingVerification(true);
    const response = await api.requestEmailVerification();

    if (!response.ok) {
      if (response.status === 401) {
        setSendingVerification(false);
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return;
      }

      setError(response.error?.message ?? 'Failed to send verification email.');
      setSendingVerification(false);
      return;
    }

    setMessage('Verification email sent. Open it on this device to continue.');
    setSendingVerification(false);
  };

  const handleDraw = async () => {
    resetFeedback();
    setSubmitting(true);

    const response = await api.runDraw();

    if (!response.ok) {
      if (response.status === 401) {
        setSubmitting(false);
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return;
      }

      setError(response.error?.message ?? 'Draw failed.');
      setSubmitting(false);
      return;
    }

    setDrawResult(response.data);
    setMessage('Draw completed.');
    await refreshBalance();
    setSubmitting(false);
  };

  const handleSignOut = async () => {
    if (!session?.token) {
      await clearLocalSession('Signed out.');
      return;
    }

    resetFeedback();
    setSubmitting(true);
    const response = await api.deleteCurrentSession();
    const remoteLogoutFailed = !response.ok && response.status !== 401;
    setSubmitting(false);
    await clearLocalSession(remoteLogoutFailed ? undefined : 'Signed out on this device.');

    if (remoteLogoutFailed) {
      setError(
        response.error?.message
          ? `Signed out on this device, but remote logout failed: ${response.error.message}`
          : 'Signed out on this device, but the server could not confirm remote logout.'
      );
    }
  };

  const handleRevokeSession = async (targetSession: AuthSessionSummary) => {
    if (!session?.token) {
      return;
    }

    resetFeedback();
    setLoadingSessions(true);
    const response = await api.revokeSession(targetSession.sessionId);

    if (!response.ok) {
      setLoadingSessions(false);

      if (response.status === 401) {
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return;
      }

      setError(response.error?.message ?? 'Failed to revoke session.');
      return;
    }

    setLoadingSessions(false);

    if (targetSession.current) {
      await clearLocalSession('Current session revoked.');
      return;
    }

    setMessage('Session revoked.');
    await refreshSessions();
  };

  const handleRevokeAllSessions = async () => {
    if (!session?.token) {
      return;
    }

    resetFeedback();
    setLoadingSessions(true);
    const response = await api.revokeAllSessions();

    if (!response.ok) {
      setLoadingSessions(false);

      if (response.status === 401) {
        await handleUnauthorized('Session expired or was revoked. Sign in again.');
        return;
      }

      setError(response.error?.message ?? 'Failed to revoke sessions.');
      return;
    }

    setLoadingSessions(false);
    await clearLocalSession(
      `Signed out everywhere. Revoked ${response.data.revokedCount} active sessions.`
    );
  };

  const renderAuthCard = () => {
    if (screen === 'forgotPassword') {
      return (
        <SectionCard
          title="Reset password"
          subtitle="Request a recovery link, then open it in the app or paste it below."
        >
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="user@example.com"
          />
          <ActionButton
          label={submitting ? 'Sending...' : 'Send recovery link'}
          onPress={handleRequestPasswordReset}
          disabled={submitting}
        />
        <View style={styles.linkRow}>
          <TextLink label="I already have a reset link" onPress={() => setScreen('resetPassword')} />
          <TextLink
            label={session?.token ? 'Back to app' : 'Back to sign in'}
            onPress={() => setScreen(session?.token ? 'app' : 'login')}
          />
        </View>
      </SectionCard>
    );
  }

    if (screen === 'resetPassword') {
      return (
        <SectionCard
          title="Choose a new password"
          subtitle="Paste the recovery link or just the token from the email."
        >
          <Field
            label="Recovery link or token"
            value={resetTokenInput}
            onChangeText={setResetTokenInput}
            placeholder="reward-mobile://reset-password?token=..."
          />
          <Field
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <ActionButton
            label={submitting ? 'Updating...' : 'Reset password'}
            onPress={handleConfirmPasswordReset}
            disabled={submitting}
          />
          <View style={styles.linkRow}>
            <TextLink label="Request another link" onPress={() => setScreen('forgotPassword')} />
            <TextLink
              label={session?.token ? 'Back to app' : 'Back to sign in'}
              onPress={() => setScreen(session?.token ? 'app' : 'login')}
            />
          </View>
        </SectionCard>
      );
    }

    if (screen === 'verifyEmail') {
      return (
        <SectionCard
          title="Verify email"
          subtitle="Open the verification message on this device or paste the verification link."
        >
          <Field
            label="Verification link or token"
            value={verificationTokenInput}
            onChangeText={setVerificationTokenInput}
            placeholder="reward-mobile://verify-email?token=..."
          />
          <ActionButton
            label={submitting ? 'Verifying...' : 'Verify email'}
            onPress={handleConfirmEmailVerification}
            disabled={submitting}
          />
          <View style={styles.linkRow}>
            {session?.token && !emailVerified ? (
              <TextLink
                label={
                  sendingVerification ? 'Sending verification email...' : 'Send another verification email'
                }
                onPress={() => void handleRequestEmailVerification()}
                disabled={sendingVerification}
              />
            ) : null}
            <TextLink
              label={session?.token ? 'Back to app' : 'Back to sign in'}
              onPress={() => setScreen(session?.token ? 'app' : 'login')}
            />
          </View>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title={screen === 'login' ? 'Sign in' : 'Create account'}
        subtitle="Uses the backend session lifecycle: create, persist, restore, revoke."
      >
        <View style={styles.segmentedControl}>
          <ActionButton
            label="Login"
            onPress={() => {
              resetFeedback();
              setScreen('login');
            }}
            variant={screen === 'login' ? 'primary' : 'secondary'}
          />
          <ActionButton
            label="Register"
            onPress={() => {
              resetFeedback();
              setScreen('register');
            }}
            variant={screen === 'register' ? 'primary' : 'secondary'}
          />
        </View>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="user@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <ActionButton
          label={
            submitting
              ? 'Submitting...'
              : screen === 'login'
                ? 'Sign in'
                : 'Create account'
          }
          onPress={screen === 'login' ? handleLogin : handleRegister}
          disabled={submitting}
        />

        <View style={styles.linkRow}>
          <TextLink label="Forgot password?" onPress={() => setScreen('forgotPassword')} />
          <TextLink label="Open verification link" onPress={() => setScreen('verifyEmail')} />
        </View>
      </SectionCard>
    );
  };

  if (restoringSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.bootSplash}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.bootTitle}>Restoring secure session...</Text>
          <Text style={styles.bootSubtitle}>
            Checking the saved token with the backend before showing the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Reward System Native</Text>
          <Text style={styles.title}>Production session lifecycle for mobile.</Text>
          <Text style={styles.subtitle}>
            Secure storage, cold-start restore, backend-backed logout, session
            self-service, and native password-recovery/email-verification flows.
          </Text>
          <Text style={styles.endpoint}>API: {configuredApiBaseUrl}</Text>
        </View>

        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {screen !== 'app' || !session ? (
          renderAuthCard()
        ) : (
          <View style={styles.appStack}>
            <SectionCard
              title={`Signed in as ${session.user.email}`}
              subtitle={`Platform: ${platform} · Role: ${session.user.role}`}
            >
              <View style={styles.badgeRow}>
                <View style={[styles.badge, emailVerified ? styles.badgeSuccess : styles.badgeWarning]}>
                  <Text style={styles.badgeText}>
                    {emailVerified ? 'Email verified' : 'Email not verified'}
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    Session {currentSession?.current ? 'active' : 'loading'}
                  </Text>
                </View>
              </View>

              <View style={styles.inlineActions}>
                <ActionButton
                  label={refreshingBalance ? 'Refreshing...' : 'Refresh balance'}
                  onPress={() => void refreshBalance()}
                  disabled={refreshingBalance || submitting}
                  variant="secondary"
                  compact
                />
                <ActionButton
                  label={loadingSessions ? 'Refreshing...' : 'Refresh sessions'}
                  onPress={() => void refreshSessions()}
                  disabled={loadingSessions || submitting}
                  variant="secondary"
                  compact
                />
                <ActionButton
                  label={submitting ? 'Signing out...' : 'Sign out'}
                  onPress={() => void handleSignOut()}
                  disabled={submitting}
                  variant="danger"
                  compact
                />
              </View>

              {!emailVerified ? (
                <View style={styles.securityCallout}>
                  <Text style={styles.securityTitle}>Finish email verification</Text>
                  <Text style={styles.securitySubtitle}>
                    Recovery and security notifications depend on a verified email.
                  </Text>
                  <View style={styles.inlineActions}>
                    <ActionButton
                      label={
                        sendingVerification
                          ? 'Sending verification...'
                          : 'Send verification email'
                      }
                      onPress={() => void handleRequestEmailVerification()}
                      disabled={sendingVerification}
                      compact
                    />
                    <ActionButton
                      label="Open verification"
                      onPress={() => setScreen('verifyEmail')}
                      variant="secondary"
                      compact
                    />
                  </View>
                </View>
              ) : null}
            </SectionCard>

            <SectionCard title="Wallet" subtitle="Same `/wallet` endpoint as the web app.">
              <Text style={styles.balanceLabel}>Current balance</Text>
              <Text style={styles.balanceValue}>{balance}</Text>
            </SectionCard>

            <SectionCard title="Draw" subtitle="Native shell over the existing draw flow.">
              <ActionButton
                label={submitting ? 'Drawing...' : 'Run draw'}
                onPress={() => void handleDraw()}
                disabled={submitting}
              />
              {submitting ? (
                <View style={styles.loaderRow}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={styles.loaderText}>Calling POST /draw...</Text>
                </View>
              ) : null}
              {drawResult ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.resultLine}>Status: {drawResult.status}</Text>
                  <Text style={styles.resultLine}>Reward: {drawResult.rewardAmount}</Text>
                  <Text style={styles.resultLine}>
                    Prize: {drawResult.prizeId ?? 'N/A'}
                  </Text>
                </View>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Session security"
              subtitle="List active sessions, revoke a single session, or sign out everywhere."
            >
              {currentSession ? (
                <View style={styles.sessionMeta}>
                  <Text style={styles.sessionMetaLine}>
                    Current session ID: {currentSession.sessionId}
                  </Text>
                  <Text style={styles.sessionMetaLine}>
                    Expires: {formatTimestamp(currentSession.expiresAt)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inlineActions}>
                <ActionButton
                  label={loadingSessions ? 'Refreshing...' : 'Refresh list'}
                  onPress={() => void refreshSessions()}
                  disabled={loadingSessions}
                  variant="secondary"
                  compact
                />
                <ActionButton
                  label="Reset password"
                  onPress={() => setScreen('resetPassword')}
                  variant="secondary"
                  compact
                />
                <ActionButton
                  label="Sign out everywhere"
                  onPress={() => void handleRevokeAllSessions()}
                  disabled={loadingSessions}
                  variant="danger"
                  compact
                />
              </View>

              {loadingSessions ? (
                <View style={styles.loaderRow}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={styles.loaderText}>Loading active sessions...</Text>
                </View>
              ) : null}

              {visibleSessions.map((entry) => (
                <View key={entry.sessionId} style={styles.sessionCard}>
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionTitle}>
                      {entry.current ? 'Current device' : 'Active session'}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        entry.current ? styles.badgeSuccess : styles.badgeMuted,
                      ]}
                    >
                      <Text style={styles.badgeText}>{entry.current ? 'Current' : entry.kind}</Text>
                    </View>
                  </View>
                  <Text style={styles.sessionBody}>ID: {entry.sessionId}</Text>
                  <Text style={styles.sessionBody}>IP: {entry.ip ?? 'Unavailable'}</Text>
                  <Text style={styles.sessionBody}>
                    User-Agent: {summarizeUserAgent(entry.userAgent)}
                  </Text>
                  <Text style={styles.sessionBody}>
                    Created: {formatTimestamp(entry.createdAt)}
                  </Text>
                  <Text style={styles.sessionBody}>
                    Last seen: {formatTimestamp(entry.lastSeenAt)}
                  </Text>
                  <Text style={styles.sessionBody}>
                    Expires: {formatTimestamp(entry.expiresAt)}
                  </Text>
                  <View style={styles.sessionActionRow}>
                    <ActionButton
                      label={entry.current ? 'Sign out this device' : 'Revoke session'}
                      onPress={() => void handleRevokeSession(entry)}
                      variant={entry.current ? 'danger' : 'secondary'}
                      compact
                    />
                  </View>
                </View>
              ))}
            </SectionCard>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  if (webviewQaEnabled) {
    return <WebviewQaHarness />;
  }

  return <NativeApp />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    minHeight: '100%',
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 18,
  },
  bootSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  bootTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  bootSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  hero: {
    gap: 10,
  },
  kicker: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  endpoint: {
    color: palette.accentMuted,
    fontSize: 12,
  },
  card: {
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 18,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  buttonCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  buttonPrimary: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  buttonSecondary: {
    backgroundColor: palette.panelMuted,
    borderColor: palette.border,
  },
  buttonDanger: {
    backgroundColor: '#3a161d',
    borderColor: '#7a2836',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: '#031320',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelSecondary: {
    color: palette.text,
  },
  textLink: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  textLinkDisabled: {
    opacity: 0.5,
  },
  textLinkDanger: {
    color: palette.danger,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  successText: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f6d55',
    backgroundColor: '#0d2c24',
    color: palette.success,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7a2836',
    backgroundColor: '#2d141b',
    color: palette.danger,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  appStack: {
    gap: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeSuccess: {
    borderColor: '#1f6d55',
    backgroundColor: '#0d2c24',
  },
  badgeWarning: {
    borderColor: '#7a6328',
    backgroundColor: '#2d2614',
  },
  badgeMuted: {
    backgroundColor: palette.input,
  },
  badgeText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  securityCallout: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7a6328',
    backgroundColor: '#2d2614',
    padding: 14,
  },
  securityTitle: {
    color: palette.warning,
    fontSize: 15,
    fontWeight: '700',
  },
  securitySubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  balanceLabel: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceValue: {
    color: palette.text,
    fontSize: 36,
    fontWeight: '800',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loaderText: {
    color: palette.textMuted,
    fontSize: 14,
  },
  resultPanel: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  resultLine: {
    color: palette.text,
    fontSize: 14,
  },
  sessionMeta: {
    gap: 4,
  },
  sessionMetaLine: {
    color: palette.textMuted,
    fontSize: 13,
  },
  sessionCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sessionBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sessionActionRow: {
    paddingTop: 4,
  },
  webviewShell: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  webviewHeader: {
    gap: 8,
  },
  webviewTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '800',
  },
  webviewMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  webviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  webviewContainer: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    backgroundColor: palette.panel,
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
