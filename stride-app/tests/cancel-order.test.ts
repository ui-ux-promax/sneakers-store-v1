import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    order: { findUnique: vi.fn() },
    productVariant: { update: vi.fn() },
  },
}));

import { cancelOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.order.findUnique as unknown as ReturnType<typeof vi.fn>;
const execRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;

function pendingOrder() {
  return {
    id: 'o1', orderNumber: 1025, userId: 'u1', status: 'PENDING',
    items: [{ productVariantId: 'v1', quantity: 2 }, { productVariantId: 'v2', quantity: 1 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  variantUpdate.mockResolvedValue({});
  execRaw.mockResolvedValue(1);
});

describe('cancelOrder', () => {
  it('успех — статус CANCELLED, возврат стока по всем позициям', async () => {
    findUnique.mockResolvedValue(pendingOrder());
    execRaw.mockResolvedValue(1);
    const r = await cancelOrder('o1');
    expect(r).toEqual({ ok: true });
    expect(variantUpdate).toHaveBeenCalledTimes(2);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
  });

  it('чужой заказ — отказ, сток не тронут', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), userId: 'other' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(execRaw).not.toHaveBeenCalled();
    expect(variantUpdate).not.toHaveBeenCalled();
  });

  it('не PENDING — отказ', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), status: 'SHIPPED' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(execRaw).not.toHaveBeenCalled();
  });

  it('гонка: лок не сработал (0 строк) — сток НЕ возвращается', async () => {
    findUnique.mockResolvedValue(pendingOrder());
    execRaw.mockResolvedValue(0);
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(variantUpdate).not.toHaveBeenCalled();
  });
});
