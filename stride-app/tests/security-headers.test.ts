import { describe, it, expect } from 'vitest';

describe('security headers', () => {
  it('includes CSP and production HSTS', async () => {
    const { buildSecurityHeaders } = await import('../lib/security/headers.mjs');
    const headers = buildSecurityHeaders({ includeHsts: true });

    expect(headers).toContainEqual(expect.objectContaining({ key: 'Content-Security-Policy' }));
    expect(headers).toContainEqual(expect.objectContaining({
      key: 'Strict-Transport-Security',
      value: expect.stringContaining('max-age=31536000'),
    }));
  });
});
