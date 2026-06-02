'use server';

import { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { hashPassword } from '@/lib/password';
import { normalizeEmail } from '@/lib/auth-identity';
import { registerSchema } from '@/services/dto/auth.dto';
import { checkAuthRateLimit, extractClientIp } from '@/lib/rate-limit';
import { signIn } from '@/auth';

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(raw: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };

  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Некорректный email' };

  // Rate-limit ДО любой дорогой работы (argon2-хэш ~19 МБ/попытка) — анти-DoS (#10).
  const ip = extractClientIp({ headers: await headers() });
  const limit = await checkAuthRateLimit(ip);
  if (!limit.success) return { ok: false, error: 'Слишком много попыток. Попробуйте позже' };

  // Дешёвая проверка дубликата ДО argon2: спам существующих email не оплачивает хэш (#10).
  // P2002-catch ниже всё равно нужен — закрывает гонку двух одновременных регистраций.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: 'Такой email уже зарегистрирован' };

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Такой email уже зарегистрирован' };
    }
    throw e;
  }

  // redirect:false — устанавливаем сессию и ВОЗВРАЩАЕМ управление (не бросаем NEXT_REDIRECT),
  // чтобы контракт RegisterResult был честным; редирект делает форма по {ok:true} (#8).
  // Автологин best-effort: его сбой не отменяет успешную регистрацию — юзер войдёт через /login.
  try {
    await signIn('credentials', { email, password: parsed.data.password, redirect: false });
  } catch (err) {
    const { logger } = await import('@/lib/logger');
    logger.error('auto_signin_after_register_failed', err);
  }
  return { ok: true };
}
