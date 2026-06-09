import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({
  recalcCartTotalByToken: vi.fn(async () => null),
  resolveOwnerCart: vi.fn(async () => ({ id: 'c1', token: 't' })),
}));
vi.mock('@/lib/yookassa', () => ({ createPayment: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), delete: vi.fn() },
    orderItem: { create: vi.fn() },
    payment: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  },
}));

import { placeOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { createPayment } from '@/lib/yookassa';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;
const headersMock = headers as unknown as ReturnType<typeof vi.fn>;
const cartFindFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const variantFindUnique = prisma.productVariant.findUnique as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const orderCreate = prisma.order.create as unknown as ReturnType<typeof vi.fn>;
const orderDelete = prisma.order.delete as unknown as ReturnType<typeof vi.fn>;
const orderItemCreate = prisma.orderItem.create as unknown as ReturnType<typeof vi.fn>;
const paymentCreate = prisma.payment.create as unknown as ReturnType<typeof vi.fn>;
const cartItemDeleteMany = prisma.cartItem.deleteMany as unknown as ReturnType<typeof vi.fn>;
const createPaymentMock = createPayment as unknown as ReturnType<typeof vi.fn>;

const onlineForm = {
  contactName: 'Neo', contactPhone: '+79990000000', contactEmail: 'neo@e.test',
  shippingMethod: 'pickup', city: 'Москва', addressLine: 'Тверская 1', paymentMethod: 'online',
};

function variant(id: string, stock = 9) {
  return {
    id, sku: `SKU-${id}`, price: 5000, sizeEu: 42, stock, active: true,
    colorway: { name: 'Black', product: { name: `P-${id}`, slug: id, active: true }, images: [{ url: `/i/${id}.jpg` }] },
  };
}
function cartWith(...ids: string[]) {
  return {
    id: 'c1', token: 't', items: ids.map((id, n) => ({
      id: `ci${n}`, cartId: 'c1', productVariantId: id, quantity: 1, createdAt: new Date(0), productVariant: variant(id),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  cookiesMock.mockResolvedValue({ get: () => ({ value: 't' }) });
  headersMock.mockResolvedValue({ get: () => 'preview.vercel.app' });
  variantFindUnique.mockResolvedValue({ stock: 9 });
  variantUpdate.mockResolvedValue({});
  cartItemDeleteMany.mockResolvedValue({ count: 1 });
  orderItemCreate.mockResolvedValue({});
  orderDelete.mockResolvedValue({});
  paymentCreate.mockResolvedValue({});
});

describe('placeOrder online', () => {
  it('успех — создаёт Payment и возвращает paymentUrl', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1025 });
    createPaymentMock.mockResolvedValue({ id: 'pay_1', confirmationUrl: 'https://yoo/redirect' });
    const r = await placeOrder(onlineForm);
    expect(r).toEqual({ ok: true, orderNumber: 1025, paymentUrl: 'https://yoo/redirect' });
    expect(createPaymentMock).toHaveBeenCalledWith({ orderNumber: 1025, amountRub: 5000, baseUrl: 'https://preview.vercel.app' });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: { id: 'pay_1', orderId: 'o1', amount: 5000, confirmationUrl: 'https://yoo/redirect', status: 'pending' },
    });
    expect(cartItemDeleteMany).toHaveBeenCalledOnce();
  });

  it('сбой создания платежа — откат заказа и возврат стока', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1026 });
    createPaymentMock.mockRejectedValue(new Error('yoo down'));
    const r = await placeOrder(onlineForm);
    expect(r.ok).toBe(false);
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
    expect(cartItemDeleteMany).not.toHaveBeenCalled();
  });

  it('COD не трогает платёж', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1027 });
    const r = await placeOrder({ ...onlineForm, paymentMethod: 'cod' });
    expect(r).toEqual({ ok: true, orderNumber: 1027 });
    expect(createPaymentMock).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});
