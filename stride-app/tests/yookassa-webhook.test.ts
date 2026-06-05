import { describe, it, expect, beforeEach, vi } from 'vitest';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({ parseNotification: parseMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/payment-sync', () => ({ applyPaymentSucceeded: vi.fn(), applyPaymentCanceled: vi.fn() }));

import { POST } from '@/app/api/yookassa/webhook/route';
import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';

const succeededMock = applyPaymentSucceeded as unknown as ReturnType<typeof vi.fn>;
const canceledMock = applyPaymentCanceled as unknown as ReturnType<typeof vi.fn>;

function req() {
  return { json: async () => ({}) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  succeededMock.mockResolvedValue(undefined);
  canceledMock.mockResolvedValue(undefined);
});

describe('yookassa webhook', () => {
  it('payment.succeeded → applyPaymentSucceeded(id)', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(succeededMock).toHaveBeenCalledWith('pay_1');
    expect(canceledMock).not.toHaveBeenCalled();
  });

  it('payment.canceled → applyPaymentCanceled(id)', async () => {
    parseMock.mockReturnValue({ event: 'payment.canceled', object: { id: 'pay_1' } });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(canceledMock).toHaveBeenCalledWith('pay_1');
    expect(succeededMock).not.toHaveBeenCalled();
  });

  it('невалидный payload → 400', async () => {
    parseMock.mockImplementation(() => { throw new Error('bad'); });
    const res = await POST(req() as never);
    expect(res.status).toBe(400);
  });

  it('ошибка в обработчике → 500', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    succeededMock.mockRejectedValue(new Error('db down'));
    const res = await POST(req() as never);
    expect(res.status).toBe(500);
  });
});
