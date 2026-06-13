import { describe, it, expect } from 'vitest';
import { productSchema } from '@/services/dto/product.dto';

const variant = { sizeEu: 42, sku: 'NK-AM90-BLK-42', price: 12990, compareAtPrice: null, stock: 5, active: true };
const colorway = { name: 'Чёрный', slug: 'black', isDefault: true, images: [], variants: [variant] };
const base = {
  name: 'Air Max 90', slug: 'air-max-90', brand: 'Nike', gender: 'UNISEX', categoryId: 'cat1',
  description: '', fitNote: '', specs: [], isBestseller: false, active: false, sortOrder: 0,
  colorways: [colorway],
};

describe('productSchema', () => {
  it('accepts a valid product', () => {
    expect(productSchema.safeParse(base).success).toBe(true);
  });

  it('draft: active=false with empty colorways is valid', () => {
    expect(productSchema.safeParse({ ...base, colorways: [] }).success).toBe(true);
  });

  it('active=true without any active variant is rejected', () => {
    const cw = { ...colorway, variants: [{ ...variant, active: false }] };
    expect(productSchema.safeParse({ ...base, active: true, colorways: [cw] }).success).toBe(false);
  });

  it('active=true with an active variant is accepted', () => {
    expect(productSchema.safeParse({ ...base, active: true }).success).toBe(true);
  });

  it('rejects bad slug', () => {
    expect(productSchema.safeParse({ ...base, slug: 'Air Max' }).success).toBe(false);
  });

  it('rejects sizeEu out of range and non-0.5 step', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sizeEu: 99 }] }] }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sizeEu: 42.3 }] }] }).success).toBe(false);
  });

  it('rejects empty sku', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sku: '' }] }] }).success).toBe(false);
  });

  it('rejects compareAtPrice not greater than price', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, compareAtPrice: 100 }] }] }).success).toBe(false);
  });

  it('rejects when not exactly one default colorway', () => {
    const two = [{ ...colorway, slug: 'a', isDefault: true }, { ...colorway, slug: 'b', isDefault: true }];
    expect(productSchema.safeParse({ ...base, colorways: two }).success).toBe(false);
    const none = [{ ...colorway, isDefault: false }];
    expect(productSchema.safeParse({ ...base, colorways: none }).success).toBe(false);
  });

  it('rejects duplicate colorway slugs', () => {
    const dup = [{ ...colorway, slug: 'x', isDefault: true }, { ...colorway, slug: 'x', isDefault: false }];
    expect(productSchema.safeParse({ ...base, colorways: dup }).success).toBe(false);
  });

  it('rejects duplicate sizeEu within a colorway', () => {
    const cw = { ...colorway, variants: [variant, { ...variant, sku: 'OTHER' }] };
    expect(productSchema.safeParse({ ...base, colorways: [cw] }).success).toBe(false);
  });

  it('accepts specs as key/value entries', () => {
    expect(productSchema.safeParse({ ...base, specs: [{ key: 'Материал', value: 'Сетка' }] }).success).toBe(true);
  });

  it('rejects duplicate spec keys', () => {
    expect(productSchema.safeParse({ ...base, specs: [{ key: 'Материал', value: 'Сетка' }, { key: 'Материал', value: 'Кожа' }] }).success).toBe(false);
  });
});
