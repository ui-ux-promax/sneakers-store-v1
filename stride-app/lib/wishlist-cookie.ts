import { WISHLIST_COOKIE_NAME, WISHLIST_COOKIE_MAX_AGE } from '@/constants/config';

export const wishlistCookieName = WISHLIST_COOKIE_NAME;

export const wishlistCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: WISHLIST_COOKIE_MAX_AGE,
  path: '/',
};
