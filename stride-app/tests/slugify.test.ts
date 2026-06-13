import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slugify';

describe('slugify', () => {
  it('transliterates Cyrillic to latin', () => {
    expect(slugify('Беговые')).toBe('begovye');
  });

  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Беговые кроссовки')).toBe('begovye-krossovki');
  });

  it('handles latin input unchanged (lowercased)', () => {
    expect(slugify('Running Shoes')).toBe('running-shoes');
  });

  it('collapses non-alphanumerics and repeated hyphens', () => {
    expect(slugify('  Hello---World!!!  ')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('!!!platform!!!')).toBe('platform');
  });

  it('drops ъ/ь, maps ё/ж/ш/щ/ч/ц/ю/я', () => {
    expect(slugify('Объём ёжик')).toBe('obem-ezhik');
  });

  it('returns empty string for input with no usable chars', () => {
    expect(slugify('!!! ___')).toBe('');
  });
});
