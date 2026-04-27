import './globals.css';

import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';

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
  themeColor: '#08111f',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = getServerLocale();
  const messages = getServerMessages(locale);

  return (
    <html lang={locale}>
      <body className={`${GeistSans.variable} app-root`}>
        <ObservabilityBootstrap />
        <WebviewBridge />
        <I18nProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
