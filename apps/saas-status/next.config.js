const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  output: 'standalone',
  allowedDevOrigins: ['10.0.2.2', '127.0.0.1', 'localhost'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

module.exports = nextConfig;
