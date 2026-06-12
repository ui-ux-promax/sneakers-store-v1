import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/cloudinary/config', () => ({
  isCloudinaryConfigured: vi.fn(),
  getCloudinaryEnv: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/admin/media/sign/route';
import { auth } from '@/auth';
import { isCloudinaryConfigured, getCloudinaryEnv } from '@/lib/cloudinary/config';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const configuredMock = isCloudinaryConfigured as unknown as ReturnType<typeof vi.fn>;
const envMock = getCloudinaryEnv as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request('http://test/api/admin/media/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configuredMock.mockReturnValue(true);
  envMock.mockReturnValue({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
});

describe('POST /api/admin/media/sign', () => {
  it('anon → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(401);
  });

  it('CUSTOMER → 403', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(403);
  });

  it('ADMIN but not configured → 503', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    configuredMock.mockReturnValue(false);
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(503);
  });

  it('ADMIN + disallowed folder → 400', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ folder: 'hacker/evil' }));
    expect(res.status).toBe(400);
  });

  it('ADMIN + valid → 200 with signature payload', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ apiKey: 'k', cloudName: 'c', folder: 'stride/uploads' });
    expect(typeof body.signature).toBe('string');
    expect(body.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof body.timestamp).toBe('number');
  });

  it('ADMIN + empty body → defaults to stride/uploads → 200', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folder).toBe('stride/uploads');
  });
});
