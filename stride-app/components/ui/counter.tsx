'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CounterProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function Counter({ value, onChange, min = 1, max = 99, disabled }: CounterProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn = 'w-8 h-8 grid place-items-center rounded-full bg-surface border border-line text-lg hover:border-ink disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <div className={cn('count-btn inline-flex items-center gap-2', disabled && 'opacity-50')}>
      <button type="button" className={btn} onClick={dec} disabled={disabled || value <= min} aria-label="Уменьшить количество">
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center font-semibold tnum">{value}</span>
      <button type="button" className={btn} onClick={inc} disabled={disabled || value >= max} aria-label="Увеличить количество">
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
