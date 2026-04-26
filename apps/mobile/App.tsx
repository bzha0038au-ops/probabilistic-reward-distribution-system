import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
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
import type { DrawResult, UserSessionResponse } from '@reward/shared-types';
import {
  createUserApiClient,
  resolveLocalApiBaseUrl,
  type SupportedUserPlatform,
} from '@reward/user-core';

type ScreenMode = 'login' | 'register' | 'app';
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
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
        placeholderTextColor={palette.textMuted}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        keyboardType={props.keyboardType ?? 'default'}
      />
    </View>
  );
}

function ActionButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        props.variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          props.variant === 'secondary' ? styles.buttonLabelSecondary : null,
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
  const [session, setSession] = useState<UserSessionResponse | null>(null);
  const [balance, setBalance] = useState('0');
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  const api = createUserApiClient({
    baseUrl: configuredApiBaseUrl,
    getAuthToken: () => session?.token,
  });

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const refreshBalance = async () => {
    if (!session?.token) {
      return;
    }

    setRefreshingBalance(true);
    const response = await api.getWalletBalance();

    if (response.ok) {
      setBalance(response.data.balance);
    } else {
      setError(response.error?.message ?? 'Failed to refresh wallet balance.');
    }

    setRefreshingBalance(false);
  };

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    void refreshBalance();
  }, [session?.token]);

  const normalizedEmail = email.trim().toLowerCase();

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

    setSession(response.data);
    setScreen('app');
    setMessage('Signed in. Mobile is now using the same backend contract as web.');
    setSubmitting(false);
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

    setMessage('Account created. You can now sign in on iOS and Android.');
    setScreen('login');
    setSubmitting(false);
  };

  const handleDraw = async () => {
    resetFeedback();
    setSubmitting(true);

    const response = await api.runDraw();

    if (!response.ok) {
      setError(response.error?.message ?? 'Draw failed.');
      setSubmitting(false);
      return;
    }

    setDrawResult(response.data);
    setMessage('Draw completed.');
    await refreshBalance();
    setSubmitting(false);
  };

  const handleSignOut = () => {
    setSession(null);
    setBalance('0');
    setDrawResult(null);
    setScreen('login');
    setPassword('');
    setMessage('Signed out.');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Reward System Native</Text>
          <Text style={styles.title}>One user stack, three surfaces.</Text>
          <Text style={styles.subtitle}>
            Web stays in Next.js. iOS and Android now run through this Expo app and
            reuse the shared user request layer.
          </Text>
          <Text style={styles.endpoint}>API: {configuredApiBaseUrl}</Text>
        </View>

        {!session ? (
          <SectionCard
            title={screen === 'login' ? 'Sign in' : 'Create account'}
            subtitle="Uses the existing backend endpoints: /auth/register and /auth/user/session."
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
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

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
          </SectionCard>
        ) : (
          <View style={styles.appStack}>
            <SectionCard
              title={`Signed in as ${session.user.email}`}
              subtitle={`Platform: ${platform} · Role: ${session.user.role}`}
            >
              <View style={styles.inlineActions}>
                <ActionButton
                  label={refreshingBalance ? 'Refreshing...' : 'Refresh balance'}
                  onPress={() => void refreshBalance()}
                  disabled={refreshingBalance || submitting}
                  variant="secondary"
                />
                <ActionButton
                  label="Sign out"
                  onPress={handleSignOut}
                  variant="secondary"
                />
              </View>
              {message ? <Text style={styles.successText}>{message}</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </SectionCard>

            <SectionCard title="Wallet" subtitle="Same /wallet endpoint as the web app.">
              <Text style={styles.balanceLabel}>Current balance</Text>
              <Text style={styles.balanceValue}>{balance}</Text>
            </SectionCard>

            <SectionCard title="Draw" subtitle="Native shell over the existing draw flow.">
              <ActionButton
                label={submitting ? 'Drawing...' : 'Run draw'}
                onPress={handleDraw}
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
  hero: {
    gap: 10,
  },
  kicker: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
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
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 16,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    color: palette.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonPrimary: {
    backgroundColor: palette.accent,
  },
  buttonSecondary: {
    backgroundColor: palette.panelMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: '#00131c',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelSecondary: {
    color: palette.text,
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  successText: {
    color: palette.success,
    fontSize: 14,
    lineHeight: 20,
  },
  appStack: {
    gap: 18,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  balanceLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  balanceValue: {
    color: palette.text,
    fontSize: 42,
    fontWeight: '800',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loaderText: {
    color: palette.textMuted,
    fontSize: 13,
  },
  resultPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 16,
    gap: 8,
  },
  resultLine: {
    color: palette.text,
    fontSize: 14,
  },
  webviewShell: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  webviewHeader: {
    backgroundColor: palette.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 6,
  },
  webviewTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
  },
  webviewMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  webviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
