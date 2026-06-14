'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';
import { ORDER_STATUS_META } from '@/lib/order';
import { ORDER_STATUS_VALUES } from '@/lib/order-admin';

const PAYMENTS = [
  { value: '__all__', label: 'Любая оплата' },
  { value: 'none', label: 'Без оплаты (COD)' },
  { value: 'pending', label: 'Ожидает оплаты' },
  { value: 'succeeded', label: 'Оплачен' },
  { value: 'canceled', label: 'Платёж отменён' },
];
const ALL = '__all__';

// Триггер селекта в стиле прототипа: пилюля (rounded-full), увеличенный паддинг.
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function OrderFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete('page'); // сбрасываем пагинацию при смене фильтра
    router.push(`/admin/orders?${next.toString()}`);
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
          placeholder="Поиск: № / имя / телефон / email…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все статусы" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все статусы</SelectItem>
          {ORDER_STATUS_VALUES.map((s) => (
            <SelectItem key={s} value={s}>{ORDER_STATUS_META[s].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get('payment') ?? ALL} onValueChange={(v) => setParam('payment', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Любая оплата" /></SelectTrigger>
        <SelectContent>
          {PAYMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
