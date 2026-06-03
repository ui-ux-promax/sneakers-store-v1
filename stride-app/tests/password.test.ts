import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('password', () => {
  it('хеш не равен исходному паролю и верифицируется', async () => {
    const hash = await hashPassword('S3cret!pass');
    expect(hash).not.toBe('S3cret!pass');
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword('S3cret!pass', hash)).toBe(true);
  });
  it('неверный пароль не проходит', async () => {
    const hash = await hashPassword('S3cret!pass');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
