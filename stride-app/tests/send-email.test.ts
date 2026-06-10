import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  getResend: vi.fn(() => ({ emails: { send: sendMock } })),
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { sendEmail } from '@/lib/email/send-email';
import { getResend, isEmailConfigured } from '@/lib/email/resend-client';
import { createElement } from 'react';

const configured = isEmailConfigured as unknown as ReturnType<typeof vi.fn>;
const resendFactory = getResend as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  resendFactory.mockReturnValue({ emails: { send: sendMock } });
  process.env.EMAIL_FROM_TRANSACTIONAL = 'Stride <no-reply@cloudd3r.eu.cc>';
  process.env.EMAIL_FROM_NEWSLETTER = 'Stride <hello@cloudd3r.eu.cc>';
});

const node = createElement('div', null, 'hi');

describe('sendEmail', () => {
  it('успех → {ok:true,id}, использует транзакционный from по умолчанию', async () => {
    sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r).toEqual({ ok: true, id: 'em_1' });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Stride <no-reply@cloudd3r.eu.cc>', to: 'u@x.com', subject: 'S',
    }));
  });

  it('kind:newsletter → from hello@', async () => {
    sendMock.mockResolvedValue({ data: { id: 'em_2' }, error: null });
    await sendEmail({ to: 'u@x.com', subject: 'S', react: node, kind: 'newsletter' });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'Stride <hello@cloudd3r.eu.cc>' }));
  });

  it('Resend вернул error → {ok:false}, не бросает', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
  });

  it('не сконфигурирован → {ok:false}, send не вызывается', async () => {
    configured.mockReturnValue(false);
    resendFactory.mockReturnValue(null);
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('send бросил исключение → {ok:false}, не пробрасывает', async () => {
    sendMock.mockRejectedValue(new Error('network'));
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
  });
});
