'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

const STATUSES = [
  { value: '__all__', label: 'Все статусы' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Выключенные' },
  { value: 'expired', label: 'Истёкшие' },
];
const ALL = '__all__';
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function CouponFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.push(`/admin/marketing?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="relative">
        <Icon
          name="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-on-surface-variant text-[20px] pointer-events-none"
        />
        <Input
          className="pl-10 pr-4 rounded-full py-2.5 h-auto"
          placeholder="Поиск по коду…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все статусы" /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
