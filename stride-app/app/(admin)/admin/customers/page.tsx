/**
 * /admin/customers — Управление клиентами
 * Заглушка. Phase 3.5.
 */

import { Heading } from '@/components/admin/heading';

export const metadata = { title: 'Клиенты' };

export default function CustomersPage() {
  return (
    <div className="space-y-8">
      <Heading
        title="Клиенты"
        description="База покупателей магазина"
      />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
        Список клиентов, профили, история заказов и управление ролями будут реализованы в Phase 3.5.
      </div>
    </div>
  );
}
