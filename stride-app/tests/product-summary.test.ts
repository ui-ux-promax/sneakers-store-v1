import { describe, it, expect } from 'vitest';
import { buildProductCardData, type ProductForCard } from '@/lib/product-summary';

function fake(overrides: Partial<ProductForCard> = {}): ProductForCard {
  return {
    id: 'p1', name: 'STRIDE Court Classic', slug: 'stride-court-classic', brand: 'Adidas',
    gender: 'UNISEX', categoryId: 'c', description: null, fitNote: null, specs: null,
    isBestseller: false, active: true, sortOrder: 1, createdAt: new Date('2026-05-25T00:00:00Z'),
    category: { name: 'Лайфстайл', slug: 'lifestyle' },
    colorways: [
      {
        id: 'cw1', productId: 'p1', name: 'Court White', slug: 'court-white', swatchHex: '#fff',
        isDefault: true, sortOrder: 1,
        images: [{ id: 'im', colorwayId: 'cw1', url: '/products/a.jpeg', alt: 'A', sortOrder: 0 }],
        variants: [
          { price: 11240, compareAtPrice: 14990, stock: 3, active: true },
          { price: 11240, compareAtPrice: 14990, stock: 0, active: true },
        ],
      },
    ],
    ...overrides,
  } as unknown as ProductForCard;
}

const now = new Date('2026-06-01T00:00:00Z');
const cfg = { newWindowDays: 30, lowStock: 3 };

describe('buildProductCardData', () => {
  it('берёт дефолтную расцветку: фото, минимальную цену активных вариантов, старую цену', () => {
    const d = buildProductCardData(fake(), now, cfg);
    expect(d.slug).toBe('stride-court-classic');
    expect(d.categoryName).toBe('Лайфстайл');
    expect(d.imageUrl).toBe('/products/a.jpeg');
    expect(d.minPrice).toBe(11240);
    expect(d.minCompareAtPrice).toBe(14990);
    expect(d.soldOut).toBe(false);
  });
  it('бейджи: скидка + новинка (товар свежий)', () => {
    const d = buildProductCardData(fake(), now, cfg);
    expect(d.badges.map((b) => b.tone)).toEqual(expect.arrayContaining(['discount', 'new']));
  });
  it('soldOut когда сток дефолтной расцветки = 0', () => {
    const f = fake();
    f.colorways[0].variants = [{ price: 100, compareAtPrice: null, stock: 0, active: true } as never];
    const d = buildProductCardData(f, now, cfg);
    expect(d.soldOut).toBe(true);
    expect(d.badges).toEqual([{ tone: 'soldout', label: 'Распродано' }]);
  });
});
