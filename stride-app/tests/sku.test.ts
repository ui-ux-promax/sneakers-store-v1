import { describe, it, expect } from 'vitest';
import { suggestSku } from '@/lib/sku';

describe('suggestSku', () => {
  it('builds UPPER segments joined by dash', () => {
    expect(suggestSku({ brand: 'Nike', productName: 'Air Max 90', colorwaySlug: 'black', sizeEu: 42 }))
      .toBe('NIKE-AIR-MAX-90-BLACK-42');
  });

  it('formats half sizes with a dot replaced by 5 suffix style', () => {
    expect(suggestSku({ brand: 'Nike', productName: 'AM', colorwaySlug: 'red', sizeEu: 42.5 }))
      .toBe('NIKE-AM-RED-42-5');
  });

  it('transliterates Cyrillic and strips junk', () => {
    expect(suggestSku({ brand: 'Адидас', productName: 'Бег!!!', colorwaySlug: 'white', sizeEu: 40 }))
      .toBe('ADIDAS-BEG-WHITE-40');
  });

  it('omits empty segments', () => {
    expect(suggestSku({ brand: '', productName: 'X', colorwaySlug: '', sizeEu: 41 })).toBe('X-41');
  });
});
