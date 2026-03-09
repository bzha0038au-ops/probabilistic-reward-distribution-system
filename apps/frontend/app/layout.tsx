import './globals.css';

import { GeistSans } from 'geist/font/sans';

import { I18nProvider } from '@/components/i18n-provider';
import { getServerLocale, getServerMessages } from '@/lib/i18n/server';

const title = 'Prize Pool & Probability Engine System';
const description =
  'A transactional reward distribution platform with balances, weighted draws, and operational analytics.';

export const metadata = {
  title,
  description,
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  metadataBase: new URL('http://localhost:3000'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getServerLocale();
  const messages = getServerMessages(locale);

  return (
    <html lang={locale}>
      <body className={GeistSans.variable}>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
