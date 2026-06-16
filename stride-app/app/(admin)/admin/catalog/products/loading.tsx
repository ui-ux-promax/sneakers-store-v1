import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function ProductsLoading() {
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
