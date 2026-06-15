'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// На клиенте — useLayoutEffect (скрыть оверлей до paint при горячем кеше шрифта);
// на сервере — useEffect-«заглушка», чтобы не было React-warning «useLayoutEffect does nothing on the server».
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Оверлей-скелетон сайдбара.
 *
 * Material Symbols — иконочный шрифт: пока он не загружен, на месте глифов
 * виден сырой текст лигатур (`dashboard`, `inventory_2`, `shopping_cart`…).
 * Этот гейт перекрывает сайдбар shimmer-скелетоном на первой загрузке и
 * убирается, как только шрифт готов (или сработает страховочный таймаут).
 *
 * Геометрия повторяет <aside> из admin-shell.tsx (280px, py-6 px-4):
 * бренд-блок, 5 nav-пунктов (1 активный лайм), низ (Оформление + 2 ссылки + профиль).
 *
 * Родительский <aside> — fixed → служит containing block для absolute inset-0;
 * дополнительный relative не нужен.
 */
export default function SidebarSkeletonGate(): JSX.Element | null {
  // Одинаковое начальное значение на SSR и клиенте → нет hydration-mismatch.
  const [state, setState] = useState<'pending' | 'ready'>('pending');

  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;

    const FONT = '1em "Material Symbols Outlined"';

    // Горячий кеш: шрифт уже доступен — скрываемся до paint, без мерцания.
    if (document.fonts && document.fonts.check(FONT)) {
      setState('ready');
      return;
    }

    let cancelled = false;
    const done = () => {
      if (!cancelled) setState('ready');
    };

    document.fonts
      ?.load(FONT)
      .then(() => document.fonts.ready)
      .then(done)
      .catch(done);

    // Страховка, согласованная с font-display: block (~3s) — не зависаем навсегда.
    const t = setTimeout(done, 3500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (state === 'ready') return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-10 flex flex-col bg-admin-surface py-6 px-4"
    >
      {/* ── Бренд-блок (лайм-квадрат без глифа + 2 строки) ────────────── */}
      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-admin-primary flex-shrink-0" />
        <div className="flex flex-col gap-2">
          <div className="sk sk-line w-20 h-[18px]" />
          <div className="sk sk-line d1 w-28 h-2.5" />
        </div>
      </div>

      {/* ── Навигация (5 пунктов, первый активный лайм) ───────────────── */}
      <nav className="flex-1 flex flex-col gap-1">
        {/* Активный пункт: лайм-фон, светлые плейсхолдеры on-primary внутри */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-admin-primary">
          <div className="sk sk-circle w-6 h-6 bg-admin-on-primary/25" />
          <div className="sk sk-line w-24 bg-admin-on-primary/25" />
        </div>
        {/* 4 неактивных: серый квадрат-иконка + строка */}
        {(['d1', 'd2', 'd3', 'd4'] as const).map((d) => (
          <div key={d} className="flex items-center gap-3 px-4 py-3 rounded-xl">
            <div className={cn('sk sk-circle w-6 h-6', d)} />
            <div className={cn('sk sk-line w-24', d)} />
          </div>
        ))}
      </nav>

      {/* ── Низ: Оформление + сегмент + 2 ссылки + профиль ────────────── */}
      <div className="mt-auto flex flex-col gap-1 pt-6 border-t border-admin-outline-variant">
        {/* Оформление-лейбл + сегмент-плейсхолдер тоггла темы */}
        <div className="px-2 py-2 flex flex-col gap-2">
          <div className="sk sk-line w-16 h-2" />
          <div className="sk sk-pill h-9 w-full" />
        </div>

        {/* Помощь / Настройки */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="sk sk-circle d2 w-6 h-6" />
          <div className="sk sk-line d2 w-16" />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="sk sk-circle d3 w-6 h-6" />
          <div className="sk sk-line d3 w-24" />
        </div>

        {/* Профиль-карточка */}
        <div className="mt-3 p-3 rounded-xl bg-admin-surface-container flex items-center gap-3">
          <div className="sk sk-circle d1 w-10 h-10 flex-shrink-0" />
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="sk sk-line d1 w-20" />
            <div className="sk sk-line d2 w-12 h-2.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
