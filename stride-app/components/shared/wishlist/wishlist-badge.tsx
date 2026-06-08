'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';

// Лёгкий клиентский бейдж: только иконка-ссылка на /wishlist, БЕЗ серверного auth()/cookies()/БД.
// Счётчик убран намеренно — серверная работа в общем хедере на каждой странице задевала
// обработку session-cookie (терялась сессия на навигации в auth-e2e). Зеркалит CartBadge-подход
// (клиентский, без блокирующего SSR). Счётчик при необходимости вернём через клиентский fetch.
export function WishlistBadge() {
  return (
    <Link
      href="/wishlist"
      className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft"
      aria-label="Избранное"
    >
      <Heart className="w-5 h-5" aria-hidden />
    </Link>
  );
}
