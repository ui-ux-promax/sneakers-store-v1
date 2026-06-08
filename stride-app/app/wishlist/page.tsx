import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistItems } from '@/lib/wishlist';
import { WishlistGrid } from '@/components/shared/wishlist/wishlist-grid';
import { WishlistEmpty } from '@/components/shared/wishlist/wishlist-empty';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Избранное' };

export default async function WishlistPage() {
  const [session, store] = await Promise.all([auth(), cookies()]);
  const products = await getWishlistItems(session, store.get(wishlistCookieName)?.value);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8 pb-16">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">
        Избранное{products.length > 0 && <span className="text-ink-muted font-normal text-2xl"> ({products.length})</span>}
      </h1>
      {products.length === 0 ? <WishlistEmpty /> : <WishlistGrid products={products} />}
    </div>
  );
}
