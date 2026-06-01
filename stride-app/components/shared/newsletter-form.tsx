'use client';
import { useState } from 'react';
import { Button } from '@/components/ui';

export function NewsletterForm() {
  const [done, setDone] = useState(false);
  return (
    <form className="flex gap-2 mt-4 max-w-sm" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
      <label className="flex-1">
        <span className="sr-only">E-mail для рассылки</span>
        <input type="email" required placeholder="Твой e-mail" className="w-full h-11 px-4 rounded-full bg-white/10 border border-white/15 text-sm text-white placeholder-white/40 outline-none focus:border-primary" />
      </label>
      <Button type="submit" variant="primary" size="md" className="shrink-0">{done ? 'Готово' : 'Подписаться'}</Button>
    </form>
  );
}
