'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useWishlistStore } from '@/store';

// Клиентский бейдж: счётчик живёт в zustand-сторе (паттерн CartBadge), мутации сердечка
// апдейтят стор инкрементом/декрементом — счётчик меняется мгновенно, без навигации.
// Рефетч на смену маршрута сверяет с авторитетным значением сервера (guest→login merge, cross-tab).
export function WishlistBadge() {
  const pathname = usePathname();
  const count = useWishlistStore((s) => s.count);
  const fetchCount = useWishlistStore((s) => s.fetchCount);

  useEffect(() => {
    fetchCount();
  }, [pathname, fetchCount]);

  return (
    <Link
      href="/wishlist"
      className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft"
      aria-label={count ? `Избранное, ${count}` : 'Избранное пусто'}
    >
      <Heart className="w-5 h-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 grid place-items-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground tnum">{count}</span>
      )}
    </Link>
  );
}
