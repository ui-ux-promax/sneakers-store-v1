import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, verifyCodeHash } from '@/lib/verification/code';

describe('verification code', () => {
  it('generateCode — ровно 6 цифр', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashCode → verifyCodeHash: верный код проходит', async () => {
    const code = '123456';
    const h = await hashCode(code);
    expect(h).not.toBe(code);
    expect(await verifyCodeHash(code, h)).toBe(true);
  });

  it('verifyCodeHash: неверный код не проходит', async () => {
    const h = await hashCode('123456');
    expect(await verifyCodeHash('000000', h)).toBe(false);
  });

  it('verifyCodeHash: битый хэш → false, не бросает', async () => {
    expect(await verifyCodeHash('123456', 'not-a-hash')).toBe(false);
  });
});
