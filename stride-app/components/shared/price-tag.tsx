import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PriceTag({ price, compareAtPrice, className }: { price: number; compareAtPrice?: number | null; className?: string }) {
  const showOld = compareAtPrice != null && compareAtPrice > price;
  return (
    <p className={cn('tnum font-bold flex items-baseline gap-2', className)}>
      <span>{formatPrice(price)}</span>
      {showOld && <span className="text-ink-muted text-xs font-medium line-through">{formatPrice(compareAtPrice!)}</span>}
    </p>
  );
}
