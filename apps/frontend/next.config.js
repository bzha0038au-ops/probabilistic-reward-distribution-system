const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production artifacts isolated so `next dev --turbo`
  // cannot poison the build output later consumed by `next start`.
  // Allow test harnesses to opt into their own isolated dev cache so they
  // don't fight with a developer's already-running `next dev`.
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === 'production' ? '.next' : '.next-dev'),
  output: 'standalone',
  allowedDevOrigins: ['10.0.2.2', '127.0.0.1', 'localhost'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Keep the Node SDK out of the route bundle to avoid webpack critical-dependency
  // warnings from its optional OpenTelemetry integrations.
  serverExternalPackages: ['@sentry/node'],
};

module.exports = nextConfig;
