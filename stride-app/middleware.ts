import NextAuth from 'next-auth';
import authConfig from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // /login и /register — чтобы authorized-колбэк увёл залогиненного в /profile.
  matcher: ['/profile/:path*', '/checkout/:path*', '/orders/:path*', '/login', '/register'],
};
