'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { normalizeCouponCode } from '@/lib/coupon';
import { couponSchema } from '@/services/dto/coupon-admin.dto';

export type CouponActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/marketing';

// 'YYYY-MM-DD' → конец дня UTC 23:59:59.999 (валиден весь день: checkCoupon сравнивает expiresAt < now).
// '' / undefined → null (бессрочный). Невалидная дата → Error → action вернёт {ok:false}.
function parseExpiresAt(raw?: string): Date | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error('bad-date');
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
  if (Number.isNaN(dt.getTime())) throw new Error('bad-date');
  return dt;
}

// code → normalizeCouponCode (trim+UPPERCASE) ПЕРЕД zod (regex по [A-Z]); expiresAt оставляем строкой для DTO.
function normalize(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    code: normalizeCouponCode(typeof r.code === 'string' ? r.code : ''),
    percent: r.percent,
    active: typeof r.active === 'boolean' ? r.active : true,
    expiresAt: typeof r.expiresAt === 'string' ? r.expiresAt : undefined,
  };
}

export async function createCoupon(raw: unknown): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = couponSchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  let expiresAt: Date | null;
  try {
    expiresAt = parseExpiresAt(v.expiresAt);
  } catch {
    return { ok: false, error: 'Некорректная дата окончания' };
  }

  try {
    await prisma.coupon.create({
      data: { code: v.code, percent: v.percent, active: v.active, expiresAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Код уже занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function updateCoupon(id: string, raw: unknown): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = couponSchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  let expiresAt: Date | null;
  try {
    expiresAt = parseExpiresAt(v.expiresAt);
  } catch {
    return { ok: false, error: 'Некорректная дата окончания' };
  }

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  try {
    await prisma.coupon.update({
      where: { id },
      data: { code: v.code, percent: v.percent, active: v.active, expiresAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Код уже занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

// Тонкий флип active из Switch в списке (без полной формы).
export async function toggleCoupon(id: string, next: boolean): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  await prisma.coupon.update({ where: { id }, data: { active: next } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

// FK на Coupon нет (Order.couponCode — денормализованная строка) → удаление безопасно, гард только «существует».
export async function deleteCoupon(id: string): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  await prisma.coupon.delete({ where: { id } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}
