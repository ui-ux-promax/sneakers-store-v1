import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cloudinary/server', () => ({ deleteAsset: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    product: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    productColorway: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    productImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    productVariant: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import { createProduct, updateProduct, deleteProduct } from '@/app/actions/admin/products';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  product: Record<string, ReturnType<typeof vi.fn>>;
  productColorway: Record<string, ReturnType<typeof vi.fn>>;
  productImage: Record<string, ReturnType<typeof vi.fn>>;
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
  orderItem: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

const variant = { sizeEu: 42, sku: 'SKU-42', price: 12990, compareAtPrice: null, stock: 5, active: true };
const colorway = { name: 'Чёрный', slug: 'black', isDefault: true, images: [], variants: [variant] };
const fullProduct = {
  name: 'Air Max 90', slug: 'air-max-90', brand: 'Nike', gender: 'UNISEX', categoryId: 'cat1',
  description: '', fitNote: '', specs: [], isBestseller: false, active: true, sortOrder: 0,
  colorways: [colorway],
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
  // Интерактивная транзакция: выполняем колбэк с тем же мок-клиентом.
  p.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  p.product.create.mockResolvedValue({ id: 'new1' });
  p.productColorway.create.mockResolvedValue({ id: 'cw1' });
});

describe('createProduct', () => {
  it('anon → ok:false, no write', async () => {
    authMock.mockResolvedValue(null);
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
    expect(p.product.create).not.toHaveBeenCalled();
  });

  it('CUSTOMER → ok:false', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
  });

  it('draft (active=false, empty colorways) → creates with minPrice/discountPct 0', async () => {
    const r = await createProduct({ ...fullProduct, active: false, colorways: [] });
    expect(r.ok).toBe(true);
    expect(p.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minPrice: 0, discountPct: 0, active: false }) }),
    );
  });

  it('full product → computes denorm minPrice from cheapest active variant', async () => {
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(true);
    expect(p.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minPrice: 12990 }) }),
    );
    expect(p.productColorway.create).toHaveBeenCalled();
    expect(p.productVariant.create).toHaveBeenCalled();
  });

  it('invalid (zod) → ok:false, no write', async () => {
    const r = await createProduct({ ...fullProduct, name: '' });
    expect(r.ok).toBe(false);
    expect(p.product.create).not.toHaveBeenCalled();
  });

  it('P2002 (dup sku) → ok:false', async () => {
    const { Prisma } = await import('@prisma/client');
    p.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SKU/);
  });
});

describe('updateProduct', () => {
  beforeEach(() => {
    p.product.findUnique.mockResolvedValue({
      id: 'pr1',
      colorways: [{ id: 'cw1', images: [{ id: 'im1' }], variants: [{ id: 'v1' }] }],
    });
    p.orderItem.findMany.mockResolvedValue([]);
  });

  it('not found → ok:false', async () => {
    p.product.findUnique.mockResolvedValue(null);
    const r = await updateProduct('nope', fullProduct);
    expect(r.ok).toBe(false);
  });

  it('removing a referenced variant → blocked', async () => {
    // incoming has no variant id 'v1' → it is being removed
    p.orderItem.findMany.mockResolvedValue([{ productVariantId: 'v1' }]);
    const r = await updateProduct('pr1', { ...fullProduct, colorways: [{ ...colorway, id: 'cw1', variants: [{ ...variant, sku: 'NEW' }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/заказ/);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('valid update keeping referenced variant → updates in transaction', async () => {
    const r = await updateProduct('pr1', { ...fullProduct, colorways: [{ ...colorway, id: 'cw1', variants: [{ ...variant, id: 'v1' }] }] });
    expect(r.ok).toBe(true);
    expect(p.$transaction).toHaveBeenCalled();
    expect(p.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pr1' }, data: expect.objectContaining({ minPrice: 12990 }) }),
    );
    expect(p.productVariant.update).toHaveBeenCalled();
  });
});

describe('deleteProduct', () => {
  it('referenced by an order → blocked', async () => {
    p.product.findUnique.mockResolvedValue({ id: 'pr1', colorways: [{ variants: [{ id: 'v1' }], images: [] }] });
    p.orderItem.findMany.mockResolvedValue([{ productVariantId: 'v1' }]);
    const r = await deleteProduct('pr1');
    expect(r.ok).toBe(false);
    expect(p.product.delete).not.toHaveBeenCalled();
  });

  it('unreferenced → deletes', async () => {
    p.product.findUnique.mockResolvedValue({ id: 'pr1', colorways: [{ variants: [{ id: 'v1' }], images: [{ publicId: 'x' }] }] });
    p.orderItem.findMany.mockResolvedValue([]);
    p.product.delete.mockResolvedValue({ id: 'pr1' });
    const r = await deleteProduct('pr1');
    expect(r.ok).toBe(true);
    expect(p.product.delete).toHaveBeenCalledWith({ where: { id: 'pr1' } });
  });
});
