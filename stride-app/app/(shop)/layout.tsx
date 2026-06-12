import { PromoTopBar } from '@/components/shared/promo-top-bar';
import { SiteHeader } from '@/components/shared/site-header';
import { SiteFooter } from '@/components/shared/site-footer';
import { VerificationGateHost } from '@/components/shared/auth/verification-gate-host';

// Storefront chrome. Вынесено из root layout, чтобы admin route-group
// (app/(admin)) рендерился БЕЗ шапки/футера/promo. URL не меняются —
// (shop) и (admin) это route-groups (невидимы в пути).
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PromoTopBar />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <VerificationGateHost />
    </>
  );
}
