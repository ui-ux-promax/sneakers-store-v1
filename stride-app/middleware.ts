import NextAuth from 'next-auth';
import authConfig from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // /login и /register — чтобы authorized-колбэк увёл залогиненного в /profile.
  // /admin и /admin/:path* — гейт роли ADMIN живёт в authorized() (auth.config.ts).
  matcher: ['/profile/:path*', '/checkout/:path*', '/orders/:path*', '/login', '/register', '/admin', '/admin/:path*'],
};
