import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { apiError, apiZodError, apiInternalError } from '@/lib/admin/api-error';
import { logger } from '@/lib/logger';

const loggerErrorMock = logger.error as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// apiError
// ---------------------------------------------------------------------------
describe('apiError', () => {
  it('возвращает ответ с нужным статусом', async () => {
    const res = apiError('Not found', 404);
    expect(res.status).toBe(404);
  });

  it('тело содержит { message } без issues', async () => {
    const res = apiError('Something wrong', 400);
    const body = await res.json();
    expect(body).toEqual({ message: 'Something wrong' });
    expect(body.issues).toBeUndefined();
  });

  it('статус 400', async () => {
    const res = apiError('Bad request', 400);
    expect(res.status).toBe(400);
  });

  it('статус 401', async () => {
    const res = apiError('Unauthorized', 401);
    expect(res.status).toBe(401);
  });

  it('статус 403', async () => {
    const res = apiError('Forbidden', 403);
    expect(res.status).toBe(403);
  });

  it('статус 500', async () => {
    const res = apiError('Server error', 500);
    expect(res.status).toBe(500);
  });

  it('с issues — тело включает issues', async () => {
    const issues = { fieldErrors: { name: ['Required'] } };
    const res = apiError('Validation failed', 400, issues);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation failed');
    expect(body.issues).toEqual(issues);
  });

  it('issues=undefined → поле не появляется в теле', async () => {
    const res = apiError('x', 400, undefined);
    const body = await res.json();
    expect(Object.prototype.hasOwnProperty.call(body, 'issues')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// apiZodError
// ---------------------------------------------------------------------------
describe('apiZodError', () => {
  it('статус 400', () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(result.success).toBe(false);
    const res = apiZodError(result.error!);
    expect(res.status).toBe(400);
  });

  it('тело содержит message "Validation failed"', async () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    const res = apiZodError(result.error!);
    const body = await res.json();
    expect(body.message).toBe('Validation failed');
  });

  it('тело содержит issues с fieldErrors', async () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    const res = apiZodError(result.error!);
    const body = await res.json();
    expect(body.issues).toBeDefined();
    expect(body.issues.fieldErrors).toBeDefined();
  });

  it('issues.fieldErrors содержит ошибку для поля "a"', async () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    const res = apiZodError(result.error!);
    const body = await res.json();
    expect(body.issues.fieldErrors.a).toBeDefined();
    expect(Array.isArray(body.issues.fieldErrors.a)).toBe(true);
  });

  it('несколько полей с ошибками', async () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ name: 42, age: 'not-a-number' });
    const res = apiZodError(result.error!);
    const body = await res.json();
    expect(body.issues.fieldErrors).toHaveProperty('name');
    expect(body.issues.fieldErrors).toHaveProperty('age');
  });
});

// ---------------------------------------------------------------------------
// apiInternalError
// ---------------------------------------------------------------------------
describe('apiInternalError', () => {
  it('статус 500', () => {
    loggerErrorMock.mockClear();
    const res = apiInternalError('tag', new Error('boom'));
    expect(res.status).toBe(500);
  });

  it('тело { message: "Internal error" }', async () => {
    loggerErrorMock.mockClear();
    const res = apiInternalError('tag', new Error('boom'));
    const body = await res.json();
    expect(body).toEqual({ message: 'Internal error' });
  });

  it('logger.error вызывается ровно один раз', () => {
    loggerErrorMock.mockClear();
    apiInternalError('my-tag', new Error('boom'));
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });

  it('logger.error вызывается с тегом и ошибкой', () => {
    loggerErrorMock.mockClear();
    const err = new Error('something bad');
    apiInternalError('orders', err);
    expect(loggerErrorMock).toHaveBeenCalledWith('admin_internal_error:orders', err);
  });

  it('работает с не-Error payload', () => {
    loggerErrorMock.mockClear();
    const res = apiInternalError('tag', 'some string error');
    expect(res.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
