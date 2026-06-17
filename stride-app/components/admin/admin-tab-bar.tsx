'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/admin/icon';
import { ADMIN_NAV, resolveActiveIndex } from '@/lib/admin/nav';

/**
 * Мобильный нижний таб-бар (5 разделов). Виден только <md (десктоп — сайдбар).
 * Активный таб подсвечивается скользящей лайм-пилюлей — механика тоггла темы:
 * 5 равных сегментов → пилюля шириной 1/5 двигается translateX(index*100%),
 * без JS-замеров. Позиция берётся из usePathname через resolveActiveIndex.
 */
export function AdminTabBar() {
  const pathname = usePathname();
  const active = resolveActiveIndex(pathname);

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-admin-surface border-t border-admin-outline-variant',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative flex items-stretch h-16 p-1.5 isolate">
        {/* Скользящая лайм-пилюля (декоративная) */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 z-0 w-[calc((100%-0.75rem)/5)] rounded-full',
            'bg-admin-primary shadow-[var(--pill-shadow)]',
            'transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)]',
            active < 0 && 'opacity-0',
          )}
          style={{ transform: `translateX(${Math.max(active, 0) * 100}%)` }}
        />

        {ADMIN_NAV.map((item, i) => {
          const isActive = i === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-10 flex-1 flex items-center justify-center min-h-[44px] rounded-full',
                'transition-colors duration-200',
                isActive ? 'text-admin-on-primary' : 'text-admin-on-surface-variant',
              )}
            >
              <Icon name={item.icon} filled={isActive} className="text-[26px]" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
