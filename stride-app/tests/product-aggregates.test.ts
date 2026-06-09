import { describe, it, expect } from 'vitest';
import { productDenormFromColorways, salesDeltaByProduct } from '@/lib/product-aggregates';

describe('productDenormFromColorways', () => {
  it('берёт дешёвый активный вариант дефолтной расцветки', () => {
    const r = productDenormFromColorways([
      { isDefault: false, sortOrder: 2, variants: [{ price: 5000, compareAtPrice: null, active: true }] },
      { isDefault: true, sortOrder: 1, variants: [
        { price: 12990, compareAtPrice: null, active: true },
        { price: 9990, compareAtPrice: null, active: true },
      ] },
    ]);
    expect(r.minPrice).toBe(9990); // из дефолтной (не из более дешёвой не-дефолтной)
    expect(r.discountPct).toBe(0);
  });

  it('дефолт по sortOrder при отсутствии isDefault', () => {
    const r = productDenormFromColorways([
      { isDefault: false, sortOrder: 2, variants: [{ price: 8000, compareAtPrice: null, active: true }] },
      { isDefault: false, sortOrder: 1, variants: [{ price: 11000, compareAtPrice: null, active: true }] },
    ]);
    expect(r.minPrice).toBe(11000); // sortOrder:1 — первый
  });

  it('исключает неактивные варианты', () => {
    const r = productDenormFromColorways([
      { isDefault: true, sortOrder: 1, variants: [
        { price: 3000, compareAtPrice: null, active: false },
        { price: 7000, compareAtPrice: null, active: true },
      ] },
    ]);
    expect(r.minPrice).toBe(7000);
  });

  it('active undefined трактуется как активный (seed)', () => {
    const r = productDenormFromColorways([
      { isDefault: true, sortOrder: 1, variants: [{ price: 6000, compareAtPrice: null }] },
    ]);
    expect(r.minPrice).toBe(6000);
  });

  it('считает discountPct из compareAtPrice', () => {
    const r = productDenormFromColorways([
      { isDefault: true, sortOrder: 1, variants: [{ price: 11240, compareAtPrice: 14990, active: true }] },
    ]);
    expect(r.minPrice).toBe(11240);
    expect(r.discountPct).toBe(25); // round(1 - 11240/14990)
  });

  it('нет активных вариантов → 0/0', () => {
    expect(productDenormFromColorways([
      { isDefault: true, sortOrder: 1, variants: [{ price: 5000, compareAtPrice: null, active: false }] },
    ])).toEqual({ minPrice: 0, discountPct: 0 });
    expect(productDenormFromColorways([])).toEqual({ minPrice: 0, discountPct: 0 });
  });
});

describe('salesDeltaByProduct', () => {
  it('агрегирует quantity по productId', () => {
    const d = salesDeltaByProduct([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
      { productId: 'p1', quantity: 3 }, // другой вариант того же товара
    ]);
    expect(d.get('p1')).toBe(5);
    expect(d.get('p2')).toBe(1);
    expect(d.size).toBe(2);
  });

  it('пустой ввод → пустая мапа', () => {
    expect(salesDeltaByProduct([]).size).toBe(0);
  });
});
