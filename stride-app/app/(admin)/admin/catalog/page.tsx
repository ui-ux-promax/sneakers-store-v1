/**
 * /admin/catalog — Управление каталогом товаров
 * Заглушка. Полный CRUD — Phase 3.2 / Phase 3.3.
 */

import { Heading } from '@/components/admin/heading';

export const metadata = { title: 'Каталог' };

export default function CatalogPage() {
  return (
    <div className="space-y-8">
      <Heading
        title="Каталог"
        description="Управление товарами"
      />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
        Управление товарами (таблица, добавление, редактирование, загрузка фото через Cloudinary)
        будет реализовано в Phase 3.2 — 3.3.
      </div>
    </div>
  );
}
