'use client';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { Counter } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/store';
import type { CartStateItem } from '@/services/dto/cart.dto';

export function CartLineItem({ item }: { item: CartStateItem }) {
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);
  const removeCartItem = useCartStore((s) => s.removeCartItem);
  return (
    <article className={cn('rounded-2xl bg-surface border border-line p-4 flex gap-4', (item.disabled || !item.available) && 'opacity-60')}>
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-surface-soft shrink-0">
        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill sizes="80px" className="object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="font-semibold text-base leading-tight">{item.name}</h3>
            {!item.available && <p className="text-sm text-danger font-medium mt-1">Нет в наличии</p>}
          </div>
          <button className="text-ink-muted hover:text-danger transition shrink-0" aria-label={`Удалить ${item.name} из корзины`} onClick={() => removeCartItem(item.id)}>
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-ink-muted">Размер: {item.sizeEu} · Цвет: {item.colorwayName}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3 mt-3">
          <Counter value={item.quantity} min={1} max={Math.max(1, item.stock)} disabled={item.disabled || !item.available}
            onChange={(q) => updateItemQuantity(item.id, q)} />
          <p className={cn('font-bold text-lg tnum shrink-0', !item.available && 'line-through text-ink-muted')}>{formatPrice(item.lineTotal)}</p>
        </div>
      </div>
    </article>
  );
}
