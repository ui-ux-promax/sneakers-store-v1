import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/password', () => ({ verifyPassword: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { authorizeCredentials } from '@/lib/auth-credentials';
import { verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma-client';

const vp = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => { vp.mockReset(); findUnique.mockReset(); });

describe('authorizeCredentials (constant-time, #11)', () => {
  it('пустые креды — null, без обращения к БД', async () => {
    expect(await authorizeCredentials({ email: '', password: '' })).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(vp).not.toHaveBeenCalled();
  });

  it('пользователь не найден — verifyPassword ВСЁ РАВНО вызывается (constant-time), результат null', async () => {
    findUnique.mockResolvedValue(null);
    vp.mockResolvedValue(false);
    const r = await authorizeCredentials({ email: 'a@b.com', password: 'secretpass' });
    expect(r).toBeNull();
    expect(vp).toHaveBeenCalledTimes(1); // ключ #11: verify выполнен против dummy-хэша
  });

  it('OAuth-аккаунт без passwordHash — verifyPassword вызывается, результат null', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: null, role: 'CUSTOMER', passwordHash: null });
    vp.mockResolvedValue(false);
    const r = await authorizeCredentials({ email: 'a@b.com', password: 'secretpass' });
    expect(r).toBeNull();
    expect(vp).toHaveBeenCalledTimes(1);
  });

  it('верный пароль — возвращает пользователя (с нормализованным email)', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', role: 'CUSTOMER', passwordHash: '$argon2id$real', emailVerified: new Date() });
    vp.mockResolvedValue(true);
    const r = await authorizeCredentials({ email: 'A@b.com', password: 'secretpass' });
    expect(r).toEqual({ id: 'u1', email: 'a@b.com', name: 'A', role: 'CUSTOMER' });
  });

  it('неверный пароль — null', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', role: 'CUSTOMER', passwordHash: '$argon2id$real' });
    vp.mockResolvedValue(false);
    const r = await authorizeCredentials({ email: 'a@b.com', password: 'wrong' });
    expect(r).toBeNull();
  });

  it('верный пароль, но emailVerified=null — null (gate P2.2c)', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', role: 'CUSTOMER', passwordHash: '$argon2id$real', emailVerified: null });
    vp.mockResolvedValue(true);
    const r = await authorizeCredentials({ email: 'a@b.com', password: 'secretpass' });
    expect(r).toBeNull();
  });
});
