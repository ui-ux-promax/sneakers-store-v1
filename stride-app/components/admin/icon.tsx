import { cn } from '@/lib/utils';

interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
}

// Material Symbols wrapper. CSS для .material-symbols-outlined и .fill — в globals.css
export function Icon({ name, filled, className }: IconProps) {
  return (
    <span className={cn('material-symbols-outlined', filled && 'fill', className)}>
      {name}
    </span>
  );
}
