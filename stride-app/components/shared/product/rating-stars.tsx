import { Star } from 'lucide-react';

// value 0..5; звёзды округляются до целого, число показывается точно.
export function RatingStars({ value, count, size = 16 }: { value: number; count?: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} strokeWidth={1.5}
            className={i <= full ? 'text-amber-400 fill-current' : 'text-line'} />
        ))}
      </span>
      {count !== undefined && (
        <span className="text-sm text-ink-muted tnum">
          {count > 0 ? `${value.toFixed(1)} (${count})` : 'Пока нет отзывов'}
        </span>
      )}
    </span>
  );
}
