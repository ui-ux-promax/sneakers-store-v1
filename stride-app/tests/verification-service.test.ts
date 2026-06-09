import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    emailVerificationCode: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'em' })) }));
vi.mock('@/lib/verification/code', () => ({
  generateCode: vi.fn(() => '123456'),
  hashCode: vi.fn(async () => 'HASH'),
  verifyCodeHash: vi.fn(async (code: string) => code === '123456'),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { issueCode, confirmCode } from '@/lib/verification/service';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';
import { verifyCodeHash } from '@/lib/verification/code';

const deleteMany = prisma.emailVerificationCode.deleteMany as unknown as ReturnType<typeof vi.fn>;
const create = prisma.emailVerificationCode.create as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.emailVerificationCode.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.emailVerificationCode.update as unknown as ReturnType<typeof vi.fn>;
const send = sendEmail as unknown as ReturnType<typeof vi.fn>;
const verifyHash = verifyCodeHash as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  deleteMany.mockResolvedValue({ count: 0 });
  create.mockResolvedValue({ id: 'c1' });
  update.mockResolvedValue({ id: 'c1' });
  send.mockResolvedValue({ ok: true, id: 'em' });
  verifyHash.mockImplementation(async (code: string) => code === '123456');
});

describe('issueCode', () => {
  it('чистит старые коды, создаёт новый, шлёт письмо', async () => {
    await issueCode('u@x.com');
    expect(deleteMany).toHaveBeenCalledWith({ where: { email: 'u@x.com' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'u@x.com', codeHash: 'HASH' }),
    }));
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('confirmCode', () => {
  const active = { id: 'c1', email: 'u@x.com', codeHash: 'HASH', attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 60000) };

  it('нет активного кода → expired', async () => {
    findFirst.mockResolvedValue(null);
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'expired' });
  });

  it('истёкший код → expired', async () => {
    findFirst.mockResolvedValue({ ...active, expiresAt: new Date(Date.now() - 1000) });
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'expired' });
  });

  it('attempts >= лимит → locked, помечает consumed', async () => {
    findFirst.mockResolvedValue({ ...active, attempts: 5 });
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'locked' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }));
  });

  it('неверный код → wrong, инкремент attempts', async () => {
    findFirst.mockResolvedValue(active);
    const r = await confirmCode('u@x.com', '000000');
    expect(r).toEqual({ status: 'wrong' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
  });

  it('верный код → ok, помечает consumed', async () => {
    findFirst.mockResolvedValue(active);
    update.mockResolvedValue({ id: 'c1', consumedAt: new Date() });
    const r = await confirmCode('u@x.com', '123456');
    expect(r).toEqual({ status: 'ok' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1', consumedAt: null },
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
  });
});
