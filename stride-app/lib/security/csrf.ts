import { NextResponse, type NextRequest } from 'next/server';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_PATHS = new Set(['/api/yookassa/webhook']);

export type CsrfCheckInput = {
  method: string;
  pathname: string;
  requestOrigin: string;
  headers: Headers;
};

function originMatches(value: string | null, requestOrigin: string): boolean {
  if (!value) return true;
  try {
    return new URL(value).origin === requestOrigin;
  } catch {
    return false;
  }
}

export function isStateChangingRequestAllowed(input: CsrfCheckInput): boolean {
  const method = input.method.toUpperCase();
  if (!STATE_CHANGING_METHODS.has(method)) return true;
  if (CSRF_EXEMPT_PATHS.has(input.pathname)) return true;

  const secFetchSite = input.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') return false;
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') return originMatches(input.headers.get('origin'), input.requestOrigin);

  const origin = input.headers.get('origin');
  if (origin) return originMatches(origin, input.requestOrigin);

  const referer = input.headers.get('referer');
  return originMatches(referer, input.requestOrigin);
}

export function blockCrossSiteStateChange(req: NextRequest): NextResponse | null {
  if (isStateChangingRequestAllowed({
    method: req.method,
    pathname: req.nextUrl.pathname,
    requestOrigin: req.nextUrl.origin,
    headers: req.headers,
  })) {
    return null;
  }

  return NextResponse.json({ message: 'Запрос отклонён' }, { status: 403 });
}
