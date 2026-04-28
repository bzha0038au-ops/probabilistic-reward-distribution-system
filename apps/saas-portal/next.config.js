const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production artifacts isolated so `next dev --turbo`
  // cannot poison the build output later consumed by `next start`.
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  output: 'standalone',
  allowedDevOrigins: ['10.0.2.2', '127.0.0.1', 'localhost'],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../..'),
    // Keep the Node SDK out of the route bundle to avoid webpack critical-dependency
    // warnings from its optional OpenTelemetry integrations.
    serverComponentsExternalPackages: ['@sentry/node'],
  },
};

module.exports = nextConfig;
