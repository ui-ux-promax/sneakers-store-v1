import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({
  recalcCartTotalByToken: vi.fn(async () => null),
  resolveOwnerCart: vi.fn(async () => ({ id: 'c1', token: 't' })),
}));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), delete: vi.fn() },
    orderItem: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    coupon: { findUnique: vi.fn() },
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
const cartItemDeleteMany = prisma.cartItem.deleteMany as unknown as ReturnType<typeof vi.fn>;
const couponFindUnique = prisma.coupon.findUnique as unknown as ReturnType<typeof vi.fn>;

const baseForm = {
  contactName: 'Neo', contactPhone: '+79990000000', contactEmail: 'neo@e.test',
  shippingMethod: 'pickup', city: 'Москва', addressLine: 'Тверская 1', paymentMethod: 'cod',
};

function variant(id: string, price = 5000) {
  return {
    id, sku: `SKU-${id}`, price, sizeEu: 42, stock: 9, active: true,
    colorway: { name: 'Black', product: { name: `P-${id}`, slug: id, active: true }, images: [{ url: `/i/${id}.jpg` }] },
  };
}
function cartWith(ids: string[], price = 5000) {
  return {
    id: 'c1', token: 't', items: ids.map((id, n) => ({
      id: `ci${n}`, cartId: 'c1', productVariantId: id, quantity: 1, createdAt: new Date(0), productVariant: variant(id, price),
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
});

describe('placeOrder + купон', () => {
  it('валидный купон 10% — discountAmount/couponCode в заказе, totalAmount со скидкой', async () => {
    cartFindFirst.mockResolvedValue(cartWith(['v1', 'v2'], 5000)); // itemsTotal = 10000
    couponFindUnique.mockResolvedValue({ code: 'STRIDE10', percent: 10, active: true, expiresAt: null });
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 2001 });

    const r = await placeOrder({ ...baseForm, couponCode: 'stride10' });

    expect(r).toEqual({ ok: true, orderNumber: 2001 });
    const data = orderCreate.mock.calls[0][0].data;
    expect(data.itemsTotal).toBe(10000);
    expect(data.discountAmount).toBe(1000);
    expect(data.couponCode).toBe('STRIDE10');
    expect(data.totalAmount).toBe(9000); // 10000 - 1000 + 0 (самовывоз)
  });

  it('истёкший купон — отказ, заказ не создан, сток не тронут', async () => {
    cartFindFirst.mockResolvedValue(cartWith(['v1'], 5000));
    couponFindUnique.mockResolvedValue({ code: 'EXPIRED', percent: 50, active: true, expiresAt: new Date('2020-01-01') });

    const r = await placeOrder({ ...baseForm, couponCode: 'EXPIRED' });

    expect(r.ok).toBe(false);
    expect(orderCreate).not.toHaveBeenCalled();
    expect(variantFindUnique).not.toHaveBeenCalled();
  });

  it('без купона — discountAmount=0, couponCode=null, БД купонов не трогается (регрессия)', async () => {
    cartFindFirst.mockResolvedValue(cartWith(['v1'], 5000));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 2002 });

    const r = await placeOrder(baseForm);

    expect(r.ok).toBe(true);
    const data = orderCreate.mock.calls[0][0].data;
    expect(data.discountAmount).toBe(0);
    expect(data.couponCode).toBeNull();
    expect(couponFindUnique).not.toHaveBeenCalled();
  });
});
