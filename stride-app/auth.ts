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
      const { cookies } = await import('next/headers');
      const { cartCookieName } = await import('@/lib/cart-cookie');
      const { mergeGuestCart } = await import('@/lib/cart-merge');
      const store = await cookies();
      const guestToken = store.get(cartCookieName)?.value;
      await mergeGuestCart(guestToken, user.id);
    },
  },
});
