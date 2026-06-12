import { describe, it, expect } from 'vitest';
import { buildImageUrl, TRANSFORM_PRESETS } from '@/lib/cloudinary/url';

const CLOUD = 'demo-cloud';

describe('buildImageUrl', () => {
  it('builds a thumb URL with f_auto,q_auto', () => {
    const url = buildImageUrl('stride/uploads/abc', 'thumb', CLOUD);
    expect(url).toBe(
      'https://res.cloudinary.com/demo-cloud/image/upload/c_fill,w_160,h_160,f_auto,q_auto/stride/uploads/abc',
    );
  });

  it('builds a card URL', () => {
    const url = buildImageUrl('abc', 'card', CLOUD);
    expect(url).toContain('/image/upload/c_fill,w_640,h_480,f_auto,q_auto/abc');
  });

  it('builds a full URL with c_limit', () => {
    const url = buildImageUrl('abc', 'full', CLOUD);
    expect(url).toContain('/image/upload/c_limit,w_1600,f_auto,q_auto/abc');
  });

  it('every preset includes f_auto and q_auto', () => {
    for (const t of Object.values(TRANSFORM_PRESETS)) {
      expect(t).toContain('f_auto');
      expect(t).toContain('q_auto');
    }
  });

  it('falls back to NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME when cloudName omitted', () => {
    const prev = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'env-cloud';
    try {
      expect(buildImageUrl('abc', 'thumb')).toContain('res.cloudinary.com/env-cloud/');
    } finally {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = prev;
    }
  });
});
