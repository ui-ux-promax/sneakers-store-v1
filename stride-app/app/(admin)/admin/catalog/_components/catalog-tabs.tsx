'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Товары', href: '/admin/catalog/products' },
  { label: 'Категории', href: '/admin/catalog/categories' },
];

export function CatalogTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-admin-outline-variant">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors',
              active
                ? 'border-admin-primary text-admin-on-surface'
                : 'border-transparent text-admin-on-surface-variant hover:text-admin-on-surface',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
