import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: { subscriber: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'em' })) }));
const contactsCreate = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  getResend: vi.fn(() => ({ contacts: { create: contactsCreate } })),
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { subscribe } from '@/lib/newsletter/service';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';

const find = prisma.subscriber.findUnique as unknown as ReturnType<typeof vi.fn>;
const create = prisma.subscriber.create as unknown as ReturnType<typeof vi.fn>;
const update = prisma.subscriber.update as unknown as ReturnType<typeof vi.fn>;
const send = sendEmail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = 'test-secret-key';
  process.env.RESEND_AUDIENCE_ID = 'aud_1';
  find.mockResolvedValue(null);
  create.mockResolvedValue({ id: 's1', email: 'a@b.com' });
  update.mockResolvedValue({ id: 's1', email: 'a@b.com' });
  contactsCreate.mockResolvedValue({ data: { id: 'ct_1' }, error: null });
  send.mockResolvedValue({ ok: true, id: 'em' });
});

describe('subscribe', () => {
  it('новый email → создаёт Subscriber, синкает в Resend, шлёт welcome', async () => {
    const r = await subscribe('a@b.com', 'footer');
    expect(r).toMatchObject({ ok: true, alreadySubscribed: false });
    expect(create).toHaveBeenCalled();
    expect(contactsCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com', audienceId: 'aud_1' }));
    expect(send).toHaveBeenCalledOnce();
  });

  it('уже подписан и активен → alreadySubscribed:true, welcome не шлём повторно', async () => {
    find.mockResolvedValue({ id: 's1', email: 'a@b.com', unsubscribedAt: null });
    const r = await subscribe('a@b.com', 'footer');
    expect(r).toMatchObject({ ok: true, alreadySubscribed: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('был отписан → реактивация (update unsubscribedAt=null)', async () => {
    find.mockResolvedValue({ id: 's1', email: 'a@b.com', unsubscribedAt: new Date() });
    const r = await subscribe('a@b.com', 'footer');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unsubscribedAt: null }) }));
    expect(r.ok).toBe(true);
  });

  it('сбой синка в Resend не роняет подписку', async () => {
    contactsCreate.mockRejectedValue(new Error('resend down'));
    const r = await subscribe('a@b.com', 'footer');
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalled();
  });
});
