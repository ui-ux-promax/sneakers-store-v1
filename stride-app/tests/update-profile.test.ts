import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { user: { update: vi.fn() } } }));

import { updateProfile } from '@/app/actions/profile';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const update = prisma.user.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  update.mockResolvedValue({ id: 'u1' });
});

describe('updateProfile', () => {
  it('не авторизован — ошибка, БД не трогается', async () => {
    authMock.mockResolvedValue(null);
    const r = await updateProfile({ name: 'X' });
    expect(r).toEqual({ ok: false, error: 'Не авторизован' });
    expect(update).not.toHaveBeenCalled();
  });

  it('валидные данные — сохраняет по id текущего пользователя', async () => {
    const r = await updateProfile({ name: 'Иван', phone: '+79990001122', birthdate: '1990-05-01' });
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Иван', phone: '+79990001122', birthdate: new Date('1990-05-01') },
    });
  });

  it('пустые поля очищаются в null (не пустые строки)', async () => {
    await updateProfile({ name: '   ', phone: '', birthdate: '' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: null, phone: null, birthdate: null },
    });
  });

  it('невалидные данные (имя длиннее 80) — ошибка, БД не трогается', async () => {
    const r = await updateProfile({ name: 'a'.repeat(81) });
    expect(r).toEqual({ ok: false, error: 'Проверьте поля' });
    expect(update).not.toHaveBeenCalled();
  });
});
