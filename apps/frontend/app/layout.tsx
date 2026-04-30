import './globals.css';

import type { CSSProperties, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { webRootCssVariables, webThemeColor } from '@reward/design-tokens';

import { I18nProvider } from '@/components/i18n-provider';
import { ObservabilityBootstrap } from '@/components/observability-bootstrap';
import { ToastProvider } from '@/components/ui/toast-provider';
import { WebviewBridge } from '@/components/webview-bridge';
import { getServerLocale, getServerMessages } from '@/lib/i18n/server';

const title = 'Prize Pool & Probability Engine System';
const description =
  'A transactional reward distribution platform with balances, weighted draws, and operational analytics.';

export const metadata: Metadata = {
  title,
  description,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  metadataBase: new URL('http://localhost:3000'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: webThemeColor,
  colorScheme: 'light',
};

const rootTokenStyle = webRootCssVariables as CSSProperties;

export default async function RootLayout({
  children,
}: LayoutProps<'/'>) {
  const locale = await getServerLocale();
  const messages = await getServerMessages(locale);

  return (
    <html lang={locale} style={rootTokenStyle}>
      <body className={`${GeistSans.variable} app-root`}>
        <ObservabilityBootstrap />
        <WebviewBridge />
        <I18nProvider locale={locale} messages={messages}>
          <ToastProvider>{children as ReactNode}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
