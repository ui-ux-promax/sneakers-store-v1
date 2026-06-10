import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import type { ORDER_STATUS_META } from '@/lib/order';

export interface OrderThumb {
  imageUrl: string | null;
  productName: string;
}

export interface OrderRow {
  orderNumber: number;
  status: keyof typeof ORDER_STATUS_META;
  createdAt: string; // ISO; форматируем на клиенте
  totalAmount: number;
  itemCount: number;
  thumbs: OrderThumb[]; // снимки первых позиций для превью (cap в запросе)
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/orders/${o.orderNumber}`} className="font-semibold hover:underline">Заказ #{o.orderNumber}</Link>
              <p className="text-xs text-ink-muted">{new Date(o.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {o.itemCount} шт.</p>
            </div>
            <OrderStatusBadge status={o.status} paymentStatus={o.paymentStatus} />
          </div>
          {o.thumbs.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {o.thumbs.map((t, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-surface-soft shrink-0">
                  {t.imageUrl && <Image src={t.imageUrl} alt={t.productName} fill sizes="64px" className="object-cover" />}
                </div>
              ))}
              {o.itemCount > o.thumbs.length && (
                <span className="text-sm text-ink-muted shrink-0">+{o.itemCount - o.thumbs.length}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className={o.status === 'CANCELLED' ? 'tnum line-through text-ink-muted' : 'font-semibold tnum'}>{formatPrice(o.totalAmount)}</span>
            <Button asChild variant="secondary" size="sm"><Link href={`/orders/${o.orderNumber}`}>Подробнее</Link></Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
