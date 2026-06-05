import { describe, it, expect, beforeEach, vi } from 'vitest';

const createMock = vi.fn();
const cancelMock = vi.fn();
const loadMock = vi.fn();
vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({
  YooKassa: () => ({ payments: { create: createMock, cancel: cancelMock, load: loadMock } }),
  CurrencyEnum: { RUB: 'RUB' },
  LocaleEnum: { ru_RU: 'ru_RU' },
}));

import { createPayment, cancelPayment, getPaymentStatus } from '@/lib/yookassa';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.YOOKASSA_SHOP_ID = 'shop';
  process.env.YOOKASSA_SECRET_KEY = 'secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test';
});

describe('createPayment', () => {
  it('передаёт сумму в рублях (value в рублях, 2 знака) и прокидывает return_url/idempotency', async () => {
    createMock.mockResolvedValue({ id: 'pay_1', confirmation: { confirmation_url: 'https://yoo/redirect' } });
    const res = await createPayment({ orderNumber: 1025, amountRub: 15999 });
    expect(res).toEqual({ id: 'pay_1', confirmationUrl: 'https://yoo/redirect' });
    const [payload, idempotencyKey] = createMock.mock.calls[0];
    expect(payload.amount).toEqual({ value: '15999.00', currency: 'RUB' });
    expect(payload.capture).toBe(true);
    expect(payload.confirmation).toEqual({ type: 'redirect', return_url: 'https://shop.test/orders/1025', locale: 'ru_RU' });
    expect(payload.metadata).toEqual({ orderNumber: '1025' });
    expect(idempotencyKey).toBe('order-1025');
  });

  it('amount.value в рублях, без ×100 (регресс: переплата в 100 раз, инцидент order-17)', async () => {
    createMock.mockResolvedValue({ id: 'pay_5', confirmation: { confirmation_url: 'https://yoo/r5' } });
    await createPayment({ orderNumber: 17, amountRub: 15490 });
    const [payload] = createMock.mock.calls[0];
    // ЮKassa ждёт сумму в рублях ("15490.00"), а не в копейках ("1549000").
    expect(payload.amount).toEqual({ value: '15490.00', currency: 'RUB' });
  });

  it('использует baseUrl если передан, приоритетнее siteUrl', async () => {
    createMock.mockResolvedValue({ id: 'pay_2', confirmation: { confirmation_url: 'https://yoo/r2' } });
    await createPayment({ orderNumber: 1026, amountRub: 100, baseUrl: 'https://preview.vercel.app' });
    const [payload] = createMock.mock.calls[0];
    expect(payload.confirmation.return_url).toBe('https://preview.vercel.app/orders/1026');
  });

  it('нормализует baseUrl до origin: выкусывает путь и хвостовой \\n (регресс инцидента order-16)', async () => {
    createMock.mockResolvedValue({ id: 'pay_3', confirmation: { confirmation_url: 'https://yoo/r3' } });
    await createPayment({
      orderNumber: 16,
      amountRub: 13490,
      // В env по ошибке попал URL вебхука с хвостовым переносом строки.
      baseUrl: 'https://sneakers-store-v1-13k4jbj23-s1aw3ns-projects.vercel.app/api/yookassa/webhook\n',
    });
    const [payload] = createMock.mock.calls[0];
    expect(payload.confirmation.return_url).toBe(
      'https://sneakers-store-v1-13k4jbj23-s1aw3ns-projects.vercel.app/orders/16',
    );
  });

  it('нормализует загрязнённый NEXT_PUBLIC_SITE_URL через siteUrl()', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test/api/yookassa/webhook\n';
    createMock.mockResolvedValue({ id: 'pay_4', confirmation: { confirmation_url: 'https://yoo/r4' } });
    await createPayment({ orderNumber: 20, amountRub: 100 });
    const [payload] = createMock.mock.calls[0];
    expect(payload.confirmation.return_url).toBe('https://shop.test/orders/20');
  });
});

describe('cancelPayment', () => {
  it('зовёт sdk.payments.cancel с id', async () => {
    cancelMock.mockResolvedValue({ id: 'pay_1', status: 'canceled' });
    await cancelPayment('pay_1');
    expect(cancelMock).toHaveBeenCalledWith('pay_1');
  });
});

describe('getPaymentStatus', () => {
  it('возвращает статус платежа от sdk.payments.load', async () => {
    loadMock.mockResolvedValue({ id: 'pay_1', status: 'succeeded' });
    const status = await getPaymentStatus('pay_1');
    expect(loadMock).toHaveBeenCalledWith('pay_1');
    expect(status).toBe('succeeded');
  });
});
