import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    payment: { update: vi.fn(), findUnique: vi.fn() },
    order: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  },
}));

import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';
import { prisma } from '@/lib/prisma-client';

const paymentUpdate = prisma.payment.update as unknown as ReturnType<typeof vi.fn>;
const paymentFindUnique = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdate = prisma.order.update as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  paymentUpdate.mockResolvedValue({});
  orderUpdate.mockResolvedValue({});
  variantUpdate.mockResolvedValue({});
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
  it('Payment→canceled + Order→CANCELLED + возврат стока', async () => {
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1', order: { items: [{ productVariantId: 'v1', quantity: 2 }] } });
    await applyPaymentCanceled('pay_1');
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CANCELLED' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
  });
});
