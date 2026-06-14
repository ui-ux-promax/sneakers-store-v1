'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

const ROLES = [
  { value: '__all__', label: 'Все роли' },
  { value: 'ADMIN', label: 'Администраторы' },
  { value: 'CUSTOMER', label: 'Клиенты' },
];
const SORTS = [
  { value: 'registered', label: 'По дате регистрации' },
  { value: 'orders', label: 'По числу заказов' },
  { value: 'spent', label: 'По сумме трат' },
];
const ALL = '__all__';

// Триггер селекта в стиле прототипа: пилюля (rounded-full), увеличенный паддинг.
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function CustomerFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete('page'); // сбрасываем пагинацию при смене фильтра
    router.push(`/admin/customers?${next.toString()}`);
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
          placeholder="Поиск: имя / email / телефон…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('role') ?? ALL} onValueChange={(v) => setParam('role', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все роли" /></SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.get('sort') ?? 'registered'} onValueChange={(v) => setParam('sort', v === 'registered' ? undefined : v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="По дате регистрации" /></SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
