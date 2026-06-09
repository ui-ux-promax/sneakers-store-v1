import { describe, it, expect, beforeEach } from 'vitest';
import { signPending, parsePending } from '@/lib/verification/pending-cookie';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-key';
});

describe('pending-verification cookie payload', () => {
  it('sign → parse возвращает email', () => {
    const token = signPending('user@example.com');
    expect(parsePending(token)).toEqual({ email: 'user@example.com' });
  });

  it('подделанная подпись → null', () => {
    const token = signPending('user@example.com');
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(parsePending(tampered)).toBeNull();
  });

  it('подменённый payload (другой email) → null', () => {
    const token = signPending('user@example.com');
    const [, sig] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ email: 'evil@x.com', exp: Date.now() + 100000 })).toString('base64url');
    expect(parsePending(`${fakePayload}.${sig}`)).toBeNull();
  });

  it('истёкший exp → null', () => {
    const token = signPending('user@example.com', Date.now() - 1000);
    expect(parsePending(token)).toBeNull();
  });

  it('мусор → null, не бросает', () => {
    expect(parsePending('garbage')).toBeNull();
    expect(parsePending('')).toBeNull();
  });
});
