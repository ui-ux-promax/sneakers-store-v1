/**
 * /admin — Dashboard (Performance Hub)
 * Заглушка с KPI-карточками. Реальные метрики — Phase 3.6.
 */

import { Heading } from '@/components/admin/heading';

export const metadata = { title: 'Дашборд' };

const KPI_CARDS = [
  { label: 'Выручка за месяц',     value: '—',   note: 'Phase 3.6' },
  { label: 'Заказы за месяц',      value: '—',   note: 'Phase 3.6' },
  { label: 'Новые клиенты',        value: '—',   note: 'Phase 3.6' },
  { label: 'Товаров в каталоге',   value: '—',   note: 'Phase 3.6' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Heading
        title="Performance Hub"
        description="Метрики магазина STRIDE"
      />

      {/* Bento-сетка KPI-карточек */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {KPI_CARDS.map(({ label, value, note }) => (
          <div
            key={label}
            className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 flex flex-col gap-3"
          >
            <p className="text-sm text-admin-on-surface-variant">{label}</p>
            <p className="text-3xl font-admin-head font-bold text-admin-on-surface">{value}</p>
            <p className="text-xs text-admin-on-surface-variant mt-auto">Данные появятся в {note}</p>
          </div>
        ))}
      </div>

      {/* Placeholder основного контента */}
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
        Детализированный дашборд (графики, таблицы, активность) будет реализован в Phase 3.6.
      </div>
    </div>
  );
}
