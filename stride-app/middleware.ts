import NextAuth from 'next-auth';
import type { NextFetchEvent, NextMiddleware, NextRequest } from 'next/server';
import authConfig from './auth.config';
import { blockCrossSiteStateChange } from './lib/security/csrf';

const { auth } = NextAuth(authConfig);
const authMiddleware = auth as unknown as NextMiddleware;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const blocked = blockCrossSiteStateChange(req);
  if (blocked) return blocked;

  return authMiddleware(req, event);
}

export const config = {
  // Broad app matcher: auth.config decides protected pages; csrf.ts blocks cross-site
  // state-changing requests, including Server Actions posted to their page route.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
