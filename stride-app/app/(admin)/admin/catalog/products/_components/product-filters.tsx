'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

export interface ProductFilterOptions {
  brands: string[];
  categories: { id: string; name: string }[];
}

const GENDERS = [
  { value: 'MEN', label: 'Мужские' },
  { value: 'WOMEN', label: 'Женские' },
  { value: 'UNISEX', label: 'Унисекс' },
  { value: 'KIDS', label: 'Детские' },
];
const STATUSES = [
  { value: 'all', label: 'Все статусы' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Черновики' },
];
const ALL = '__all__';

// Триггер селекта в стиле прототипа: пилюля (rounded-full), увеличенный паддинг.
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function ProductFilters({ options }: { options: ProductFilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete('page'); // сбрасываем пагинацию при смене фильтра
    router.push(`/admin/catalog/products?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div className="relative">
        <Icon
          name="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-on-surface-variant text-[20px] pointer-events-none"
        />
        <Input
          className="pl-10 pr-4 rounded-full py-2.5 h-auto"
          placeholder="Поиск товаров…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('category') ?? ALL} onValueChange={(v) => setParam('category', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все категории" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все категории</SelectItem>
          {options.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.get('brand') ?? ALL} onValueChange={(v) => setParam('brand', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все бренды" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все бренды</SelectItem>
          {options.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.get('gender') ?? ALL} onValueChange={(v) => setParam('gender', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Любой пол" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Любой пол</SelectItem>
          {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.get('status') ?? 'all'} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Статус" /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
