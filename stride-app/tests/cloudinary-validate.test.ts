import { describe, it, expect } from 'vitest';
import { validateImageFile, ALLOWED_FORMATS, MAX_FILE_BYTES } from '@/lib/cloudinary/validate';

describe('validateImageFile', () => {
  it('accepts a normal jpeg under the limit', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toEqual({ ok: true });
  });

  it.each(ALLOWED_FORMATS)('accepts allowed format %s', (type) => {
    expect(validateImageFile({ type, size: 1024 })).toEqual({ ok: true });
  });

  it('rejects a disallowed format (gif)', () => {
    const r = validateImageFile({ type: 'image/gif', size: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/формат/i);
  });

  it('rejects a file over the size limit', () => {
    const r = validateImageFile({ type: 'image/png', size: MAX_FILE_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/МБ/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_FILE_BYTES })).toEqual({ ok: true });
  });

  it('rejects an empty file', () => {
    const r = validateImageFile({ type: 'image/png', size: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/пуст/i);
  });
});
