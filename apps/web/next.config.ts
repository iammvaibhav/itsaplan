import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // LAN / NetBird access from the MacBook. Next 16 blocks /_next/static
  // for any origin that is not localhost unless it is listed here.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    'dev.netbird.cloud',
    '100.123.178.38',
    '10.0.0.237',
    'iammvaibhav',
    'vaibhav-dev',
  ],
  // standalone build for a lean docker image.
  output: 'standalone',
  // Monorepo: include the repo root in file tracing for standalone and turbopack.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  serverExternalPackages: ['isomorphic-dompurify'],
  // Single browser origin: page and API share one origin (https://<host>:8443),
  // so the browser only ever has to accept ONE self-signed certificate. The
  // prefix is stripped on the way through — :path* lands at the api root — so
  // /__api/api/auth/* reaches better-auth's handler unchanged.
  async rewrites() {
    return [{ source: '/__api/:path*', destination: 'http://127.0.0.1:3000/:path*' }];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
