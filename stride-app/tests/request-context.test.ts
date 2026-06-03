import { describe, it, expect } from 'vitest';
import { sanitizeRequestId } from '@/lib/request-context';

describe('sanitizeRequestId (#13 — не доверять клиентскому x-request-id)', () => {
  it('валидный id возвращается как есть', () => {
    expect(sanitizeRequestId('abc-123_X.y')).toBe('abc-123_X.y');
    expect(sanitizeRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('пусто / null / undefined — отклоняется', () => {
    expect(sanitizeRequestId('')).toBeNull();
    expect(sanitizeRequestId(null)).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
  });

  it('недопустимые символы (пробел, перевод строки, спецсимволы) — отклоняются', () => {
    expect(sanitizeRequestId('has space')).toBeNull();
    expect(sanitizeRequestId('line\nbreak')).toBeNull();
    expect(sanitizeRequestId('semi;colon')).toBeNull();
    expect(sanitizeRequestId('<script>')).toBeNull();
  });

  it('длина: 128 символов допустимо, 129 — отклоняется (анти log-amplification)', () => {
    expect(sanitizeRequestId('a'.repeat(128))).toBe('a'.repeat(128));
    expect(sanitizeRequestId('a'.repeat(129))).toBeNull();
  });
});
