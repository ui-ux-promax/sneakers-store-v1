import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '@/lib/auth-identity';

describe('normalizeEmail', () => {
  it('тримит и приводит к нижнему регистру', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
  it('пустой/невалидный → null', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('notanemail')).toBeNull();
  });
});
