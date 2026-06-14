'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { roleChangeSchema } from '@/services/dto/customer-admin.dto';
import { roleChangeGuard } from '@/lib/customer-admin';

export type RoleActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/customers';

// Смена роли пользователя. Единственная мутация раздела Customers. Guard «себя + последний админ»
// (чистый, в lib) + guarded updateMany (one-shot против гонки, как в orders 3.4). Схему не трогаем.
export async function changeUserRole(input: unknown): Promise<RoleActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Некорректные данные' };
  const { userId, role } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return { ok: false, error: 'Пользователь не найден' };

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

  const guard = roleChangeGuard({
    targetId: userId,
    targetRole: target.role,
    requestedRole: role,
    actingAdminId: gate.session.user.id,
    adminCount,
  });
  if (!guard.ok) return { ok: false, error: guard.error };

  if (target.role === role) return { ok: true }; // no-op, без записи

  // Guarded one-shot: пишем только если роль в БД всё ещё та, что видел админ.
  const res = await prisma.user.updateMany({
    where: { id: userId, role: target.role },
    data: { role },
  });
  if (res.count === 0) return { ok: false, error: 'Роль изменилась, обновите страницу' };

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${userId}`);
  return { ok: true };
}
