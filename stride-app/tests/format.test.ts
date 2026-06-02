import { describe, it, expect } from 'vitest';
import { formatPrice, normalizeSize } from '@/lib/format';

describe('formatPrice', () => {
  it('форматирует рубли с неразрывным пробелом-разделителем тысяч и знаком ₽', () => {
    expect(formatPrice(12990)).toBe('12 990 ₽');
    expect(formatPrice(0)).toBe('0 ₽');
    expect(formatPrice(1000000)).toBe('1 000 000 ₽');
  });
});

describe('normalizeSize', () => {
  it('целые размеры — без дробной части', () => {
    expect(normalizeSize(42)).toBe('42');
    expect(normalizeSize('42.0')).toBe('42');
  });
  it('полуразмеры — с .5', () => {
    expect(normalizeSize(42.5)).toBe('42.5');
    expect(normalizeSize('42.50')).toBe('42.5');
  });
});
