'use client';
import { LogOut } from 'lucide-react';
import { useCartStore, useWishlistStore } from '@/store';

// Логаут — server action с soft-навигацией на '/'; zustand-стора её переживают, поэтому
// счётчики корзины/избранного остались бы старыми (cart-бейдж фетчит только на маунте).
// Сбрасываем стора оптимистично onClick ДО сабмита (сервер удалит cookie + signOut),
// чтобы оба бейджа обнулились сразу, не дожидаясь навигации.
export function LogoutButton() {
  return (
    <button
      type="submit"
      onClick={() => {
        useCartStore.setState({ items: [], totalAmount: 0 });
        useWishlistStore.getState().setCount(0);
      }}
      className="w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft text-ink-muted hover:text-ink"
      aria-label="Выйти"
    >
      <LogOut className="w-5 h-5" aria-hidden />
    </button>
  );
}
