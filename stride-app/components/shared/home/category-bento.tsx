import Link from 'next/link';
import Image from 'next/image';
import { CategoryCountdown } from './category-countdown';

export interface BentoCategory { slug: string; name: string; tagline: string | null; count: number; }

// Статическая презентационная конфигурация плиток (зеркалит прототип home.html 173-341).
// Реальный счётчик моделей подмешиваем по slug из categories; плитка LIMITED — промо без счётчика.
interface Tile {
  key: string;
  slug: string | null; // null = промо без привязки к категории (LIMITED)
  href: string;
  image: string;
  gradient: string;
  badge: string;
  title: string;
  subtitle: string;
  span: string;
  ariaLabel: string;
}

const TILES: Tile[] = [
  {
    key: 'lifestyle',
    slug: 'lifestyle',
    href: '/catalog?category=lifestyle',
    image: '/products/new-balance-550.jpeg',
    gradient: 'linear-gradient(135deg, hsl(var(--color-accent)/.35) 0%, hsl(var(--color-accent)/.25) 100%)',
    badge: 'LIFESTYLE',
    title: 'Urban Comfort',
    subtitle: 'Стиль для повседневной жизни',
    span: 'col-span-2 row-span-2',
    ariaLabel: 'Лайфстайл кроссовки',
  },
  {
    key: 'running',
    slug: 'running',
    href: '/catalog?category=running',
    image: '/products/nike-air-max-270.jpeg',
    gradient: 'linear-gradient(135deg, #FEF3E2 0%, #FAE6D0 100%)',
    badge: 'RUNNING',
    title: 'Скорость и легкость',
    subtitle: 'Технологии для бега',
    span: 'col-span-2 row-span-1',
    ariaLabel: 'Беговые кроссовки',
  },
  {
    key: 'limited',
    slug: null,
    href: '/catalog',
    image: '/products/adidas-ultraboost.jpeg',
    gradient: 'linear-gradient(135deg, hsl(var(--color-danger)) 0%, hsl(var(--color-danger)/.8) 100%)',
    badge: 'LIMITED',
    title: 'Exclusive Drop',
    subtitle: '',
    span: 'col-span-1 row-span-1',
    ariaLabel: 'Лимитированные кроссовки — эксклюзивный дроп',
  },
  {
    key: 'platform',
    slug: 'platform',
    href: '/catalog?category=platform',
    image: '/products/puma-rs-x.jpeg',
    gradient: 'linear-gradient(135deg, #E8F4F8 0%, #D4E7F0 100%)',
    badge: 'TRENDING',
    title: 'Platform',
    subtitle: 'Высота и стиль',
    span: 'col-span-1 row-span-1',
    ariaLabel: 'Платформы',
  },
];

export function CategoryBento({ categories }: { categories: BentoCategory[] }) {
  const countBySlug = new Map(categories.map((c) => [c.slug, c.count]));
  const count = (slug: string | null) => (slug ? countBySlug.get(slug) ?? 0 : 0);

  const lifestyle = TILES[0];
  const running = TILES[1];
  const limited = TILES[2];
  const platform = TILES[3];

  return (
    <section id="cats" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="label mb-1.5">Категории</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight">Под твой темп</h2>
        </div>
        <Link href="/catalog" className="btn btn-md btn-ghost hidden sm:inline-flex">Весь каталог →</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[200px] sm:auto-rows-[180px]">

        {/* Lifestyle 2x2 (главная карточка) */}
        <Link
          href={lifestyle.href}
          className={`${lifestyle.span} rounded-2xl overflow-hidden group relative transition-transform duration-300 hover:scale-[1.02] focus:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
          style={{ background: lifestyle.gradient }}
          aria-label={`${lifestyle.ariaLabel} — ${count(lifestyle.slug)} моделей`}
        >
          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/5 transition-all duration-500 z-10" />
          <Image src={lifestyle.image} alt="" aria-hidden="true" fill priority sizes="(min-width: 640px) 50vw, 100vw" className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
          <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end z-20">
            <div className="transform group-hover:translate-y-[-8px] transition-transform duration-500">
              <span className="inline-block px-3 py-1 bg-white/90 backdrop-blur-sm text-[11px] font-semibold rounded-full mb-2 sm:mb-3 uppercase tracking-wide">{lifestyle.badge}</span>
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1 sm:mb-2 drop-shadow-lg">{lifestyle.title}</h3>
              <p className="text-ink/80 text-xs sm:text-sm mb-3 sm:mb-4 drop-shadow">{lifestyle.subtitle}</p>
              <span className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 bg-ink text-surface rounded-full font-semibold text-sm group-hover:bg-ink/90 transition-colors">
                <span className="hidden sm:inline">Смотреть коллекцию</span>
                <span className="sm:hidden tnum">{count(lifestyle.slug)} моделей</span>
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>

        {/* Беговые 2x1 (широкая полоса) */}
        <Link
          href={running.href}
          className={`${running.span} rounded-2xl overflow-hidden group relative transition-transform duration-300 hover:scale-[1.02] focus:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
          style={{ background: running.gradient }}
          aria-label={`${running.ariaLabel} — ${count(running.slug)} моделей`}
        >
          <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-all duration-500 z-10" />
          <Image src={running.image} alt="" aria-hidden="true" fill priority sizes="(min-width: 640px) 50vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 p-4 sm:p-6 flex items-center justify-between z-20">
            <div className="transform group-hover:translate-x-2 transition-transform duration-500">
              <span className="inline-block px-3 py-1 bg-white/90 backdrop-blur-sm text-[11px] font-semibold rounded-full mb-2 uppercase tracking-wide">{running.badge}</span>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-ink drop-shadow-lg">{running.title}</h3>
              <p className="text-ink/70 text-xs sm:text-sm drop-shadow hidden sm:block">{running.subtitle}</p>
              <p className="text-ink/70 text-xs tnum mt-1 sm:hidden">{count(running.slug)} моделей</p>
            </div>
            <div className="transform group-hover:rotate-12 group-hover:scale-110 transition-all duration-500 hidden sm:block">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-ink/10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
              </svg>
            </div>
          </div>
        </Link>

        {/* Лимитированные 1x1 с countdown таймером */}
        <Link
          href={limited.href}
          className={`${limited.span} rounded-2xl overflow-hidden group relative transition-all duration-300 hover:scale-[1.02] focus:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2 animate-pulse-glow`}
          style={{ background: limited.gradient }}
          aria-label={limited.ariaLabel}
        >
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-500 z-10" />
          <Image src={limited.image} alt="" aria-hidden="true" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover group-hover:scale-110 group-hover:rotate-3 transition-all duration-700" />
          <div className="absolute inset-0 p-3 sm:p-4 flex flex-col justify-between z-20">
            <div>
              <span className="inline-block px-2 py-1 bg-white text-danger text-[10px] sm:text-xs font-bold rounded-full uppercase">{limited.badge}</span>
            </div>
            <div className="transform group-hover:translate-y-[-4px] transition-transform duration-500">
              <h3 className="font-display font-bold text-base sm:text-lg text-white drop-shadow-lg mb-2">{limited.title}</h3>
              <CategoryCountdown />
            </div>
          </div>
        </Link>

        {/* Платформы 1x1 с трендовым бейджем */}
        <Link
          href={platform.href}
          className={`${platform.span} rounded-2xl overflow-hidden group relative transition-transform duration-300 hover:scale-[1.02] focus:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
          style={{ background: platform.gradient }}
          aria-label={`${platform.ariaLabel} — ${count(platform.slug)} моделей, в тренде`}
        >
          <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-all duration-500 z-10" />
          <Image src={platform.image} alt="" aria-hidden="true" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover group-hover:scale-110 transition-transform duration-700" />
          <div className="absolute top-3 right-3 animate-rotate-badge z-20">
            <div className="bg-warning text-ink px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-lg flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="hidden sm:inline">{platform.badge}</span>
              <span className="sm:hidden">TOP</span>
            </div>
          </div>
          <div className="absolute inset-0 p-3 sm:p-4 flex flex-col justify-end z-20">
            <div className="transform group-hover:translate-y-[-4px] transition-transform duration-500">
              <h3 className="font-display font-bold text-lg sm:text-xl text-white drop-shadow-lg mb-1">{platform.title}</h3>
              <p className="text-white/90 text-xs drop-shadow">{platform.subtitle}</p>
              <p className="text-white/80 text-[10px] tnum mt-1">{count(platform.slug)} моделей</p>
            </div>
          </div>
        </Link>

      </div>

      {/* Mobile CTA */}
      <div className="mt-4 sm:hidden">
        <Link href="/catalog" className="btn btn-md btn-ghost w-full">Весь каталог →</Link>
      </div>
    </section>
  );
}
