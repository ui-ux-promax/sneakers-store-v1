import { createHmac, timingSafeEqual } from 'node:crypto';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}
function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(`unsub:${payloadB64}`).digest('base64url');
}

export function buildUnsubscribeUrl(email: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ email })).toString('base64url');
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return `${SITE}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function parseUnsubscribeToken(token: string | undefined | null): { email: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payloadB64));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { email: string };
    if (typeof payload.email !== 'string') return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
