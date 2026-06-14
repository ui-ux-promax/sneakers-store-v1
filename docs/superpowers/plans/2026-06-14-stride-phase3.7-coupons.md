# Phase 3.7 Coupons Admin CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin CRUD for percentage coupons over the existing `Coupon` model and `lib/coupon.ts`, with zero schema change and no checkout-path edits.

**Architecture:** Route-group `(admin)/admin/marketing` becomes the coupon list (replacing the stub) + `new` / `[id]/edit` pages. Server actions follow the `categories.ts` envelope pattern (`requireAdminAction` → zod → prisma → `revalidatePath`). A client-safe pure helper `lib/coupon-status.ts` derives the badge status (no prisma import). Validation reuses `normalizeCouponCode` from `lib/coupon.ts`.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma/Neon, react-hook-form + zod, Radix (Select/Switch via `components/admin/ui/*`), vitest (node-only).

**Spec:** `docs/superpowers/specs/2026-06-14-stride-phase3.7-coupons-design.md`

**Conventions:**
- All npm/git commands run from `stride-app/` unless noted; the repo root is the parent.
- Commits: English, conventional-commits, single author `ui-ux-promax`, NO `Co-Authored-By`.
- NEVER run `prisma db push` / `prisma db seed` / e2e locally (hangs on Neon). Local verification = `npx tsc --noEmit` + `npx vitest run` only.
- Branch `feat/phase3.7-coupons` already exists (off `main@c68ff89`). Do not create it again.
- Tests are TDD: write failing test → confirm fail → implement → confirm pass → commit.
- UI components (table/form/filters/pages) are NOT unit-tested (vitest is node-only) — verified by `tsc` + Vercel preview.

**Files created:**
- `stride-app/lib/coupon-status.ts`
- `stride-app/services/dto/coupon-admin.dto.ts`
- `stride-app/app/actions/admin/coupons.ts`
- `stride-app/app/(admin)/admin/marketing/new/page.tsx`
- `stride-app/app/(admin)/admin/marketing/[id]/edit/page.tsx`
- `stride-app/app/(admin)/admin/marketing/_components/coupon-form.tsx`
- `stride-app/app/(admin)/admin/marketing/_components/coupon-filters.tsx`
- `stride-app/app/(admin)/admin/marketing/_components/coupon-table.tsx`
- `stride-app/tests/coupon-status.test.ts`
- `stride-app/tests/admin-coupons-action.test.ts`

**Files modified:**
- `stride-app/app/(admin)/admin/marketing/page.tsx` (stub → coupon list)

**Not touched:** `prisma/schema.prisma`, `lib/coupon.ts`, checkout (`actions/order.ts`, `actions/coupon.ts`), `admin-shell.tsx` nav, `prisma/seed.ts`.

---

## Task 1: `couponStatus` pure helper

**Files:**
- Create: `stride-app/lib/coupon-status.ts`
- Test: `stride-app/tests/coupon-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/coupon-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { couponStatus } from '@/lib/coupon-status';

const NOW = new Date('2026-06-14T12:00:00.000Z');
const PAST = new Date('2020-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T23:59:59.999Z');

describe('couponStatus', () => {
  it('active: active + no expiry', () => {
    expect(couponStatus({ active: true, expiresAt: null }, NOW)).toBe('active');
  });
  it('active: active + future expiry', () => {
    expect(couponStatus({ active: true, expiresAt: FUTURE }, NOW)).toBe('active');
  });
  it('inactive: not active + no expiry', () => {
    expect(couponStatus({ active: false, expiresAt: null }, NOW)).toBe('inactive');
  });
  it('expired: past expiry overrides active', () => {
    expect(couponStatus({ active: true, expiresAt: PAST }, NOW)).toBe('expired');
  });
  it('expired: past expiry overrides inactive', () => {
    expect(couponStatus({ active: false, expiresAt: PAST }, NOW)).toBe('expired');
  });
  it('boundary: expiresAt exactly now is NOT expired', () => {
    expect(couponStatus({ active: true, expiresAt: new Date(NOW) }, NOW)).toBe('active');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `stride-app/`): `npx vitest run tests/coupon-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/coupon-status"` / `couponStatus is not a function`.

- [ ] **Step 3: Write the implementation**

Create `stride-app/lib/coupon-status.ts`:

```ts
// Client-safe (НЕ импортит prisma): используют и серверный фильтр, и клиентский бейдж.
// Прецедент разделения — lib/admin/analytics-config.ts (Phase 3.6).
export type CouponStatus = 'active' | 'inactive' | 'expired';

// Приоритет: expired важнее inactive (истёкший — финальное состояние независимо от active).
// Граница `< now` совпадает с checkCoupon (lib/coupon.ts): expiresAt === now ещё валиден.
export function couponStatus(
  c: { active: boolean; expiresAt: Date | null },
  now: Date,
): CouponStatus {
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return 'expired';
  if (!c.active) return 'inactive';
  return 'active';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/coupon-status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add stride-app/lib/coupon-status.ts stride-app/tests/coupon-status.test.ts
git commit -m "feat(coupons): client-safe couponStatus helper"
```

---

## Task 2: DTO + `createCoupon` action

**Files:**
- Create: `stride-app/services/dto/coupon-admin.dto.ts`
- Create: `stride-app/app/actions/admin/coupons.ts`
- Test: `stride-app/tests/admin-coupons-action.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/admin-coupons-action.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    coupon: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
  };
  return { prisma };
});

import { Prisma } from '@prisma/client';
import { createCoupon } from '@/app/actions/admin/coupons';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const revalidateMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as { coupon: Record<string, ReturnType<typeof vi.fn>> };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  p.coupon.create.mockResolvedValue({ id: 'c1' });
});

describe('createCoupon', () => {
  it('non-admin → error, no prisma touch', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'CUSTOMER' } });
    const r = await createCoupon({ code: 'NEW10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('zod reject: percent out of range → error, no create', async () => {
    const r = await createCoupon({ code: 'NEW10', percent: 0, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('zod reject: code too short → error', async () => {
    const r = await createCoupon({ code: 'AB', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('happy: normalizes code to UPPERCASE, no expiry → null', async () => {
    const r = await createCoupon({ code: ' new10 ', percent: 10, active: true, expiresAt: '' });
    expect(r.ok).toBe(true);
    expect(p.coupon.create).toHaveBeenCalledWith({
      data: { code: 'NEW10', percent: 10, active: true, expiresAt: null },
    });
    expect(revalidateMock).toHaveBeenCalledWith('/admin/marketing');
  });

  it('happy: expiresAt YYYY-MM-DD → end of day UTC', async () => {
    const r = await createCoupon({ code: 'XMAS', percent: 25, active: true, expiresAt: '2026-12-31' });
    expect(r.ok).toBe(true);
    const arg = p.coupon.create.mock.calls[0][0];
    expect(arg.data.expiresAt.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('bad date string → error, no create', async () => {
    const r = await createCoupon({ code: 'XMAS', percent: 25, active: true, expiresAt: '31-12-2026' });
    expect(r.ok).toBe(false);
    expect(p.coupon.create).not.toHaveBeenCalled();
  });

  it('duplicate code (P2002) → "Код уже занят"', async () => {
    p.coupon.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    const r = await createCoupon({ code: 'STRIDE10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/занят/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin-coupons-action.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/actions/admin/coupons"`.

- [ ] **Step 3: Write the DTO**

Create `stride-app/services/dto/coupon-admin.dto.ts`:

```ts
import { z } from 'zod';

// code (нормализованный UPPERCASE): начинается с буквы/цифры, далее буквы/цифры/-/_.
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]*$/;

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Код от 3 символов')
    .max(32, 'Код до 32 символов')
    .regex(CODE_RE, 'Код: латиница в верхнем регистре, цифры, - и _'),
  percent: z.coerce.number().int('Процент — целое число').min(1, 'От 1%').max(100, 'До 100%'),
  active: z.boolean().default(true), // вход всегда реальный boolean из RHF Switch
  expiresAt: z.string().trim().optional(), // '' → null в action; формат 'YYYY-MM-DD'
});

export type CouponValues = z.infer<typeof couponSchema>;
```

- [ ] **Step 4: Write the action (create only)**

Create `stride-app/app/actions/admin/coupons.ts`:

```ts
'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { normalizeCouponCode } from '@/lib/coupon';
import { couponSchema } from '@/services/dto/coupon-admin.dto';

export type CouponActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/marketing';

// 'YYYY-MM-DD' → конец дня UTC 23:59:59.999 (валиден весь день: checkCoupon сравнивает expiresAt < now).
// '' / undefined → null (бессрочный). Невалидная дата → Error → action вернёт {ok:false}.
function parseExpiresAt(raw?: string): Date | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error('bad-date');
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
  if (Number.isNaN(dt.getTime())) throw new Error('bad-date');
  return dt;
}

// code → normalizeCouponCode (trim+UPPERCASE) ПЕРЕД zod (regex по [A-Z]); expiresAt оставляем строкой для DTO.
function normalize(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    code: normalizeCouponCode(typeof r.code === 'string' ? r.code : ''),
    percent: r.percent,
    active: typeof r.active === 'boolean' ? r.active : true,
    expiresAt: typeof r.expiresAt === 'string' ? r.expiresAt : undefined,
  };
}

export async function createCoupon(raw: unknown): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = couponSchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  let expiresAt: Date | null;
  try {
    expiresAt = parseExpiresAt(v.expiresAt);
  } catch {
    return { ok: false, error: 'Некорректная дата окончания' };
  }

  try {
    await prisma.coupon.create({
      data: { code: v.code, percent: v.percent, active: v.active, expiresAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Код уже занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/admin-coupons-action.test.ts`
Expected: PASS (7 tests in `createCoupon`).

- [ ] **Step 6: Commit**

```bash
cd ..
git add stride-app/services/dto/coupon-admin.dto.ts stride-app/app/actions/admin/coupons.ts stride-app/tests/admin-coupons-action.test.ts
git commit -m "feat(coupons): DTO + createCoupon action"
```

---

## Task 3: `updateCoupon`, `toggleCoupon`, `deleteCoupon`

**Files:**
- Modify: `stride-app/app/actions/admin/coupons.ts`
- Test: `stride-app/tests/admin-coupons-action.test.ts` (append describes)

- [ ] **Step 1: Extend the failing test**

Append these `describe` blocks to `stride-app/tests/admin-coupons-action.test.ts` (and add the three names to the existing import line so it reads `import { createCoupon, updateCoupon, toggleCoupon, deleteCoupon } from '@/app/actions/admin/coupons';`). Also extend `beforeEach` to add `p.coupon.update.mockResolvedValue({ id: 'c1' }); p.coupon.delete.mockResolvedValue({ id: 'c1' });`:

```ts
describe('updateCoupon', () => {
  it('not found → error, no update', async () => {
    p.coupon.findUnique.mockResolvedValue(null);
    const r = await updateCoupon('cX', { code: 'NEW10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.update).not.toHaveBeenCalled();
  });

  it('happy → update with normalized data + revalidate', async () => {
    p.coupon.findUnique.mockResolvedValue({ id: 'c1' });
    const r = await updateCoupon('c1', { code: 'new10', percent: 20, active: false, expiresAt: '' });
    expect(r.ok).toBe(true);
    expect(p.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { code: 'NEW10', percent: 20, active: false, expiresAt: null },
    });
    expect(revalidateMock).toHaveBeenCalledWith('/admin/marketing');
  });

  it('non-admin → error', async () => {
    authMock.mockResolvedValue(null);
    const r = await updateCoupon('c1', { code: 'NEW10', percent: 10, active: true });
    expect(r.ok).toBe(false);
    expect(p.coupon.findUnique).not.toHaveBeenCalled();
  });
});

describe('toggleCoupon', () => {
  it('flips active, revalidates', async () => {
    p.coupon.findUnique.mockResolvedValue({ id: 'c1' });
    const r = await toggleCoupon('c1', false);
    expect(r.ok).toBe(true);
    expect(p.coupon.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { active: false } });
  });

  it('not found → error', async () => {
    p.coupon.findUnique.mockResolvedValue(null);
    const r = await toggleCoupon('cX', true);
    expect(r.ok).toBe(false);
    expect(p.coupon.update).not.toHaveBeenCalled();
  });

  it('non-admin → error', async () => {
    authMock.mockResolvedValue(null);
    const r = await toggleCoupon('c1', true);
    expect(r.ok).toBe(false);
    expect(p.coupon.findUnique).not.toHaveBeenCalled();
  });
});

describe('deleteCoupon', () => {
  it('happy → delete + revalidate', async () => {
    p.coupon.findUnique.mockResolvedValue({ id: 'c1' });
    const r = await deleteCoupon('c1');
    expect(r.ok).toBe(true);
    expect(p.coupon.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(revalidateMock).toHaveBeenCalledWith('/admin/marketing');
  });

  it('not found → error, no delete', async () => {
    p.coupon.findUnique.mockResolvedValue(null);
    const r = await deleteCoupon('cX');
    expect(r.ok).toBe(false);
    expect(p.coupon.delete).not.toHaveBeenCalled();
  });

  it('non-admin → error', async () => {
    authMock.mockResolvedValue(null);
    const r = await deleteCoupon('c1');
    expect(r.ok).toBe(false);
    expect(p.coupon.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin-coupons-action.test.ts`
Expected: FAIL — `updateCoupon is not a function` (and toggle/delete).

- [ ] **Step 3: Append the three actions**

Append to `stride-app/app/actions/admin/coupons.ts`:

```ts
export async function updateCoupon(id: string, raw: unknown): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = couponSchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  let expiresAt: Date | null;
  try {
    expiresAt = parseExpiresAt(v.expiresAt);
  } catch {
    return { ok: false, error: 'Некорректная дата окончания' };
  }

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  try {
    await prisma.coupon.update({
      where: { id },
      data: { code: v.code, percent: v.percent, active: v.active, expiresAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Код уже занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

// Тонкий флип active из Switch в списке (без полной формы).
export async function toggleCoupon(id: string, next: boolean): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  await prisma.coupon.update({ where: { id }, data: { active: next } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

// FK на Coupon нет (Order.couponCode — денормализованная строка) → удаление безопасно, гард только «существует».
export async function deleteCoupon(id: string): Promise<CouponActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Купон не найден' };

  await prisma.coupon.delete({ where: { id } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/admin-coupons-action.test.ts`
Expected: PASS (all `createCoupon` + `updateCoupon` + `toggleCoupon` + `deleteCoupon`).

- [ ] **Step 5: Commit**

```bash
cd ..
git add stride-app/app/actions/admin/coupons.ts stride-app/tests/admin-coupons-action.test.ts
git commit -m "feat(coupons): update/toggle/delete actions"
```

---

## Task 4: Coupon form (client island)

**Files:**
- Create: `stride-app/app/(admin)/admin/marketing/_components/coupon-form.tsx`

No unit test (vitest is node-only). Verified by `tsc` + preview.

- [ ] **Step 1: Write the form**

Create `stride-app/app/(admin)/admin/marketing/_components/coupon-form.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { couponSchema, type CouponValues } from '@/services/dto/coupon-admin.dto';
import { normalizeCouponCode } from '@/lib/coupon';
import { createCoupon, updateCoupon } from '@/app/actions/admin/coupons';

export interface CouponFormInitial {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  expiresAt: string | null; // ISO; срезаем до YYYY-MM-DD для <input type="date">
}

export function CouponForm({ initial }: { initial?: CouponFormInitial }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: initial?.code ?? '',
      percent: initial?.percent ?? 10,
      active: initial?.active ?? true,
      expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '',
    },
  });

  const active = watch('active');

  async function onSubmit(values: CouponValues) {
    setServerError(null);
    const res = initial ? await updateCoupon(initial.id, values) : await createCoupon(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/marketing');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Код</label>
        <Input
          {...register('code', {
            onBlur: (e) => setValue('code', normalizeCouponCode(e.target.value)),
          })}
          placeholder="STRIDE10"
          autoCapitalize="characters"
        />
        {errors.code && <p className="text-sm text-admin-error">{errors.code.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Скидка, %</label>
        <Input type="number" min={1} max={100} {...register('percent')} placeholder="10" />
        {errors.percent && <p className="text-sm text-admin-error">{errors.percent.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Действует до</label>
        <Input type="date" {...register('expiresAt')} />
        <p className="text-xs text-admin-on-surface-variant">Пусто — бессрочный.</p>
        {errors.expiresAt && <p className="text-sm text-admin-error">{errors.expiresAt.message}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={active} onCheckedChange={(v) => setValue('active', v)} />
        <span className="text-sm font-medium text-admin-on-surface">Активен</span>
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/marketing')}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `stride-app/`): `npx tsc --noEmit`
Expected: no errors. (The form references `createCoupon`/`updateCoupon`/`couponSchema`/`CouponValues`/`normalizeCouponCode`, all defined in Tasks 2–3.)

- [ ] **Step 3: Commit**

```bash
cd ..
git add stride-app/app/(admin)/admin/marketing/_components/coupon-form.tsx
git commit -m "feat(coupons): coupon form island"
```

---

## Task 5: Coupon filters + table (client islands)

**Files:**
- Create: `stride-app/app/(admin)/admin/marketing/_components/coupon-filters.tsx`
- Create: `stride-app/app/(admin)/admin/marketing/_components/coupon-table.tsx`

No unit test. Verified by `tsc` + preview. (Two separate islands mirror the orders/customers convention: a filters island + a table island.)

- [ ] **Step 1: Write the filters island**

Create `stride-app/app/(admin)/admin/marketing/_components/coupon-filters.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

const STATUSES = [
  { value: '__all__', label: 'Все статусы' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Выключенные' },
  { value: 'expired', label: 'Истёкшие' },
];
const ALL = '__all__';
const TRIGGER = 'rounded-full h-auto px-5 py-2.5';

export function CouponFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.push(`/admin/marketing?${next.toString()}`);
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
          placeholder="Поиск по коду…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>

      <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className={TRIGGER}><SelectValue placeholder="Все статусы" /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Write the table island**

Create `stride-app/app/(admin)/admin/marketing/_components/coupon-table.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { Switch } from '@/components/admin/ui/switch';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/admin/ui/dialog';
import type { CouponStatus } from '@/lib/coupon-status';
import { deleteCoupon, toggleCoupon } from '@/app/actions/admin/coupons';

export interface CouponRow {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  status: CouponStatus;
  expiresLabel: string;
  createdLabel: string;
}

const STATUS_META: Record<CouponStatus, { label: string; cls: string }> = {
  active: { label: 'Активен', cls: 'bg-admin-primary text-admin-on-primary' },
  inactive: { label: 'Выключен', cls: 'bg-admin-surface-high text-admin-on-surface-variant' },
  expired: { label: 'Истёк', cls: 'bg-admin-error/15 text-admin-error' },
};

export function CouponTable({ rows }: { rows: CouponRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<CouponRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [blockMsg, setBlockMsg] = React.useState<string | null>(null);

  async function handleToggle(row: CouponRow, next: boolean) {
    setPending(row.id);
    const res = await toggleCoupon(row.id, next);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
    setPending(null);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteCoupon(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Скидка</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Активен</TableHead>
              <TableHead>Действует до</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium font-mono">{row.code}</TableCell>
                <TableCell>{row.percent}%</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold w-fit inline-block ${STATUS_META[row.status].cls}`}>
                    {STATUS_META[row.status].label}
                  </span>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.active}
                    disabled={pending === row.id}
                    onCheckedChange={(v) => handleToggle(row, v)}
                  />
                </TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.expiresLabel}</TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.createdLabel}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/marketing/${row.id}/edit`}>Изменить</Link>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setToDelete(row)}>
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Удалить купон?"
        description={toDelete ? `«${toDelete.code}» будет удалён безвозвратно.` : undefined}
      />

      <Dialog open={blockMsg !== null} onOpenChange={(open) => !open && setBlockMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Не удалось</DialogTitle>
            <DialogDescription>{blockMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setBlockMsg(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run (from `stride-app/`): `npx tsc --noEmit`
Expected: no errors. (`CouponStatus` from Task 1; `deleteCoupon`/`toggleCoupon` from Task 3.)

- [ ] **Step 4: Commit**

```bash
cd ..
git add stride-app/app/(admin)/admin/marketing/_components/coupon-filters.tsx stride-app/app/(admin)/admin/marketing/_components/coupon-table.tsx
git commit -m "feat(coupons): filters + table islands"
```

---

## Task 6: Pages — list (replace stub) + new + edit

**Files:**
- Modify: `stride-app/app/(admin)/admin/marketing/page.tsx`
- Create: `stride-app/app/(admin)/admin/marketing/new/page.tsx`
- Create: `stride-app/app/(admin)/admin/marketing/[id]/edit/page.tsx`

No unit test. Verified by `tsc` + preview.

- [ ] **Step 1: Replace the marketing stub with the list page**

Replace the entire contents of `stride-app/app/(admin)/admin/marketing/page.tsx`:

```tsx
import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { prisma } from '@/lib/prisma-client';
import { readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { normalizeCouponCode } from '@/lib/coupon';
import { couponStatus } from '@/lib/coupon-status';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { CouponFilters } from './_components/coupon-filters';
import { CouponTable, type CouponRow } from './_components/coupon-table';

export const metadata = { title: 'Купоны' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const STATUS_VALUES = ['active', 'inactive', 'expired'] as const;

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = readSearchQuery(sp);
  const status = readEnumParam(sp, 'status', STATUS_VALUES);
  const now = new Date();

  const where: Prisma.CouponWhereInput = {
    ...(q ? { code: { contains: normalizeCouponCode(q) } } : {}),
    ...(status === 'active'
      ? { active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
      : status === 'inactive'
        ? { active: false }
        : status === 'expired'
          ? { expiresAt: { lt: now } }
          : {}),
  };

  const coupons = await prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });

  const rows: CouponRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    percent: c.percent,
    active: c.active,
    status: couponStatus(c, now),
    expiresLabel: c.expiresAt ? formatDate(c.expiresAt) : 'Бессрочный',
    createdLabel: formatDate(c.createdAt),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Купоны ({rows.length})</h2>
          <p className="text-admin-on-surface-variant">Процентные промокоды на сумму товаров.</p>
        </div>
        <Button asChild>
          <Link href="/admin/marketing/new">
            <Icon name="add" className="text-[18px]" /> Добавить купон
          </Link>
        </Button>
      </div>

      <CouponFilters />

      {rows.length > 0 ? (
        <CouponTable rows={rows} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Купоны не найдены.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the new-coupon page**

Create `stride-app/app/(admin)/admin/marketing/new/page.tsx`:

```tsx
import { Heading } from '@/components/admin/heading';
import { CouponForm } from '../_components/coupon-form';

export const metadata = { title: 'Новый купон' };

export default function NewCouponPage() {
  return (
    <div className="space-y-8">
      <Heading title="Новый купон" description="Процентный промокод" />
      <CouponForm />
    </div>
  );
}
```

- [ ] **Step 3: Create the edit-coupon page**

Create `stride-app/app/(admin)/admin/marketing/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma-client';
import { Heading } from '@/components/admin/heading';
import { CouponForm } from '../../_components/coupon-form';

export const metadata = { title: 'Редактирование купона' };
export const dynamic = 'force-dynamic';

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) notFound();

  return (
    <div className="space-y-8">
      <Heading title="Редактирование купона" description={coupon.code} />
      <CouponForm
        initial={{
          id: coupon.id,
          code: coupon.code,
          percent: coupon.percent,
          active: coupon.active,
          expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run (from `stride-app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ..
git add "stride-app/app/(admin)/admin/marketing/page.tsx" "stride-app/app/(admin)/admin/marketing/new/page.tsx" "stride-app/app/(admin)/admin/marketing/[id]/edit/page.tsx"
git commit -m "feat(coupons): list, new, edit pages"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run (from `stride-app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run (from `stride-app/`): `npx vitest run`
Expected: all suites PASS, including the new `coupon-status` (6) and `admin-coupons-action` (16) tests. Confirm count grew from the 446 baseline by ~22.

- [ ] **Step 3: Schema-change guard**

Run (from repo root): `git diff --stat origin/main -- stride-app/prisma/schema.prisma`
Expected: EMPTY output (no schema change — the whole point of 3.7).

- [ ] **Step 4: Stub-removal guard**

Run (from repo root): `git grep -n "Phase 3.7" -- stride-app/app` 
Expected: no matches in `marketing/page.tsx` (the stub text was removed).

- [ ] **Step 5: Manual preview checklist (after push, on Vercel preview)**

Push the branch and open the preview. As ADMIN at `/admin/marketing`:
- [ ] List renders existing seed coupons (STRIDE10, WELCOME15, EXPIRED) with correct status badges (EXPIRED shows «Истёк»).
- [ ] Search by code filters; status filter (Активные/Выключенные/Истёкшие) filters.
- [ ] «Добавить купон» → create `TEST20` 20%, no expiry → appears Active.
- [ ] Edit `TEST20`: change to 25%, set «Действует до» a past date → save → badge «Истёк».
- [ ] Toggle a coupon's Switch off → row badge «Выключен»; toggle on → «Активен».
- [ ] Delete `TEST20` via confirm modal → row gone.
- [ ] Duplicate code: create another `STRIDE10` → inline error «Код уже занят».
- [ ] Storefront checkout: apply `STRIDE10` still works (unchanged) — sanity that nothing broke.
- [ ] Light/dark theme toggle: list + form readable in both (Select/Dialog portal into `.admin-root`).

---

## Self-Review

**1. Spec coverage:**

| Spec § | Requirement | Task |
|---|---|---|
| §4.1 | 3 routes (list/new/edit) | Task 6 |
| §4.2 | client-safe `couponStatus` | Task 1 |
| §4.3 | DTO `couponSchema` | Task 2 |
| §4.4 | create/update/toggle/delete actions, `parseExpiresAt`, `normalize` | Tasks 2–3 |
| §4.5 | list page WHERE (q + status), force-dynamic | Task 6 |
| §4.6 | table: columns, badge, Switch, AlertModal | Task 5 |
| §4.7 | form: RHF+zod, code/percent/active/expiresAt | Task 4 |
| §6 | `coupon-status.test.ts`, `admin-coupons-action.test.ts` | Tasks 1–3 |
| §7 | end-of-day UTC, schema-guard, client-safe split | Tasks 2, 7 |

Deviation from spec §4.6/§4.8: filters split into a separate `coupon-filters.tsx` island (mirrors orders/customers house convention) rather than inline in the table. Same behavior, better decomposition.

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; every run step shows command + expected output.

**3. Type consistency:**
- `CouponActionResult`, `createCoupon/updateCoupon/toggleCoupon/deleteCoupon` — signatures identical across Tasks 2/3 and consumers (Tasks 4/5).
- `CouponValues`/`couponSchema` — defined Task 2, consumed Task 4.
- `CouponStatus`/`couponStatus` — defined Task 1, consumed Tasks 5 (type import) + 6 (call).
- `CouponRow` — defined in `coupon-table.tsx` (Task 5), imported by list page (Task 6) via `import { CouponTable, type CouponRow }`.
- `CouponFormInitial` — defined Task 4, constructed in edit page (Task 6) with matching field shape (`expiresAt: string | null`).
- `formatDate` (date-only, MSK) — confirmed exported at `lib/format.ts:42`.
- `readSearchQuery`/`readEnumParam` — confirmed exported from `lib/admin/pagination.ts`, used same as `orders/page.tsx`.
