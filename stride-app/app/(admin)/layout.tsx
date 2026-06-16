/**
 * Layout для маршрутной группы (admin).
 * SERVER component — можно использовать async/await, cookies(), requireAdminPage().
 * Не содержит <html>/<body> — они принадлежат корневому layout.tsx.
 */

import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/admin/require-admin';
import { AdminShell } from '@/components/admin/admin-shell';
import { ScrollLock } from '@/components/admin/scroll-lock';
import { cn } from '@/lib/utils';

export const metadata = {
  title: {
    default: 'Админка · STRIDE',
    template: '%s · Админка',
  },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Гейт: перенаправляет не-админов до рендера — получаем сессию
  const session = await requireAdminPage();

  // Читаем cookie темы, установленную ThemeToggle на клиенте
  // В Next 15 cookies() — асинхронная функция
  const cookieStore = await cookies();
  const isDark = cookieStore.get('admin-theme')?.value === 'dark';

  return (
    <div className={cn('admin-root', isDark && 'dark', 'font-admin-body h-screen overflow-hidden')}>
      <ScrollLock />
      {/* Material Symbols icon font — нужен только в админке, поэтому здесь, а не в корне.
          display=block: пока шрифт не пришёл, глиф не рендерится текстом лигатуры
          (никаких «dashboard», «inventory_2» в сайдбаре) — «невидимый период» ~3s,
          который к тому же перекрыт скелетон-оверлеем сайдбара. preconnect ускоряет CDN. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
      />
      <AdminShell user={session.user} initialTheme={isDark ? 'dark' : 'light'}>
        {children}
      </AdminShell>
    </div>
  );
}
