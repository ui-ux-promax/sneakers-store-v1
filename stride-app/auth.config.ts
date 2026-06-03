import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

type Role = 'CUSTOMER' | 'ADMIN';

export default {
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [
    // allowDangerousEmailAccountLinking НЕ включаем: иначе Google-вход авто-линковался бы к
    // ЛЮБОму существующему User с тем же email — включая аккаунт, заведённый через credentials
    // на непроверенный email (account pre-seeding / hijack, #1). При коллизии email Auth.js
    // вернёт OAuthAccountNotLinked — намеренно; явная линковка появится после email-верификации.
    Google({}),
    Credentials({
      credentials: { email: {}, password: {} },
      // Тяжёлую логику (prisma/argon2) держим в отдельном Node-модуле и тянем dynamic import'ом —
      // чтобы она не попадала в edge-бандл middleware (см. next.config.mjs edge-alias).
      authorize: async (creds) => {
        const { authorizeCredentials } = await import('@/lib/auth-credentials');
        return authorizeCredentials(creds);
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected =
        nextUrl.pathname.startsWith('/profile') ||
        nextUrl.pathname.startsWith('/checkout') ||
        nextUrl.pathname.startsWith('/orders');
      if (isProtected) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.role = (token.role as Role) ?? 'CUSTOMER';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
