import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Базовый shimmer-плейсхолдер админки. Серверный, без интерактива.
 * Класс `.sk` (engine в globals.css) рисует сплошной `--admin-surface-high`
 * с бесконечным диагональным световым бликом. `aria-hidden` — узел декоративен;
 * семантику «идёт загрузка» несёт корневой композит (role="status").
 *
 * Размеры задавай через className (Tailwind `w-*`/`h-*`) или style (произвольные px).
 */
export type SkeletonRounded = 'line' | 'pill' | 'circle' | 'box';

const ROUNDED: Record<SkeletonRounded, string> = {
  // `line` повторяет .sk-line: высота 12px + полностью скруглённые концы.
  line: 'h-3 rounded-full',
  pill: 'rounded-full',
  circle: 'rounded-full',
  box: 'rounded-xl',
};

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Стаггер-задержка блика 1..5 → класс .d{n} (мягкое «дыхание» полотна). */
  delay?: 1 | 2 | 3 | 4 | 5;
  /** Форма плейсхолдера. По умолчанию прямоугольник со скруглением `box`. */
  rounded?: SkeletonRounded;
}

export function Skeleton({ className, style, delay, rounded = 'box' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn('sk', ROUNDED[rounded], delay && `d${delay}`, className)}
    />
  );
}
