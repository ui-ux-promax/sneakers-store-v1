import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import { CancelOrderButton } from '@/components/shared/orders/cancel-order-button';
import { Button } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Заказ' };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { number } = await params;
  const orderNumber = Number(number);
  if (!Number.isInteger(orderNumber)) notFound();

  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true, payment: true } });
  if (!order || order.userId !== session.user.id) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Заказ #{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} paymentStatus={order.payment?.status} />
      </div>
      <p className="text-ink-muted text-sm">
        {order.createdAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-3 p-4 text-sm">
            <span>{it.productName} · {it.colorwayName} · {it.sizeEu} · {it.quantity} шт.</span>
            <span className="font-semibold tnum shrink-0">{formatPrice(it.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-line bg-surface p-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-ink-muted">Товары</span><span className="tnum">{formatPrice(order.itemsTotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="tnum">{order.shippingAmount === 0 ? 'Бесплатно' : formatPrice(order.shippingAmount)}</span></div>
        <div className="flex justify-between border-t border-line pt-2 text-base"><span className="font-semibold">Итого</span><span className="font-display font-bold tnum">{formatPrice(order.totalAmount)}</span></div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 text-sm space-y-1">
        <p className="font-semibold">Доставка</p>
        <p className="text-ink-muted">{order.shippingMethod === 'pickup' ? 'Самовывоз' : 'Курьер'} · {[order.city, order.addressLine].filter(Boolean).join(', ')}</p>
        <p className="text-ink-muted">{order.contactName} · {order.contactPhone}</p>
        <p className="text-ink-muted">
            {order.payment
              ? order.payment.status === 'succeeded'
                ? 'Оплачено онлайн'
                : order.payment.status === 'canceled'
                  ? 'Оплата отменена'
                  : 'Ожидание оплаты…'
              : 'Оплата при получении'}
          </p>
      </div>

      {order.status === 'PENDING' && (
        <div className="flex flex-wrap gap-3">
          {order.payment && order.payment.status === 'pending' && order.payment.confirmationUrl && (
            <Button asChild variant="primary" size="lg">
              <a href={order.payment.confirmationUrl}>Продолжить оплату</a>
            </Button>
          )}
          <CancelOrderButton orderId={order.id} />
        </div>
      )}
    </main>
  );
}
