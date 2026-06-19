import { withSentryConfig } from '@sentry/nextjs';
import { buildSecurityHeaders } from './lib/security/headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless', 'ws', '@upstash/ratelimit', '@upstash/redis', 'cloudinary'],
  poweredByHeader: false,
  webpack(config, { nextRuntime }) {
    // Edge middleware bundles auth.config.ts which lazy-imports argon2/prisma and the
    // verified-ticket authorize (lib/verification/ticket → node:crypto). Все они Node-only;
    // глушим их в edge-бандле. authorize-колбэки Credentials исполняются только в Node-рантайме
    // (auth.ts), никогда в edge-middleware (там работает только колбэк `authorized`).
    if (nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@node-rs/argon2': false,
        '@prisma/client': false,
        '@prisma/adapter-neon': false,
        '@neondatabase/serverless': false,
        ws: false,
        '@upstash/ratelimit': false,
        '@upstash/redis': false,
        // ticket.ts (verified-ticket authorize) импортит crypto — в Edge его нет.
        // authorize крутится только в Node (auth.ts), edge до него не доходит → глушим.
        crypto: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
    ];
  },
  images: {
    // Демо-фото в Фазе 1 — локальные (public/), remotePatterns понадобятся при Cloudinary (Фаза 2+).
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' }],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // source-map upload — best-effort: без SENTRY_AUTH_TOKEN билд не падает.
});
