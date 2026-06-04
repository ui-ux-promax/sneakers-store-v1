'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PersonalDataForm } from './personal-data-form';
import { OrdersList, type OrderRow } from './orders-list';
import type { ProfileValues } from '@/services/dto/auth.dto';

export function ProfileView({ email, initial, orders }: { email: string; initial: ProfileValues; orders: OrderRow[] }) {
  const [tab, setTab] = useState<'data' | 'orders'>('data');
  const tabCls = (active: boolean) =>
    cn(
      'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
      active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-soft',
    );

  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist" aria-label="Разделы профиля">
        <button role="tab" aria-selected={tab === 'data'} className={tabCls(tab === 'data')} onClick={() => setTab('data')}>
          Личные данные
        </button>
        <button role="tab" aria-selected={tab === 'orders'} className={tabCls(tab === 'orders')} onClick={() => setTab('orders')}>
          Мои заказы
        </button>
      </div>
      {tab === 'data' ? <PersonalDataForm initial={initial} email={email} /> : <OrdersList orders={orders} />}
    </div>
  );
}
