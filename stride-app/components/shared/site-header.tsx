import Link from 'next/link';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { HeaderSearch } from './header-search';
import { CartBadge } from './cart-badge';
import { WishlistBadge } from './wishlist/wishlist-badge';
import { AuthNav } from './auth/auth-nav';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 glass-header">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="relative flex items-center gap-4 h-16">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2" aria-label="STRIDE — на главную">
            <span className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm">S</span>
            <span className="font-display font-bold text-lg tracking-tight">STRIDE</span>
          </Link>
          <MainNav />
          <div className="flex-1" />
          <HeaderSearch />
          <AuthNav />
          <WishlistBadge />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
