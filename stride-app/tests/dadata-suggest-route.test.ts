import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({
  extractClientIp: vi.fn(() => '1.2.3.4'),
  checkDadataRateLimit: vi.fn(async () => ({ success: true, remaining: 5, reset: 0 })),
}));

import { POST } from '@/app/api/dadata/suggest/route';
import { checkDadataRateLimit } from '@/lib/rate-limit';

const limitMock = checkDadataRateLimit as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown, headers?: HeadersInit) {
  return new Request('http://test/api/dadata/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DADATA_TOKEN', 'token');
  limitMock.mockResolvedValue({ success: true, remaining: 5, reset: 0 });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 })));
});

describe('POST /api/dadata/suggest', () => {
  it('applies rate limit before calling DaData', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 10_000 });

    const res = await POST(req({ query: 'Москва' }, { 'x-forwarded-for': '9.9.9.9' }));

    expect(res.status).toBe(429);
    expect(limitMock).toHaveBeenCalledWith('1.2.3.4');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects overlong query before calling DaData', async () => {
    const res = await POST(req({ query: 'а'.repeat(121) }));

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trims query and forwards bounded request to DaData', async () => {
    const res = await POST(req({ query: '  Москва  ' }));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
      expect.objectContaining({
        body: JSON.stringify({ query: 'Москва', count: 5, language: 'ru' }),
      }),
    );
  });
});
