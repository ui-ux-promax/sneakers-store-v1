'use client';

import { signOut } from 'next-auth/react';
import { Icon } from '@/components/admin/icon';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/admin/ui/dropdown-menu';

interface AdminMobileMenuProps {
  user: { name?: string | null; email?: string | null; role: string; image?: string | null };
  initialTheme: 'light' | 'dark';
}

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Администратор', CUSTOMER: 'Клиент' };

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (email?.[0] ?? '?').toUpperCase();
}

/** Аватар в топбаре (только <md): тема + служебные ссылки + профиль + выход. */
export function AdminMobileMenu({ user, initialTheme }: AdminMobileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Меню профиля"
          className="md:hidden shrink-0 w-9 h-9 rounded-full bg-admin-primary text-admin-on-primary font-admin-head font-bold text-[13px] grid place-items-center"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(user.name, user.email)
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 normal-case tracking-normal">
          <span className="w-9 h-9 rounded-full bg-admin-primary text-admin-on-primary font-admin-head font-bold grid place-items-center">
            {getInitials(user.name, user.email)}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-admin-on-surface truncate">
              {user.name ?? user.email ?? 'Admin'}
            </span>
            <span className="block text-xs text-admin-on-surface-variant truncate">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </span>
        </DropdownMenuLabel>

        <div className="px-2 py-2">
          <p className="text-[10px] uppercase tracking-widest text-admin-on-surface-variant mb-2">Оформление</p>
          <ThemeToggle initialTheme={initialTheme} />
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Icon name="help" className="text-[18px]" /> Помощь
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Icon name="settings" className="text-[18px]" /> Настройки
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut({ callbackUrl: '/login' })}
          className="text-admin-error focus:text-admin-error"
        >
          <Icon name="logout" className="text-[18px]" /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
