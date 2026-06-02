import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma-client';
import authConfig from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as unknown as import('@prisma/client').PrismaClient),
  session: { strategy: 'jwt' },
  ...authConfig,
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      // Слияние гостевой корзины — побочный эффект входа; оно НЕ должно ронять
      // аутентификацию. safeMergeGuestCart глотает сбои merge, а внешний try/catch
      // страхует ещё и чтение cookie. Merge идемпотентен — досольётся при следующем входе.
      try {
        const { cookies } = await import('next/headers');
        const { cartCookieName } = await import('@/lib/cart-cookie');
        const { safeMergeGuestCart } = await import('@/lib/cart-merge');
        const store = await cookies();
        const guestToken = store.get(cartCookieName)?.value;
        await safeMergeGuestCart(guestToken, user.id);
      } catch (err) {
        const { logger } = await import('@/lib/logger');
        logger.error('signin_event_failed', err);
      }
    },
  },
});
