'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/store';

export function CartBadge() {
  const items = useCartStore((s) => s.items);
  const fetchCartItems = useCartStore((s) => s.fetchCartItems);
  useEffect(() => { fetchCartItems(); }, [fetchCartItems]);
  const count = items.length;
  return (
    <Link href="/cart" className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft" aria-label={count ? `Корзина, ${count} товара` : 'Корзина пуста'}>
      <ShoppingCart className="w-5 h-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 grid place-items-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground tnum">{count}</span>
      )}
    </Link>
  );
}
