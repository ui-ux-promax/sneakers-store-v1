import Link from 'next/link';
import { User, LogOut } from 'lucide-react';
import { auth, signOut } from '@/auth';

// Server-компонент: читает сессию (JWT, без БД-I/O) и показывает вход или профиль+выход.
// Гость → иконка-ссылка на /login; залогинен → профиль + кнопка выхода (signOut server action).
export async function AuthNav() {
  const session = await auth();

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft"
        aria-label="Войти"
      >
        <User className="w-5 h-5" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="flex items-center">
      <Link
        href="/profile"
        className="w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft"
        aria-label="Профиль"
      >
        <User className="w-5 h-5" aria-hidden />
      </Link>
      <form
        action={async () => {
          'use server';
          // Чистим гостевые токены корзины/избранного: иначе следующий гость/юзер на этом
          // браузере увидит корзину/избранное предыдущего по несброшенной cookie (#leak).
          const { cookies } = await import('next/headers');
          const { cartCookieName } = await import('@/lib/cart-cookie');
          const { wishlistCookieName } = await import('@/lib/wishlist-cookie');
          const store = await cookies();
          store.delete(cartCookieName);
          store.delete(wishlistCookieName);
          await signOut({ redirectTo: '/' });
        }}
      >
        <button
          type="submit"
          className="w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft text-ink-muted hover:text-ink"
          aria-label="Выйти"
        >
          <LogOut className="w-5 h-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
