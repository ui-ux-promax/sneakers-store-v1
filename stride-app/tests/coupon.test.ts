import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: { coupon: { findUnique: vi.fn() } },
}));

import { normalizeCouponCode, calcCouponDiscount, checkCoupon } from '@/lib/coupon';
import { prisma } from '@/lib/prisma-client';

const findUnique = prisma.coupon.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeCouponCode', () => {
  it('тримит и приводит к UPPERCASE', () => {
    expect(normalizeCouponCode('  stride10 ')).toBe('STRIDE10');
  });
  it('пустое → пустая строка', () => {
    expect(normalizeCouponCode('   ')).toBe('');
  });
});

describe('calcCouponDiscount', () => {
  it('10% от 10000 = 1000', () => {
    expect(calcCouponDiscount(10000, 10)).toBe(1000);
  });
  it('округляет вниз (33% от 100 = 33)', () => {
    expect(calcCouponDiscount(100, 33)).toBe(33);
  });
  it('не превышает сумму товаров (clamp при 100%)', () => {
    expect(calcCouponDiscount(5000, 100)).toBe(5000);
  });
});

describe('checkCoupon', () => {
  it('валидный бессрочный → ok', async () => {
    findUnique.mockResolvedValue({ code: 'STRIDE10', percent: 10, active: true, expiresAt: null });
    expect(await checkCoupon('stride10')).toEqual({ ok: true, code: 'STRIDE10', percent: 10 });
  });
  it('неактивный → отказ', async () => {
    findUnique.mockResolvedValue({ code: 'X', percent: 10, active: false, expiresAt: null });
    expect((await checkCoupon('x')).ok).toBe(false);
  });
  it('истёкший → отказ', async () => {
    findUnique.mockResolvedValue({ code: 'X', percent: 10, active: true, expiresAt: new Date('2020-01-01') });
    expect((await checkCoupon('x')).ok).toBe(false);
  });
  it('несуществующий → отказ', async () => {
    findUnique.mockResolvedValue(null);
    expect((await checkCoupon('nope')).ok).toBe(false);
  });
  it('пустой код → отказ без запроса к БД', async () => {
    expect((await checkCoupon('   ')).ok).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
