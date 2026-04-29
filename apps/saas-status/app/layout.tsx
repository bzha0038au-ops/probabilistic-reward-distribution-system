import './globals.css';

import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

const title = 'Reward SaaS Status';
const description =
  'Public runtime health, latency, worker backlog, and monthly SLA for the Reward prize engine.';

const resolveMetadataBase = () => {
  const value = process.env.STATUS_SITE_URL?.trim();
  if (!value) {
    return new URL('http://localhost:3003');
  }

  try {
    return new URL(value);
  } catch {
    return new URL('http://localhost:3003');
  }
};

export const metadata: Metadata = {
  title,
  description,
  metadataBase: resolveMetadataBase(),
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08131f',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} status-root`}
      >
        {children}
      </body>
    </html>
  );
}
