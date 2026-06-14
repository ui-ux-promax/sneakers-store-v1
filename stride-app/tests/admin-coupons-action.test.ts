import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    coupon: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
  };
  return { prisma };
});

import { Prisma } from '@prisma/client';
import { createCoupon } from '@/app/actions/admin/coupons';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const revalidateMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as { coupon: Record<string, ReturnType<typeof vi.fn>> };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  p.coupon.create.mockResolvedValue({ id: 'c1' });
});

describe('createCoupon', () => {
  it('non-admin → error, no prisma touch', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'CUSTOMER' } });
    const r = await createCoupon({ code: 'NEW10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('zod reject: percent out of range → error, no create', async () => {
    const r = await createCoupon({ code: 'NEW10', percent: 0, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('zod reject: code too short → error', async () => {
    const r = await createCoupon({ code: 'AB', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('happy: normalizes code to UPPERCASE, no expiry → null', async () => {
    const r = await createCoupon({ code: ' new10 ', percent: 10, active: true, expiresAt: '' });
    expect(r.ok).toBe(true);
    expect(p.coupon.create).toHaveBeenCalledWith({
      data: { code: 'NEW10', percent: 10, active: true, expiresAt: null },
    });
    expect(revalidateMock).toHaveBeenCalledWith('/admin/marketing');
  });

  it('happy: expiresAt YYYY-MM-DD → end of day UTC', async () => {
    const r = await createCoupon({ code: 'XMAS', percent: 25, active: true, expiresAt: '2026-12-31' });
    expect(r.ok).toBe(true);
    const arg = p.coupon.create.mock.calls[0][0];
    expect(arg.data.expiresAt.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('bad date string → error, no create', async () => {
    const r = await createCoupon({ code: 'XMAS', percent: 25, active: true, expiresAt: '31-12-2026' });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('duplicate code (P2002) → "Код уже занят"', async () => {
    p.coupon.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    const r = await createCoupon({ code: 'STRIDE10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/занят/i);
  });
});
