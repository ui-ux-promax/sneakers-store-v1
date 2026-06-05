import { ORDER_STATUS_META, orderStatusView } from '@/lib/order';

export function OrderStatusBadge({
  status,
  paymentStatus,
}: {
  status: keyof typeof ORDER_STATUS_META;
  paymentStatus?: string | null;
}) {
  const meta = orderStatusView(status, paymentStatus);
  return <span className={meta.badge}>{meta.label}</span>;
}
