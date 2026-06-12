import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildUploadSignature } from '@/lib/cloudinary/sign';

const SECRET = 'test_secret';

function expected(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + SECRET).digest('hex');
}

describe('buildUploadSignature', () => {
  it('is deterministic for fixed params + secret', () => {
    const params = { folder: 'stride/uploads', timestamp: 1700000000 };
    const sig = buildUploadSignature(params, SECRET);
    expect(sig).toBe(expected(params));
  });

  it('is independent of key insertion order (params get sorted)', () => {
    const a = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    const b = buildUploadSignature({ timestamp: 1, folder: 'f' }, SECRET);
    expect(a).toBe(b);
  });

  it('changes when a param value changes', () => {
    const a = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    const b = buildUploadSignature({ folder: 'f', timestamp: 2 }, SECRET);
    expect(a).not.toBe(b);
  });

  it('returns a 40-char hex string (sha1)', () => {
    const sig = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
  });
});
