import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    user: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  };
  return { prisma };
});

import { changeUserRole } from '@/app/actions/admin/customers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  p.user.updateMany.mockResolvedValue({ count: 1 });
  p.user.count.mockResolvedValue(3);
});

describe('changeUserRole', () => {
  it('promotes CUSTOMER → ADMIN via guarded updateMany', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u2', role: 'CUSTOMER' },
      data: { role: 'ADMIN' },
    });
  });

  it('blocks demoting yourself, no write', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const r = await changeUserRole({ userId: 'admin1', role: 'CUSTOMER' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/себя/i);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('blocks demoting the last admin, no write', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    p.user.count.mockResolvedValue(1);
    const r = await changeUserRole({ userId: 'u2', role: 'CUSTOMER' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/последнего/i);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('demotes another admin when others remain', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    p.user.count.mockResolvedValue(2);
    const r = await changeUserRole({ userId: 'u2', role: 'CUSTOMER' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u2', role: 'ADMIN' },
      data: { role: 'CUSTOMER' },
    });
  });

  it('no-op when role already matches (no write, ok)', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('guarded race (count:0) → asks to refresh', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    p.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/обновите/i);
  });

  it('user not found → error, no write', async () => {
    p.user.findUnique.mockResolvedValue(null);
    const r = await changeUserRole({ userId: 'uX', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('non-admin → error, no prisma touch', async () => {
    authMock.mockResolvedValue({ user: { id: 'u9', role: 'CUSTOMER' } });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  it('bad input (zod) → error, no prisma touch', async () => {
    const r = await changeUserRole({ userId: '', role: 'SUPERUSER' });
    expect(r.ok).toBe(false);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });
});
