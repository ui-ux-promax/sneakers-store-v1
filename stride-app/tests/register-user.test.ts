import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/auth', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn(async () => '$argon2id$hash') }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { user: { findUnique: vi.fn(), create: vi.fn() } } }));
vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/verification/service', () => ({ issueCode: vi.fn(async () => {}) }));
vi.mock('@/lib/verification/pending-cookie', () => ({ setPending: vi.fn(async () => {}) }));

import { registerUser } from '@/app/actions/auth';
import { signIn } from '@/auth';
import { hashPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma-client';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { issueCode } from '@/lib/verification/service';
import { setPending } from '@/lib/verification/pending-cookie';

const issue = issueCode as unknown as ReturnType<typeof vi.fn>;
const setPend = setPending as unknown as ReturnType<typeof vi.fn>;

const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;
const hashMock = hashPassword as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const create = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const rateLimit = checkAuthRateLimit as unknown as ReturnType<typeof vi.fn>;

const valid = { email: 'New@Example.com', password: 'secret123', name: 'Neo' };

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ success: true, remaining: -1, reset: 0 });
  findUnique.mockResolvedValue(null);
  create.mockResolvedValue({ id: 'u1' });
  signInMock.mockResolvedValue(undefined);
});

describe('registerUser', () => {
  it('невалидные данные — ошибка формы, argon2 не вызывается', async () => {
    const r = await registerUser({ email: 'bad', password: '1' });
    expect(r).toEqual({ ok: false, error: 'Проверьте поля формы' });
    expect(hashMock).not.toHaveBeenCalled();
  });

  it('email уже существует — ошибка БЕЗ argon2-хэша (#10 дешёвая проверка до hash)', async () => {
    findUnique.mockResolvedValue({ id: 'existing' });
    const r = await registerUser(valid);
    expect(r).toEqual({ ok: false, error: 'Такой email уже зарегистрирован' });
    expect(hashMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('превышен rate-limit — отказ ДО argon2 и до запроса в БД (#10)', async () => {
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 600_000 });
    const r = await registerUser(valid);
    expect(r.ok).toBe(false);
    expect((r as { retryAfterSec?: number }).retryAfterSec).toBeGreaterThan(0);
    expect(hashMock).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('успешная регистрация — создаёт юзера, шлёт код, ставит pending cookie, НЕ логинит', async () => {
    const r = await registerUser(valid);
    expect(r).toEqual({ ok: true, needsVerification: true });
    expect(create).toHaveBeenCalledWith({ data: { email: 'new@example.com', passwordHash: '$argon2id$hash', name: 'Neo' } });
    expect(issue).toHaveBeenCalledWith('new@example.com');
    expect(setPend).toHaveBeenCalledWith('new@example.com');
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('гонка: P2002 на create — ошибка дубликата', async () => {
    create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await registerUser(valid);
    expect(r).toEqual({ ok: false, error: 'Такой email уже зарегистрирован' });
  });

  it('сбой отправки кода не отменяет регистрацию — {ok:true, needsVerification} best-effort', async () => {
    issue.mockRejectedValue(new Error('resend down'));
    const r = await registerUser(valid);
    expect(r).toMatchObject({ ok: true, needsVerification: true });
  });
});
