import Link from 'next/link';
import { Heart } from 'lucide-react';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistCount } from '@/lib/wishlist';

export async function WishlistBadge() {
  const [session, store] = await Promise.all([auth(), cookies()]);
  const count = await getWishlistCount(session, store.get(wishlistCookieName)?.value);
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
