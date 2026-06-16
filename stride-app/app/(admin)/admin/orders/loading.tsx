import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function OrdersLoading() {
  return <ListPageSkeleton withStatusChips filterCount={3} tableCols={6} withThumb />;
}
