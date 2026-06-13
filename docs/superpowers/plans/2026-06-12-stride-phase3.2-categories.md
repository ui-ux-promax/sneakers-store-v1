# Phase 3.2 — Categories CRUD + reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only Category management at `/admin/catalog` — list, create, edit, delete, reorder (↑/↓), and cover image via the Phase 3.1 ImageUploader — using server actions, with no storefront changes.

**Architecture:** List is a server component reading Prisma directly. Mutations are server actions (`{ok,error}` envelope, `requireAdminAction`, `revalidatePath`). Cover image stores `url` + new `coverImagePublicId` column for clean Cloudinary deletion. Reorder swaps `sortOrder` with the neighbour in a `$transaction`. Slug auto-derives from name via a new `slugify` util (Cyrillic transliteration), overridable.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Auth.js v5 gate, Prisma + Neon WebSocket, zod + react-hook-form, admin UI primitives (Table/Button/Input/AlertModal), ImageUploader (3.1), vitest (node-only).

**Branch:** `feat/phase3.2-categories` (already created from main `75a8627`; spec committed `240d371`).

**Spec:** `docs/superpowers/specs/2026-06-12-stride-phase3.2-categories-design.md`

**Conventions:** commit messages English, single author, no `Co-Authored-By`. Commands run from `stride-app/`. Do NOT run `prisma db push` / seed / e2e locally (Neon hang on Windows) — `prisma generate` is fine (offline). The `coverImagePublicId` column reaches the DB via `db push` on CI/Vercel deploy, not locally.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `stride-app/prisma/schema.prisma` | MODIFY: add `coverImagePublicId String?` to Category |
| `stride-app/lib/slugify.ts` | `slugify(input)` — Cyrillic→latin transliteration + kebab |
| `stride-app/services/dto/category.dto.ts` | `categorySchema` (zod) + `CategoryValues` |
| `stride-app/app/api/admin/media/sign/route.ts` | MODIFY: add `stride/categories` to `ALLOWED_FOLDERS` |
| `stride-app/app/actions/admin/categories.ts` | `createCategory`/`updateCategory`/`deleteCategory`/`moveCategory` |
| `stride-app/app/(admin)/admin/catalog/page.tsx` | MODIFY: list (RSC), replaces 3.1 demo |
| `stride-app/app/(admin)/admin/catalog/_components/category-table.tsx` | client: table + reorder arrows + delete modal |
| `stride-app/app/(admin)/admin/catalog/_components/category-form.tsx` | client: rhf form + cover uploader + auto-slug |
| `stride-app/app/(admin)/admin/catalog/new/page.tsx` | RSC wrapper (create) |
| `stride-app/app/(admin)/admin/catalog/[id]/edit/page.tsx` | RSC wrapper (edit) |
| `stride-app/tests/slugify.test.ts` | slugify unit tests |
| `stride-app/tests/category-dto.test.ts` | DTO validation tests |
| `stride-app/tests/categories-action.test.ts` | server action tests (create/update/delete/move) |
| `stride-app/tests/media-sign-route.test.ts` | MODIFY: add `stride/categories` allowed case |

---

## Task 1: Schema — coverImagePublicId column

**Files:**
- Modify: `stride-app/prisma/schema.prisma` (Category model)

- [ ] **Step 1: Add the column**

In `stride-app/prisma/schema.prisma`, in the `Category` model, add `coverImagePublicId` right after `coverImage`:
```prisma
model Category {
  id                 String    @id @default(cuid())
  name               String
  slug               String    @unique
  tagline            String?
  coverImage         String?
  coverImagePublicId String?
  sortOrder          Int       @default(0)
  products           Product[]

  @@index([sortOrder])
}
```

- [ ] **Step 2: Regenerate the Prisma client (offline, safe locally)**

Run (from `stride-app/`): `npm run prisma:generate`
Expected: "Generated Prisma Client" — the `Category` type now includes `coverImagePublicId`. (Do NOT run `prisma db push` locally.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(categories): add coverImagePublicId column to Category"
```

---

## Task 2: slugify utility

**Files:**
- Create: `stride-app/lib/slugify.ts`
- Test: `stride-app/tests/slugify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/slugify.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slugify';

describe('slugify', () => {
  it('transliterates Cyrillic to latin', () => {
    expect(slugify('Беговые')).toBe('begovye');
  });

  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Беговые кроссовки')).toBe('begovye-krossovki');
  });

  it('handles latin input unchanged (lowercased)', () => {
    expect(slugify('Running Shoes')).toBe('running-shoes');
  });

  it('collapses non-alphanumerics and repeated hyphens', () => {
    expect(slugify('  Hello---World!!!  ')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('!!!platform!!!')).toBe('platform');
  });

  it('drops ъ/ь, maps ё/ж/ш/щ/ч/ц/ю/я', () => {
    expect(slugify('Объём ёжик')).toBe('obem-ezhik');
  });

  it('returns empty string for input with no usable chars', () => {
    expect(slugify('!!! ___')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slugify.test.ts`
Expected: FAIL — `Cannot find module '@/lib/slugify'`.

- [ ] **Step 3: Implement**

Create `stride-app/lib/slugify.ts`:
```ts
// Транслитерация кириллицы → латиница для генерации slug из русского названия.
const RU_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** name → url-safe slug: транслит кириллицы, lowercase, non-alnum → '-', схлопывание и trim дефисов. */
export function slugify(input: string): string {
  const lower = input.trim().toLowerCase();
  let out = '';
  for (const ch of lower) {
    out += RU_MAP[ch] !== undefined ? RU_MAP[ch] : ch;
  }
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/slugify.test.ts`
Expected: PASS (7 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/slugify.ts tests/slugify.test.ts
git commit -m "feat(categories): slugify util with Cyrillic transliteration"
```

---

## Task 3: Category DTO

**Files:**
- Create: `stride-app/services/dto/category.dto.ts`
- Test: `stride-app/tests/category-dto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/category-dto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { categorySchema } from '@/services/dto/category.dto';

const valid = { name: 'Беговые', slug: 'running', tagline: 'Скорость' };

describe('categorySchema', () => {
  it('accepts a valid category', () => {
    const r = categorySchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('accepts optional tagline/coverImage absent', () => {
    const r = categorySchema.safeParse({ name: 'X', slug: 'x' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(categorySchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects slug with uppercase or spaces', () => {
    expect(categorySchema.safeParse({ ...valid, slug: 'Run Shoes' }).success).toBe(false);
  });

  it('rejects slug with leading/trailing hyphen', () => {
    expect(categorySchema.safeParse({ ...valid, slug: '-run' }).success).toBe(false);
    expect(categorySchema.safeParse({ ...valid, slug: 'run-' }).success).toBe(false);
  });

  it('accepts hyphenated slug', () => {
    expect(categorySchema.safeParse({ ...valid, slug: 'running-shoes' }).success).toBe(true);
  });

  it('rejects name longer than 100 chars', () => {
    expect(categorySchema.safeParse({ ...valid, name: 'a'.repeat(101) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/category-dto.test.ts`
Expected: FAIL — `Cannot find module '@/services/dto/category.dto'`.

- [ ] **Step 3: Implement**

Create `stride-app/services/dto/category.dto.ts`:
```ts
import { z } from 'zod';

// slug: латиница/цифры, дефис только между сегментами (без ведущих/конечных/двойных).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(100, 'Название до 100 символов'),
  slug: z
    .string()
    .trim()
    .min(1, 'Укажите slug')
    .max(100, 'Slug до 100 символов')
    .regex(SLUG_RE, 'Slug: только латиница, цифры и дефис'),
  tagline: z.string().trim().max(200, 'Подпись до 200 символов').optional(),
  coverImage: z.string().url('Некорректный URL обложки').optional(),
  coverImagePublicId: z.string().optional(),
});

export type CategoryValues = z.infer<typeof categorySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/category-dto.test.ts`
Expected: PASS (7 cases).

- [ ] **Step 5: Commit**

```bash
git add services/dto/category.dto.ts tests/category-dto.test.ts
git commit -m "feat(categories): category zod DTO"
```

---

## Task 4: Extend sign-route folder whitelist

**Files:**
- Modify: `stride-app/app/api/admin/media/sign/route.ts`
- Modify: `stride-app/tests/media-sign-route.test.ts`

The 3.1 sign route only allows `stride/uploads`. Category covers upload to `stride/categories`, which must be added or they get 400.

- [ ] **Step 1: Add the failing test case**

In `stride-app/tests/media-sign-route.test.ts`, add this test inside the `describe('POST /api/admin/media/sign', ...)` block (after the existing cases):
```ts
  it('ADMIN + stride/categories folder → 200 (3.2 consumer)', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ folder: 'stride/categories' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folder).toBe('stride/categories');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-sign-route.test.ts`
Expected: FAIL — the new case gets 400 (folder not in whitelist) instead of 200.

- [ ] **Step 3: Add the folder to the whitelist**

In `stride-app/app/api/admin/media/sign/route.ts`, change the `ALLOWED_FOLDERS` constant:
```ts
const ALLOWED_FOLDERS = ['stride/uploads', 'stride/categories'] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-sign-route.test.ts`
Expected: PASS (7 cases — 6 original + 1 new).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/media/sign/route.ts tests/media-sign-route.test.ts
git commit -m "feat(categories): allow stride/categories folder in sign route"
```

---

## Task 5: Category server actions

**Files:**
- Create: `stride-app/app/actions/admin/categories.ts`
- Test: `stride-app/tests/categories-action.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/categories-action.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cloudinary/server', () => ({ deleteAsset: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    category: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
} from '@/app/actions/admin/categories';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const create = prisma.category.create as unknown as ReturnType<typeof vi.fn>;
const update = prisma.category.update as unknown as ReturnType<typeof vi.fn>;
const del = prisma.category.delete as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.category.findUnique as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.category.findFirst as unknown as ReturnType<typeof vi.fn>;
const tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const deleteAssetMock = deleteAsset as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
});

describe('createCategory', () => {
  it('anon → ok:false', async () => {
    authMock.mockResolvedValue(null);
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('CUSTOMER → ok:false', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('valid → creates, ok:true', async () => {
    create.mockResolvedValue({ id: 'c1' });
    const r = await createCategory({ name: 'Беговые', slug: 'running', tagline: 'Скорость' });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Беговые', slug: 'running', tagline: 'Скорость', coverImage: null, coverImagePublicId: null },
    });
  });

  it('empty slug → derived from name via slugify', async () => {
    create.mockResolvedValue({ id: 'c1' });
    await createCategory({ name: 'Беговые', slug: '' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'begovye' }) }),
    );
  });

  it('invalid (zod) → ok:false, no create', async () => {
    const r = await createCategory({ name: '', slug: '' });
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('P2002 (dup slug) → ok:false "Slug занят"', async () => {
    const { Prisma } = await import('@prisma/client');
    create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await createCategory({ name: 'X', slug: 'x' });
    expect(r).toEqual({ ok: false, error: 'Slug занят' });
  });
});

describe('updateCategory', () => {
  it('valid → updates, ok:true', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: null });
    update.mockResolvedValue({ id: 'c1' });
    const r = await updateCategory('c1', { name: 'New', slug: 'new' });
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('cover changed → deleteAsset(old publicId) best-effort', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'old/pid' });
    update.mockResolvedValue({ id: 'c1' });
    deleteAssetMock.mockResolvedValue({ ok: true });
    await updateCategory('c1', { name: 'N', slug: 'n', coverImage: 'https://x/y.jpg', coverImagePublicId: 'new/pid' });
    expect(deleteAssetMock).toHaveBeenCalledWith('old/pid');
  });

  it('cover unchanged → no deleteAsset', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'same/pid' });
    update.mockResolvedValue({ id: 'c1' });
    await updateCategory('c1', { name: 'N', slug: 'n', coverImage: 'https://x/y.jpg', coverImagePublicId: 'same/pid' });
    expect(deleteAssetMock).not.toHaveBeenCalled();
  });
});

describe('deleteCategory', () => {
  it('has products → blocked, ok:false', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: null, _count: { products: 3 } });
    const r = await deleteCategory('c1');
    expect(r).toEqual({ ok: false, error: 'Нельзя удалить: 3 товаров' });
    expect(del).not.toHaveBeenCalled();
  });

  it('no products → deletes + cleans cover', async () => {
    findUnique.mockResolvedValue({ id: 'c1', coverImagePublicId: 'c/pid', _count: { products: 0 } });
    del.mockResolvedValue({ id: 'c1' });
    deleteAssetMock.mockResolvedValue({ ok: true });
    const r = await deleteCategory('c1');
    expect(r.ok).toBe(true);
    expect(deleteAssetMock).toHaveBeenCalledWith('c/pid');
    expect(del).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('not found → ok:false', async () => {
    findUnique.mockResolvedValue(null);
    const r = await deleteCategory('nope');
    expect(r.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('moveCategory', () => {
  it('up with a neighbour → swaps sortOrder in a transaction', async () => {
    findUnique.mockResolvedValue({ id: 'c2', sortOrder: 2 });
    findFirst.mockResolvedValue({ id: 'c1', sortOrder: 1 });
    tx.mockResolvedValue([{}, {}]);
    const r = await moveCategory('c2', 'up');
    expect(r.ok).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sortOrder: { lt: 2 } },
        orderBy: { sortOrder: 'desc' },
      }),
    );
    expect(tx).toHaveBeenCalled();
  });

  it('up at the top (no neighbour) → no-op ok:true', async () => {
    findUnique.mockResolvedValue({ id: 'c1', sortOrder: 1 });
    findFirst.mockResolvedValue(null);
    const r = await moveCategory('c1', 'up');
    expect(r.ok).toBe(true);
    expect(tx).not.toHaveBeenCalled();
  });

  it('anon → ok:false', async () => {
    authMock.mockResolvedValue(null);
    const r = await moveCategory('c1', 'up');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/categories-action.test.ts`
Expected: FAIL — `Cannot find module '@/app/actions/admin/categories'`.

- [ ] **Step 3: Implement**

Create `stride-app/app/actions/admin/categories.ts`:
```ts
'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';
import { slugify } from '@/lib/slugify';
import { categorySchema } from '@/services/dto/category.dto';

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/catalog';

// Нормализация формы: пустой slug → derive из name; пустые строки → undefined.
function normalize(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name : '';
  const slugInput = typeof r.slug === 'string' ? r.slug.trim() : '';
  return {
    name,
    slug: slugInput || slugify(name),
    tagline: r.tagline ? String(r.tagline) : undefined,
    coverImage: r.coverImage ? String(r.coverImage) : undefined,
    coverImagePublicId: r.coverImagePublicId ? String(r.coverImagePublicId) : undefined,
  };
}

export async function createCategory(raw: unknown): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = categorySchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  try {
    await prisma.category.create({
      data: {
        name: v.name,
        slug: v.slug,
        tagline: v.tagline ?? null,
        coverImage: v.coverImage ?? null,
        coverImagePublicId: v.coverImagePublicId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Slug занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function updateCategory(id: string, raw: unknown): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = categorySchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  const existing = await prisma.category.findUnique({ where: { id }, select: { coverImagePublicId: true } });
  if (!existing) return { ok: false, error: 'Категория не найдена' };

  try {
    await prisma.category.update({
      where: { id },
      data: {
        name: v.name,
        slug: v.slug,
        tagline: v.tagline ?? null,
        coverImage: v.coverImage ?? null,
        coverImagePublicId: v.coverImagePublicId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Slug занят' };
    }
    throw e;
  }

  // Старая обложка заменена/удалена → подчистить Cloudinary (best-effort, не блокирует).
  const oldPid = existing.coverImagePublicId;
  if (oldPid && oldPid !== v.coverImagePublicId) {
    try {
      await deleteAsset(oldPid);
    } catch {
      /* best-effort */
    }
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cat = await prisma.category.findUnique({
    where: { id },
    select: { coverImagePublicId: true, _count: { select: { products: true } } },
  });
  if (!cat) return { ok: false, error: 'Категория не найдена' };
  if (cat._count.products > 0) {
    return { ok: false, error: `Нельзя удалить: ${cat._count.products} товаров` };
  }

  if (cat.coverImagePublicId) {
    try {
      await deleteAsset(cat.coverImagePublicId);
    } catch {
      /* best-effort */
    }
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function moveCategory(id: string, dir: 'up' | 'down'): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const target = await prisma.category.findUnique({ where: { id }, select: { id: true, sortOrder: true } });
  if (!target) return { ok: false, error: 'Категория не найдена' };

  const neighbour = await prisma.category.findFirst({
    where: dir === 'up' ? { sortOrder: { lt: target.sortOrder } } : { sortOrder: { gt: target.sortOrder } },
    orderBy: { sortOrder: dir === 'up' ? 'desc' : 'asc' },
    select: { id: true, sortOrder: true },
  });
  if (!neighbour) return { ok: true }; // край списка — no-op

  await prisma.$transaction([
    prisma.category.update({ where: { id: target.id }, data: { sortOrder: neighbour.sortOrder } }),
    prisma.category.update({ where: { id: neighbour.id }, data: { sortOrder: target.sortOrder } }),
  ]);
  revalidatePath(LIST_PATH);
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/categories-action.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/actions/admin/categories.ts tests/categories-action.test.ts
git commit -m "feat(categories): create/update/delete/move server actions"
```

---

## Task 6: Catalog list page + category table

**Files:**
- Modify: `stride-app/app/(admin)/admin/catalog/page.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/_components/category-table.tsx`

No unit tests (UI, vitest node-only) — verified via typecheck + manual.

- [ ] **Step 1: Create the table component**

Create `stride-app/app/(admin)/admin/catalog/_components/category-table.tsx`:
```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import { deleteCategory, moveCategory } from '@/app/actions/admin/categories';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  coverImage: string | null;
  productCount: number;
}

export function CategoryTable({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleMove(id: string, dir: 'up' | 'down') {
    setPending(id);
    setError(null);
    const res = await moveCategory(id, dir);
    if (!res.ok) setError(res.error);
    setPending(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    const res = await deleteCategory(toDelete.id);
    setDeleting(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      router.refresh();
    }
    setToDelete(null);
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-admin-error">{error}</p>}
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Обложка</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Товаров</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.coverImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
                    <img src={row.coverImage} alt="" className="h-10 w-10 rounded object-cover bg-admin-surface-high" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-admin-surface-high" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.slug}</TableCell>
                <TableCell>{row.productCount}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Вверх"
                      disabled={i === 0 || pending === row.id}
                      onClick={() => handleMove(row.id, 'up')}
                      className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
                    >
                      <Icon name="arrow_upward" />
                    </button>
                    <button
                      type="button"
                      aria-label="Вниз"
                      disabled={i === rows.length - 1 || pending === row.id}
                      onClick={() => handleMove(row.id, 'down')}
                      className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
                    >
                      <Icon name="arrow_downward" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/catalog/${row.id}/edit`}>Изменить</Link>
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
        title="Удалить категорию?"
        description={toDelete ? `«${toDelete.name}» будет удалена безвозвратно.` : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace the catalog page with the list (RSC)**

Replace the entire contents of `stride-app/app/(admin)/admin/catalog/page.tsx`:
```tsx
/**
 * /admin/catalog — Категории каталога (Phase 3.2).
 * Список + reorder + ссылки на создание/редактирование. Товары (Product CRUD) — Phase 3.3.
 */

import Link from 'next/link';
import { Heading } from '@/components/admin/heading';
import { Button } from '@/components/admin/ui/button';
import { prisma } from '@/lib/prisma-client';
import { CategoryTable, type CategoryRow } from './_components/category-table';

export const metadata = { title: 'Категории' };
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      tagline: true,
      coverImage: true,
      _count: { select: { products: true } },
    },
  });

  const rows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    tagline: c.tagline,
    coverImage: c.coverImage,
    productCount: c._count.products,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Heading title="Категории" description="Управление категориями каталога" />
        <Button asChild>
          <Link href="/admin/catalog/new">Добавить категорию</Link>
        </Button>
      </div>
      {rows.length > 0 ? (
        <CategoryTable rows={rows} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Категорий пока нет. Нажмите «Добавить категорию».
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/catalog/page.tsx" "app/(admin)/admin/catalog/_components/category-table.tsx"
git commit -m "feat(categories): admin catalog list with reorder and delete"
```

---

## Task 7: Category form + new/edit pages

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/_components/category-form.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/new/page.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/[id]/edit/page.tsx`

- [ ] **Step 1: Create the form component**

Create `stride-app/app/(admin)/admin/catalog/_components/category-form.tsx`:
```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { ImageUploader } from '@/components/admin/media/image-uploader';
import { categorySchema, type CategoryValues } from '@/services/dto/category.dto';
import { slugify } from '@/lib/slugify';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { createCategory, updateCategory } from '@/app/actions/admin/categories';

export interface CategoryFormInitial {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  coverImage: string | null;
  coverImagePublicId: string | null;
}

export function CategoryForm({ initial }: { initial?: CategoryFormInitial }) {
  const router = useRouter();
  const [cover, setCover] = React.useState<UploadedImage | null>(
    initial?.coverImage && initial.coverImagePublicId
      ? { publicId: initial.coverImagePublicId, url: initial.coverImage, width: 0, height: 0, format: '', bytes: 0 }
      : null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const slugDirty = React.useRef(Boolean(initial));

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: initial?.name ?? '',
      slug: initial?.slug ?? '',
      tagline: initial?.tagline ?? '',
    },
  });

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugDirty.current) setValue('slug', slugify(e.target.value));
  }

  async function onSubmit(values: CategoryValues) {
    setServerError(null);
    const payload = {
      ...values,
      coverImage: cover?.url,
      coverImagePublicId: cover?.publicId,
    };
    const res = initial ? await updateCategory(initial.id, payload) : await createCategory(payload);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/catalog');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Название</label>
        <Input {...register('name', { onChange: onNameChange })} placeholder="Беговые" />
        {errors.name && <p className="text-sm text-admin-error">{errors.name.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Slug</label>
        <Input
          {...register('slug', { onChange: () => { slugDirty.current = true; } })}
          placeholder="running"
        />
        {errors.slug && <p className="text-sm text-admin-error">{errors.slug.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Подпись</label>
        <Input {...register('tagline')} placeholder="Скорость и амортизация" />
        {errors.tagline && <p className="text-sm text-admin-error">{errors.tagline.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Обложка</label>
        <ImageUploader
          value={cover ? [cover] : []}
          onChange={(imgs) => setCover(imgs[0] ?? null)}
          folder="stride/categories"
          max={1}
        />
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/catalog')}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the "new" page**

Create `stride-app/app/(admin)/admin/catalog/new/page.tsx`:
```tsx
import { Heading } from '@/components/admin/heading';
import { CategoryForm } from '../_components/category-form';

export const metadata = { title: 'Новая категория' };

export default function NewCategoryPage() {
  return (
    <div className="space-y-8">
      <Heading title="Новая категория" description="Создание категории каталога" />
      <CategoryForm />
    </div>
  );
}
```

- [ ] **Step 3: Create the "edit" page**

Create `stride-app/app/(admin)/admin/catalog/[id]/edit/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { CategoryForm } from '../../_components/category-form';

export const metadata = { title: 'Редактирование категории' };
export const dynamic = 'force-dynamic';

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, tagline: true, coverImage: true, coverImagePublicId: true },
  });
  if (!category) notFound();

  return (
    <div className="space-y-8">
      <Heading title="Редактирование категории" description={category.name} />
      <CategoryForm initial={category} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (Note: Next.js 15 page `params` is a Promise — the edit page awaits it, matching the project's Next 15 convention.)

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/catalog/_components/category-form.tsx" "app/(admin)/admin/catalog/new/page.tsx" "app/(admin)/admin/catalog/[id]/edit/page.tsx"
git commit -m "feat(categories): category create/edit form with cover uploader"
```

---

## Task 8: Full verification + wrap-up

**Files:** none (verification)

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: PASS — prior suites plus `slugify`, `category-dto`, `categories-action`, and the extended `media-sign-route`. Note the new total (325 + ~25 new ≈ 350).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint`
Expected: exits 0, or "lint not configured" (acceptable per repo notes).

- [ ] **Step 4: Confirm storefront untouched**

Run: `git diff main --stat -- "stride-app/app/(shop)" stride-app/components/shared stride-app/lib/find-products.ts`
Expected: no output (zero storefront changes — only admin/lib/actions/dto/schema/tests touched).

- [ ] **Step 5: Push**

```bash
git push -u origin feat/phase3.2-categories
```

- [ ] **Step 6: Open PR (web UI — `gh` not installed)**

Title: `Phase 3.2 — Categories CRUD + reorder`
Body must cover: scope (admin-only CRUD, storefront untouched), schema change (`coverImagePublicId` — applied via `db push` on deploy), reorder via sortOrder swap, cover via 3.1 ImageUploader + best-effort cleanup, delete-guard (blocked when products exist), sign-route folder whitelist extension, and test counts.

---

## Self-Review

**Spec coverage** (spec §13 acceptance criteria → task):
1. `coverImagePublicId` added, rest untouched → Task 1. ✓
2. `slugify` + `category.dto` with tests → Tasks 2, 3. ✓
3. Actions create/update/delete/move gated, envelope, P2002/delete-guard, tests → Task 5. ✓
4. `/admin/catalog` list (cover/name/slug/tagline/count/order/actions) → Task 6. ✓
5. Create/edit form (validation, auto-slug, cover via ImageUploader) → Task 7. ✓
6. Reorder ↑/↓ swap, edges disabled → Tasks 5 (move), 6 (disabled buttons). ✓
7. Delete blocked with products; else delete + cover cleanup → Task 5. ✓
8. Vitest green, typecheck 0, storefront untouched → Task 8. ✓
9. `ALLOWED_FOLDERS` includes `stride/categories` → Task 4. ✓

Spec §6 single-image bridge (value/onChange/max=1, partial UploadedImage rehydration) → Task 7. ✓
Spec §8 auto-slug dirty flag → Task 7 (`slugDirty` ref). ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:**
- `CategoryValues` (Task 3) used in form (Task 7) and actions parse `normalize()` output against `categorySchema` (Task 5). ✓
- `createCategory(raw)`/`updateCategory(id, raw)`/`deleteCategory(id)`/`moveCategory(id, dir)` signatures (Task 5) match calls in `category-table.tsx` (`moveCategory(id,'up'|'down')`, `deleteCategory(id)`) and `category-form.tsx` (`createCategory(payload)`, `updateCategory(initial.id, payload)`). ✓
- `CategoryRow` (Task 6) shape produced by page mapper matches table prop. ✓
- `CategoryFormInitial` (Task 7) matches edit page `select`. ✓
- `UploadedImage` from 3.1 reused for cover bridge. ✓

**Watch-out flagged for executor:** Task 5 Step 4 notes the `findFirst` assertion may need relaxing to `expect.objectContaining` if the `select` clause makes `toHaveBeenCalledWith` too strict — the implementation includes `select: { id: true, sortOrder: true }` which the test's asserted object omits. Executor: assert with `expect.objectContaining({ where: ..., orderBy: ... })`.
