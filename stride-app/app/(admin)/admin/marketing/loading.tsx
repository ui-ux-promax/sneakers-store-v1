import { ListPageSkeleton } from '@/components/admin/skeleton';

export default function MarketingLoading() {
  return <ListPageSkeleton withAction filterCount={2} tableCols={5} />;
}
