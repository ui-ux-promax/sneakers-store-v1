import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error('REDIRECT:' + url);
  }),
}));

import { requireAdminApi, requireAdminPage, requireAdminAction } from '@/lib/admin/require-admin';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const redirectMock = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// requireAdminApi
// ---------------------------------------------------------------------------
describe('requireAdminApi', () => {
  it('аноним (auth → null) → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await requireAdminApi();
    expect(res!.status).toBe(401);
  });

  it('CUSTOMER → 403', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const res = await requireAdminApi();
    expect(res!.status).toBe(403);
  });

  it('ADMIN → null (пропускает)', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await requireAdminApi();
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requireAdminAction
// ---------------------------------------------------------------------------
describe('requireAdminAction', () => {
  it('аноним → { ok:false, error:"Не авторизован" }', async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAdminAction();
    expect(result).toEqual({ ok: false, error: 'Не авторизован' });
  });

  it('CUSTOMER → { ok:false, error:"Доступ запрещён" }', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const result = await requireAdminAction();
    expect(result).toEqual({ ok: false, error: 'Доступ запрещён' });
  });

  it('ADMIN → { ok:true, session }', async () => {
    const session = { user: { role: 'ADMIN', id: 'u1' } };
    authMock.mockResolvedValue(session);
    const result = await requireAdminAction();
    expect(result).toEqual({ ok: true, session });
  });
});

// ---------------------------------------------------------------------------
// requireAdminPage
// ---------------------------------------------------------------------------
describe('requireAdminPage', () => {
  it('аноним → redirect("/login?callbackUrl=/admin")', async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=/admin');
    expect(redirectMock).toHaveBeenCalledWith('/login?callbackUrl=/admin');
  });

  it('CUSTOMER → redirect("/")', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('ADMIN → возвращает сессию', async () => {
    const session = { user: { role: 'ADMIN', id: 'u1' } };
    authMock.mockResolvedValue(session);
    const result = await requireAdminPage();
    expect(result).toBe(session);
  });
});
