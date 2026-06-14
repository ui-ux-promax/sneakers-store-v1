// Client-safe (НЕ импортит prisma): используют и серверный фильтр, и клиентский бейдж.
// Прецедент разделения — lib/admin/analytics-config.ts (Phase 3.6).
export type CouponStatus = 'active' | 'inactive' | 'expired';

// Приоритет: expired важнее inactive (истёкший — финальное состояние независимо от active).
// Граница `< now` совпадает с checkCoupon (lib/coupon.ts): expiresAt === now ещё валиден.
export function couponStatus(
  c: { active: boolean; expiresAt: Date | null },
  now: Date,
): CouponStatus {
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return 'expired';
  if (!c.active) return 'inactive';
  return 'active';
}
