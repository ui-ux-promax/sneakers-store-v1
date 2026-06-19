import NextAuth from 'next-auth';
import authConfig from './auth.config';
import { blockCrossSiteStateChange } from './lib/security/csrf';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const blocked = blockCrossSiteStateChange(req);
  if (blocked) return blocked;
});

export const config = {
  // Broad app matcher: auth.config decides protected pages; csrf.ts blocks cross-site
  // state-changing requests, including Server Actions posted to their page route.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
