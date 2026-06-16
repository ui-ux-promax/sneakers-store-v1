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

    const root = document.querySelector<HTMLElement>('.admin-root');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    const MAX_WAIT = 4000; // страховка: не зависаем в скелетоне навсегда

    /**
     * Иконочный глиф реально доступен? Меряем ширину тест-лигатуры: загруженный глиф
     * Material Symbols ≈ квадрат (≈ font-size), а fallback-текст «settings» заметно шире.
     * Почему не document.fonts.check: пока @font-face ещё не объявлен (CSS шрифта грузится),
     * check() возвращает true (нет совпадающих faces → «нечего грузить»), из-за чего гейт
     * снимался слишком рано и мелькали текст-имена иконок.
     */
    const glyphReady = (): boolean => {
      const probe = document.createElement('span');
      probe.textContent = 'settings';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;' +
        "font-family:'Material Symbols Outlined';font-weight:400;font-size:48px;line-height:1;";
      document.body.appendChild(probe);
      const w = probe.offsetWidth;
      document.body.removeChild(probe);
      return w > 0 && w < 80; // глиф ≈ 48px; текст «settings» ≈ 190px
    };

    const elapsed = () =>
      (typeof performance !== 'undefined' ? performance.now() : 0) - startedAt;

    const reveal = () => {
      if (cancelled) return;
      root?.classList.add('ms-ready'); // показать иконки во всей админке (снять FOUT-гард)
      setState('ready'); // убрать оверлей-скелетон сайдбара
    };

    const poll = () => {
      if (cancelled) return;
      if (glyphReady() || elapsed() > MAX_WAIT) {
        reveal();
        return;
      }
      timer = setTimeout(poll, 90);
    };

    // Best-effort подтолкнуть загрузку шрифта и начать опрос (первый — синхронно до paint).
    document.fonts?.load("48px 'Material Symbols Outlined'").catch(() => {});
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
