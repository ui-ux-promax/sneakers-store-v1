import { prisma } from '@/lib/prisma-client';

// Нормализация кода купона — единый ключ (trim + UPPERCASE).
export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase();
}

// Скидка в целых рублях: процент от суммы товаров, округление вниз, clamp в [0, itemsTotal].
// Math.max(0, …) — защита от отрицательного percent (иначе totalAmount вырос бы = overcharge).
export function calcCouponDiscount(itemsTotal: number, percent: number): number {
  return Math.min(itemsTotal, Math.max(0, Math.floor((itemsTotal * percent) / 100)));
}

export type CouponCheck =
  | { ok: true; code: string; percent: number }
  | { ok: false; error: string };

// Проверка купона против БД (без привязки к корзине). Одиночный findUnique.
export async function checkCoupon(rawCode: string): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: 'Введите промокод' };
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) return { ok: false, error: 'Промокод недействителен' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'Срок действия промокода истёк' };
  }
  // Fail-closed на криво заведённый купон (percent вне 1..100): лучше отказать, чем
  // overcharge (percent<0) или раздать 100%-скидку (percent>100). Инвариант в коде —
  // в схеме Prisma CHECK не выразить.
  if (coupon.percent < 1 || coupon.percent > 100) {
    return { ok: false, error: 'Промокод недействителен' };
  }
  return { ok: true, code, percent: coupon.percent };
}
