/**
 * /admin/marketing — Маркетинг и купоны
 * Заглушка. Купоны (процентные скидки) — Phase 3.7.
 */

import { Heading } from '@/components/admin/heading';

export const metadata = { title: 'Маркетинг' };

export default function MarketingPage() {
  return (
    <div className="space-y-8">
      <Heading
        title="Маркетинг"
        description="Купоны и промоакции"
      />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
        Управление купонами (процентные скидки), промокодами и рассылками будет реализовано в Phase 3.7.
      </div>
    </div>
  );
}
