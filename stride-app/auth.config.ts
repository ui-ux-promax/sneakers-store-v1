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
      // Rate-limit ДО authorizeCredentials (argon2) — защита от argon2-DoS. Гейт в этом слое
      // (а не внутри auth-credentials) оставляет constant-time dummy-hash нетронутым.
      authorize: async (creds, request) => {
        const { checkLoginRateLimit, extractClientIp } = await import('@/lib/rate-limit');
        const { normalizeEmail } = await import('@/lib/auth-identity');
        const email = normalizeEmail(String(creds?.email ?? '')) ?? '';
        const ip = extractClientIp({ headers: request.headers });
        if (!(await checkLoginRateLimit(`${ip}:${email}`)).success) return null;
        const { authorizeCredentials } = await import('@/lib/auth-credentials');
        return authorizeCredentials(creds);
      },
    }),
    // Автологин ПОСЛЕ верификации кода — без пароля. confirmCode выдал одноразовый
    // подписанный тикет (lib/verification/ticket), здесь он валидируется. Пускаем
    // только пользователя с уже выставленным emailVerified (двойная страховка).
    Credentials({
      id: 'verified-ticket',
      credentials: { ticket: {} },
      authorize: async (creds) => {
        const { verifyTicket } = await import('@/lib/verification/ticket');
        const parsed = verifyTicket(String(creds?.ticket ?? ''));
        if (!parsed) return null;
        const { prisma } = await import('@/lib/prisma-client');
        const user = await prisma.user.findUnique({
          where: { id: parsed.userId },
          select: { id: true, email: true, role: true, emailVerified: true, name: true },
        });
        if (!user || !user.emailVerified) return null;
        return { id: user.id, email: user.email, role: user.role, name: user.name };
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const path = nextUrl.pathname;

      // Залогиненному на /login и /register делать нечего — иначе можно «войти/зарегаться»
      // поверх живой сессии (в т.ч. под другим аккаунтом). Уводим в профиль.
      if (isLoggedIn && (path === '/login' || path === '/register')) {
        return Response.redirect(new URL('/profile', nextUrl));
      }

      // Админка: только ADMIN. Edge-safe — читаем роль из токена, без prisma.
      if (path === '/admin' || path.startsWith('/admin/')) {
        if (!isLoggedIn) return false;                 // Auth.js уведёт на signIn (/login)
        if (auth!.user.role !== 'ADMIN') return Response.redirect(new URL('/', nextUrl));
        return true;
      }

      const isProtected =
        path.startsWith('/profile') ||
        path.startsWith('/checkout') ||
        path.startsWith('/orders');
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
