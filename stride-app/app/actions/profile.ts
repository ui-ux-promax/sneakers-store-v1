'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { profileSchema } from '@/services/dto/auth.dto';

export type ProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfile(raw: unknown): Promise<ProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля' };

  const { name, phone, birthdate } = parsed.data;
  // Пустые поля трактуем как «очистить» → null (а не пустая строка в БД).
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name?.trim() ? name.trim() : null,
      phone: phone?.trim() ? phone.trim() : null,
      birthdate: birthdate ? new Date(birthdate) : null,
    },
  });
  revalidatePath('/profile');
  return { ok: true };
}
