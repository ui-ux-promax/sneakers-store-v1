import type { Metadata } from 'next';
import { Unbounded, Manrope, Anybody } from 'next/font/google';
import { defaultOgImage, defaultSeoDescription, defaultSeoTitle, getSiteUrl, siteName } from '@/lib/seo';
import './globals.css';

// Root layout: только <html>/<body> + шрифты. Storefront-chrome живёт в
// app/(shop)/layout.tsx, admin-shell — в app/(admin)/layout.tsx. Это
// единственный layout, который рендерит <html> (требование App Router).
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', weight: ['400', '500', '600', '700'], display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', weight: ['600', '700'], display: 'swap' });
// Anybody — заголовки админки (см. app/(admin)). На storefront не используется.
const anybody = Anybody({ subsets: ['latin'], variable: '--font-anybody', weight: ['600', '700', '800'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: 'STRIDE — кроссовки', template: '%s · STRIDE' },
  description: defaultSeoDescription,
  alternates: { canonical: '/' },
  openGraph: {
    title: defaultSeoTitle,
    description: defaultSeoDescription,
    url: '/',
    siteName,
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: defaultOgImage, alt: defaultSeoTitle }],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultSeoTitle,
    description: defaultSeoDescription,
    images: [defaultOgImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable} ${anybody.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
