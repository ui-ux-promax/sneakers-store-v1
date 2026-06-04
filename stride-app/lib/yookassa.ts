import { YooKassa } from '@webzaytsev/yookassa-ts-sdk';

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
