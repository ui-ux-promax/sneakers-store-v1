import type { Metadata } from 'next';
import { Unbounded, Manrope } from 'next/font/google';
import './globals.css';
import { PromoTopBar } from '@/components/shared/promo-top-bar';
import { SiteHeader } from '@/components/shared/site-header';
import { SiteFooter } from '@/components/shared/site-footer';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', weight: ['400', '500', '600', '700'], display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', weight: ['600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'STRIDE — кроссовки', template: '%s · STRIDE' },
  description: 'Кроссовки STRIDE: беговые, лайфстайл, платформы. Доставка по России.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="font-sans">
        <PromoTopBar />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
