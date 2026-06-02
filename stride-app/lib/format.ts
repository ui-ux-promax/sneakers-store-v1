// Размер приходит как Prisma.Decimal | number | string. Нормализуем к '42' / '42.5'.
export function normalizeSize(size: number | string | { toString(): string }): string {
  const n = typeof size === 'number' ? size : Number(size.toString());
  if (!Number.isFinite(n)) return String(size);
  // округляем до 0.5
  const rounded = Math.round(n * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const RUB = new Intl.NumberFormat('ru-RU', { useGrouping: true });

export function formatPrice(rub: number): string {
  // Intl в ru-RU использует узкий неразрывный пробел; нормализуем к обычному пробелу для стабильности тестов/верстки.
  const grouped = RUB.format(Math.round(rub)).replace(/[\u202f\u00a0]/g, ' ');
  return `${grouped} ₽`;
}
