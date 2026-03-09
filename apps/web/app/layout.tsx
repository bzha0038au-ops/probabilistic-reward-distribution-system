import './globals.css';

import { GeistSans } from 'geist/font/sans';

const title = 'Prize Pool & Probability Engine System';
const description =
  'A transactional reward distribution platform with wallets, weighted draws, and admin analytics.';

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
  return (
    <html lang="en">
      <body className={GeistSans.variable}>{children}</body>
    </html>
  );
}
