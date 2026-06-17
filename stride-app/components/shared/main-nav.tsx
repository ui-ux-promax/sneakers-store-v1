'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface NavLink {
  label: string;
  href: string;
  /** Активна ли ссылка для текущего маршрута + query. */
  match: (pathname: string, sp: ReadonlyURLSearchParams) => boolean;
}

const links: NavLink[] = [
  { label: 'Новинки',   href: '/catalog?sort=new',           match: (p, s) => p === '/catalog' && s.get('sort') === 'new' },
  { label: 'Беговые',   href: '/catalog?category=running',    match: (p, s) => p === '/catalog' && s.get('category') === 'running' },
  { label: 'Лайфстайл', href: '/catalog?category=lifestyle',  match: (p, s) => p === '/catalog' && s.get('category') === 'lifestyle' },
  { label: 'Платформы', href: '/catalog?category=platform',   match: (p, s) => p === '/catalog' && s.get('category') === 'platform' },
  // «Каталог» — fallback: на /catalog без выбранной категории/сортировки.
  { label: 'Каталог',   href: '/catalog',                     match: (p, s) => p === '/catalog' && !s.get('category') && !s.get('sort') },
];

const NAV_CLASS = 'hidden md:inline-flex relative items-center p-1 ml-4 rounded-full bg-surface border border-line shadow-sm isolate';
const ITEM_CLASS = 'relative z-10 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-300';

/**
 * Сегментированная навигация-«таблетки» (порт sliding-pill из тоггла темы админки).
 * Активный раздел = текущий маршрут; чёрная пилюля скользит под активную кнопку.
 * Кнопки разной ширины → позицию/ширину пилюли меряем по DOM (offsetLeft/offsetWidth),
 * перемеряем на смене активного, ресайзе и после загрузки шрифтов (Unbounded/Manrope).
 */
export function MainNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = links.findIndex((l) => l.match(pathname, sp));

  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const place = useCallback(() => {
    const el = itemRefs.current[active];
    setPill(active >= 0 && el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [active]);

  useEffect(() => {
    place(); // начальная установка + при смене активного раздела
    window.addEventListener('resize', place);
    if (document.fonts?.ready) document.fonts.ready.then(place).catch(() => {});
    return () => window.removeEventListener('resize', place);
  }, [place]);

  // Включаем анимацию только со 2-го кадра — чтобы пилюля не «въезжала» из нуля на маунте.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <nav className={NAV_CLASS} aria-label="Основная навигация">
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 left-0 z-0 rounded-full bg-ink shadow-sm',
          animate && 'transition-[transform,width,opacity] duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none',
        )}
        style={{
          width: pill ? pill.width : 0,
          transform: `translateX(${pill ? pill.left : 0}px)`,
          opacity: pill ? 1 : 0,
        }}
      />
      {links.map((l, i) => (
        <Link
          key={l.href}
          ref={(el) => { itemRefs.current[i] = el; }}
          href={l.href}
          aria-current={i === active ? 'page' : undefined}
          className={cn(ITEM_CLASS, i === active ? 'text-white' : 'text-ink-muted hover:text-ink')}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** SSR-безопасный заглушка-вариант для Suspense (useSearchParams требует границы). */
export function MainNavFallback() {
  return (
    <nav className={NAV_CLASS} aria-label="Основная навигация">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={cn(ITEM_CLASS, 'text-ink-muted hover:text-ink')}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
