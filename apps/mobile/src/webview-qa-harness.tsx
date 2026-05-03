import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import {
  buildWebUrl,
  configuredWebBaseUrl,
  getAutoLoginScript,
  type WebRoute,
} from './app-support';
import type { MobileStyles } from './screens';
import { mobilePalette as palette, mobileSurfaceTheme } from './theme';
import { ActionButton } from './ui';

type WebviewQaHarnessProps = {
  styles: MobileStyles;
};

export function WebviewQaHarness(props: WebviewQaHarnessProps) {
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
    <SafeAreaView style={props.styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.webviewShell}>
        <View style={styles.webviewHeader}>
          <Text style={props.styles.kicker}>WebView QA</Text>
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
          <ActionButton
            label="Slot"
            onPress={() => openRoute('/app/slot')}
            variant="secondary"
          />
          <ActionButton
            label="Quick Eight"
            onPress={() => openRoute('/app/quick-eight')}
            variant="secondary"
          />
          <ActionButton
            label="Blackjack"
            onPress={() => openRoute('/app/blackjack')}
            variant="secondary"
          />
          <ActionButton
            label="Fairness"
            onPress={() => openRoute('/app/fairness')}
            variant="secondary"
          />
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

const styles = StyleSheet.create({
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
    backgroundColor: mobileSurfaceTheme.cardFace,
  },
});
