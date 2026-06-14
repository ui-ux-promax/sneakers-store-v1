'use server';

import { cookies } from 'next/headers';
import { signOut } from '@/auth';
import { cartCookieName } from '@/lib/cart-cookie';
import { wishlistCookieName } from '@/lib/wishlist-cookie';

// Логаут. ВЫНЕСЕНО в модульный server action намеренно: inline `'use server'`-экшен внутри
// server-компонента (AuthNav) терял async-request-scope в Next 15.1.x → `cookies()` бросал
// "called outside a request scope", экшен падал ДО signOut, и логаут не происходил (#leak).
// Модульные экшены (как actions/order.ts) сохраняют scope — cookies() работает.
export async function logout() {
  // Чистим гостевые токены корзины/избранного: иначе следующий гость/юзер на этом браузере
  // увидит корзину/избранное предыдущего по несброшенной cookie.
  const store = await cookies();
  store.delete(cartCookieName);
  store.delete(wishlistCookieName);
  await signOut({ redirectTo: '/' });
}
