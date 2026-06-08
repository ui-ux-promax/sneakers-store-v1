'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';

// Клиентский бейдж: счётчик тянем fetch'ем к лёгкому роуту /api/wishlist/count (паттерн CartBadge),
// БЕЗ серверного auth()/cookies()/БД в рендере хедера — иначе теряется сессия на клиентском signIn (P14).
// Рефетч на смену маршрута: после лайка и перехода на /wishlist счётчик актуализируется.
export function WishlistBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/wishlist/count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (active) setCount(typeof d?.count === 'number' ? d.count : 0);
      })
      .catch(() => {
        /* бейдж не критичен — молча игнорируем сбой */
      });
    return () => {
      active = false;
    };
  }, [pathname]);

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
