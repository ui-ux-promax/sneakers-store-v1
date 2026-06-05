import { YooKassa, CurrencyEnum, LocaleEnum } from '@webzaytsev/yookassa-ts-sdk';
import type { IConfirmationRedirect } from '@webzaytsev/yookassa-ts-sdk';

let _sdk: ReturnType<typeof YooKassa> | null = null;

export function getYooKassa() {
  if (_sdk) return _sdk;
  const shop_id = process.env.YOOKASSA_SHOP_ID;
  const secret_key = process.env.YOOKASSA_SECRET_KEY;
  if (!shop_id || !secret_key) throw new Error('YooKassa not configured (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)');
  _sdk = YooKassa({ shop_id, secret_key });
  return _sdk;
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Нормализует кандидата в чистый origin: убирает пробелы/переносы строк и любой путь.
 * Защищает return_url от загрязнённого источника (напр. в NEXT_PUBLIC_SITE_URL по ошибке
 * оказался URL вебхука с хвостовым "\n") — иначе ЮKassa получает битый return_url
 * и виджет падает с «Платёж не прошёл».
 */
export function toOrigin(raw: string): string {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export interface CreatePaymentInput {
  orderNumber: number;
  amountRub: number;
  baseUrl?: string;  // перекрывает siteUrl() — для рантайм-определения хоста из запроса
}
export interface CreatePaymentResult {
  id: string;
  confirmationUrl: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const sdk = getYooKassa();
  const base = toOrigin(input.baseUrl || siteUrl());
  const payment = await sdk.payments.create(
    {
      // ЮKassa ждёт сумму в рублях (major units), напр. "15490.00" — НЕ в копейках.
      amount: { value: input.amountRub.toFixed(2), currency: CurrencyEnum.RUB },
      confirmation: { type: 'redirect', return_url: `${base}/orders/${input.orderNumber}`, locale: LocaleEnum.ru_RU },
      capture: true,
      description: `Заказ #${input.orderNumber}`,
      metadata: { orderNumber: String(input.orderNumber) },
    },
    `order-${input.orderNumber}`,
  );
  const confirmation = payment.confirmation as IConfirmationRedirect;
  return { id: payment.id, confirmationUrl: confirmation.confirmation_url! };
}

export async function cancelPayment(paymentId: string): Promise<void> {
  const sdk = getYooKassa();
  await sdk.payments.cancel(paymentId);
}

// Запрос актуального статуса платежа у ЮKassa (источник правды).
// Используется страницей заказа, чтобы подтвердить оплату без зависимости от вебхука.
export async function getPaymentStatus(paymentId: string): Promise<string> {
  const sdk = getYooKassa();
  const payment = await sdk.payments.load(paymentId);
  return payment.status;
}
