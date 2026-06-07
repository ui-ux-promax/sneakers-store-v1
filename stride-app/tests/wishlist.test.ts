import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    wishlist: { findFirst: vi.fn(), create: vi.fn() },
    wishlistItem: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { resolveOwnerWishlist, getWishlistProductIds, getWishlistCount } from '@/lib/wishlist';
import { prisma } from '@/lib/prisma-client';

const wlFindFirst = prisma.wishlist.findFirst as unknown as ReturnType<typeof vi.fn>;
const wlCreate = prisma.wishlist.create as unknown as ReturnType<typeof vi.fn>;
const itemFindMany = prisma.wishlistItem.findMany as unknown as ReturnType<typeof vi.fn>;
const itemCount = prisma.wishlistItem.count as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('resolveOwnerWishlist', () => {
  it('залогинен → ищет по userId', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    const w = await resolveOwnerWishlist({ user: { id: 'u1' } } as never, 'guest-tok', { create: false });
    expect(w).toEqual({ id: 'w1', userId: 'u1', token: 't' });
    expect(wlFindFirst).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
  it('гость → ищет по token', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w2', userId: null, token: 'tok' });
    const w = await resolveOwnerWishlist(null, 'tok', { create: false });
    expect(w?.id).toBe('w2');
    expect(wlFindFirst).toHaveBeenCalledWith({ where: { token: 'tok' } });
  });
  it('нет владельца и create:false → null, без create', async () => {
    wlFindFirst.mockResolvedValue(null);
    const w = await resolveOwnerWishlist(null, 'tok', { create: false });
    expect(w).toBeNull();
    expect(wlCreate).not.toHaveBeenCalled();
  });
  it('гость без записи и create:true → создаёт по token', async () => {
    wlFindFirst.mockResolvedValue(null);
    wlCreate.mockResolvedValue({ id: 'w3', userId: null, token: 'tok' });
    const w = await resolveOwnerWishlist(null, 'tok', { create: true });
    expect(w?.id).toBe('w3');
    expect(wlCreate).toHaveBeenCalledWith({ data: { token: 'tok', userId: undefined } });
  });
  it('гость без token и create:false → null, без запроса', async () => {
    const w = await resolveOwnerWishlist(null, undefined, { create: false });
    expect(w).toBeNull();
    expect(wlFindFirst).not.toHaveBeenCalled();
  });
});

describe('getWishlistProductIds', () => {
  it('нет владельца → пустой Set, без запроса items', async () => {
    wlFindFirst.mockResolvedValue(null);
    const ids = await getWishlistProductIds(null, undefined);
    expect(ids.size).toBe(0);
    expect(itemFindMany).not.toHaveBeenCalled();
  });
  it('есть владелец → Set productId', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    itemFindMany.mockResolvedValue([{ productId: 'p1' }, { productId: 'p2' }]);
    const ids = await getWishlistProductIds({ user: { id: 'u1' } } as never, 't');
    expect([...ids].sort()).toEqual(['p1', 'p2']);
  });
});

describe('getWishlistCount', () => {
  it('нет владельца → 0', async () => {
    wlFindFirst.mockResolvedValue(null);
    expect(await getWishlistCount(null, undefined)).toBe(0);
    expect(itemCount).not.toHaveBeenCalled();
  });
  it('есть владелец → count', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    itemCount.mockResolvedValue(3);
    expect(await getWishlistCount({ user: { id: 'u1' } } as never, 't')).toBe(3);
    expect(itemCount).toHaveBeenCalledWith({ where: { wishlistId: 'w1' } });
  });
});
