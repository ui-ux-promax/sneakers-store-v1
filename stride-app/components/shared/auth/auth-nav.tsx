import Link from 'next/link';
import { cookies } from 'next/headers';
import { User } from 'lucide-react';
import { auth, signOut } from '@/auth';
import { cartCookieName } from '@/lib/cart-cookie';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { LogoutButton } from './logout-button';

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
          // ВАЖНО: cookies/имена импортированы статически. Динамический `await import()` здесь
          // терял request-scope → `cookies()` бросал "called outside a request scope" и логаут падал.
          const store = await cookies();
          store.delete(cartCookieName);
          store.delete(wishlistCookieName);
          await signOut({ redirectTo: '/' });
        }}
      >
        <LogoutButton />
      </form>
    </div>
  );
}
