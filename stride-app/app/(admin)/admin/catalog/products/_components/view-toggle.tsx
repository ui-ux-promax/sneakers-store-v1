'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const VIEWS = [
  { value: 'all', label: 'Все товары' },
  { value: 'recent', label: 'Недавние' },
];

export function ViewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('view') === 'recent' ? 'recent' : 'all';

  function setView(view: string) {
    const next = new URLSearchParams(params.toString());
    if (view === 'all') next.delete('view');
    else next.set('view', view);
    next.delete('page');
    router.push(`/admin/catalog/products?${next.toString()}`);
  }

  return (
    <div className="flex bg-admin-surface rounded-full p-1 border border-admin-outline-variant">
      {VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          onClick={() => setView(v.value)}
          className={cn(
            'px-4 py-1.5 text-xs font-bold rounded-full transition-colors',
            current === v.value
              ? 'bg-admin-primary text-admin-on-primary'
              : 'text-admin-on-surface-variant hover:text-admin-on-surface',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
