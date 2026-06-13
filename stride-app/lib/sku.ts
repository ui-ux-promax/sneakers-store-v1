import { slugify } from './slugify';

export interface SuggestSkuInput {
  brand: string;
  productName: string;
  colorwaySlug: string;
  sizeEu: number;
}

/** Подсказка артикула: BRAND-NAME-COLOR-SIZE, UPPER, латиница/цифры, размер 42.5 → 42-5. */
export function suggestSku({ brand, productName, colorwaySlug, sizeEu }: SuggestSkuInput): string {
  const sizePart = String(sizeEu).replace('.', '-');
  const segments = [slugify(brand), slugify(productName), slugify(colorwaySlug), sizePart]
    .map((s) => s.toUpperCase())
    .filter((s) => s.length > 0);
  return segments.join('-');
}
