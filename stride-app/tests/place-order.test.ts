import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({
  recalcCartTotalByToken: vi.fn(async () => null),
  // Залогинен → корзина по userId; в тесте владелец фиксирован, контент даёт cart.findFirst({id}).
  resolveOwnerCart: vi.fn(async () => ({ id: 'c1', token: 't' })),
}));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), delete: vi.fn() },
    orderItem: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  },
}));

import { placeOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;
const cartFindFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const variantFindUnique = prisma.productVariant.findUnique as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const orderCreate = prisma.order.create as unknown as ReturnType<typeof vi.fn>;
const orderItemCreate = prisma.orderItem.create as unknown as ReturnType<typeof vi.fn>;
const orderDelete = prisma.order.delete as unknown as ReturnType<typeof vi.fn>;
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
  variantFindUnique.mockResolvedValue({ stock: 9 });
  cartItemDeleteMany.mockResolvedValue({ count: 1 });
  orderItemCreate.mockResolvedValue({});
  orderDelete.mockResolvedValue({});
});

describe('placeOrder', () => {
  it('успех — декремент стока через update, создание заказа, очистка корзины', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1025 });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: true, orderNumber: 1025 });
    expect(variantFindUnique).toHaveBeenCalledTimes(1);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { decrement: 1 } } });
    expect(orderCreate).toHaveBeenCalledOnce();
    expect(orderItemCreate).toHaveBeenCalledTimes(1);
    expect(cartItemDeleteMany).toHaveBeenCalledOnce();
  });

  it('нехватка на 2-й позиции — компенсация 1-й, заказ НЕ создан', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1', 'v2'));
    variantFindUnique.mockResolvedValueOnce({ stock: 9 }).mockResolvedValueOnce({ stock: 0 });
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('сбой order.create — компенсация всех декрементов', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1', 'v2'));
    orderCreate.mockRejectedValue(new Error('db down'));
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledTimes(4); // 2 decrement + 2 increment restore
    expect(orderItemCreate).not.toHaveBeenCalled();
  });

  it('сбой создания позиций — откат заказа и возврат стока', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1', 'v2'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1026 });
    orderItemCreate.mockRejectedValue(new Error('items down'));
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(variantUpdate).toHaveBeenCalledTimes(4); // 2 decrement + 2 increment restore
  });

  it('пустая корзина — ошибка, без записи', async () => {
    cartFindFirst.mockResolvedValue({ id: 'c1', token: 't', items: [] });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: false, error: 'Корзина пуста' });
    expect(variantFindUnique).not.toHaveBeenCalled();
  });

  it('неактивный товар — отказ до проверки стока', async () => {
    const cart = cartWith('v1');
    cart.items[0].productVariant.active = false;
    cartFindFirst.mockResolvedValue(cart);
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantFindUnique).not.toHaveBeenCalled();
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('paymentMethod != cod — отказ', async () => {
    const r = await placeOrder({ ...validForm, paymentMethod: 'card' });
    expect(r.ok).toBe(false);
  });
});
