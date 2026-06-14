import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/yookassa', () => ({ cancelPayment: vi.fn() }));
vi.mock('@/lib/review', () => ({ pruneReviewsAfterCancel: vi.fn() }));
vi.mock('@/lib/sales-count', () => ({ adjustSalesCount: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    order: { findUnique: vi.fn(), updateMany: vi.fn() },
    payment: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  };
  return { prisma };
});

import { advanceOrderStatus, cancelOrderByAdmin } from '@/app/actions/admin/orders';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cancelPayment } from '@/lib/yookassa';
import { pruneReviewsAfterCancel } from '@/lib/review';
import { adjustSalesCount } from '@/lib/sales-count';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cancelPaymentMock = cancelPayment as unknown as ReturnType<typeof vi.fn>;
const pruneMock = pruneReviewsAfterCancel as unknown as ReturnType<typeof vi.fn>;
const adjustMock = adjustSalesCount as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  order: Record<string, ReturnType<typeof vi.fn>>;
  payment: Record<string, ReturnType<typeof vi.fn>>;
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
};

// Заказ с двумя позициями (для проверки возврата стока по каждой).
function makeOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    userId: 'u1',
    orderNumber: 1001,
    status: 'PENDING',
    payment: null,
    items: [
      { productVariantId: 'v1', quantity: 2, productVariant: { colorway: { productId: 'p1' } } },
      { productVariantId: 'v2', quantity: 1, productVariant: { colorway: { productId: 'p2' } } },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  p.order.updateMany.mockResolvedValue({ count: 1 });
  p.payment.update.mockResolvedValue({});
  p.productVariant.update.mockResolvedValue({});
});

describe('advanceOrderStatus', () => {
  it('PENDING → PROCESSING via guarded updateMany', async () => {
    p.order.findUnique.mockResolvedValue({ status: 'PENDING' });
    const r = await advanceOrderStatus({ orderId: 'o1', toStatus: 'PROCESSING' });
    expect(r.ok).toBe(true);
    expect(p.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
  });

  it('invalid jump PENDING → SHIPPED → error, no write', async () => {
    p.order.findUnique.mockResolvedValue({ status: 'PENDING' });
    const r = await advanceOrderStatus({ orderId: 'o1', toStatus: 'SHIPPED' });
    expect(r.ok).toBe(false);
    expect(p.order.updateMany).not.toHaveBeenCalled();
  });

  it('race (count:0) → error', async () => {
    p.order.findUnique.mockResolvedValue({ status: 'PENDING' });
    p.order.updateMany.mockResolvedValue({ count: 0 });
    const r = await advanceOrderStatus({ orderId: 'o1', toStatus: 'PROCESSING' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/обновите/i);
  });

  it('order not found → error', async () => {
    p.order.findUnique.mockResolvedValue(null);
    const r = await advanceOrderStatus({ orderId: 'oX', toStatus: 'PROCESSING' });
    expect(r.ok).toBe(false);
    expect(p.order.updateMany).not.toHaveBeenCalled();
  });

  it('non-admin → error, no prisma touch', async () => {
    authMock.mockResolvedValue(null);
    const r = await advanceOrderStatus({ orderId: 'o1', toStatus: 'PROCESSING' });
    expect(r.ok).toBe(false);
    expect(p.order.findUnique).not.toHaveBeenCalled();
  });

  it('bad input (zod) → error', async () => {
    const r = await advanceOrderStatus({ orderId: '', toStatus: 'PENDING' });
    expect(r.ok).toBe(false);
    expect(p.order.findUnique).not.toHaveBeenCalled();
  });
});

describe('cancelOrderByAdmin', () => {
  it('PENDING COD (no payment) → restock both items, salesCount -1, prune, no cancelPayment', async () => {
    p.order.findUnique.mockResolvedValue(makeOrder());
    const r = await cancelOrderByAdmin('o1');
    expect(r.ok).toBe(true);
    expect(p.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'CANCELLED' },
    });
    expect(p.productVariant.update).toHaveBeenCalledTimes(2);
    expect(p.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { stock: { increment: 2 } },
    });
    expect(adjustMock).toHaveBeenCalledWith(
      [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
      -1,
    );
    expect(pruneMock).toHaveBeenCalledWith('u1', ['p1', 'p2']);
    expect(cancelPaymentMock).not.toHaveBeenCalled();
  });

  it('PENDING online pending → cancelPayment + payment status canceled', async () => {
    p.order.findUnique.mockResolvedValue(makeOrder({ payment: { id: 'pay1', status: 'pending' } }));
    const r = await cancelOrderByAdmin('o1');
    expect(r.ok).toBe(true);
    expect(cancelPaymentMock).toHaveBeenCalledWith('pay1');
    expect(p.payment.update).toHaveBeenCalledWith({ where: { id: 'pay1' }, data: { status: 'canceled' } });
  });

  it('PROCESSING with succeeded payment → cancelled, no refund (cancelPayment not called)', async () => {
    p.order.findUnique.mockResolvedValue(
      makeOrder({ status: 'PROCESSING', payment: { id: 'pay2', status: 'succeeded' } }),
    );
    const r = await cancelOrderByAdmin('o1');
    expect(r.ok).toBe(true);
    expect(cancelPaymentMock).not.toHaveBeenCalled();
    expect(p.payment.update).not.toHaveBeenCalled();
    expect(p.productVariant.update).toHaveBeenCalledTimes(2);
  });

  it('terminal (count:0) → error, no stock/salesCount side-effects', async () => {
    p.order.findUnique.mockResolvedValue(makeOrder({ status: 'SHIPPED' }));
    p.order.updateMany.mockResolvedValue({ count: 0 });
    const r = await cancelOrderByAdmin('o1');
    expect(r.ok).toBe(false);
    expect(p.productVariant.update).not.toHaveBeenCalled();
    expect(adjustMock).not.toHaveBeenCalled();
    expect(pruneMock).not.toHaveBeenCalled();
  });

  it('order not found → error', async () => {
    p.order.findUnique.mockResolvedValue(null);
    const r = await cancelOrderByAdmin('oX');
    expect(r.ok).toBe(false);
    expect(p.order.updateMany).not.toHaveBeenCalled();
  });

  it('non-admin → error', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'CUSTOMER' } });
    const r = await cancelOrderByAdmin('o1');
    expect(r.ok).toBe(false);
    expect(p.order.findUnique).not.toHaveBeenCalled();
  });
});
