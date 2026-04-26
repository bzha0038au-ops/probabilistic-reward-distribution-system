/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production artifacts isolated so `next dev --turbo`
  // cannot poison the build output later consumed by `next start`.
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  allowedDevOrigins: ['10.0.2.2', '127.0.0.1', 'localhost'],
};

module.exports = nextConfig;
