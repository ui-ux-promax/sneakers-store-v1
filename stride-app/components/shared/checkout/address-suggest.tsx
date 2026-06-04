'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CheckoutValues } from '@/services/dto/order.dto';

interface Suggestion {
  value: string;
  data: { city: string | null; street_with_type: string | null; house: string | null };
}

export function AddressSuggest() {
  const { setValue, watch } = useFormContext<CheckoutValues>();
  const city = watch('city');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!city || city.trim().length < 2) { setItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/dadata/suggest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: city }),
        });
        const data = await res.json();
        setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
        setOpen(true);
      } catch { setItems([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [city]);

  if (!open || items.length === 0) return null;

  const pick = (s: Suggestion) => {
    skip.current = true;
    setValue('city', s.data.city ?? s.value);
    const line = [s.data.street_with_type, s.data.house].filter(Boolean).join(', ');
    if (line) setValue('addressLine', line);
    setItems([]);
    setOpen(false);
  };

  return (
    <ul className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-surface shadow-lg max-h-60 overflow-auto">
      {items.map((s, i) => (
        <li key={i}>
          <button type="button" onClick={() => pick(s)} className="block w-full text-left px-3 py-2 text-sm hover:bg-surface-soft">
            {s.value}
          </button>
        </li>
      ))}
    </ul>
  );
}
