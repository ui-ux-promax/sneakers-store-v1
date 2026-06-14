'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PERIOD_VALUES, DEFAULT_PERIOD } from '@/lib/admin/analytics-config';

const LABELS: Record<number, string> = { 7: '7 дней', 30: '30 дней', 90: '90 дней' };

export function PeriodToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = Number(params.get('period'));
  const active = (PERIOD_VALUES as readonly number[]).includes(raw) ? raw : DEFAULT_PERIOD;

  function setPeriod(value: number) {
    const next = new URLSearchParams(params.toString());
    if (value === DEFAULT_PERIOD) next.delete('period');
    else next.set('period', String(value));
    router.push(`/admin?${next.toString()}`);
  }

  return (
    <div className="flex bg-admin-surface rounded-full p-1 border border-admin-outline-variant">
      {PERIOD_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setPeriod(value)}
          className={cn(
            'px-4 py-1.5 text-sm font-bold rounded-full transition-colors',
            value === active
              ? 'bg-admin-primary text-admin-on-primary'
              : 'text-admin-on-surface-variant hover:text-admin-on-surface',
          )}
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  );
}
