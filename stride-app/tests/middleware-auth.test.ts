import { describe, it, expect, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';

const authMock = vi.fn((arg: unknown) => {
  if (typeof arg === 'function') {
    return async () => new Response(null, { status: 200, headers: { 'x-auth-mode': 'wrapper' } });
  }

  return new Response(null, {
    status: 307,
    headers: {
      location: 'http://test.local/login?callbackUrl=http%3A%2F%2Ftest.local%2Fprofile',
      'x-auth-mode': 'inline',
    },
  });
});

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ auth: authMock })),
}));

describe('middleware auth composition', () => {
  it('calls Auth.js inline so callbacks.authorized can redirect protected anonymous routes', async () => {
    const { default: middleware } = await import('../middleware');
    const req = new NextRequest('http://test.local/profile');

    const res = await middleware(req, {} as NextFetchEvent) as Response;

    expect(res.status).toBe(307);
    expect(res.headers.get('x-auth-mode')).toBe('inline');
    expect(res.headers.get('location')).toContain('/login');
  });
});
