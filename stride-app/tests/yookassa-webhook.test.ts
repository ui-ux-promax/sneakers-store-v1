import { describe, it, expect, beforeEach, vi } from 'vitest';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({ parseNotification: parseMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/payment-sync', () => ({ applyPaymentSucceeded: vi.fn(), applyPaymentCanceled: vi.fn() }));
vi.mock('@/lib/yookassa', () => ({ getPaymentStatus: vi.fn() }));

import { POST } from '@/app/api/yookassa/webhook/route';
import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';
import { getPaymentStatus } from '@/lib/yookassa';

const succeededMock = applyPaymentSucceeded as unknown as ReturnType<typeof vi.fn>;
const canceledMock = applyPaymentCanceled as unknown as ReturnType<typeof vi.fn>;
const statusMock = getPaymentStatus as unknown as ReturnType<typeof vi.fn>;

function req() {
  return { json: async () => ({}) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  succeededMock.mockResolvedValue(undefined);
  canceledMock.mockResolvedValue(undefined);
  statusMock.mockResolvedValue('succeeded');
});

describe('yookassa webhook', () => {
  it('payment.succeeded verifies remote status, then applies local success effects', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    statusMock.mockResolvedValue('succeeded');

    const res = await POST(req() as never);

    expect(res.status).toBe(200);
    expect(statusMock).toHaveBeenCalledWith('pay_1');
    expect(succeededMock).toHaveBeenCalledWith('pay_1');
    expect(canceledMock).not.toHaveBeenCalled();
  });

  it('payment.canceled verifies remote status, then applies local cancel effects', async () => {
    parseMock.mockReturnValue({ event: 'payment.canceled', object: { id: 'pay_1' } });
    statusMock.mockResolvedValue('canceled');

    const res = await POST(req() as never);

    expect(res.status).toBe(200);
    expect(statusMock).toHaveBeenCalledWith('pay_1');
    expect(canceledMock).toHaveBeenCalledWith('pay_1');
    expect(succeededMock).not.toHaveBeenCalled();
  });

  it('does not apply local payment effects when remote status does not match the event', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    statusMock.mockResolvedValue('pending');

    const res = await POST(req() as never);

    expect(res.status).toBe(200);
    expect(statusMock).toHaveBeenCalledWith('pay_1');
    expect(succeededMock).not.toHaveBeenCalled();
    expect(canceledMock).not.toHaveBeenCalled();
  });

  it('invalid payload returns 400', async () => {
    parseMock.mockImplementation(() => { throw new Error('bad'); });

    const res = await POST(req() as never);

    expect(res.status).toBe(400);
  });

  it('handler error returns 500', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    statusMock.mockResolvedValue('succeeded');
    succeededMock.mockRejectedValue(new Error('db down'));

    const res = await POST(req() as never);

    expect(res.status).toBe(500);
  });

  it('YooKassa status verification error returns 500 without local effects', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    statusMock.mockRejectedValue(new Error('yookassa down'));

    const res = await POST(req() as never);

    expect(res.status).toBe(500);
    expect(succeededMock).not.toHaveBeenCalled();
    expect(canceledMock).not.toHaveBeenCalled();
  });
});
