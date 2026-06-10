import { describe, it, expect } from 'vitest';
import { checkAuthRateLimit, checkCartRateLimit } from '@/lib/rate-limit';

// vitest env НЕ задаёт KV_REST_API_* → isRateLimitConfigured()=false → fail-open.
describe('rate-limit fail-open без Upstash', () => {
  it('checkAuthRateLimit → success', async () => {
    expect((await checkAuthRateLimit('1.2.3.4')).success).toBe(true);
  });
  it('checkCartRateLimit → success', async () => {
    expect((await checkCartRateLimit('1.2.3.4')).success).toBe(true);
  });
});
