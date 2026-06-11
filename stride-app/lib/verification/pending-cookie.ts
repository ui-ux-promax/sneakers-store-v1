import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  PENDING_VERIFICATION_COOKIE,
  PENDING_VERIFICATION_MAX_AGE,
} from '@/constants/config';
import { safeCallbackUrl } from '@/lib/safe-redirect';

interface PendingPayload {
  email: string;
  exp: number; // epoch ms
  cb?: string; // safe callbackUrl — куда увести после верификации (#4 guest redirect)
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payloadB64: string): string {
  // Префикс домена подписи отделяет pending-cookie от ticket/unsubscribe (общий AUTH_SECRET).
  return createHmac('sha256', secret()).update(`pending:${payloadB64}`).digest('base64url');
}

export function signPending(
  email: string,
  callbackUrl?: string,
  exp = Date.now() + PENDING_VERIFICATION_MAX_AGE * 1000,
): string {
  // cb кладём только если он есть и безопасен — храним «как есть», валидируем на записи.
  const safeCb = callbackUrl ? safeCallbackUrl(callbackUrl) : undefined;
  const payload: PendingPayload =
    safeCb && safeCb !== '/' ? { email, exp, cb: safeCb } : { email, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parsePending(token: string | undefined | null): { email: string; callbackUrl?: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as PendingPayload;
    if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    // cb пере-валидируем при чтении (defence-in-depth): подпись наша, но путь всё равно sanit'им.
    if (typeof payload.cb === 'string') {
      const safeCb = safeCallbackUrl(payload.cb);
      if (safeCb !== '/') return { email: payload.email, callbackUrl: safeCb };
    }
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function setPending(email: string, callbackUrl?: string): Promise<void> {
  const store = await cookies();
  store.set(PENDING_VERIFICATION_COOKIE, signPending(email, callbackUrl), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PENDING_VERIFICATION_MAX_AGE,
    path: '/',
  });
}

export async function readPending(): Promise<{ email: string; callbackUrl?: string } | null> {
  const store = await cookies();
  return parsePending(store.get(PENDING_VERIFICATION_COOKIE)?.value);
}

export async function clearPending(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_VERIFICATION_COOKIE);
}
