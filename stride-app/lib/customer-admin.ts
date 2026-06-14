import type { UserRole } from '@prisma/client';

// Кортежи для readEnumParam (валидация URL-фильтров списка).
export const ROLE_FILTER_VALUES = ['ADMIN', 'CUSTOMER'] as const satisfies readonly UserRole[];
export const CUSTOMER_SORT_VALUES = ['registered', 'orders', 'spent'] as const;
export type CustomerSort = (typeof CUSTOMER_SORT_VALUES)[number];

// Бейдж/лейбл роли для списка и детали.
export function roleView(role: UserRole): { label: string; badge: string } {
  return role === 'ADMIN'
    ? { label: 'Администратор', badge: 'badge badge-info' }
    : { label: 'Клиент', badge: 'badge badge-success' };
}

// ORDER BY для raw-запроса списка. Возвращает строку ИЗ WHITELIST (не из ввода) — её безопасно
// вставлять через Prisma.raw. Неизвестное значение → дефолт (по дате регистрации).
export function buildCustomerOrderByClause(sort: CustomerSort | undefined): string {
  switch (sort) {
    case 'orders':
      return 'order_count DESC, u."createdAt" DESC';
    case 'spent':
      return 'total_spent DESC, u."createdAt" DESC';
    case 'registered':
    default:
      return 'u."createdAt" DESC';
  }
}

// Экранирование спецсимволов ILIKE (% _ \) перед подстановкой в паттерн '%q%'.
// Default-escape ILIKE в PostgreSQL — обратный слеш, поэтому именно его и удваиваем.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type RoleChangeGuardInput = {
  targetId: string;
  targetRole: UserRole;
  requestedRole: UserRole;
  actingAdminId: string;
  adminCount: number;
};

// Чистая защита смены роли (без БД). Понижение блокируется для себя и для последнего админа.
// Повышение и no-op всегда разрешены.
export function roleChangeGuard(
  i: RoleChangeGuardInput,
): { ok: true } | { ok: false; error: string } {
  if (i.targetRole === i.requestedRole) return { ok: true }; // нечего менять
  if (i.requestedRole === 'CUSTOMER') {
    if (i.targetId === i.actingAdminId) {
      return { ok: false, error: 'Нельзя снять роль администратора с самого себя' };
    }
    if (i.adminCount <= 1) {
      return { ok: false, error: 'Нельзя разжаловать последнего администратора' };
    }
  }
  return { ok: true };
}
