import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import { CancelOrderButton } from '@/components/shared/orders/cancel-order-button';
import { Button } from '@/components/ui';
import { getPaymentStatus } from '@/lib/yookassa';
import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
import Image from 'next/image';
import Link from 'next/link';
import { ReviewForm } from '@/components/shared/product/review-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Заказ' };

// Позиции + связь товара (productId/slug/name) — нужно для формы отзыва на странице заказа.
const orderInclude = {
  items: {
    include: {
      productVariant: {
        select: { colorway: { select: { productId: true, product: { select: { slug: true, name: true } } } } },
      },
    },
  },
  payment: true,
} satisfies Prisma.OrderInclude;

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { number } = await params;
  const orderNumber = Number(number);
  if (!Number.isInteger(orderNumber)) notFound();

  let order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
  if (!order || order.userId !== session.user.id) notFound();

  // Источник правды по оплате — ЮKassa, а не вебхук (он может не дойти на preview/хэш-URL).
  // Если платёж ещё pending — спрашиваем актуальный статус и синхронизируем БД при возврате с оплаты.
  if (order.status === 'PENDING' && order.payment && order.payment.status === 'pending') {
    try {
      const remote = await getPaymentStatus(order.payment.id);
      if (remote === 'succeeded') {
        await applyPaymentSucceeded(order.payment.id);
        order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
      } else if (remote === 'canceled') {
        await applyPaymentCanceled(order.payment.id);
        order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
      }
    } catch (e) {
      logger.error('order_payment_sync_failed', e, { orderNumber });
    }
    if (!order) notFound();
  }

  // Товары заказа (дедуп по productId) + уже оставленные отзывы — для формы «Оцените покупку».
  const productsInOrder: { id: string; slug: string; name: string }[] = [];
  const seenProductIds = new Set<string>();
  for (const it of order.items) {
    const cw = it.productVariant.colorway;
    if (!seenProductIds.has(cw.productId)) {
      seenProductIds.add(cw.productId);
      productsInOrder.push({ id: cw.productId, slug: cw.product.slug, name: cw.product.name });
    }
  }
  // Отзыв доступен, только если этот заказ — реальная покупка: не отменён И (COD ИЛИ онлайн оплачен).
  // Неоплаченный онлайн-заказ («Ожидает оплаты») формы не даёт.
  const orderIsPurchase =
    order.status !== 'CANCELLED' && (order.paymentMethod === 'cod' || order.payment?.status === 'succeeded');
  const canLeaveReviews = orderIsPurchase && productsInOrder.length > 0;
  const reviewedProductIds = canLeaveReviews
    ? new Set(
        (
          await prisma.review.findMany({
            where: { userId: session.user.id, productId: { in: productsInOrder.map((p) => p.id) } },
            select: { productId: true },
          })
        ).map((r) => r.productId),
      )
    : new Set<string>();

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
          <li key={it.id} className="flex items-center gap-3 p-4 text-sm">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-surface-soft shrink-0">
              {it.imageUrl && <Image src={it.imageUrl} alt={it.productName} fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{it.productName}</p>
              <p className="text-ink-muted">{it.colorwayName} · {it.sizeEu} · {it.quantity} шт.</p>
            </div>
            <span className="font-semibold tnum shrink-0">{formatPrice(it.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {canLeaveReviews && (
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-semibold">Оцените покупку</h2>
          {productsInOrder.map((p) => (
            <div key={p.id} className="space-y-2">
              <Link href={`/product/${p.slug}`} className="text-sm font-medium underline-offset-2 hover:underline">{p.name}</Link>
              {reviewedProductIds.has(p.id) ? (
                <p className="text-sm text-ink-muted">Вы уже оставили отзыв на этот товар. Спасибо!</p>
              ) : (
                <ReviewForm productId={p.id} />
              )}
            </div>
          ))}
        </section>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-ink-muted">Товары</span><span className="tnum">{formatPrice(order.itemsTotal)}</span></div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between"><span className="text-ink-muted">Скидка{order.couponCode ? ` (${order.couponCode})` : ''}</span><span className="text-success tnum">−{formatPrice(order.discountAmount)}</span></div>
        )}
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
