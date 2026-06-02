'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { hashPassword } from '@/lib/password';
import { normalizeEmail } from '@/lib/auth-identity';
import { registerSchema } from '@/services/dto/auth.dto';
import { signIn } from '@/auth';

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(raw: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };

  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Некорректный email' };

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Такой email уже зарегистрирован' };
    }
    throw e;
  }

  await signIn('credentials', { email, password: parsed.data.password, redirectTo: '/' });
  return { ok: true };
}
