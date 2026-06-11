'use client';
import { useCart } from '@/hooks/use-cart';
import { CartLineItem } from '@/components/shared/cart/cart-line-item';
import { OrderSummary } from '@/components/shared/cart/order-summary';
import { EmptyCart } from '@/components/shared/cart/empty-cart';
import { Skeleton } from '@/components/ui';

export default function CartPage() {
  const { items, totalAmount, loading } = useCart();

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8 pb-16">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px]">Корзина</h1>
      {items.length > 0 && <p className="text-ink-muted mt-1">{items.length} товара</p>}

      {loading && items.length === 0 ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyCart /></div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 mt-6">
          <div className="space-y-4">
            {items.map((it) => <CartLineItem key={it.id} item={it} />)}
          </div>
          <OrderSummary totalAmount={totalAmount} count={items.reduce((a, i) => a + i.quantity, 0)} />
        </div>
      )}
    </div>
  );
}
