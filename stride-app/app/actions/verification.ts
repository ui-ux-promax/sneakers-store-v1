'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { signIn } from '@/auth';
import { confirmCode, issueCode } from '@/lib/verification/service';
import { readPending, clearPending, setPending } from '@/lib/verification/pending-cookie';
import { issueTicket } from '@/lib/verification/ticket';
import { verifyCodeSchema } from '@/services/dto/auth.dto';
import { checkVerifyRateLimit, checkResendRateLimit, extractClientIp } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/auth-identity';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'expired' | 'locked' | 'no-session' | 'invalid' | 'rate' };

export async function verifyEmailCode(raw: unknown): Promise<VerifyResult> {
  const parsed = verifyCodeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const pending = await readPending();
  if (!pending) return { ok: false, reason: 'no-session' };

  const ip = extractClientIp({ headers: await headers() });
  if (!(await checkVerifyRateLimit(`${ip}:${pending.email}`)).success) {
    return { ok: false, reason: 'rate' };
  }

  const { status } = await confirmCode(pending.email, parsed.data.code);
  if (status !== 'ok') return { ok: false, reason: status };

  const user = await prisma.user.findUnique({ where: { email: pending.email }, select: { id: true } });
  if (!user) return { ok: false, reason: 'no-session' };

  await prisma.user.update({ where: { email: pending.email }, data: { emailVerified: new Date() } });
  await clearPending();

  // Автологин без пароля: одноразовый тикет → провайдер verified-ticket.
  try {
    await signIn('verified-ticket', { ticket: issueTicket(user.id), redirect: false });
  } catch (err) {
    logger.error('verified_ticket_signin_failed', err);
    // Верификация всё равно прошла; пользователь сможет войти по паролю.
  }
  return { ok: true };
}

export async function resendVerificationCode(): Promise<{ ok: boolean; error?: string }> {
  const pending = await readPending();
  if (!pending) return { ok: false, error: 'no-session' };

  if (!(await checkResendRateLimit(pending.email)).success) {
    return { ok: false, error: 'rate' };
  }
  await issueCode(pending.email);
  return { ok: true };
}

// Вызывается login-формой/регистрацией, когда нужно поднять гейт: ставит pending-cookie + шлёт код.
export async function startVerification(email: string, callbackUrl?: string): Promise<{ ok: boolean }> {
  const safeCb = safeCallbackUrl(callbackUrl);
  await (safeCb === '/' ? setPending(email) : setPending(email, safeCb));
  await issueCode(email);
  return { ok: true };
}

// Login-форма зовёт при отказе входа: если почта существует и не верифицирована — поднять гейт
// (без раскрытия существования email вызывающему — наружу только gated:boolean).
// callbackUrl (#4) кладём в cookie, чтобы гейт увёл туда после верификации.
export async function ensureVerificationGate(email: string, callbackUrl?: string): Promise<{ gated: boolean }> {
  const norm = normalizeEmail(email);
  if (!norm) return { gated: false };
  const user = await prisma.user.findUnique({ where: { email: norm }, select: { emailVerified: true } });
  if (user && !user.emailVerified) {
    const safeCb = safeCallbackUrl(callbackUrl);
    await (safeCb === '/' ? setPending(norm) : setPending(norm, safeCb));
    if (!(await checkResendRateLimit(norm)).success) {
      return { gated: true };
    }
    await issueCode(norm);
    return { gated: true };
  }
  return { gated: false };
}
