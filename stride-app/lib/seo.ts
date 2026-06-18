export const siteName = 'STRIDE';
export const defaultSeoTitle = 'STRIDE - кроссовки';
export const defaultSeoDescription = 'Кроссовки STRIDE: беговые, лайфстайл, платформы. Доставка по России.';
export const catalogSeoDescription = 'Каталог кроссовок STRIDE: беговые, лайфстайл и платформы с фильтрами по размеру, цвету и цене.';
export const defaultOgImage = '/products/Professional_product_photography_of_white_202605311739.png';

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
}

export function absoluteUrl(pathOrUrl: string, base = getSiteUrl()): string {
  return new URL(pathOrUrl, base).toString();
}
