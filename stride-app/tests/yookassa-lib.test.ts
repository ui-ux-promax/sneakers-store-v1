import { describe, it, expect, beforeEach, vi } from 'vitest';

const createMock = vi.fn();
const cancelMock = vi.fn();
vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({
  YooKassa: () => ({ payments: { create: createMock, cancel: cancelMock } }),
  CurrencyEnum: { RUB: 'RUB' },
  LocaleEnum: { ru_RU: 'ru_RU' },
}));

import { createPayment, cancelPayment } from '@/lib/yookassa';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.YOOKASSA_SHOP_ID = 'shop';
  process.env.YOOKASSA_SECRET_KEY = 'secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test';
});

describe('createPayment', () => {
  it('конвертирует рубли в копейки строкой и прокидывает return_url/idempotency', async () => {
    createMock.mockResolvedValue({ id: 'pay_1', confirmation: { confirmation_url: 'https://yoo/redirect' } });
    const res = await createPayment({ orderNumber: 1025, amountRub: 15999 });
    expect(res).toEqual({ id: 'pay_1', confirmationUrl: 'https://yoo/redirect' });
    const [payload, idempotencyKey] = createMock.mock.calls[0];
    expect(payload.amount).toEqual({ value: '1599900', currency: 'RUB' });
    expect(payload.capture).toBe(true);
    expect(payload.confirmation).toEqual({ type: 'redirect', return_url: 'https://shop.test/orders/1025', locale: 'ru_RU' });
    expect(payload.metadata).toEqual({ orderNumber: '1025' });
    expect(idempotencyKey).toBe('order-1025');
  });

  it('использует baseUrl если передан, приоритетнее siteUrl', async () => {
    createMock.mockResolvedValue({ id: 'pay_2', confirmation: { confirmation_url: 'https://yoo/r2' } });
    await createPayment({ orderNumber: 1026, amountRub: 100, baseUrl: 'https://preview.vercel.app' });
    const [payload] = createMock.mock.calls[0];
    expect(payload.confirmation.return_url).toBe('https://preview.vercel.app/orders/1026');
  });
});

describe('cancelPayment', () => {
  it('зовёт sdk.payments.cancel с id', async () => {
    cancelMock.mockResolvedValue({ id: 'pay_1', status: 'canceled' });
    await cancelPayment('pay_1');
    expect(cancelMock).toHaveBeenCalledWith('pay_1');
  });
});
