import { CART_COOKIE_NAME, CART_COOKIE_MAX_AGE } from '@/constants/config';

export const cartCookieName = CART_COOKIE_NAME;

export const cartCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: CART_COOKIE_MAX_AGE,
  path: '/',
};
