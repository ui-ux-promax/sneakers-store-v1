'use client';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { FREE_SHIPPING_THRESHOLD } from '@/constants/config';

export function OrderSummary({ totalAmount, count }: { totalAmount: number; count: number }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - totalAmount);
  const freeShipping = remaining === 0;
  return (
    <aside>
      <div className="sticky bottom-0 md:static rounded-2xl border border-line bg-surface p-5 space-y-4">
        <h2 className="font-display font-bold text-xl">Итого</h2>

        <div className="space-y-2 text-sm border-t border-line pt-4">
          <div className="flex justify-between"><span className="text-ink-muted">Товары ({count} шт.)</span><span className="font-semibold tnum">{formatPrice(totalAmount)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="font-semibold text-success">{freeShipping ? 'Бесплатно' : 'по тарифу'}</span></div>
        </div>

        {/* Индикатор бесплатной доставки */}
        {!freeShipping ? (
          <div className="text-xs text-ink-muted">Добавьте ещё <span className="font-semibold text-ink tnum">{formatPrice(remaining)}</span> до бесплатной доставки</div>
        ) : (
          <div className="text-xs text-success font-semibold">Бесплатная доставка применена</div>
        )}

        <div className="flex justify-between items-baseline border-t border-line pt-4">
          <span className="text-lg font-semibold">Итого</span>
          <span className="font-display font-bold text-2xl tnum">{formatPrice(totalAmount)}</span>
        </div>

        <Button asChild variant="primary" size="lg" className="w-full"><Link href="/checkout">Оформить заказ →</Link></Button>
        <p className="text-xs text-ink-muted leading-relaxed">Оплата при получении. Онлайн-оплата появится позже.</p>
      </div>
    </aside>
  );
}
