import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getWishlistCount } from '@/lib/wishlist';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';

// Лёгкий счётчик избранного для клиентского WishlistBadge (паттерн CartBadge → /api/cart).
// Отдельный запрос, НЕ серверный рендер хедера → не задевает session-cookie при навигации (см. P14).
export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const session = await auth();
      const token = req.cookies.get(wishlistCookieName)?.value;
      const count = await getWishlistCount(session, token);
      return NextResponse.json({ count });
    } catch (error) {
      logger.error('wishlist_count_failed', error);
      return NextResponse.json({ count: 0 });
    }
  });
}
