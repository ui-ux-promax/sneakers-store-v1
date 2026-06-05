import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import type { ORDER_STATUS_META } from '@/lib/order';

export interface OrderRow {
  orderNumber: number;
  status: keyof typeof ORDER_STATUS_META;
  createdAt: string; // ISO; форматируем на клиенте
  totalAmount: number;
  itemCount: number;
  paymentStatus?: string | null;
}

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="text-ink-muted">Заказов пока нет.</p>;
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.orderNumber} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/orders/${o.orderNumber}`} className="font-semibold hover:underline">Заказ #{o.orderNumber}</Link>
              <p className="text-xs text-ink-muted">{new Date(o.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {o.itemCount} шт.</p>
            </div>
            <OrderStatusBadge status={o.status} paymentStatus={o.paymentStatus} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className={o.status === 'CANCELLED' ? 'tnum line-through text-ink-muted' : 'font-semibold tnum'}>{formatPrice(o.totalAmount)}</span>
            <Link href={`/orders/${o.orderNumber}`} className="text-sm text-ink-muted hover:text-ink">Подробнее</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
