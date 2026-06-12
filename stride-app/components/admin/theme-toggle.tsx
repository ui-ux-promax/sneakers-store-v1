'use client';

import { Icon } from '@/components/admin/icon';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

// Сегментный переключатель Light | Dark.
// Читает начальное состояние из .admin-root.dark,
// записывает cookie admin-theme и переключает класс — без next-themes.
export function ThemeToggle({ className }: ThemeToggleProps) {
  // Определяем текущую тему по наличию класса dark на .admin-root
  const isDark = () =>
    typeof document !== 'undefined' &&
    document.querySelector('.admin-root')?.classList.contains('dark') === true;

  const applyTheme = (theme: 'light' | 'dark') => {
    const root = document.querySelector('.admin-root');
    if (!root) return;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Сохраняем в cookie на ~1 год (path=/ чтобы сервер читал при SSR layout)
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `admin-theme=${theme}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  const currentDark = isDark();

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-admin-outline-variant bg-admin-surface-low p-1 gap-1',
        className,
      )}
      role="group"
      aria-label="Переключатель темы"
    >
      {/* Light pill */}
      <button
        type="button"
        onClick={() => applyTheme('light')}
        aria-pressed={!currentDark}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
          !currentDark
            ? 'bg-admin-primary text-admin-on-primary'
            : 'text-admin-on-surface-variant hover:bg-admin-surface-high',
        )}
      >
        <Icon name="light_mode" className="text-base leading-none" />
        Light
      </button>

      {/* Dark pill */}
      <button
        type="button"
        onClick={() => applyTheme('dark')}
        aria-pressed={currentDark}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
          currentDark
            ? 'bg-admin-primary text-admin-on-primary'
            : 'text-admin-on-surface-variant hover:bg-admin-surface-high',
        )}
      >
        <Icon name="dark_mode" className="text-base leading-none" />
        Dark
      </button>
    </div>
  );
}
