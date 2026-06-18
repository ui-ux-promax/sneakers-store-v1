import { describe, expect, it } from 'vitest';
import { absoluteUrl, getSiteUrl } from '@/lib/seo';

describe('getSiteUrl', () => {
  it('uses NEXT_PUBLIC_SITE_URL when present', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://cloudd3r.eu.cc/';
    try {
      expect(getSiteUrl().toString()).toBe('https://cloudd3r.eu.cc/');
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it('falls back to localhost', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      expect(getSiteUrl().toString()).toBe('http://localhost:3000/');
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});

describe('absoluteUrl', () => {
  it('turns root-relative paths into absolute URLs', () => {
    expect(absoluteUrl('/product/test', new URL('https://cloudd3r.eu.cc'))).toBe('https://cloudd3r.eu.cc/product/test');
  });

  it('keeps already absolute URLs', () => {
    expect(absoluteUrl('https://cdn.example.com/a.jpg', new URL('https://cloudd3r.eu.cc'))).toBe('https://cdn.example.com/a.jpg');
  });
});
