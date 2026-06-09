'use client';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { subscribeToNewsletter } from '@/app/actions/newsletter';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'already' | 'error'>('idle');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;
    setState('loading');
    const res = await subscribeToNewsletter({ email, source: 'footer' });
    if (!res.ok) { setState('error'); return; }
    setState(res.alreadySubscribed ? 'already' : 'done');
    if (!res.alreadySubscribed) setEmail('');
  };

  const label =
    state === 'done' ? 'Готово' :
    state === 'already' ? 'Вы с нами' :
    state === 'loading' ? '…' : 'Подписаться';

  return (
    <form className="flex gap-2 mt-4 max-w-sm" onSubmit={onSubmit}>
      <label className="flex-1">
        <span className="sr-only">E-mail для рассылки</span>
        <input
          type="email" required placeholder="Твой e-mail" value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle'); }}
          className="w-full h-11 px-4 rounded-full bg-white/10 border border-white/15 text-sm text-white placeholder-white/40 outline-none focus:border-primary"
        />
      </label>
      <Button type="submit" variant="primary" size="md" className="shrink-0" loading={state === 'loading'}>
        {label}
      </Button>
      {state === 'error' && <span className="sr-only" role="alert">Ошибка подписки</span>}
    </form>
  );
}
