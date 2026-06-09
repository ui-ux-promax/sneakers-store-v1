import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
    productVariant: { update: vi.fn() },
    product: { update: vi.fn() },
  },
}));
vi.mock('@/lib/yookassa', () => ({ cancelPayment: vi.fn() }));
vi.mock('@/lib/review', () => ({ pruneReviewsAfterCancel: vi.fn() }));

import { cancelOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cancelPayment } from '@/lib/yookassa';
import { pruneReviewsAfterCancel } from '@/lib/review';
const cancelPaymentMock = cancelPayment as unknown as ReturnType<typeof vi.fn>;
const pruneMock = pruneReviewsAfterCancel as unknown as ReturnType<typeof vi.fn>;

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.order.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdate = prisma.order.update as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const productUpdate = prisma.product.update as unknown as ReturnType<typeof vi.fn>;

function pendingOrder() {
  return {
    id: 'o1', orderNumber: 1025, userId: 'u1', status: 'PENDING',
    payment: null,
    items: [
      { productVariantId: 'v1', quantity: 2, productVariant: { colorway: { productId: 'p1' } } },
      { productVariantId: 'v2', quantity: 1, productVariant: { colorway: { productId: 'p2' } } },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  variantUpdate.mockResolvedValue({});
  orderUpdate.mockResolvedValue({});
  productUpdate.mockResolvedValue({});
  cancelPaymentMock.mockResolvedValue(undefined);
});

describe('cancelOrder', () => {
  it('успех — статус CANCELLED, возврат стока по всем позициям', async () => {
    findUnique.mockResolvedValue(pendingOrder());
    const r = await cancelOrder('o1');
    expect(r).toEqual({ ok: true });
    // Атомарный гейт: переход разрешён только для своего PENDING-заказа (идемпотентность побочек).
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1', userId: 'u1', status: 'PENDING' }, data: { status: 'CANCELLED' } });
    expect(variantUpdate).toHaveBeenCalledTimes(2);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
    // salesCount откатывается по товарам (популярность ↓ симметрично возврату стока).
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { salesCount: { increment: -2 } } });
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { salesCount: { increment: -1 } } });
    // Осиротевшие отзывы по товарам отменённого заказа снимаются (дедуп по productId).
    expect(pruneMock).toHaveBeenCalledWith('u1', ['p1', 'p2']);
  });

  it('чужой заказ — отказ, сток не тронут, отзывы не трогаются', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), userId: 'other' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(variantUpdate).not.toHaveBeenCalled();
    expect(pruneMock).not.toHaveBeenCalled();
  });

  it('не PENDING — отказ', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), status: 'SHIPPED' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('неавторизован — отказ', async () => {
    authMock.mockResolvedValue({ user: null });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('online-заказ с pending-платежом — отменяет платёж в ЮKassa', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), payment: { id: 'pay_1', status: 'pending' } });
    const r = await cancelOrder('o1');
    expect(r).toEqual({ ok: true });
    expect(cancelPaymentMock).toHaveBeenCalledWith('pay_1');
    expect(variantUpdate).toHaveBeenCalledTimes(2);
  });
});
