'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/admin/icon';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  /** Тема из SSR (cookie admin-theme в (admin)/layout). Делает SSR === первый клиентский кадр. */
  initialTheme: 'light' | 'dark';
  className?: string;
}

/**
 * Sliding-pill переключатель темы (порт theme-btn-1-sliding-pill).
 *
 * Реактивная реализация (НЕ императивный JS прототипа):
 *  - useState — единственный источник правды; БЕЗ чтения DOM/localStorage в init,
 *    поэтому SSR-рендер и первый клиентский кадр совпадают (детерминизм гидратации).
 *  - Позиция лайм-таблетки управляется CSS через [data-theme] на .seg
 *    (.seg__opt — flex:1, равны → translateX(100%) без JS-замеров offsetWidth).
 *  - Фикс бага ре-рендера: setState на каждый клик → активная опция всегда верна,
 *    больше не залипает на «Светлая».
 */
export function ThemeToggle({ initialTheme, className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);

  // Дропдаун-меню аватара размонтирует/ремонтирует этот компонент при каждом
  // открытии (Radix unmount-on-close), а проп initialTheme — снимок SSR-cookie на
  // момент загрузки страницы, он НЕ обновляется при клиентском переключении темы.
  // Поэтому на маунте синхронизируемся с живым DOM (.admin-root.dark), иначе
  // таблетка залипает на устаревшем значении. Чтение в useEffect (не в init)
  // сохраняет SSR === первый клиентский кадр — детерминизм гидратации цел.
  useEffect(() => {
    const root = document.querySelector('.admin-root');
    if (root) setTheme(root.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);

    // Тоглим класс на корне админки — синхронно со state.
    const root = document.querySelector('.admin-root');
    root?.classList.toggle('dark', next === 'dark');

    // Сохраняем выбор на ~1 год; path=/ чтобы сервер читал cookie при SSR layout.
    document.cookie = `admin-theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  };

  // Стрелки: влево → light, вправо → dark (как в прототипе).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applyTheme('light');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applyTheme('dark');
    }
  };

  return (
    <div
      className={cn('seg w-full', className)}
      role="group"
      aria-label="Переключатель темы"
      data-theme={theme}
      onKeyDown={onKeyDown}
    >
      {/* Скользящая лайм-таблетка — позиция чисто через CSS [data-theme]. */}
      <span className="seg__thumb" aria-hidden="true" />

      {/* Светлая */}
      <button
        type="button"
        className="seg__opt"
        onClick={() => applyTheme('light')}
        aria-pressed={theme === 'light'}
        aria-label="Светлая тема"
      >
        <span className="seg__ico" aria-hidden="true">
          <Icon name="light_mode" className="ico-off" />
          <Icon name="light_mode" filled className="ico-on" />
        </span>
        <span>Светлая</span>
      </button>

      {/* Тёмная */}
      <button
        type="button"
        className="seg__opt"
        onClick={() => applyTheme('dark')}
        aria-pressed={theme === 'dark'}
        aria-label="Тёмная тема"
      >
        <span className="seg__ico" aria-hidden="true">
          <Icon name="dark_mode" className="ico-off" />
          <Icon name="dark_mode" filled className="ico-on" />
        </span>
        <span>Тёмная</span>
      </button>
    </div>
  );
}
