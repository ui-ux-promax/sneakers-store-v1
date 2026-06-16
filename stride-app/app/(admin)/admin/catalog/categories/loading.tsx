import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function CategoriesLoading() {
  // Категории: заголовок Heading (text-2xl), без фильтр-бара, кнопка «Добавить», таблица.
  return <ListPageSkeleton withAction withFilter={false} tableCols={4} withThumb headingSmall />;
}
