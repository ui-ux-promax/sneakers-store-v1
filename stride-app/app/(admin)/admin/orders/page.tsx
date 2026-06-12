/**
 * /admin/orders — Управление заказами
 * Заглушка. Orders MVP — Phase 3.4.
 */

import { Heading } from '@/components/admin/heading';

export const metadata = { title: 'Заказы' };

export default function OrdersPage() {
  return (
    <div className="space-y-8">
      <Heading
        title="Заказы"
        description="Управление заказами покупателей"
      />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
        Таблица заказов, смена статусов и детализация заказа будут реализованы в Phase 3.4.
      </div>
    </div>
  );
}
