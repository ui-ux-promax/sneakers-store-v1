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

export interface CreatePaymentInput {
  orderNumber: number;
  amountRub: number;
}
export interface CreatePaymentResult {
  id: string;
  confirmationUrl: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const sdk = getYooKassa();
  const payment = await sdk.payments.create(
    {
      amount: { value: (input.amountRub * 100).toString(), currency: CurrencyEnum.RUB },
      confirmation: { type: 'redirect', return_url: `${siteUrl()}/orders/${input.orderNumber}`, locale: LocaleEnum.ru_RU },
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
