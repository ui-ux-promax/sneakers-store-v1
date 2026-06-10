import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: { cart: { findFirst: vi.fn(), create: vi.fn() } },
}));

import { resolveOwnerCart } from '@/lib/cart';
import { prisma } from '@/lib/prisma-client';

const findFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const create = prisma.cart.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('resolveOwnerCart', () => {
  it('залогинен → ищет по userId (cookie-токен игнорируется)', async () => {
    findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', token: 't' });
    const c = await resolveOwnerCart('u1', 'guest-tok', { create: false });
    expect(c).toEqual({ id: 'c1', userId: 'u1', token: 't' });
    expect(findFirst).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('залогинен, нет своей корзины, create:false → null без create', async () => {
    findFirst.mockResolvedValue(null);
    const c = await resolveOwnerCart('u1', 'tok', { create: false });
    expect(c).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('залогинен, нет своей, create:true → создаёт со СВЕЖИМ token + userId (не cookie-токен)', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'c2', userId: 'u1', token: 'fresh' });
    const c = await resolveOwnerCart('u1', 'cookie-tok', { create: true });
    expect(c?.id).toBe('c2');
    const arg = create.mock.calls[0][0];
    expect(arg.data.userId).toBe('u1');
    expect(typeof arg.data.token).toBe('string');
    expect(arg.data.token).not.toBe('cookie-tok'); // свежий, не из cookie
  });

  it('гость → ищет по token', async () => {
    findFirst.mockResolvedValue({ id: 'c3', userId: null, token: 'tok' });
    const c = await resolveOwnerCart(null, 'tok', { create: false });
    expect(c?.id).toBe('c3');
    expect(findFirst).toHaveBeenCalledWith({ where: { token: 'tok' } });
  });

  it('гость без token → null без запроса', async () => {
    const c = await resolveOwnerCart(null, undefined, { create: false });
    expect(c).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('гость без записи, create:true → создаёт по cookie-токену', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'c4', userId: null, token: 'tok' });
    const c = await resolveOwnerCart(null, 'tok', { create: true });
    expect(c?.id).toBe('c4');
    expect(create).toHaveBeenCalledWith({ data: { token: 'tok' } });
  });
});
