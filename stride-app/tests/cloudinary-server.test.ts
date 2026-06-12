import { describe, it, expect, beforeEach, vi } from 'vitest';

const destroyMock = vi.fn();
const configMock = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => configMock(...args),
    uploader: { destroy: (...args: unknown[]) => destroyMock(...args) },
  },
}));

vi.mock('@/lib/cloudinary/config', () => ({
  getCloudinaryEnv: () => ({ cloudName: 'c', apiKey: 'k', apiSecret: 's' }),
}));

import { deleteAsset } from '@/lib/cloudinary/server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteAsset', () => {
  it('returns ok:true when Cloudinary reports result "ok"', async () => {
    destroyMock.mockResolvedValue({ result: 'ok' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: true });
    expect(destroyMock).toHaveBeenCalledWith('pid');
  });

  it('treats "not found" as ok (idempotent delete)', async () => {
    destroyMock.mockResolvedValue({ result: 'not found' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: true });
  });

  it('returns ok:false on any other result', async () => {
    destroyMock.mockResolvedValue({ result: 'error' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: false });
  });

  it('configures the SDK before destroying', async () => {
    destroyMock.mockResolvedValue({ result: 'ok' });
    await deleteAsset('pid');
    expect(configMock).toHaveBeenCalledWith({
      cloud_name: 'c',
      api_key: 'k',
      api_secret: 's',
      secure: true,
    });
  });
});
