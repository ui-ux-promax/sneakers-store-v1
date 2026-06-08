// Относительный импорт (не '@/'): этот модуль грузит ts-node при сиде (prisma/seed.ts),
// а он не регистрирует path-алиасы tsconfig — '@/...' не резолвится. Относительный путь
// работает и в ts-node, и в Next/Vitest/tsc.
import { discountPercent } from './product-badges';

// Чистые хелперы денормализации сортировочных ключей Product (без Prisma-рантайма).

interface DenormVariant {
  price: number;
  compareAtPrice: number | null;
  active?: boolean; // undefined трактуем как активный (seed всегда active:true)
}
interface DenormColorway {
  isDefault: boolean;
  sortOrder: number;
  variants: DenormVariant[];
}

// minPrice/discountPct из дефолтной расцветки — повторяет логику buildProductCardData:
// дефолтная расцветка = первая по (isDefault desc, sortOrder asc); самый дешёвый АКТИВНЫЙ
// вариант. Нет расцветок/активных вариантов → { 0, 0 }.
export function productDenormFromColorways(
  colorways: DenormColorway[],
): { minPrice: number; discountPct: number } {
  const cw = [...colorways].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder,
  )[0];
  const active = (cw?.variants ?? []).filter((v) => v.active !== false);
  const cheapest = active.reduce<DenormVariant | null>(
    (min, v) => (min === null || v.price < min.price ? v : min),
    null,
  );
  if (!cheapest) return { minPrice: 0, discountPct: 0 };
  return {
    minPrice: cheapest.price,
    discountPct: discountPercent(cheapest.price, cheapest.compareAtPrice) ?? 0,
  };
}

// Дельта продаж по товару: суммирует quantity по productId (один заказ может содержать
// несколько вариантов одного товара). Используется для одного update на товар.
export function salesDeltaByProduct(
  items: { productId: string; quantity: number }[],
): Map<string, number> {
  const delta = new Map<string, number>();
  for (const it of items) {
    delta.set(it.productId, (delta.get(it.productId) ?? 0) + it.quantity);
  }
  return delta;
}
