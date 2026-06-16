/**
 * /admin/catalog — фоллбэк сегмента (redirect → /catalog/products). Табы рисует
 * реальный catalog/layout.tsx (он не суспендится), поэтому скелетон их не дублирует.
 */
import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function CatalogLoading() {
  return (
    <ListPageSkeleton
      withAction
      withViewToggle
      withStatCards
      statCardCount={3}
      filterCount={5}
      tableCols={6}
      withThumb
    />
  );
}
