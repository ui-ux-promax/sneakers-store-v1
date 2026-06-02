'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function PriceFilter() {
  const { get, setParams } = useCatalogUrl();
  const [from, setFrom] = useState(get('priceFrom'));
  const [to, setTo] = useState(get('priceTo'));
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Цена, ₽</p>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" placeholder="от" value={from} onChange={(e) => setFrom(e.target.value)} className="!h-10 text-sm" aria-label="Цена от" />
        <span className="text-ink-muted">—</span>
        <Input type="number" inputMode="numeric" placeholder="до" value={to} onChange={(e) => setTo(e.target.value)} className="!h-10 text-sm" aria-label="Цена до" />
      </div>
      <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => setParams({ priceFrom: from || null, priceTo: to || null })}>Применить</Button>
    </div>
  );
}
