import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined),
    set: (k: string, v: string) => { store.set(k, v); },
  })),
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/wishlist', () => ({ resolveOwnerWishlist: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: { wishlistItem: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));

import { toggleWishlist } from '@/app/actions/wishlist';
import { auth } from '@/auth';
import { resolveOwnerWishlist } from '@/lib/wishlist';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const resolveMock = resolveOwnerWishlist as unknown as ReturnType<typeof vi.fn>;
const itemFindUnique = prisma.wishlistItem.findUnique as unknown as ReturnType<typeof vi.fn>;
const itemCreate = prisma.wishlistItem.create as unknown as ReturnType<typeof vi.fn>;
const itemDelete = prisma.wishlistItem.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  store.set('wishlistToken', 'tok');
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  resolveMock.mockResolvedValue({ id: 'w1', userId: 'u1', token: 'tok' });
});

describe('toggleWishlist', () => {
  it('нет item → create, active:true', async () => {
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockResolvedValue({ id: 'i1' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
    expect(itemCreate).toHaveBeenCalledWith({ data: { wishlistId: 'w1', productId: 'p1' } });
    expect(itemDelete).not.toHaveBeenCalled();
  });
  it('есть item → delete, active:false', async () => {
    itemFindUnique.mockResolvedValue({ id: 'i1' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: false });
    expect(itemDelete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(itemCreate).not.toHaveBeenCalled();
  });
  it('P2002 на create (гонка) → active:true', async () => {
    const { Prisma } = await import('@prisma/client');
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
  });
  it('P2003 на create (несуществующий товар) → ok:false', async () => {
    const { Prisma } = await import('@prisma/client');
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }));
    const r = await toggleWishlist({ productId: 'nope' });
    expect(r.ok).toBe(false);
  });
  it('невалидный productId (zod) → ok:false, без записи', async () => {
    const r = await toggleWishlist({ productId: '' });
    expect(r.ok).toBe(false);
    expect(itemCreate).not.toHaveBeenCalled();
    expect(itemDelete).not.toHaveBeenCalled();
  });
  it('гость без cookie → генерит token, ставит cookie', async () => {
    store.clear();
    authMock.mockResolvedValue(null);
    resolveMock.mockResolvedValue({ id: 'w9', userId: null, token: 'newtok' });
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockResolvedValue({ id: 'i9' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
    expect(store.get('wishlistToken')).toBeTruthy();
  });
});
