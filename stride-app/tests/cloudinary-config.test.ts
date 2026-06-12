import { describe, it, expect, afterEach, vi } from 'vitest';
import { getCloudinaryEnv, isCloudinaryConfigured } from '@/lib/cloudinary/config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCloudinaryConfigured', () => {
  it('false when all env vars are empty', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', '');
    vi.stubEnv('CLOUDINARY_API_KEY', '');
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it('false when only some are present', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'c');
    vi.stubEnv('CLOUDINARY_API_KEY', 'k');
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it('true when all three are present', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'c');
    vi.stubEnv('CLOUDINARY_API_KEY', 'k');
    vi.stubEnv('CLOUDINARY_API_SECRET', 's');
    expect(isCloudinaryConfigured()).toBe(true);
  });
});

describe('getCloudinaryEnv', () => {
  it('returns the current env values', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'cc');
    vi.stubEnv('CLOUDINARY_API_KEY', 'kk');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'ss');
    expect(getCloudinaryEnv()).toEqual({ cloudName: 'cc', apiKey: 'kk', apiSecret: 'ss' });
  });
});
