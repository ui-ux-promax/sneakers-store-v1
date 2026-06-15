import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function CustomersLoading() {
  return <ListPageSkeleton filterCount={3} tableCols={5} />;
}
