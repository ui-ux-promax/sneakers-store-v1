'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

// Тонкая обёртка над radix Slider: трек + диапазон + по одному thumb на каждое значение
// (передаём массив из двух чисел → две ручки). Стиль на токенах проекта; фокус-кольцо даёт
// глобальный :focus-visible (см. globals.css), поэтому отдельный ring не дублируем.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, ...props }, ref) => {
  const thumbs = value ?? defaultValue ?? [0];
  return (
    <SliderPrimitive.Root
      ref={ref}
      // role=group: на Root-span есть aria-label (напр. "Диапазон цены"), но без роли axe
      // ругается (aria-prohibited-attr) — для group aria-label валиден; ручки внутри = role=slider.
      role="group"
      value={value}
      defaultValue={defaultValue}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-soft">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {thumbs.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block h-4 w-4 rounded-full border-2 border-primary bg-surface shadow-sm transition-colors hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
