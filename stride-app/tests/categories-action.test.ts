import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cloudinary/server', () => ({ deleteAsset: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    category: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
} from '@/app/actions/admin/categories';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const create = prisma.category.create as unknown as ReturnType<typeof vi.fn>;
const update = prisma.category.update as unknown as ReturnType<typeof vi.fn>;
const del = prisma.category.delete as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.category.findUnique as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.category.findFirst as unknown as ReturnType<typeof vi.fn>;
const tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const deleteAssetMock = deleteAsset as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
});

describe('createCategory', () => {
  it('anon → ok:false', async () => {
    authMock.mockResolvedValue(null);
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('CUSTOMER → ok:false', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('valid → creates, ok:true', async () => {
    create.mockResolvedValue({ id: 'c1' });
    const r = await createCategory({ name: 'Беговые', slug: 'running', tagline: 'Скорость' });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Беговые', slug: 'running', tagline: 'Скорость', coverImage: null, coverImagePublicId: null },
    });
  });

  it('empty slug → derived from name via slugify', async () => {
    create.mockResolvedValue({ id: 'c1' });
    await createCategory({ name: 'Беговые', slug: '' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'begovye' }) }),
    );
  });

  it('invalid (zod) → ok:false, no create', async () => {
    const r = await createCategory({ name: '', slug: '' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('P2002 (dup slug) → ok:false "Slug занят"', async () => {
    const { Prisma } = await import('@prisma/client');
    create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r).toEqual({ ok: false, error: 'Slug занят' });
  });
});

describe('updateCategory', () => {
  it('valid → updates, ok:true', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: null });
    update.mockResolvedValue({ id: 'c1' });
    const r = await updateCategory('c1', { name: 'New', slug: 'new' });
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('cover changed → deleteAsset(old publicId) best-effort', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'old/pid' });
    update.mockResolvedValue({ id: 'c1' });
    deleteAssetMock.mockResolvedValue({ ok: true });
    await updateCategory('c1', { name: 'N', slug: 'n', coverImage: 'https://x/y.jpg', coverImagePublicId: 'new/pid' });
    expect(deleteAssetMock).toHaveBeenCalledWith('old/pid');
  });

  it('cover unchanged → no deleteAsset', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'same/pid' });
    update.mockResolvedValue({ id: 'c1' });
    await updateCategory('c1', { name: 'N', slug: 'n', coverImage: 'https://x/y.jpg', coverImagePublicId: 'same/pid' });
    expect(deleteAssetMock).not.toHaveBeenCalled();
  });
});

describe('deleteCategory', () => {
  it('has products → blocked, ok:false', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: null, _count: { products: 3 } });
    const r = await deleteCategory('c1');
    expect(r).toEqual({ ok: false, error: 'Нельзя удалить: 3 товаров' });
    expect(del).not.toHaveBeenCalled();
  });

  it('no products → deletes + cleans cover', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'c/pid', _count: { products: 0 } });
    del.mockResolvedValue({ id: 'c1' });
    deleteAssetMock.mockResolvedValue({ ok: true });
    const r = await deleteCategory('c1');
    expect(r.ok).toBe(true);
    expect(deleteAssetMock).toHaveBeenCalledWith('c/pid');
    expect(del).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('not found → ok:false', async () => {
    findUnique.mockResolvedValue(null);
    const r = await deleteCategory('nope');
    expect(r.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('moveCategory', () => {
  it('up with a neighbour → swaps sortOrder in a transaction', async () => {
    findUnique.mockResolvedValue({ id: 'c2', sortOrder: 2 });
    findFirst.mockResolvedValue({ id: 'c1', sortOrder: 1 });
    tx.mockResolvedValue([{}, {}]);
    const r = await moveCategory('c2', 'up');
    expect(r.ok).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sortOrder: { lt: 2 } },
        orderBy: { sortOrder: 'desc' },
      }),
    );
    expect(tx).toHaveBeenCalled();
  });

  it('up at the top (no neighbour) → no-op ok:true', async () => {
    findUnique.mockResolvedValue({ id: 'c1', sortOrder: 1 });
    findFirst.mockResolvedValue(null);
    const r = await moveCategory('c1', 'up');
    expect(r.ok).toBe(true);
    expect(tx).not.toHaveBeenCalled();
  });

  it('anon → ok:false', async () => {
    authMock.mockResolvedValue(null);
    const r = await moveCategory('c1', 'up');
    expect(r.ok).toBe(false);
  });
});
