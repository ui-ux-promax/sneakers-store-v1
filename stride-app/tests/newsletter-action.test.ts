import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/newsletter/service', () => ({ subscribe: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkNewsletterRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { subscribeToNewsletter } from '@/app/actions/newsletter';
import { subscribe } from '@/lib/newsletter/service';
import { checkNewsletterRateLimit } from '@/lib/rate-limit';

const sub = subscribe as unknown as ReturnType<typeof vi.fn>;
const rate = checkNewsletterRateLimit as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rate.mockResolvedValue({ success: true, remaining: -1, reset: 0 });
  sub.mockResolvedValue({ ok: true, alreadySubscribed: false });
});

describe('subscribeToNewsletter', () => {
  it('невалидный email → ошибка, subscribe не зовётся', async () => {
    const r = await subscribeToNewsletter({ email: 'nope' });
    expect(r.ok).toBe(false);
    expect(sub).not.toHaveBeenCalled();
  });
  it('rate-limit → ошибка', async () => {
    rate.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const r = await subscribeToNewsletter({ email: 'a@b.com' });
    expect(r.ok).toBe(false);
  });
  it('валидный → subscribe вызван, ok', async () => {
    const r = await subscribeToNewsletter({ email: 'a@b.com', source: 'footer' });
    expect(sub).toHaveBeenCalledWith('a@b.com', 'footer');
    expect(r.ok).toBe(true);
  });
});
