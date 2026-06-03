'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

type Props = Omit<React.ComponentProps<'input'>, 'type'> & { error?: boolean };

// Поле пароля с переключателем показать/скрыть. forwardRef — чтобы работать с register() из RHF.
export const PasswordInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, error, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('pr-11', error && 'err', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
