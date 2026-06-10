import { describe, it, expect } from 'vitest';
import { retryAfterSeconds, tooManyRequests } from '@/lib/rate-limit-response';

describe('retryAfterSeconds', () => {
  it('reset в прошлом → 0', () => {
    expect(retryAfterSeconds(0)).toBe(0);
    expect(retryAfterSeconds(Date.now() - 5000)).toBe(0);
  });
  it('reset через ~30с → 30 (округление вверх)', () => {
    const v = retryAfterSeconds(Date.now() + 29_400);
    expect(v).toBeGreaterThanOrEqual(29);
    expect(v).toBeLessThanOrEqual(31);
  });
});

describe('tooManyRequests', () => {
  it('429 + Retry-After + JSON {message, retryAfterSec}', async () => {
    const res = tooManyRequests({ success: false, remaining: 0, reset: Date.now() + 10_000 }, 'Слишком часто');
    expect(res.status).toBe(429);
    const ra = Number(res.headers.get('Retry-After'));
    expect(ra).toBeGreaterThanOrEqual(9);
    const body = await res.json();
    expect(body.message).toBe('Слишком часто');
    expect(body.retryAfterSec).toBeGreaterThanOrEqual(9);
  });
});
