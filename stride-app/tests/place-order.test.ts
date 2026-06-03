import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn(async () => null) }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { updateMany: vi.fn(), update: vi.fn() },
    order: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  },
}));

import { placeOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.productVariant.updateMany as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const orderCreate = prisma.order.create as unknown as ReturnType<typeof vi.fn>;
const cartItemDeleteMany = prisma.cartItem.deleteMany as unknown as ReturnType<typeof vi.fn>;

const validForm = {
  contactName: 'Neo', contactPhone: '+79990000000', contactEmail: 'neo@e.test',
  shippingMethod: 'pickup', city: 'Москва', addressLine: 'Тверская 1', paymentMethod: 'cod',
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
  variantUpdate.mockResolvedValue({});
  cartItemDeleteMany.mockResolvedValue({ count: 1 });
});

describe('placeOrder', () => {
  it('успех — декремент, создание заказа, очистка корзины', async () => {
    findFirst.mockResolvedValue(cartWith('v1'));
    updateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockResolvedValue({ orderNumber: 1025 });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: true, orderNumber: 1025 });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(orderCreate).toHaveBeenCalledOnce();
    expect(cartItemDeleteMany).toHaveBeenCalledOnce();
  });

  it('нехватка на 2-й позиции — компенсация 1-й, заказ НЕ создан', async () => {
    findFirst.mockResolvedValue(cartWith('v1', 'v2'));
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('сбой order.create — компенсация всех декрементов', async () => {
    findFirst.mockResolvedValue(cartWith('v1', 'v2'));
    updateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockRejectedValue(new Error('db down'));
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledTimes(2);
  });

  it('пустая корзина — ошибка, без записи', async () => {
    findFirst.mockResolvedValue({ id: 'c1', token: 't', items: [] });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: false, error: 'Корзина пуста' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('paymentMethod != cod — отказ', async () => {
    const r = await placeOrder({ ...validForm, paymentMethod: 'card' });
    expect(r.ok).toBe(false);
  });
});
