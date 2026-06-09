// Импорт без префикса `node:` — чтобы edge-бандл auth.config.ts мог заглушить его
// через resolve.alias { crypto: false } (next.config.mjs). authorize verified-ticket
// исполняется только в Node-рантайме, поэтому реальный crypto доступен на исполнении.
import { createHmac, timingSafeEqual } from 'crypto';
import { VERIFICATION_TICKET_TTL_MS } from '@/constants/config';

interface TicketPayload {
  userId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payloadB64: string): string {
  // Префикс домена подписи отделяет тикет от pending-cookie (одинаковый секрет, разные назначения).
  return createHmac('sha256', secret()).update(`ticket:${payloadB64}`).digest('base64url');
}

export function issueTicket(userId: string, exp = Date.now() + VERIFICATION_TICKET_TTL_MS): string {
  const payloadB64 = Buffer.from(JSON.stringify({ userId, exp } satisfies TicketPayload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyTicket(token: string | undefined | null): { userId: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as TicketPayload;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
