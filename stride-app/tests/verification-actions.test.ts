import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/verification/service', () => ({ confirmCode: vi.fn(), issueCode: vi.fn() }));
vi.mock('@/lib/verification/pending-cookie', () => ({
  readPending: vi.fn(), setPending: vi.fn(), clearPending: vi.fn(),
}));
vi.mock('@/lib/verification/ticket', () => ({ issueTicket: vi.fn(() => 'TICKET') }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { user: { update: vi.fn(), findUnique: vi.fn() } } }));
vi.mock('@/auth', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkVerifyRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  checkResendRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('@/lib/auth-identity', () => ({ normalizeEmail: vi.fn((e: string) => (e.includes('@') ? e.toLowerCase() : null)) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { verifyEmailCode, resendVerificationCode, ensureVerificationGate } from '@/app/actions/verification';
import { confirmCode, issueCode } from '@/lib/verification/service';
import { readPending, clearPending } from '@/lib/verification/pending-cookie';
import { prisma } from '@/lib/prisma-client';
import { signIn } from '@/auth';
import { checkResendRateLimit } from '@/lib/rate-limit';

const confirm = confirmCode as unknown as ReturnType<typeof vi.fn>;
const issue = issueCode as unknown as ReturnType<typeof vi.fn>;
const pending = readPending as unknown as ReturnType<typeof vi.fn>;
const clear = clearPending as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;
const resendLimit = checkResendRateLimit as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  pending.mockResolvedValue({ email: 'u@x.com' });
  userFind.mockResolvedValue({ id: 'u1', email: 'u@x.com' });
  userUpdate.mockResolvedValue({ id: 'u1' });
});

describe('verifyEmailCode', () => {
  it('нет pending cookie → no-session', async () => {
    pending.mockResolvedValue(null);
    const r = await verifyEmailCode({ code: '123456' });
    expect(r.ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('невалидный код (DTO) → invalid, confirmCode не зовётся', async () => {
    const r = await verifyEmailCode({ code: 'abc' });
    expect(r.ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirmCode wrong → {ok:false, reason:wrong}', async () => {
    confirm.mockResolvedValue({ status: 'wrong' });
    const r = await verifyEmailCode({ code: '000000' });
    expect(r).toMatchObject({ ok: false, reason: 'wrong' });
  });

  it('ok → emailVerified, cookie очищена, signIn verified-ticket', async () => {
    confirm.mockResolvedValue({ status: 'ok' });
    const r = await verifyEmailCode({ code: '123456' });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'u@x.com' }, data: expect.objectContaining({ emailVerified: expect.any(Date) }),
    }));
    expect(clear).toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledWith('verified-ticket', expect.objectContaining({ ticket: 'TICKET', redirect: false }));
    expect(r.ok).toBe(true);
  });
});

describe('resendVerificationCode', () => {
  it('нет pending → ошибка', async () => {
    pending.mockResolvedValue(null);
    const r = await resendVerificationCode();
    expect(r.ok).toBe(false);
    expect(issue).not.toHaveBeenCalled();
  });
  it('есть pending → issueCode по email из cookie', async () => {
    const r = await resendVerificationCode();
    expect(issue).toHaveBeenCalledWith('u@x.com');
    expect(r.ok).toBe(true);
  });
});

describe('ensureVerificationGate', () => {
  it('неверифицированный существующий → gated:true, ставит cookie + код', async () => {
    userFind.mockResolvedValue({ emailVerified: null });
    const r = await ensureVerificationGate('u@x.com');
    expect(r.gated).toBe(true);
    expect(resendLimit).toHaveBeenCalledWith('u@x.com');
    expect(issue).toHaveBeenCalled();
  });
  it('resend limit in gate → gated:true without sending another code', async () => {
    userFind.mockResolvedValue({ emailVerified: null });
    resendLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });
    const r = await ensureVerificationGate('u@x.com');
    expect(r.gated).toBe(true);
    expect(issue).not.toHaveBeenCalled();
  });
  it('верифицированный → gated:false', async () => {
    userFind.mockResolvedValue({ emailVerified: new Date() });
    const r = await ensureVerificationGate('u@x.com');
    expect(r.gated).toBe(false);
  });
  it('нет юзера → gated:false', async () => {
    userFind.mockResolvedValue(null);
    expect((await ensureVerificationGate('u@x.com')).gated).toBe(false);
  });
});
