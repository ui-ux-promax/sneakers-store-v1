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

// Абсолютная дата+время в МСК: '14.06.2026 13:01'. Таймзону фиксируем явно — RSC рендерится на
// сервере Vercel (UTC), без неё время уехало бы на −3ч от московского.
const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function formatDateTime(date: Date): string {
  // ru-RU отдаёт 'дд.мм.гггг, чч:мм' — убираем запятую, оставляя 'дд.мм.гггг чч:мм'.
  return DATE_TIME.format(date).replace(',', '');
}

// Только дата в МСК: '14.06.2026'. Для дня рождения и т.п. (без времени).
const DATE_ONLY = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

export function formatDate(date: Date): string {
  return DATE_ONLY.format(date);
}
