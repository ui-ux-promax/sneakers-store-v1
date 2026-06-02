import { Truck, RotateCcw, BadgeCheck, CreditCard } from 'lucide-react';

const items = [
  { Icon: Truck, title: 'Доставка 1–3 дня', text: 'По всей России, бесплатно от 10 000 ₽' },
  { Icon: RotateCcw, title: 'Возврат 14 дней', text: 'Примерь дома, не подошло — вернём' },
  { Icon: BadgeCheck, title: 'Только оригинал', text: 'Прямые поставки, гарантия бренда' },
  { Icon: CreditCard, title: 'Удобная оплата', text: 'Картой онлайн или при получении' },
];

export function TrustStrip() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map(({ Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <Icon className="w-6 h-6 text-ink" aria-hidden />
            <p className="font-semibold text-sm mt-3">{title}</p>
            <p className="text-xs text-ink-muted mt-1">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
