import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  PENDING_VERIFICATION_COOKIE,
  PENDING_VERIFICATION_MAX_AGE,
} from '@/constants/config';

interface PendingPayload {
  email: string;
  exp: number; // epoch ms
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

export function signPending(email: string, exp = Date.now() + PENDING_VERIFICATION_MAX_AGE * 1000): string {
  const payloadB64 = Buffer.from(JSON.stringify({ email, exp } satisfies PendingPayload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parsePending(token: string | undefined | null): { email: string } | null {
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
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function setPending(email: string): Promise<void> {
  const store = await cookies();
  store.set(PENDING_VERIFICATION_COOKIE, signPending(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PENDING_VERIFICATION_MAX_AGE,
    path: '/',
  });
}

export async function readPending(): Promise<{ email: string } | null> {
  const store = await cookies();
  return parsePending(store.get(PENDING_VERIFICATION_COOKIE)?.value);
}

export async function clearPending(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_VERIFICATION_COOKIE);
}
