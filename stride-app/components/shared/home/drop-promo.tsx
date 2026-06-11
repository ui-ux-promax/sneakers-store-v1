'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui';

export function DropPromo() {
  const [done, setDone] = useState(false);
  return (
    <section id="drop" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="rounded-[28px] bg-accent text-accent-foreground overflow-hidden grid md:grid-cols-2 items-center">
        <div className="relative h-64 md:h-[420px]">
          <Image src="/products/Professional_product_photography_of_purple_202605311921.png" alt="Лимитированный дроп STRIDE" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-contain p-8 drop-shadow-2xl" />
        </div>
        <div className="p-8 sm:p-12 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Дроп 04 · 02.06</span>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight mt-2">Лимитка<br />уже близко</h2>
          <p className="opacity-90 mt-3 max-w-sm">200 пар STRIDE Velocity. Подпишись — напомним о старте.</p>
          <form className="flex flex-wrap gap-2 mt-5 max-w-sm" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
            <input type="email" required placeholder="Твой e-mail" className="inp flex-1" />
            <Button type="submit" variant="dark" size="md" className="shrink-0">{done ? 'Готово' : 'Напомнить о дропе'}</Button>
          </form>
          <p className="text-xs opacity-90 mt-2">Без спама. Только дропы и рестоки.</p>
        </div>
      </div>
    </section>
  );
}
