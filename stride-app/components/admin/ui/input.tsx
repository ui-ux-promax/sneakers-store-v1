import * as React from 'react';
import { cn } from '@/lib/utils';

// Admin text input — forwardRef, lime focus ring, без dark: вариантов
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl bg-admin-surface border border-admin-outline-variant',
        'px-3 py-2 text-sm text-admin-on-surface',
        'placeholder:text-admin-on-surface-variant',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';
