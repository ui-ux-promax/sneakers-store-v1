/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless', 'ws', '@upstash/ratelimit', '@upstash/redis'],
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
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    // Демо-фото в Фазе 1 — локальные (public/), remotePatterns понадобятся при Cloudinary (Фаза 2+).
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' }],
  },
};

export default nextConfig;
