import { ORDER_STATUS_META } from '@/lib/order';

export function OrderStatusBadge({ status }: { status: keyof typeof ORDER_STATUS_META }) {
  const meta = ORDER_STATUS_META[status];
  return <span className={meta.badge}>{meta.label}</span>;
}
