import "./globals.css";

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";

const title = "Reward SaaS Portal";
const description =
  "Tenant self-serve portal for project keys, quota, prizes, billing, and SDK docs.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("http://localhost:3002"),
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} app-root`}>{children}</body>
    </html>
  );
}
