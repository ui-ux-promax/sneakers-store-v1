import { describe, it, expect } from 'vitest';
import { categorySchema } from '@/services/dto/category.dto';

const valid = { name: 'Беговые', slug: 'running', tagline: 'Скорость' };

describe('categorySchema', () => {
  it('accepts a valid category', () => {
    const r = categorySchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('accepts optional tagline/coverImage absent', () => {
    const r = categorySchema.safeParse({ name: 'X', slug: 'x' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(categorySchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects slug with uppercase or spaces', () => {
    expect(categorySchema.safeParse({ ...valid, slug: 'Run Shoes' }).success).toBe(false);
  });

  it('rejects slug with leading/trailing hyphen', () => {
    expect(categorySchema.safeParse({ ...valid, slug: '-run' }).success).toBe(false);
    expect(categorySchema.safeParse({ ...valid, slug: 'run-' }).success).toBe(false);
  });

  it('accepts hyphenated slug', () => {
    expect(categorySchema.safeParse({ ...valid, slug: 'running-shoes' }).success).toBe(true);
  });

  it('rejects name longer than 100 chars', () => {
    expect(categorySchema.safeParse({ ...valid, name: 'a'.repeat(101) }).success).toBe(false);
  });
});
