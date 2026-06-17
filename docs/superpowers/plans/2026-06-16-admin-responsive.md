# Admin Responsive (mobile <768px) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the STRIDE admin panel usable on screens <768px — give it mobile navigation (sliding-pill bottom tab bar), turn the products table into stacked cards, and stop the product-edit variant rows from overflowing.

**Architecture:** Desktop layout is untouched (`md+` keeps the 280px sidebar). Below `md` we add a fixed bottom tab bar + a topbar avatar menu for secondary actions, swap the products `<table>` for a card list, and reflow the variant-editor rows via responsive `grid-template-areas`. All work is presentational — no schema, no server actions, no data changes.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind v3 (admin tokens via `admin-*` CSS vars, no `dark:` variants), Radix (`DropdownMenu`/`Switch`), Material Symbols icons via `<Icon>`, react-hook-form (form), Vitest + Testing Library (unit), Playwright (e2e, CI only).

**Design source of truth:** the approved prototypes in `ui-designe and prototypes/prototypes-admin/responsive/` — `sidebar-bottom-tabs.html`, `table-cards.html`, `form-size-cards.html`. Match their look/behaviour.

---

## Context the engineer needs (read before starting)

- **Read first:** `docs/admin-design-system.md` — token table (light+dark), component catalog, markup patterns. All new markup uses `admin-*` Tailwind classes; **never** `dark:` variants; Radix floating content **must** portal to `.admin-root` (already handled inside `DropdownMenu`/`Select`/`Dialog`).
- **Shell:** `components/admin/admin-shell.tsx` — the `<aside>` sidebar (`hidden md:flex` → the reason nav vanishes <768), the `<header>` topbar (`left-0 md:left-[280px]`), and the single scroller `<main className="md:ml-[280px] pt-16 h-screen overflow-y-auto …">`. `NAV_ITEMS` (5 entries) lives here today.
- **Theme toggle reference:** `components/admin/theme-toggle.tsx` — the sliding-pill mechanic we mirror for the tab bar (equal segments → `translateX(index*100%)`, no JS measurement).
- **Token already present:** `--pill-shadow` is defined in `app/globals.css` under `.admin-root` (light) and `.admin-root.dark` — use `shadow-[var(--pill-shadow)]`.
- **Tables that share the raw-`<table>` pattern** (for the optional rollout in Task 8): `app/(admin)/admin/catalog/products/_components/product-table.tsx` (this plan's target), plus orders / customers / marketing(coupons) / categories list tables.
- **Verification reality (project constraint):** do **not** run Prisma/seed/e2e locally on Windows against Neon (hangs). Admin pages need DB + auth, so they are verified on the **Vercel preview deploy**, not locally. Local gates here are `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`. Responsive/visual correctness is confirmed on preview at 375px (and against the prototypes).
- **Commit/PR conventions:** English commit messages, single author `ui-ux-promax`, **no** `Co-Authored-By` trailer. Work on a new branch off `main`.

---

## File Structure

**Create**
- `lib/admin/nav.ts` — shared admin nav config (`ADMIN_NAV`) + pure `resolveActiveIndex(pathname)`. One responsibility: nav source of truth + active-item logic. Imported by sidebar, tab bar, and the unit test.
- `lib/admin/__tests__/nav.test.ts` — Vitest unit tests for `resolveActiveIndex`.
- `components/admin/admin-tab-bar.tsx` — mobile bottom tab bar (sliding-pill), `md:hidden`.
- `components/admin/admin-mobile-menu.tsx` — topbar avatar `DropdownMenu` (secondary actions: theme, help, settings, profile, logout), `md:hidden`.

**Modify**
- `components/admin/admin-shell.tsx` — import `ADMIN_NAV` from `lib/admin/nav.ts`; add mobile brand + `<AdminMobileMenu>` to the topbar; mount `<AdminTabBar>`; add mobile bottom padding to `<main>`.
- `app/(admin)/admin/catalog/products/_components/product-table.tsx` — table `hidden md:block`; add `md:hidden` card list; price cell `whitespace-nowrap`.
- `app/(admin)/admin/catalog/products/_components/variant-matrix.tsx` — responsive variant row (cards <md / grid `md+`) via `grid-template-areas`; bulk controls wrap.
- `app/(admin)/admin/catalog/products/_components/product-form.tsx` — scalar grid `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.
- `app/(admin)/admin/catalog/products/_components/colorway-card.tsx` — colorway grid `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`.

---

## Task 0: Branch

- [ ] **Step 1: Create branch off main**

```bash
cd stride-app
git fetch origin
git checkout main && git pull
git checkout -b feat/admin-responsive
```

---

## Task 1: Shared nav config + active-tab resolver (TDD)

**Files:**
- Create: `stride-app/lib/admin/nav.ts`
- Test: `stride-app/lib/admin/__tests__/nav.test.ts`

- [ ] **Step 1: Write the failing test**

`stride-app/lib/admin/__tests__/nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ADMIN_NAV, resolveActiveIndex } from '../nav';

describe('ADMIN_NAV', () => {
  it('has the 5 primary sections in order', () => {
    expect(ADMIN_NAV.map((n) => n.href)).toEqual([
      '/admin',
      '/admin/catalog',
      '/admin/orders',
      '/admin/customers',
      '/admin/marketing',
    ]);
  });
});

describe('resolveActiveIndex', () => {
  it('matches the dashboard only on exact path', () => {
    expect(resolveActiveIndex('/admin')).toBe(0);
  });
  it('does not match dashboard for deeper paths', () => {
    expect(resolveActiveIndex('/admin/catalog')).toBe(1);
    expect(resolveActiveIndex('/admin/catalog/products')).toBe(1);
    expect(resolveActiveIndex('/admin/catalog/products/abc/edit')).toBe(1);
  });
  it('matches orders / customers / marketing by prefix', () => {
    expect(resolveActiveIndex('/admin/orders/123')).toBe(2);
    expect(resolveActiveIndex('/admin/customers')).toBe(3);
    expect(resolveActiveIndex('/admin/marketing/new')).toBe(4);
  });
  it('returns -1 when nothing matches', () => {
    expect(resolveActiveIndex('/login')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd stride-app && npx vitest run lib/admin/__tests__/nav.test.ts`
Expected: FAIL — `Cannot find module '../nav'`.

- [ ] **Step 3: Implement `lib/admin/nav.ts`**

```ts
export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;   // Material Symbols name
  exact: boolean; // exact match (dashboard) vs prefix match
}

/** Single source of truth for primary admin navigation (sidebar + mobile tab bar). */
export const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Дашборд',   href: '/admin',           icon: 'dashboard',     exact: true },
  { label: 'Каталог',   href: '/admin/catalog',   icon: 'inventory_2',   exact: false },
  { label: 'Заказы',    href: '/admin/orders',    icon: 'shopping_cart', exact: false },
  { label: 'Клиенты',   href: '/admin/customers', icon: 'group',         exact: false },
  { label: 'Маркетинг', href: '/admin/marketing', icon: 'campaign',      exact: false },
];

/** True if a nav item is the active route for `pathname`. */
export function isNavActive(item: AdminNavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
}

/** Index of the active ADMIN_NAV item, or -1 if none match. */
export function resolveActiveIndex(pathname: string): number {
  return ADMIN_NAV.findIndex((item) => isNavActive(item, pathname));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd stride-app && npx vitest run lib/admin/__tests__/nav.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/admin/nav.ts stride-app/lib/admin/__tests__/nav.test.ts
git commit -m "feat(admin): extract shared nav config + active-index resolver"
```

---

## Task 2: AdminTabBar component (mobile sliding-pill)

**Files:**
- Create: `stride-app/components/admin/admin-tab-bar.tsx`

- [ ] **Step 1: Implement the component**

`stride-app/components/admin/admin-tab-bar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/admin/icon';
import { ADMIN_NAV, resolveActiveIndex } from '@/lib/admin/nav';

/**
 * Мобильный нижний таб-бар (5 разделов). Виден только <md (десктоп — сайдбар).
 * Активный таб подсвечивается скользящей лайм-пилюлей — механика тоггла темы:
 * 5 равных сегментов → пилюля шириной 1/5 двигается translateX(index*100%),
 * без JS-замеров. Позиция берётся из usePathname через resolveActiveIndex.
 */
export function AdminTabBar() {
  const pathname = usePathname();
  const active = resolveActiveIndex(pathname);

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-admin-surface border-t border-admin-outline-variant',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative flex items-stretch h-16 p-1.5 isolate">
        {/* Скользящая лайм-пилюля (декоративная) */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 z-0 w-[calc((100%-0.75rem)/5)] rounded-full',
            'bg-admin-primary shadow-[var(--pill-shadow)]',
            'transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)]',
            active < 0 && 'opacity-0',
          )}
          style={{ transform: `translateX(${Math.max(active, 0) * 100}%)` }}
        />

        {ADMIN_NAV.map((item, i) => {
          const isActive = i === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-10 flex-1 flex items-center justify-center min-h-[44px] rounded-full',
                'transition-colors duration-200',
                isActive ? 'text-admin-on-primary' : 'text-admin-on-surface-variant',
              )}
            >
              <Icon name={item.icon} filled={isActive} className="text-[26px]" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add stride-app/components/admin/admin-tab-bar.tsx
git commit -m "feat(admin): mobile bottom tab bar with sliding-pill indicator"
```

> Visual verification of the slide/colours happens on the preview deploy (Task 7); it already matches the approved `sidebar-bottom-tabs.html` prototype, which was browser-verified.

---

## Task 3: AdminMobileMenu (topbar avatar → secondary actions)

**Files:**
- Create: `stride-app/components/admin/admin-mobile-menu.tsx`

Secondary actions that live in the desktop sidebar footer (theme, Помощь, Настройки, profile, logout) must stay reachable on mobile. Put them behind an avatar button in the topbar.

- [ ] **Step 1: Implement the component**

`stride-app/components/admin/admin-mobile-menu.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add stride-app/components/admin/admin-mobile-menu.tsx
git commit -m "feat(admin): topbar avatar menu for secondary actions on mobile"
```

---

## Task 4: Wire tab bar + mobile topbar into AdminShell

**Files:**
- Modify: `stride-app/components/admin/admin-shell.tsx`

- [ ] **Step 1: Replace the local `NAV_ITEMS` with the shared config**

At the top of `admin-shell.tsx`, add imports:

```tsx
import { ADMIN_NAV, isNavActive } from '@/lib/admin/nav';
import { AdminTabBar } from '@/components/admin/admin-tab-bar';
import { AdminMobileMenu } from '@/components/admin/admin-mobile-menu';
```

Delete the local `const NAV_ITEMS = [...]` block (lines ~24-30). In the sidebar `<nav>`, change the map source and active check:

```tsx
{ADMIN_NAV.map((item) => {
  const active = isNavActive(item, pathname);
  return (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150',
        active
          ? 'bg-admin-primary text-admin-on-primary font-bold'
          : 'text-admin-on-surface-variant hover:bg-admin-surface-high hover:text-admin-on-surface',
      )}
    >
      <Icon name={item.icon} filled={active} />
      <span>{item.label}</span>
    </Link>
  );
})}
```

The existing local `isActive` helper (lines ~55-56) is now unused — remove it.

- [ ] **Step 2: Add the mobile brand + avatar menu to the topbar**

In the `<header>`, the search wrapper currently fills the row. Add a `md:hidden` brand to its left and the avatar menu to its right. Replace the header inner contents:

```tsx
{/* Бренд — только мобильный (на десктопе бренд в сайдбаре) */}
<div className="md:hidden flex items-center gap-2 shrink-0">
  <div className="w-9 h-9 bg-admin-primary rounded-xl flex items-center justify-center">
    <Icon name="bolt" filled className="text-admin-on-primary" />
  </div>
</div>

{/* Поиск-заглушка */}
<div className="relative flex-1 max-w-xl">
  <Icon
    name="search"
    className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-on-surface-variant text-[20px]"
  />
  <input
    type="text"
    placeholder="Поиск заказов, клиентов, товаров…"
    readOnly
    className={cn(
      'w-full pl-10 pr-4 py-2 rounded-full text-sm',
      'bg-admin-surface-container border-none',
      'text-admin-on-surface placeholder:text-admin-on-surface-variant',
      'focus:outline-none focus:ring-2 focus:ring-admin-primary',
      'cursor-default',
    )}
  />
</div>

{/* Аватар-меню — только мобильный */}
<AdminMobileMenu user={user} initialTheme={initialTheme} />
```

Also change the `<header>` outer classes so it lays children in a row with gaps: ensure it has `gap-3` (it already has `flex items-center justify-between px-8`; change `justify-between` → `gap-4` and keep `px-8`, so brand/search/avatar sit left-to-right). Final header className:

```tsx
className={cn(
  'fixed top-0 right-0 h-16 z-30',
  'flex items-center gap-4 px-4 md:px-8',
  'bg-admin-surface/80 backdrop-blur border-b border-admin-outline-variant',
  'left-0 md:left-[280px]',
)}
```

- [ ] **Step 3: Mount the tab bar and add mobile bottom padding to main**

Change the `<main>` inner container padding so content clears the fixed tab bar, and render `<AdminTabBar/>` after `</main>`:

```tsx
<main className="md:ml-[280px] pt-16 h-screen overflow-y-auto overscroll-contain bg-admin-bg [scrollbar-gutter:stable]">
  <div className="max-w-[1440px] mx-auto p-4 sm:p-8 pb-28 md:pb-8">
    <ContentReadyGate>{children}</ContentReadyGate>
  </div>
</main>
<AdminTabBar />
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `cd stride-app && npm run typecheck && npm run lint && npm run build`
Expected: all PASS (build compiles).

- [ ] **Step 5: Commit**

```bash
git add stride-app/components/admin/admin-shell.tsx
git commit -m "feat(admin): mount mobile tab bar + topbar avatar menu, share nav config"
```

---

## Task 5: Products table → responsive cards (<md)

**Files:**
- Modify: `stride-app/app/(admin)/admin/catalog/products/_components/product-table.tsx`

Keep the desktop `<table>` for `md+`; render a card list for `<md`. Same data, no form state, so duplicating the row presentation is safe.

- [ ] **Step 1: Gate the existing table to desktop + harden the price cell**

Wrap the existing `<div className="overflow-x-auto">…</div>` (the table) with `hidden md:block`:

```tsx
<div className="hidden md:block overflow-x-auto">
  {/* …existing <table> unchanged… */}
</div>
```

In that table, change the price cell so it never wraps even when squeezed (line ~140):

```tsx
<td className="px-6 py-4 font-bold text-admin-on-surface tabular-nums whitespace-nowrap">{formatPrice(row.minPrice)}</td>
```

- [ ] **Step 2: Add the mobile card list directly after the table block**

```tsx
{/* Мобильная раскладка: карточки вместо таблицы (<md) */}
<div className="md:hidden divide-y divide-admin-outline-variant">
  {rows.map((row) => (
    <div key={row.id} className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-admin-surface-high border border-admin-outline-variant p-1 overflow-hidden flex items-center justify-center shrink-0">
          {row.coverImage ? (
            /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
            <img src={row.coverImage} alt="" className="object-contain w-full h-full" />
          ) : (
            <Icon name="image" className="text-admin-on-surface-variant" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={`/admin/catalog/products/${row.id}/edit`}
            className="font-bold text-admin-on-surface hover:underline block truncate"
          >
            {row.name}
          </a>
          <div className="text-xs text-admin-on-surface-variant truncate">
            {row.brand} · {row.categoryName}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Действия"
              className="shrink-0 p-2 -mr-1 rounded-full text-admin-on-surface-variant hover:bg-admin-surface-container transition-colors"
            >
              <Icon name="more_vert" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/admin/catalog/products/${row.id}/edit`)}>
              <Icon name="edit" className="text-[18px] mr-2" /> Изменить
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setToDelete(row)} className="text-admin-error focus:text-admin-error">
              <Icon name="delete" className="text-[18px] mr-2" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {/* Остаток */}
        {row.totalStock === 0 ? (
          <span className="flex items-center gap-1.5 text-sm font-bold text-admin-error">
            <span className="w-1.5 h-1.5 rounded-full bg-admin-error" /> Нет в наличии
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm">
            <span className={cn('w-1.5 h-1.5 rounded-full', row.totalStock <= LOW_STOCK ? 'bg-admin-on-secondary-container' : 'bg-admin-primary')} />
            <span className="font-bold text-admin-on-surface tabular-nums">{row.totalStock}</span>
            <span className="text-admin-on-surface-variant">в наличии</span>
          </span>
        )}

        {/* Цена */}
        <span className="font-bold text-admin-on-surface tabular-nums whitespace-nowrap">
          {formatPrice(row.minPrice)}
        </span>
      </div>

      <div className="mt-2">
        <StatusPill active={row.active} discountPct={row.discountPct} />
      </div>
    </div>
  ))}
</div>
```

This reuses `StatusPill`, `LOW_STOCK`, `cn`, `formatPrice`, `Icon`, `DropdownMenu*`, `router`, `setToDelete` — all already imported/defined in this file.

- [ ] **Step 3: Typecheck + lint**

Run: `cd stride-app && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/product-table.tsx
git commit -m "feat(admin): responsive card layout for products table on mobile"
```

---

## Task 6: Variant rows → responsive (cards <md / grid md+)

**Files:**
- Modify: `stride-app/app/(admin)/admin/catalog/products/_components/variant-matrix.tsx`

One markup, no duplicated inputs (avoids double `register`). The row container switches `grid-template-areas` at `md`; per-field labels show only on mobile; the active `Switch` + delete are wrapped in one `ctrl` cell.

- [ ] **Step 1: Make the bulk controls wrap**

Change the bulk row (line ~90) so it wraps on narrow screens:

```tsx
<div className="flex flex-wrap gap-2 items-center">
  <BulkInput label="Цена всем" onApply={bulkPrice} />
  <BulkInput label="Остаток всем" onApply={bulkStock} />
</div>
```

- [ ] **Step 2: Replace the variant row markup**

Replace the row `<div className="grid grid-cols-[60px_1fr_110px_110px_90px_auto_auto] gap-2 items-center">…</div>` (lines ~100-120) with:

```tsx
<div
  key={row.key}
  className={cn(
    'grid gap-2 rounded-xl border border-admin-outline-variant bg-admin-surface-low p-3',
    'grid-cols-2 [grid-template-areas:"size_ctrl"_"price_old"_"stock_sku"]',
    'md:rounded-none md:border-0 md:bg-transparent md:p-0 md:items-center',
    'md:grid-cols-[60px_1fr_110px_110px_90px_auto] md:[grid-template-areas:"size_sku_price_old_stock_ctrl"]',
  )}
>
  <span className="[grid-area:size] flex items-center font-bold text-admin-on-surface md:font-normal md:text-admin-on-surface-variant md:text-sm">
    {String(row.sizeEu)}
  </span>

  <Field area="sku" label="SKU">
    <Input placeholder="SKU" {...register(`${base}.${i}.sku`)} />
  </Field>
  <Field area="price" label="Цена">
    <Input type="number" placeholder="Цена" {...register(`${base}.${i}.price`, { valueAsNumber: true })} />
  </Field>
  <Field area="old" label="Старая цена">
    <Input type="number" placeholder="Старая цена" {...register(`${base}.${i}.compareAtPrice`, { setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v)) })} />
  </Field>
  <Field area="stock" label="Сток">
    <Input type="number" placeholder="Сток" {...register(`${base}.${i}.stock`, { valueAsNumber: true })} />
  </Field>

  <div className="[grid-area:ctrl] flex items-center justify-end gap-2 md:justify-start">
    <Switch
      checked={Boolean(watchedVariants[i]?.active ?? true)}
      onCheckedChange={(c) => setValue(`${base}.${i}.active`, c, { shouldDirty: true })}
    />
    <button
      type="button"
      aria-label="Удалить размер"
      disabled={locked}
      title={locked ? 'В заказах — только деактивация' : undefined}
      onClick={() => remove(i)}
      className="grid place-items-center w-9 h-9 text-admin-on-surface-variant hover:text-admin-error disabled:opacity-30"
    >
      <Icon name="delete" />
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add the local `Field` helper at the bottom of the file**

```tsx
function Field({ area, label, children }: { area: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0" style={{ gridArea: area }}>
      <label className="md:hidden block text-[11px] font-medium text-admin-on-surface-variant mb-1">{label}</label>
      {children}
    </div>
  );
}
```

> Note: `[grid-area:size]`/`[grid-area:ctrl]` use Tailwind arbitrary properties; the `Field` helper uses inline `gridArea` because the area name is dynamic. Both resolve to the same CSS `grid-area`. `_` in the `[grid-template-areas:…]` arbitrary value is Tailwind's space escape → renders `"size ctrl" "price old" "stock sku"`.

- [ ] **Step 4: Typecheck + lint + build**

Run: `cd stride-app && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/variant-matrix.tsx
git commit -m "feat(admin): responsive variant rows (size cards on mobile, grid on desktop)"
```

---

## Task 7: Collapse scalar form grids on mobile + full verify

**Files:**
- Modify: `stride-app/app/(admin)/admin/catalog/products/_components/product-form.tsx`
- Modify: `stride-app/app/(admin)/admin/catalog/products/_components/colorway-card.tsx`

- [ ] **Step 1: product-form scalar grid**

Change line ~85 `<div className="grid grid-cols-2 gap-4">` → :

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

- [ ] **Step 2: colorway-card name/slug/hex grid**

Change line ~49 `<div className="grid grid-cols-3 gap-3">` → :

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```

- [ ] **Step 3: Full local verification**

Run: `cd stride-app && npm run typecheck && npm run lint && npm run build && npm test`
Expected: typecheck/lint/build PASS; `npm test` PASS including the new `nav.test.ts` (5) and no regressions in the existing suite.

- [ ] **Step 4: Commit + push**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/product-form.tsx \
        stride-app/app/\(admin\)/admin/catalog/products/_components/colorway-card.tsx
git commit -m "feat(admin): collapse product/colorway form grids to single column on mobile"
git push -u origin feat/admin-responsive
```

- [ ] **Step 5: Verify on preview (manual)**

On the Vercel preview deploy for this branch, at 375px width (DevTools device toolbar), confirm:
- Sidebar hidden; bottom tab bar visible; the lime pill sits centered under the active section and **slides** when switching; avatar menu opens (theme toggle works, logout works); content isn't hidden behind the bar.
- `/admin/catalog/products`: no horizontal scroll; product cards stack; **price never wraps** (`12 990 ₽` stays one line); status pills/stock dots render in light + dark.
- `/admin/catalog/products/<id>/edit`: variant rows are stacked size-cards (size + toggle + delete in the header, all on-screen, ≥44px); labeled 2-col inputs; bulk controls wrap; scalar fields are single-column. Desktop (≥768px) is unchanged from before.

---

## Task 8 (optional, gate before starting): roll out card layout to the other admin tables

The other admin list tables share the same raw-`<table>` + `overflow-x-auto` pattern and the same mobile pain. Once products is approved on preview, replicate Task 5's `hidden md:block` table + `md:hidden` card list to each, mapping the key columns:

- **Orders** (`app/(admin)/admin/orders/_components/*`): № заказа + дата · клиент · сумма (`whitespace-nowrap`) · статус заказа + статус оплаты.
- **Customers** (`app/(admin)/admin/customers/_components/*`): имя + email · роль · заказы/сумма.
- **Marketing / coupons** (`app/(admin)/admin/marketing/_components/*`): код · скидка% · статус · срок.
- **Categories** (`app/(admin)/admin/catalog/categories/_components/*`): обложка + название · slug · порядок · действия.

Do this as a separate branch/PR if the diff is large. (Out of scope for the initial PR unless requested.)

---

## Self-Review notes

- **Spec coverage:** sidebar <768 → Tasks 1-4 (tab bar + mobile menu); table price wrap + scroll → Task 5 (`whitespace-nowrap` + cards); variant-row overflow → Task 6; cramped scalar grids → Task 7. All three reported problems covered.
- **Type consistency:** `ADMIN_NAV`/`isNavActive`/`resolveActiveIndex` defined in Task 1 and consumed identically in Tasks 2 & 4. `AdminTabBar`/`AdminMobileMenu` names match their imports in Task 4. `Field` helper used in Task 6 is defined in the same task.
- **No double `register`:** Task 6 keeps a single set of inputs; only the layout reflows.
- **Project constraints honoured:** no DB/e2e locally; English commits; single author; branch off main.
