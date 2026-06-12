/**
 * /admin/catalog — Управление каталогом товаров
 * Заглушка. Полный CRUD — Phase 3.2 / Phase 3.3.
 * Временно: демо media-фундамента (Phase 3.1) для ручной проверки загрузки.
 */

import { Heading } from '@/components/admin/heading';
import { UploaderDemo } from '@/components/admin/media/uploader-demo';

export const metadata = { title: 'Каталог' };

export default function CatalogPage() {
  return (
    <div className="space-y-8">
      <Heading title="Каталог" description="Управление товарами" />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 space-y-4">
        <p className="text-sm text-admin-on-surface-variant">
          Демо загрузки изображений (Phase 3.1). Полный CRUD каталога — Phase 3.2 — 3.3.
        </p>
        <UploaderDemo />
      </div>
    </div>
  );
}
