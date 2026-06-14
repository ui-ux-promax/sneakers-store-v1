# Phase 3.5 Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Customers section — paginated user list with search/role-filter/server-sort, a customer detail page (profile + metrics + order history + cart), and an `ADMIN↔CUSTOMER` role toggle with self/last-admin guards.

**Architecture:** Mirror the Phase 3.4 orders-admin pattern (`page.tsx` RSC → `_components/*` client islands → `app/actions/admin/*` server action → `services/dto/*` zod → `lib/*-admin.ts` pure helpers). List sort-by-spend needs a `SUM(Order.totalAmount)` over a relation, which Prisma `orderBy` cannot express, so the list uses a single parameterized `$queryRaw` (values as placeholders, `ORDER BY` from a whitelist via `Prisma.raw`). Detail uses ordinary Prisma `aggregate/count/findUnique/findMany`. **Schema is not touched** — no `prisma db push`, no Neon migration.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma 6 + Neon WebSocket adapter, zod, vitest (node-only), Tailwind admin tokens, Radix UI primitives.

**Spec:** `docs/superpowers/specs/2026-06-14-stride-phase3.5-customers-design.md`

**Conventions:**
- All `npm`/`npx` commands run from `stride-app/`.
- Tests are node-only vitest. Run a single file: `npx vitest run tests/<file>.test.ts`. Typecheck: `npx tsc --noEmit`.
- Commit messages: English, no `Co-Authored-By` (per project convention). Author is the only committer.
- Do NOT run `prisma db push`/`seed`/e2e locally (Neon hangs on Windows) — schema is untouched here anyway.

**Files created/modified:**
- Create `stride-app/lib/customer-admin.ts` — pure helpers (role view, sort whitelist, ILIKE escape, role-change guard).
- Modify `stride-app/lib/format.ts` — add `formatDate` (date-only MSK) for birthdate.
- Create `stride-app/services/dto/customer-admin.dto.ts` — `roleChangeSchema`.
- Create `stride-app/app/actions/admin/customers.ts` — `changeUserRole` server action.
- Create `stride-app/app/(admin)/admin/customers/_components/customer-table.tsx` — client table + pagination, exports `CustomerRow`.
- Create `stride-app/app/(admin)/admin/customers/_components/customer-filters.tsx` — client filter bar.
- Create `stride-app/app/(admin)/admin/customers/_components/role-toggle.tsx` — client role-toggle island.
- Modify `stride-app/app/(admin)/admin/customers/page.tsx` — replace stub with RSC list (raw query).
- Create `stride-app/app/(admin)/admin/customers/[id]/page.tsx` — RSC detail page.
- Create tests: `tests/customer-admin.test.ts`, `tests/admin-customers-action.test.ts`; modify `tests/format.test.ts`.
- Sidebar nav already has "Customers" (`components/admin/admin-shell.tsx`) — **no change**.

---

## Task 1: Pure helpers — `lib/customer-admin.ts`

**Files:**
- Create: `stride-app/lib/customer-admin.ts`
- Test: `stride-app/tests/customer-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/customer-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ROLE_FILTER_VALUES,
  CUSTOMER_SORT_VALUES,
  roleView,
  buildCustomerOrderByClause,
  escapeLike,
  roleChangeGuard,
} from '@/lib/customer-admin';

describe('customer-admin helpers', () => {
  it('value tuples expose the expected members', () => {
    expect(ROLE_FILTER_VALUES).toEqual(['ADMIN', 'CUSTOMER']);
    expect(CUSTOMER_SORT_VALUES).toEqual(['registered', 'orders', 'spent']);
  });

  it('roleView maps both roles to a label + badge class', () => {
    expect(roleView('ADMIN').label).toMatch(/админ/i);
    expect(roleView('ADMIN').badge).toContain('badge-info');
    expect(roleView('CUSTOMER').label).toMatch(/клиент/i);
    expect(roleView('CUSTOMER').badge).toContain('badge-success');
  });

  it('buildCustomerOrderByClause whitelists sort, defaults to registered', () => {
    expect(buildCustomerOrderByClause('orders')).toBe('order_count DESC, u."createdAt" DESC');
    expect(buildCustomerOrderByClause('spent')).toBe('total_spent DESC, u."createdAt" DESC');
    expect(buildCustomerOrderByClause('registered')).toBe('u."createdAt" DESC');
    expect(buildCustomerOrderByClause(undefined)).toBe('u."createdAt" DESC');
    // anything off-whitelist falls back to the default
    expect(buildCustomerOrderByClause('hacky; DROP TABLE' as never)).toBe('u."createdAt" DESC');
  });

  it('escapeLike neutralises ILIKE wildcards and backslash', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('plain')).toBe('plain');
  });

  describe('roleChangeGuard', () => {
    const base = { targetId: 't1', actingAdminId: 'admin1', adminCount: 3 };

    it('no-op when role unchanged', () => {
      expect(roleChangeGuard({ ...base, targetRole: 'ADMIN', requestedRole: 'ADMIN' }).ok).toBe(true);
    });

    it('promote CUSTOMER → ADMIN always allowed', () => {
      expect(
        roleChangeGuard({ ...base, adminCount: 0, targetRole: 'CUSTOMER', requestedRole: 'ADMIN' }).ok,
      ).toBe(true);
    });

    it('blocks demoting yourself', () => {
      const r = roleChangeGuard({
        targetId: 'admin1',
        actingAdminId: 'admin1',
        adminCount: 5,
        targetRole: 'ADMIN',
        requestedRole: 'CUSTOMER',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/себя/i);
    });

    it('blocks demoting the last admin', () => {
      const r = roleChangeGuard({
        targetId: 't1',
        actingAdminId: 'admin1',
        adminCount: 1,
        targetRole: 'ADMIN',
        requestedRole: 'CUSTOMER',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/последнего/i);
    });

    it('allows demoting another admin when others remain', () => {
      expect(
        roleChangeGuard({ ...base, adminCount: 2, targetRole: 'ADMIN', requestedRole: 'CUSTOMER' }).ok,
      ).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/customer-admin.test.ts`
Expected: FAIL — `Cannot find module '@/lib/customer-admin'`.

- [ ] **Step 3: Write the implementation**

Create `stride-app/lib/customer-admin.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/customer-admin.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/customer-admin.ts stride-app/tests/customer-admin.test.ts
git commit -m "feat(customers): pure admin helpers (role view, sort whitelist, role-change guard)"
```

---

## Task 2: Date-only formatter — `lib/format.ts`

**Files:**
- Modify: `stride-app/lib/format.ts`
- Test: `stride-app/tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `stride-app/tests/format.test.ts` (inside the file, add a new `describe` block; do not duplicate existing imports — reuse the existing `import { ... } from '@/lib/format'` line by adding `formatDate` to it):

```ts
import { describe, it, expect } from 'vitest';
import { formatDate } from '@/lib/format';

describe('formatDate', () => {
  it('renders date-only in MSK as dd.mm.yyyy', () => {
    // 2026-06-14T20:00:00Z → 14.06.2026 в МСК (UTC+3)
    expect(formatDate(new Date('2026-06-14T20:00:00.000Z'))).toBe('14.06.2026');
  });

  it('rolls to next day when UTC time crosses midnight MSK', () => {
    // 2026-06-14T22:30:00Z → 15.06.2026 в МСК
    expect(formatDate(new Date('2026-06-14T22:30:00.000Z'))).toBe('15.06.2026');
  });
});
```

> If `tests/format.test.ts` already imports from `@/lib/format`, merge `formatDate` into that import and drop the extra import line above to avoid a duplicate-import lint/TS error.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `formatDate is not a function` / no export named `formatDate`.

- [ ] **Step 3: Write the implementation**

In `stride-app/lib/format.ts`, append after `formatDateTime`:

```ts
// Только дата в МСК: '14.06.2026'. Для дня рождения и т.п. (без времени).
const DATE_ONLY = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

export function formatDate(date: Date): string {
  return DATE_ONLY.format(date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/format.ts stride-app/tests/format.test.ts
git commit -m "feat(format): add date-only MSK formatter"
```

---

## Task 3: DTO + server action — `changeUserRole`

**Files:**
- Create: `stride-app/services/dto/customer-admin.dto.ts`
- Create: `stride-app/app/actions/admin/customers.ts`
- Test: `stride-app/tests/admin-customers-action.test.ts`

- [ ] **Step 1: Write the DTO**

Create `stride-app/services/dto/customer-admin.dto.ts`:

```ts
import { z } from 'zod';

// Передаём ЦЕЛЕВУЮ роль (не «toggle») — action сверит её с текущей и применит guarded-переход,
// что устраняет гонку «состояние на клиенте устарело».
export const roleChangeSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['ADMIN', 'CUSTOMER']),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
```

- [ ] **Step 2: Write the failing test**

Create `stride-app/tests/admin-customers-action.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    user: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  };
  return { prisma };
});

import { changeUserRole } from '@/app/actions/admin/customers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  p.user.updateMany.mockResolvedValue({ count: 1 });
  p.user.count.mockResolvedValue(3);
});

describe('changeUserRole', () => {
  it('promotes CUSTOMER → ADMIN via guarded updateMany', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u2', role: 'CUSTOMER' },
      data: { role: 'ADMIN' },
    });
  });

  it('blocks demoting yourself, no write', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const r = await changeUserRole({ userId: 'admin1', role: 'CUSTOMER' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/себя/i);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('blocks demoting the last admin, no write', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    p.user.count.mockResolvedValue(1);
    const r = await changeUserRole({ userId: 'u2', role: 'CUSTOMER' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/последнего/i);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('demotes another admin when others remain', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    p.user.count.mockResolvedValue(2);
    const r = await changeUserRole({ userId: 'u2', role: 'CUSTOMER' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u2', role: 'ADMIN' },
      data: { role: 'CUSTOMER' },
    });
  });

  it('no-op when role already matches (no write, ok)', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(true);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('guarded race (count:0) → asks to refresh', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    p.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/обновите/i);
  });

  it('user not found → error, no write', async () => {
    p.user.findUnique.mockResolvedValue(null);
    const r = await changeUserRole({ userId: 'uX', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it('non-admin → error, no prisma touch', async () => {
    authMock.mockResolvedValue({ user: { id: 'u9', role: 'CUSTOMER' } });
    const r = await changeUserRole({ userId: 'u2', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  it('bad input (zod) → error, no prisma touch', async () => {
    const r = await changeUserRole({ userId: '', role: 'SUPERUSER' });
    expect(r.ok).toBe(false);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/admin-customers-action.test.ts`
Expected: FAIL — `Cannot find module '@/app/actions/admin/customers'`.

- [ ] **Step 4: Write the implementation**

Create `stride-app/app/actions/admin/customers.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { roleChangeSchema } from '@/services/dto/customer-admin.dto';
import { roleChangeGuard } from '@/lib/customer-admin';

export type RoleActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/customers';

// Смена роли пользователя. Единственная мутация раздела Customers. Guard «себя + последний админ»
// (чистый, в lib) + guarded updateMany (one-shot против гонки, как в orders 3.4). Схему не трогаем.
export async function changeUserRole(input: unknown): Promise<RoleActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Некорректные данные' };
  const { userId, role } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return { ok: false, error: 'Пользователь не найден' };

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

  const guard = roleChangeGuard({
    targetId: userId,
    targetRole: target.role,
    requestedRole: role,
    actingAdminId: gate.session.user.id,
    adminCount,
  });
  if (!guard.ok) return { ok: false, error: guard.error };

  if (target.role === role) return { ok: true }; // no-op, без записи

  // Guarded one-shot: пишем только если роль в БД всё ещё та, что видел админ.
  const res = await prisma.user.updateMany({
    where: { id: userId, role: target.role },
    data: { role },
  });
  if (res.count === 0) return { ok: false, error: 'Роль изменилась, обновите страницу' };

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${userId}`);
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/admin-customers-action.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add stride-app/services/dto/customer-admin.dto.ts stride-app/app/actions/admin/customers.ts stride-app/tests/admin-customers-action.test.ts
git commit -m "feat(customers): changeUserRole server action with self/last-admin guards"
```

---

## Task 4: List table — `_components/customer-table.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/customers/_components/customer-table.tsx`

No unit test (client UI; verified on Vercel preview). This component is presentational and defines the `CustomerRow` type consumed by the page.

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/customers/_components/customer-table.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/admin/icon';
import { formatPrice, formatDateTime } from '@/lib/format';
import { roleView } from '@/lib/customer-admin';

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  orderCount: number;
  totalSpent: number;
  createdAt: Date;
}

export interface CustomerTableProps {
  rows: CustomerRow[];
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

export function CustomerTable({ rows, page, totalPages, total, limit }: CustomerTableProps) {
  const router = useRouter();
  const params = useSearchParams();

  function goPage(n: number) {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(n));
    router.push(`/admin/customers?${next.toString()}`);
  }

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-admin-surface-high">
            <tr>
              {['Клиент', 'Роль', 'Заказов', 'Потрачено', 'Регистрация'].map((h) => (
                <th key={h} className="px-6 py-4 text-[12px] font-semibold uppercase tracking-widest text-admin-on-surface-variant">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-outline-variant">
            {rows.map((row) => {
              const rv = roleView(row.role);
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/admin/customers/${row.id}`)}
                  className="group hover:bg-admin-surface-high transition-colors cursor-pointer"
                >
                  {/* Клиент */}
                  <td className="px-6 py-4">
                    <a
                      href={`/admin/customers/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-admin-on-surface hover:underline"
                    >
                      {row.name?.trim() || 'Без имени'}
                    </a>
                    <div className="text-xs text-admin-on-surface-variant truncate max-w-[240px]">{row.email}</div>
                  </td>
                  {/* Роль */}
                  <td className="px-6 py-4">
                    <span className={rv.badge}>{rv.label}</span>
                  </td>
                  {/* Заказов */}
                  <td className="px-6 py-4 text-admin-on-surface tabular-nums">{row.orderCount}</td>
                  {/* Потрачено */}
                  <td className="px-6 py-4 font-bold text-admin-on-surface tabular-nums">{formatPrice(row.totalSpent)}</td>
                  {/* Регистрация */}
                  <td className="px-6 py-4 text-admin-on-surface-variant text-sm tabular-nums">{formatDateTime(row.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      <div className="px-6 py-4 border-t border-admin-outline-variant flex items-center justify-between">
        <p className="text-xs text-admin-on-surface-variant">
          Показано {from}–{to} из {total}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <PagerBtn disabled={page <= 1} onClick={() => goPage(page - 1)} icon="chevron_left" />
            {pageItems(page, totalPages).map((it, i) =>
              it === '…' ? (
                <span key={`e${i}`} className="text-admin-on-surface-variant mx-1">…</span>
              ) : (
                <button
                  key={it}
                  type="button"
                  onClick={() => goPage(it)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg font-bold transition-colors',
                    it === page
                      ? 'bg-admin-primary text-admin-on-primary'
                      : 'text-admin-on-surface-variant hover:bg-admin-surface-high',
                  )}
                >
                  {it}
                </button>
              ),
            )}
            <PagerBtn disabled={page >= totalPages} onClick={() => goPage(page + 1)} icon="chevron_right" />
          </div>
        )}
      </div>
    </div>
  );
}

function PagerBtn({ disabled, onClick, icon }: { disabled: boolean; onClick: () => void; icon: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-admin-outline-variant text-admin-on-surface-variant hover:bg-admin-surface-high transition-colors disabled:opacity-30"
    >
      <Icon name={icon} />
    </button>
  );
}

// 1 … c-1 c c+1 … last
function pageItems(current: number, totalPages: number): (number | '…')[] {
  const set = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). Unused-import errors here would mean a typo — fix before committing.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/customers/_components/customer-table.tsx"
git commit -m "feat(customers): list table component with pagination"
```

---

## Task 5: Filter bar — `_components/customer-filters.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/customers/_components/customer-filters.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/customers/_components/customer-filters.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

const ROLES = [
  { value: '__all__', label: 'Все роли' },
  { value: 'ADMIN', label: 'Администраторы' },
  { value: 'CUSTOMER', label: 'Клиенты' },
];
const SORTS = [
  { value: 'registered', label: 'По дате регистрации' },
  { value: 'orders', label: 'По числу заказов' },
  { value: 'spent', label: 'По сумме трат' },
];
const ALL = '__all__';

// Триггер селекта в стиле прототипа: пилюля (rounded-full), увеличенный паддинг.
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function CustomerFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete('page'); // сбрасываем пагинацию при смене фильтра
    router.push(`/admin/customers?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="relative">
        <Icon
          name="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-on-surface-variant text-[20px] pointer-events-none"
        />
        <Input
          className="pl-10 pr-4 rounded-full py-2.5 h-auto"
          placeholder="Поиск: имя / email / телефон…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('role') ?? ALL} onValueChange={(v) => setParam('role', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все роли" /></SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.get('sort') ?? 'registered'} onValueChange={(v) => setParam('sort', v === 'registered' ? undefined : v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="По дате регистрации" /></SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

> Note: sort defaults to `registered`; selecting it clears the `sort` param (keeps URLs clean), other values are set explicitly. Matches the `readEnumParam` default-to-undefined behaviour on the page.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/customers/_components/customer-filters.tsx"
git commit -m "feat(customers): list filter bar (search + role + sort)"
```

---

## Task 6: List page — `page.tsx` (raw query)

**Files:**
- Modify (replace stub): `stride-app/app/(admin)/admin/customers/page.tsx`

- [ ] **Step 1: Replace the stub**

Overwrite `stride-app/app/(admin)/admin/customers/page.tsx`:

```tsx
import type { UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { ROLE_FILTER_VALUES, CUSTOMER_SORT_VALUES, buildCustomerOrderByClause, escapeLike } from '@/lib/customer-admin';
import { CustomerFilters } from './_components/customer-filters';
import { CustomerTable, type CustomerRow } from './_components/customer-table';

export const metadata = { title: 'Клиенты' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

// Форма строки из raw-запроса. Алиасы snake_case как в SQL; ::int приводит COUNT/SUM к JS number.
type CustomerListRaw = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  order_count: number;
  total_spent: number;
  created_at: Date;
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const role = readEnumParam(sp, 'role', ROLE_FILTER_VALUES);
  const sort = readEnumParam(sp, 'sort', CUSTOMER_SORT_VALUES);

  // Фрагменты WHERE: значения через placeholders (инъекций нет). role сравниваем как text,
  // чтобы не кастовать параметр к enum-типу. Поиск — ILIKE по name/email/phone с экранированием.
  const roleCond = role ? Prisma.sql`AND u.role::text = ${role}` : Prisma.empty;
  const searchCond = q
    ? (() => {
        const pat = `%${escapeLike(q)}%`;
        return Prisma.sql`AND (u.name ILIKE ${pat} OR u.email ILIKE ${pat} OR u.phone ILIKE ${pat})`;
      })()
    : Prisma.empty;

  // ORDER BY — из whitelist (не из ввода) → безопасно через Prisma.raw.
  const orderBy = Prisma.raw(buildCustomerOrderByClause(sort));

  const [rowsRaw, totalRows] = await Promise.all([
    prisma.$queryRaw<CustomerListRaw[]>(Prisma.sql`
      SELECT u.id, u.name, u.email, u.role,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o."totalAmount") FILTER (WHERE o.status::text <> 'CANCELLED'), 0)::int AS total_spent,
             u."createdAt" AS created_at
      FROM "User" u
      LEFT JOIN "Order" o ON o."userId" = u.id
      WHERE 1=1 ${roleCond} ${searchCond}
      GROUP BY u.id
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${skip}
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM "User" u WHERE 1=1 ${roleCond} ${searchCond}
    `),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const meta = buildPaginationMeta({ page, limit }, total);

  const rows: CustomerRow[] = rowsRaw.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    orderCount: r.order_count,
    totalSpent: r.total_spent,
    createdAt: r.created_at,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Клиенты ({total})</h2>
        <p className="text-admin-on-surface-variant">База покупателей, история заказов и управление ролями.</p>
      </div>

      <CustomerFilters />

      {rows.length > 0 ? (
        <CustomerTable rows={rows} page={meta.page} totalPages={meta.totalPages} total={total} limit={limit} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Клиенты не найдены.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Watch for: `Prisma.sql`/`Prisma.raw`/`Prisma.empty` must come from `import { Prisma } from '@prisma/client'` (value import, not `import type`).

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/customers/page.tsx"
git commit -m "feat(customers): admin list page with search, role filter, server sort"
```

---

## Task 7: Role-toggle island — `_components/role-toggle.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/customers/_components/role-toggle.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/customers/_components/role-toggle.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/admin/ui/dialog';
import { changeUserRole } from '@/app/actions/admin/customers';

export function RoleToggle({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const target: UserRole = currentRole === 'ADMIN' ? 'CUSTOMER' : 'ADMIN';
  const promoting = target === 'ADMIN';

  async function handleConfirm() {
    setBusy(true);
    const res = await changeUserRole({ userId, role: target });
    setBusy(false);
    setConfirm(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div>
      <Button
        variant={promoting ? 'primary' : 'outline'}
        className="w-full"
        onClick={() => setConfirm(true)}
        disabled={busy}
      >
        <Icon name={promoting ? 'shield_person' : 'person_remove'} className="text-[18px]" />
        {promoting ? 'Назначить администратором' : 'Снять роль администратора'}
      </Button>

      {/* Подтверждение */}
      <Dialog open={confirm} onOpenChange={(open) => !open && setConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promoting ? 'Назначить администратором?' : 'Снять роль администратора?'}</DialogTitle>
            <DialogDescription>
              {promoting
                ? 'Пользователь получит полный доступ к админ-панели.'
                : 'Пользователь потеряет доступ к админ-панели и станет обычным клиентом.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
              Назад
            </Button>
            <Button variant={promoting ? 'primary' : 'danger'} onClick={handleConfirm} loading={busy}>
              {promoting ? 'Назначить' : 'Снять роль'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ошибка (в т.ч. текст guard: «себя» / «последнего администратора»). */}
      <Dialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Не удалось изменить роль</DialogTitle>
            <DialogDescription>{error}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setError(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/customers/_components/role-toggle.tsx"
git commit -m "feat(customers): role-toggle island with confirm + guard-error dialogs"
```

---

## Task 8: Detail page — `[id]/page.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/customers/[id]/page.tsx`

- [ ] **Step 1: Write the page**

Create `stride-app/app/(admin)/admin/customers/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma-client';
import { Icon } from '@/components/admin/icon';
import { formatPrice, formatDateTime, formatDate } from '@/lib/format';
import { orderStatusView } from '@/lib/order';
import { roleView } from '@/lib/customer-admin';
import { RoleToggle } from '../_components/role-toggle';

export const metadata = { title: 'Клиент' };
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 50;

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      phone: true,
      birthdate: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  const [orderCount, spentAgg, reviewAgg, wishlistCount, cartCount, subscriber, orders] = await Promise.all([
    prisma.order.count({ where: { userId: id } }),
    prisma.order.aggregate({ where: { userId: id, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
    prisma.review.aggregate({ where: { userId: id }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.wishlistItem.count({ where: { wishlist: { userId: id } } }),
    prisma.cartItem.count({ where: { cart: { userId: id } } }),
    prisma.subscriber.findUnique({ where: { email: user.email }, select: { unsubscribedAt: true } }),
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        payment: { select: { status: true } },
      },
    }),
  ]);

  const totalSpent = spentAgg._sum.totalAmount ?? 0;
  const reviewCount = reviewAgg._count._all;
  const avgRating = reviewAgg._avg.rating;
  const newsletterActive = !!subscriber && subscriber.unsubscribedAt === null;
  const rv = roleView(user.role);

  return (
    <div className="space-y-8">
      {/* Назад */}
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-admin-on-surface-variant hover:text-admin-on-surface"
      >
        <Icon name="arrow_back" className="text-[18px]" /> К клиентам
      </Link>

      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface">
          {user.name?.trim() || 'Без имени'}
        </h2>
        <span className={rv.badge}>{rv.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* История заказов */}
        <div className="lg:col-span-2 space-y-6">
          <Section title={`История заказов${orderCount > HISTORY_LIMIT ? ` (последние ${HISTORY_LIMIT} из ${orderCount})` : ''}`}>
            {orders.length === 0 ? (
              <p className="text-sm text-admin-on-surface-variant">Заказов нет.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[12px] uppercase tracking-widest text-admin-on-surface-variant">
                      <th className="px-2 py-2">Заказ</th>
                      <th className="px-2 py-2">Дата</th>
                      <th className="px-2 py-2">Статус</th>
                      <th className="px-2 py-2 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-outline-variant">
                    {orders.map((o) => {
                      const sv = orderStatusView(o.status, o.payment?.status);
                      return (
                        <tr key={o.id} className="hover:bg-admin-surface-high transition-colors">
                          <td className="px-2 py-3">
                            <Link
                              href={`/admin/orders/${o.id}`}
                              className="font-bold text-admin-on-surface hover:underline tabular-nums"
                            >
                              #{o.orderNumber}
                            </Link>
                          </td>
                          <td className="px-2 py-3 text-admin-on-surface-variant tabular-nums">{formatDateTime(o.createdAt)}</td>
                          <td className="px-2 py-3"><span className={sv.badge}>{sv.label}</span></td>
                          <td className="px-2 py-3 text-right font-bold text-admin-on-surface tabular-nums">{formatPrice(o.totalAmount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Боковая колонка */}
        <div className="space-y-6">
          <Section title="Профиль">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-admin-surface-high border border-admin-outline-variant overflow-hidden flex items-center justify-center shrink-0">
                {user.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- admin avatar */
                  <img src={user.image} alt="" className="object-cover w-full h-full" />
                ) : (
                  <Icon name="person" className="text-admin-on-surface-variant" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-admin-on-surface truncate">{user.email}</span>
                  <Icon
                    name={user.emailVerified ? 'verified' : 'gpp_maybe'}
                    className={user.emailVerified ? 'text-[16px] text-admin-primary' : 'text-[16px] text-admin-on-surface-variant'}
                  />
                </div>
                <div className="text-xs text-admin-on-surface-variant">
                  {user.emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
                </div>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Телефон" value={user.phone || '—'} />
              <Row label="Дата рождения" value={user.birthdate ? formatDate(user.birthdate) : '—'} />
              <Row label="Регистрация" value={formatDateTime(user.createdAt)} />
            </dl>
          </Section>

          <Section title="Сводка">
            <dl className="space-y-2 text-sm">
              <Row label="Заказов" value={String(orderCount)} />
              <Row label="Потрачено" value={formatPrice(totalSpent)} />
              <Row
                label="Отзывов"
                value={reviewCount > 0 && avgRating != null ? `${reviewCount} (★ ${avgRating.toFixed(1)})` : String(reviewCount)}
              />
              <Row label="В избранном" value={String(wishlistCount)} />
              <Row label="В корзине" value={String(cartCount)} />
              <Row label="Рассылка" value={newsletterActive ? 'Подписан' : 'Нет'} />
            </dl>
          </Section>

          <Section title="Роль">
            <RoleToggle userId={user.id} currentRole={user.role} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-admin-on-surface-variant shrink-0">{label}</dt>
      <dd className="text-admin-on-surface text-right break-words">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/customers/[id]/page.tsx"
git commit -m "feat(customers): detail page with profile, metrics, order history, role toggle"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all prior tests + the new `customer-admin` (helpers), `admin-customers-action` (8 cases), and `format` (formatDate) tests green.

- [ ] **Step 3: Confirm schema untouched (no migration risk)**

Run: `git diff --stat origin/main -- stride-app/prisma/schema.prisma`
Expected: NO output (schema unchanged). If anything appears, the change was unintended — revert it.

- [ ] **Step 4: Commit any remaining (should be clean)**

```bash
git status --short
```
Expected: clean working tree (everything already committed per task).

- [ ] **Step 5: Manual preview verification (post-push)**

After pushing the branch and opening a PR, on the Vercel preview verify:
- `/admin/customers` lists users; search by name/email/phone works; role filter narrows; each sort (registration / orders / spent) reorders correctly; pagination works at 20/page.
- Role badges render styled inside `.admin-root` (tokens resolve).
- Row click → `/admin/customers/[id]`.
- Detail: profile (avatar, email-verified icon, phone, birthdate, registration), summary (orders, spent, reviews+avg, wishlist, cart, newsletter), order history rows link to `/admin/orders/[id]`.
- Role toggle: promote a CUSTOMER → ADMIN (confirm dialog → success); try to demote yourself → guard error «себя»; with only one admin, try to demote them → guard error «последнего администратора».

---

## Self-Review (run by plan author)

**1. Spec coverage:**
- §3.1 role guard (self + last-admin) → Task 1 `roleChangeGuard` + Task 3 action. ✓
- §3.2 list search + role filter + server sort + pagination → Task 4/5/6. ✓
- §3.3 detail 4 blocks (profile, summary, history, cart) → Task 8. ✓
- §3.4 only role toggle, schema untouched → Task 3 (single mutation), Task 9 step 3 (schema-diff guard). ✓
- §4.2 raw query strategy (placeholders, whitelist ORDER BY, ::text role, ILIKE escape, ::int casts) → Task 6 + Task 1 (`buildCustomerOrderByClause`, `escapeLike`). ✓
- §4.3 helpers (ROLE_FILTER_VALUES, CUSTOMER_SORT_VALUES, roleView, buildCustomerOrderBy*, roleChangeGuard) → Task 1. ✓ (named `buildCustomerOrderByClause` returning a string + `Prisma.raw`, a refinement of the spec's `Prisma.Sql` idea for testability — documented in Architecture.)
- §4.4 DTO `roleChangeSchema` (target role) → Task 3. ✓
- §4.5 action `changeUserRole` (gate → zod → findUnique → count → guard → no-op → guarded updateMany → revalidate) → Task 3. ✓
- §4.6 list page wiring → Task 6. ✓
- §4.7 detail queries (count all / sum non-cancelled / review agg / wishlist / cart / subscriber / history take 50) → Task 8. Metrics consistent: `orderCount` = ALL, `totalSpent` = non-CANCELLED. ✓
- §4.8 RoleToggle island → Task 7. ✓
- §6 tests (customer-admin helpers, action 8 cases) → Task 1, Task 3. ✓
- Birthdate needs date-only formatting (not covered by `formatDateTime`) → Task 2 `formatDate`. ✓ (added improvement)

**2. Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". Every code step has complete code. ✓

**3. Type consistency:**
- `roleChangeGuard` signature identical in Task 1 (def), Task 3 (call). ✓
- `CustomerRow` defined in Task 4, imported in Task 6. Fields match the page's mapping (`name|null`, `role: UserRole`, `orderCount`, `totalSpent`, `createdAt: Date`). ✓
- `buildCustomerOrderByClause` / `escapeLike` / `ROLE_FILTER_VALUES` / `CUSTOMER_SORT_VALUES` names identical across Task 1, 5, 6. ✓
- `changeUserRole` name identical in Task 3 (def/test), Task 7 (call). ✓
- `RoleActionResult` / `roleChangeSchema` consistent. ✓
- `formatDate` def (Task 2) ↔ use (Task 8). ✓
```
