'use server';

import { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { hashPassword } from '@/lib/password';
import { normalizeEmail } from '@/lib/auth-identity';
import { registerSchema } from '@/services/dto/auth.dto';
import { checkAuthRateLimit, extractClientIp } from '@/lib/rate-limit';
import { retryAfterSeconds } from '@/lib/rate-limit-response';
import { logger } from '@/lib/logger';
export type RegisterResult =
  | { ok: true; needsVerification: true }
  | { ok: false; error: string; retryAfterSec?: number };

export async function registerUser(raw: unknown, callbackUrl?: string): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };

  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Некорректный email' };

  try {
    // Rate-limit ДО любой дорогой работы (argon2-хэш ~19 МБ/попытка) — анти-DoS (#10).
    const ip = extractClientIp({ headers: await headers() });
    const limit = await checkAuthRateLimit(ip);
    if (!limit.success) return { ok: false, error: 'Слишком много попыток. Попробуйте позже', retryAfterSec: retryAfterSeconds(limit.reset) };

    // Дешёвая проверка дубликата ДО argon2: спам существующих email не оплачивает хэш (#10).
    // P2002-catch ниже всё равно нужен — закрывает гонку двух одновременных регистраций.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return { ok: false, error: 'Такой email уже зарегистрирован' };

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name } });
  } catch (e) {
    // Гонка двух одновременных регистраций — уникальный индекс email.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Такой email уже зарегистрирован' };
    }
    // Любой другой сбой (нет таблиц / коннект / инициализация) НЕ роняем молча: логируем
    // код Prisma (P2021/P1017/…) для диагностики; пользователю — нейтральный текст без кода.
    const code = (e as { code?: unknown })?.code;
    logger.error('register_failed', e, { code: typeof code === 'string' ? code : undefined });
    return { ok: false, error: 'Не удалось завершить регистрацию. Попробуйте позже' };
  }

  // P2.2c: НЕ логиним. Ставим pending-cookie и шлём код — гейт (RootLayout) поднимет модалку.
  // callbackUrl (#4) кладём в cookie: гейт минтит сессию и уведёт туда после верификации.
  // Отправка best-effort: её сбой не отменяет регистрацию (юзер нажмёт «отправить снова»).
  const { issueCode } = await import('@/lib/verification/service');
  const { setPending } = await import('@/lib/verification/pending-cookie');
  const { safeCallbackUrl } = await import('@/lib/safe-redirect');
  const safeCb = safeCallbackUrl(callbackUrl);
  // setPending(email) без второго аргумента, когда редирект — домой (single-arg форма).
  await (safeCb === '/' ? setPending(email) : setPending(email, safeCb));
  try {
    await issueCode(email);
  } catch (err) {
    logger.error('issue_code_after_register_failed', err);
  }
  return { ok: true, needsVerification: true };
}
