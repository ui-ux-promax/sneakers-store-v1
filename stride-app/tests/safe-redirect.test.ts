import { describe, it, expect } from 'vitest';
import { safeCallbackUrl } from '@/lib/safe-redirect';

describe('safeCallbackUrl', () => {
  it('пустое/отсутствует → домой', () => {
    expect(safeCallbackUrl(null)).toBe('/');
    expect(safeCallbackUrl(undefined)).toBe('/');
    expect(safeCallbackUrl('')).toBe('/');
  });

  it('безопасный относительный путь возвращается как есть', () => {
    expect(safeCallbackUrl('/checkout')).toBe('/checkout');
    expect(safeCallbackUrl('/orders?id=1')).toBe('/orders?id=1');
    expect(safeCallbackUrl('/')).toBe('/');
  });

  it('protocol-relative (//host) → домой', () => {
    expect(safeCallbackUrl('//evil.com')).toBe('/');
    expect(safeCallbackUrl('//evil.com/path')).toBe('/');
  });

  it('обход через /\\host → домой', () => {
    expect(safeCallbackUrl('/\\evil.com')).toBe('/');
  });

  it('абсолютный URL → берём только путь, origin отбрасываем', () => {
    // Корень чужого хоста схлопывается до '/'.
    expect(safeCallbackUrl('https://evil.com')).toBe('/');
    expect(safeCallbackUrl('http://evil.com')).toBe('/');
    // Это форма, которую кладёт middleware NextAuth (request.nextUrl.href).
    expect(safeCallbackUrl('https://site/checkout')).toBe('/checkout');
    expect(safeCallbackUrl('https://site/orders?id=1')).toBe('/orders?id=1');
    // Чужой origin безопасен: остаётся лишь путь.
    expect(safeCallbackUrl('https://evil.com/checkout')).toBe('/checkout');
  });

  it('контрол-символы (\\r \\n \\t) → домой (обход нормализацией парсера)', () => {
    expect(safeCallbackUrl('/\r/evil.com')).toBe('/');
    expect(safeCallbackUrl('/\n//evil.com')).toBe('/');
    expect(safeCallbackUrl('/\t/evil.com')).toBe('/');
  });

  it('не начинается со слэша → домой', () => {
    expect(safeCallbackUrl('checkout')).toBe('/');
    expect(safeCallbackUrl('javascript:alert(1)')).toBe('/');
  });
});
