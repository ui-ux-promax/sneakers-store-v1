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

  it('allows required preview tooling and regional Sentry ingest endpoints', async () => {
    const { buildContentSecurityPolicy } = await import('../lib/security/headers.mjs');
    const csp = buildContentSecurityPolicy({ allowVercelLive: true });

    expect(csp).toContain('script-src');
    expect(csp).toContain('https://vercel.live');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://*.ingest.de.sentry.io');
  });
});
