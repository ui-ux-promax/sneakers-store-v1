// «Добавлен …» для списка товаров. Грубое относительное время на русском,
// без согласования множественного числа (дн./нед./мес. — единая форма).
export function formatAddedAgo(date: Date, now: Date = new Date()): string {
  const ms = now.getTime() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / day);

  if (days <= 0) return 'Добавлен сегодня';
  if (days === 1) return 'Добавлен вчера';
  if (days < 7) return `Добавлен ${days} дн. назад`;
  if (days < 31) return `Добавлен ${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `Добавлен ${Math.floor(days / 30)} мес. назад`;
  return `Добавлен ${Math.floor(days / 365)} г. назад`;
}
