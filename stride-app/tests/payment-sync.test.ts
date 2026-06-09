import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    payment: { update: vi.fn(), findUnique: vi.fn() },
    order: { update: vi.fn() },
    productVariant: { update: vi.fn() },
    product: { update: vi.fn() },
  },
}));

import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';
import { prisma } from '@/lib/prisma-client';

const paymentUpdate = prisma.payment.update as unknown as ReturnType<typeof vi.fn>;
const paymentFindUnique = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdate = prisma.order.update as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const productUpdate = prisma.product.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  paymentUpdate.mockResolvedValue({});
  orderUpdate.mockResolvedValue({});
  variantUpdate.mockResolvedValue({});
  productUpdate.mockResolvedValue({});
});

describe('applyPaymentSucceeded', () => {
  it('Payment→succeeded + Order→PROCESSING', async () => {
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1' });
    await applyPaymentSucceeded('pay_1');
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay_1' }, data: expect.objectContaining({ status: 'succeeded' }) }));
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'PROCESSING' } });
  });

  it('платёж не найден → Order не трогаем', async () => {
    paymentFindUnique.mockResolvedValue(null);
    await applyPaymentSucceeded('pay_x');
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

describe('applyPaymentCanceled', () => {
  it('Payment→canceled + Order→CANCELLED + возврат стока + откат salesCount', async () => {
    paymentFindUnique.mockResolvedValue({
      id: 'pay_1', orderId: 'o1',
      order: { items: [{ productVariantId: 'v1', quantity: 2, productVariant: { colorway: { productId: 'prod_1' } } }] },
    });
    await applyPaymentCanceled('pay_1');
    // Переход атомарный: гейт по статусу PENDING (идемпотентность побочных эффектов).
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1', status: 'PENDING' }, data: { status: 'CANCELLED' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: 'prod_1' }, data: { salesCount: { increment: -2 } } });
  });

  it('идемпотентно: заказ уже не PENDING (P2025) → сток/salesCount НЕ трогаем', async () => {
    paymentFindUnique.mockResolvedValue({
      id: 'pay_1', orderId: 'o1',
      order: { items: [{ productVariantId: 'v1', quantity: 2, productVariant: { colorway: { productId: 'prod_1' } } }] },
    });
    orderUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'test' }));
    await applyPaymentCanceled('pay_1');
    expect(variantUpdate).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
