import { describe, it, expect, beforeEach, vi } from 'vitest';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({ parseNotification: parseMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    payment: { update: vi.fn(), findUnique: vi.fn() },
    order: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  },
}));

import { POST } from '@/app/api/yookassa/webhook/route';
import { prisma } from '@/lib/prisma-client';

const paymentUpdate = prisma.payment.update as unknown as ReturnType<typeof vi.fn>;
const paymentFindUnique = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdate = prisma.order.update as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;

function req() {
  return { json: async () => ({}) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  paymentUpdate.mockResolvedValue({});
  orderUpdate.mockResolvedValue({});
  variantUpdate.mockResolvedValue({});
});

describe('yookassa webhook', () => {
  it('payment.succeeded → Payment succeeded + Order PROCESSING', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1' });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay_1' }, data: expect.objectContaining({ status: 'succeeded' }) }));
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'PROCESSING' } });
  });

  it('payment.canceled → Payment canceled + Order CANCELLED + возврат стока', async () => {
    parseMock.mockReturnValue({ event: 'payment.canceled', object: { id: 'pay_1' } });
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1', order: { items: [{ productVariantId: 'v1', quantity: 2 }] } });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CANCELLED' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
  });

  it('невалидный payload → 400', async () => {
    parseMock.mockImplementation(() => { throw new Error('bad'); });
    const res = await POST(req() as never);
    expect(res.status).toBe(400);
  });
});
