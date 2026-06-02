import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full',
  {
    variants: {
      tone: {
        new: 'bg-primary text-primary-foreground',
        bestseller: 'bg-ink text-white',
        discount: 'bg-warm text-ink',
        limited: 'bg-accent text-accent-foreground',
        soldout: 'bg-ink/70 text-white',
      },
    },
    defaultVariants: { tone: 'new' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
