import { describe, it, expect } from 'vitest';
import {
  isNewByDate,
  discountPercent,
  stockSummary,
  computeBadges,
} from '@/lib/product-badges';

describe('isNewByDate', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('товар в пределах окна — новинка', () => {
    expect(isNewByDate(new Date('2026-05-20T00:00:00Z'), now, 30)).toBe(true);
  });
  it('товар старше окна — не новинка', () => {
    expect(isNewByDate(new Date('2026-04-01T00:00:00Z'), now, 30)).toBe(false);
  });
});

describe('discountPercent', () => {
  it('считает процент скидки и округляет', () => {
    expect(discountPercent(11240, 14990)).toBe(25); // (1-11240/14990)=25.01 -> 25
  });
  it('null/отсутствие старой цены или не-скидка → null', () => {
    expect(discountPercent(12990, null)).toBeNull();
    expect(discountPercent(12990, 12990)).toBeNull();
    expect(discountPercent(12990, 10000)).toBeNull();
  });
});

describe('stockSummary', () => {
  it('суммирует сток активных вариантов и классифицирует', () => {
    expect(stockSummary([{ stock: 0, active: true }, { stock: 0, active: true }]))
      .toEqual({ total: 0, soldOut: true, low: false });
    expect(stockSummary([{ stock: 2, active: true }, { stock: 0, active: true }], 3))
      .toEqual({ total: 2, soldOut: false, low: true });
    expect(stockSummary([{ stock: 10, active: true }], 3))
      .toEqual({ total: 10, soldOut: false, low: false });
  });
  it('неактивные варианты не учитываются', () => {
    expect(stockSummary([{ stock: 99, active: false }]))
      .toEqual({ total: 0, soldOut: true, low: false });
  });
});

describe('computeBadges', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('возвращает приоритезированный набор бейджей', () => {
    const badges = computeBadges(
      {
        createdAt: new Date('2026-05-25T00:00:00Z'),
        isBestseller: true,
        minPrice: 11240,
        minCompareAtPrice: 14990,
        stockTotal: 5,
      },
      now,
      { newWindowDays: 30, lowStock: 3 },
    );
    // soldout отсутствует; скидка/новинка/бестселлер присутствуют
    expect(badges.map((b) => b.tone)).toEqual(expect.arrayContaining(['discount', 'new', 'bestseller']));
  });
  it('распродано имеет наивысший приоритет и единственный', () => {
    const badges = computeBadges(
      { createdAt: now, isBestseller: true, minPrice: 12990, minCompareAtPrice: 15990, stockTotal: 0 },
      now,
      { newWindowDays: 30, lowStock: 3 },
    );
    expect(badges).toEqual([{ tone: 'soldout', label: 'Распродано' }]);
  });
});
