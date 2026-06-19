import { describe, it, expect } from 'vitest';
import { isStateChangingRequestAllowed } from '@/lib/security/csrf';

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe('isStateChangingRequestAllowed', () => {
  it('allows safe methods', () => {
    expect(isStateChangingRequestAllowed({
      method: 'GET',
      pathname: '/catalog',
      requestOrigin: 'https://cloudd3r.eu.cc',
      headers: headers({}),
    })).toBe(true);
  });

  it('blocks cross-site state-changing browser requests', () => {
    expect(isStateChangingRequestAllowed({
      method: 'POST',
      pathname: '/api/cart',
      requestOrigin: 'https://cloudd3r.eu.cc',
      headers: headers({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
    })).toBe(false);
  });

  it('allows same-origin state-changing browser requests', () => {
    expect(isStateChangingRequestAllowed({
      method: 'POST',
      pathname: '/api/cart',
      requestOrigin: 'https://cloudd3r.eu.cc',
      headers: headers({ 'sec-fetch-site': 'same-origin', origin: 'https://cloudd3r.eu.cc' }),
    })).toBe(true);
  });

  it('exempts provider webhooks', () => {
    expect(isStateChangingRequestAllowed({
      method: 'POST',
      pathname: '/api/yookassa/webhook',
      requestOrigin: 'https://cloudd3r.eu.cc',
      headers: headers({ 'sec-fetch-site': 'cross-site', origin: 'https://yookassa.ru' }),
    })).toBe(true);
  });
});
