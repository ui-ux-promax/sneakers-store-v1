# Phase 3.3 — Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ-CRUD товаров (`/admin/catalog/products`) — список с фильтрами + одна вложенная форма `Product → Colorways → (Images + Variants)` с атомарным сохранением в `$transaction`, пересчётом денорм-полей `minPrice/discountPct`, уникальностью SKU и защитой ссылочной целостности по `OrderItem`.

**Architecture:** Зеркалим паттерн 3.2 (`page → _components → actions → dto`). Запись — **diff-upsert** (НЕ delete-recreate: variants под `OrderItem` RESTRICT) в одной интерактивной транзакции Neon-WebSocket; денорм пересчитывается из дерева той же транзакцией через существующий `productDenormFromColorways`. Картинки переиспользуют готовый `ImageUploader` (он уже умеет multi-upload + ↑↓ reorder + alt + best-effort delete). Раздел Catalog становится таб-хабом `[Товары | Категории]`; категории 3.2 переезжают в `/admin/catalog/categories/*`.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma + Neon WebSocket (`@/lib/prisma-client`), Auth.js v5 gate (`requireAdminAction`), zod + react-hook-form + `@hookform/resolvers/zod`, Radix Select/Switch, Cloudinary (`ImageUploader`), vitest (node-only).

**Конвенции (обязательно):** коммиты на английском, без `Co-Authored-By`, автор `ui-ux-promax`. Ветка `feat/phase3.3-products` (уже создана от main; spec уже закоммичен). **Локально НЕ запускать** `prisma db push`/`seed`/e2e (Neon hang на Windows) — схема применяется на Vercel/CI. Локальная проверка: `npx prisma generate` (офлайн), `npx tsc --noEmit`, `npx vitest run`. `next lint` в проекте не настроен — не вводим.

---

## Task 1: Схема — `ProductImage.publicId` + Cloudinary-folder `stride/products`

**Files:**
- Modify: `stride-app/prisma/schema.prisma:81-90` (модель `ProductImage`)
- Modify: `stride-app/app/api/admin/media/sign/route.ts:9`

- [ ] **Step 1: Добавить `publicId` в `ProductImage`**

В `stride-app/prisma/schema.prisma`, модель `ProductImage`, добавить nullable-поле `publicId` после `url`:

```prisma
model ProductImage {
  id         String          @id @default(cuid())
  colorwayId String
  colorway   ProductColorway @relation(fields: [colorwayId], references: [id], onDelete: Cascade)
  url        String
  publicId   String?
  alt        String?
  sortOrder  Int             @default(0)

  @@index([colorwayId, sortOrder])
}
```

- [ ] **Step 2: Разрешить folder `stride/products` в sign-route**

В `stride-app/app/api/admin/media/sign/route.ts:9` расширить список:

```ts
const ALLOWED_FOLDERS = ['stride/uploads', 'stride/categories', 'stride/products'] as const;
```

- [ ] **Step 3: Перегенерировать Prisma Client офлайн (без обращения к Neon)**

Run: `cd stride-app && npx prisma generate`
Expected: `Generated Prisma Client` без сетевых ошибок (generate не ходит в БД). Тип `ProductImage.publicId: string | null` появляется в клиенте.

- [ ] **Step 4: Типчек**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок (новое поле опционально, существующий код не ломается).

- [ ] **Step 5: Commit**

```bash
git add stride-app/prisma/schema.prisma stride-app/app/api/admin/media/sign/route.ts
git commit -m "feat(products): add ProductImage.publicId column and stride/products upload folder"
```

> Реальный `db push` выполнит Vercel на первом preview-деплое ветки (`vercel.json` buildCommand). Локально не пушим.

---

## Task 2: Product DTO (`product.dto.ts`) + тесты

**Files:**
- Create: `stride-app/services/dto/product.dto.ts`
- Test: `stride-app/tests/product-dto.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `stride-app/tests/product-dto.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { productSchema } from '@/services/dto/product.dto';

const variant = { sizeEu: 42, sku: 'NK-AM90-BLK-42', price: 12990, compareAtPrice: null, stock: 5, active: true };
const colorway = { name: 'Чёрный', slug: 'black', isDefault: true, images: [], variants: [variant] };
const base = {
  name: 'Air Max 90', slug: 'air-max-90', brand: 'Nike', gender: 'UNISEX', categoryId: 'cat1',
  description: '', fitNote: '', specs: [], isBestseller: false, active: false, sortOrder: 0,
  colorways: [colorway],
};

describe('productSchema', () => {
  it('accepts a valid product', () => {
    expect(productSchema.safeParse(base).success).toBe(true);
  });

  it('draft: active=false with empty colorways is valid', () => {
    expect(productSchema.safeParse({ ...base, colorways: [] }).success).toBe(true);
  });

  it('active=true without any active variant is rejected', () => {
    const cw = { ...colorway, variants: [{ ...variant, active: false }] };
    expect(productSchema.safeParse({ ...base, active: true, colorways: [cw] }).success).toBe(false);
  });

  it('active=true with an active variant is accepted', () => {
    expect(productSchema.safeParse({ ...base, active: true }).success).toBe(true);
  });

  it('rejects bad slug', () => {
    expect(productSchema.safeParse({ ...base, slug: 'Air Max' }).success).toBe(false);
  });

  it('rejects sizeEu out of range and non-0.5 step', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sizeEu: 99 }] }] }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sizeEu: 42.3 }] }] }).success).toBe(false);
  });

  it('rejects empty sku', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, sku: '' }] }] }).success).toBe(false);
  });

  it('rejects compareAtPrice not greater than price', () => {
    expect(productSchema.safeParse({ ...base, colorways: [{ ...colorway, variants: [{ ...variant, compareAtPrice: 100 }] }] }).success).toBe(false);
  });

  it('rejects when not exactly one default colorway', () => {
    const two = [{ ...colorway, slug: 'a', isDefault: true }, { ...colorway, slug: 'b', isDefault: true }];
    expect(productSchema.safeParse({ ...base, colorways: two }).success).toBe(false);
    const none = [{ ...colorway, isDefault: false }];
    expect(productSchema.safeParse({ ...base, colorways: none }).success).toBe(false);
  });

  it('rejects duplicate colorway slugs', () => {
    const dup = [{ ...colorway, slug: 'x', isDefault: true }, { ...colorway, slug: 'x', isDefault: false }];
    expect(productSchema.safeParse({ ...base, colorways: dup }).success).toBe(false);
  });

  it('rejects duplicate sizeEu within a colorway', () => {
    const cw = { ...colorway, variants: [variant, { ...variant, sku: 'OTHER' }] };
    expect(productSchema.safeParse({ ...base, colorways: [cw] }).success).toBe(false);
  });

  it('accepts specs as key/value entries', () => {
    expect(productSchema.safeParse({ ...base, specs: [{ key: 'Материал', value: 'Сетка' }] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/product-dto.test.ts`
Expected: FAIL — `Cannot find module '@/services/dto/product.dto'`.

- [ ] **Step 3: Реализовать DTO**

Создать `stride-app/services/dto/product.dto.ts`:

```ts
import { z } from 'zod';

// slug: латиница/цифры, дефис только между сегментами (как в category.dto).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const GENDER_VALUES = ['MEN', 'WOMEN', 'UNISEX', 'KIDS'] as const;

const specEntrySchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
});

const variantSchema = z
  .object({
    id: z.string().optional(),
    sizeEu: z
      .number({ invalid_type_error: 'Размер — число' })
      .min(16, 'Размер от 16')
      .max(50, 'Размер до 50')
      .refine((n) => Number.isInteger(n * 2), 'Размер кратен 0.5'),
    sku: z.string().trim().min(1, 'Укажите SKU').max(64, 'SKU до 64 символов'),
    price: z.number().int('Цена — целое').min(0, 'Цена ≥ 0'),
    compareAtPrice: z.number().int().min(0).nullable().optional(),
    stock: z.number().int('Остаток — целое').min(0, 'Остаток ≥ 0'),
    active: z.boolean(),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    message: 'Старая цена должна быть больше текущей',
    path: ['compareAtPrice'],
  });

const imageSchema = z.object({
  url: z.string().url('Некорректный URL картинки'),
  publicId: z.string().optional(),
  alt: z.string().trim().max(200).optional(),
});

const colorwaySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Укажите название расцветки').max(80),
  slug: z.string().trim().min(1, 'Укажите slug расцветки').max(80).regex(SLUG_RE, 'Slug: латиница/цифры/дефис'),
  swatchHex: z
    .string()
    .regex(HEX_RE, 'HEX вида #RRGGBB')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isDefault: z.boolean(),
  images: z.array(imageSchema),
  variants: z.array(variantSchema),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название').max(160),
    slug: z.string().trim().min(1, 'Укажите slug').max(160).regex(SLUG_RE, 'Slug: латиница/цифры/дефис'),
    brand: z.string().trim().min(1, 'Укажите бренд').max(80),
    gender: z.enum(GENDER_VALUES),
    categoryId: z.string().min(1, 'Выберите категорию'),
    description: z.string().trim().max(4000).optional(),
    fitNote: z.string().trim().max(500).optional(),
    specs: z.array(specEntrySchema),
    isBestseller: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
    colorways: z.array(colorwaySchema),
  })
  .superRefine((p, ctx) => {
    if (p.colorways.length > 0) {
      const defaults = p.colorways.filter((c) => c.isDefault).length;
      if (defaults !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ровно одна расцветка должна быть основной', path: ['colorways'] });
      }
      const slugs = p.colorways.map((c) => c.slug);
      if (new Set(slugs).size !== slugs.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slug расцветок должны быть уникальны', path: ['colorways'] });
      }
      p.colorways.forEach((c, i) => {
        const sizes = c.variants.map((v) => v.sizeEu);
        if (new Set(sizes).size !== sizes.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Размеры в расцветке повторяются', path: ['colorways', i, 'variants'] });
        }
      });
    }
    if (p.active) {
      const ok = p.colorways.some((c) => c.variants.some((v) => v.active));
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Активный товар требует хотя бы один активный вариант', path: ['active'] });
      }
    }
  });

export type ProductValues = z.infer<typeof productSchema>;
export type ColorwayValues = z.infer<typeof colorwaySchema>;
export type VariantValues = z.infer<typeof variantSchema>;
export type SpecEntry = z.infer<typeof specEntrySchema>;
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/product-dto.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 5: Commit**

```bash
git add stride-app/services/dto/product.dto.ts stride-app/tests/product-dto.test.ts
git commit -m "feat(products): nested product zod DTO with variant/colorway validation"
```

---

## Task 3: SKU авто-подсказка (`lib/sku.ts`) + тесты

**Files:**
- Create: `stride-app/lib/sku.ts`
- Test: `stride-app/tests/sku.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `stride-app/tests/sku.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestSku } from '@/lib/sku';

describe('suggestSku', () => {
  it('builds UPPER segments joined by dash', () => {
    expect(suggestSku({ brand: 'Nike', productName: 'Air Max 90', colorwaySlug: 'black', sizeEu: 42 }))
      .toBe('NIKE-AIR-MAX-90-BLACK-42');
  });

  it('formats half sizes with a dot replaced by 5 suffix style', () => {
    expect(suggestSku({ brand: 'Nike', productName: 'AM', colorwaySlug: 'red', sizeEu: 42.5 }))
      .toBe('NIKE-AM-RED-42-5');
  });

  it('transliterates Cyrillic and strips junk', () => {
    expect(suggestSku({ brand: 'Адидас', productName: 'Бег!!!', colorwaySlug: 'white', sizeEu: 40 }))
      .toBe('ADIDAS-BEG-WHITE-40');
  });

  it('omits empty segments', () => {
    expect(suggestSku({ brand: '', productName: 'X', colorwaySlug: '', sizeEu: 41 })).toBe('X-41');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/sku.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sku'`.

- [ ] **Step 3: Реализовать util** (переиспользует транслит-логику slugify, но UPPER)

Создать `stride-app/lib/sku.ts`:

```ts
import { slugify } from './slugify';

export interface SuggestSkuInput {
  brand: string;
  productName: string;
  colorwaySlug: string;
  sizeEu: number;
}

/** Подсказка артикула: BRAND-NAME-COLOR-SIZE, UPPER, латиница/цифры, размер 42.5 → 42-5. */
export function suggestSku({ brand, productName, colorwaySlug, sizeEu }: SuggestSkuInput): string {
  const sizePart = String(sizeEu).replace('.', '-');
  const segments = [slugify(brand), slugify(productName), slugify(colorwaySlug), sizePart]
    .map((s) => s.toUpperCase())
    .filter((s) => s.length > 0);
  return segments.join('-');
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/sku.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/sku.ts stride-app/tests/sku.test.ts
git commit -m "feat(products): suggestSku helper (brand/name/color/size, transliterated)"
```

---

## Task 4: Server actions (`products.ts`) + тесты

**Files:**
- Create: `stride-app/app/actions/admin/products.ts`
- Test: `stride-app/tests/admin-products-action.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `stride-app/tests/admin-products-action.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cloudinary/server', () => ({ deleteAsset: vi.fn() }));
vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    product: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    productColorway: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    productImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    productVariant: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import { createProduct, updateProduct, deleteProduct } from '@/app/actions/admin/products';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  product: Record<string, ReturnType<typeof vi.fn>>;
  productColorway: Record<string, ReturnType<typeof vi.fn>>;
  productImage: Record<string, ReturnType<typeof vi.fn>>;
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
  orderItem: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

const variant = { sizeEu: 42, sku: 'SKU-42', price: 12990, compareAtPrice: null, stock: 5, active: true };
const colorway = { name: 'Чёрный', slug: 'black', isDefault: true, images: [], variants: [variant] };
const fullProduct = {
  name: 'Air Max 90', slug: 'air-max-90', brand: 'Nike', gender: 'UNISEX', categoryId: 'cat1',
  description: '', fitNote: '', specs: [], isBestseller: false, active: true, sortOrder: 0,
  colorways: [colorway],
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
  // Интерактивная транзакция: выполняем колбэк с тем же мок-клиентом.
  p.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  p.product.create.mockResolvedValue({ id: 'new1' });
  p.productColorway.create.mockResolvedValue({ id: 'cw1' });
});

describe('createProduct', () => {
  it('anon → ok:false, no write', async () => {
    authMock.mockResolvedValue(null);
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
    expect(p.product.create).not.toHaveBeenCalled();
  });

  it('CUSTOMER → ok:false', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
  });

  it('draft (active=false, empty colorways) → creates with minPrice/discountPct 0', async () => {
    const r = await createProduct({ ...fullProduct, active: false, colorways: [] });
    expect(r.ok).toBe(true);
    expect(p.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minPrice: 0, discountPct: 0, active: false }) }),
    );
  });

  it('full product → computes denorm minPrice from cheapest active variant', async () => {
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(true);
    expect(p.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minPrice: 12990 }) }),
    );
    expect(p.productColorway.create).toHaveBeenCalled();
    expect(p.productVariant.create).toHaveBeenCalled();
  });

  it('invalid (zod) → ok:false, no write', async () => {
    const r = await createProduct({ ...fullProduct, name: '' });
    expect(r.ok).toBe(false);
    expect(p.product.create).not.toHaveBeenCalled();
  });

  it('P2002 (dup sku) → ok:false', async () => {
    const { Prisma } = await import('@prisma/client');
    p.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await createProduct(fullProduct);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SKU/);
  });
});

describe('updateProduct', () => {
  beforeEach(() => {
    p.product.findUnique.mockResolvedValue({
      id: 'pr1',
      colorways: [{ id: 'cw1', images: [{ id: 'im1' }], variants: [{ id: 'v1' }] }],
    });
    p.orderItem.findMany.mockResolvedValue([]);
  });

  it('not found → ok:false', async () => {
    p.product.findUnique.mockResolvedValue(null);
    const r = await updateProduct('nope', fullProduct);
    expect(r.ok).toBe(false);
  });

  it('removing a referenced variant → blocked', async () => {
    // incoming has no variant id 'v1' → it is being removed
    p.orderItem.findMany.mockResolvedValue([{ productVariantId: 'v1' }]);
    const r = await updateProduct('pr1', { ...fullProduct, colorways: [{ ...colorway, id: 'cw1', variants: [{ ...variant, sku: 'NEW' }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/заказ/);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('valid update keeping referenced variant → updates in transaction', async () => {
    const r = await updateProduct('pr1', { ...fullProduct, colorways: [{ ...colorway, id: 'cw1', variants: [{ ...variant, id: 'v1' }] }] });
    expect(r.ok).toBe(true);
    expect(p.$transaction).toHaveBeenCalled();
    expect(p.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pr1' }, data: expect.objectContaining({ minPrice: 12990 }) }),
    );
    expect(p.productVariant.update).toHaveBeenCalled();
  });
});

describe('deleteProduct', () => {
  it('referenced by an order → blocked', async () => {
    p.product.findUnique.mockResolvedValue({ id: 'pr1', colorways: [{ variants: [{ id: 'v1' }], images: [] }] });
    p.orderItem.findMany.mockResolvedValue([{ productVariantId: 'v1' }]);
    const r = await deleteProduct('pr1');
    expect(r.ok).toBe(false);
    expect(p.product.delete).not.toHaveBeenCalled();
  });

  it('unreferenced → deletes', async () => {
    p.product.findUnique.mockResolvedValue({ id: 'pr1', colorways: [{ variants: [{ id: 'v1' }], images: [{ publicId: 'x' }] }] });
    p.orderItem.findMany.mockResolvedValue([]);
    p.product.delete.mockResolvedValue({ id: 'pr1' });
    const r = await deleteProduct('pr1');
    expect(r.ok).toBe(true);
    expect(p.product.delete).toHaveBeenCalledWith({ where: { id: 'pr1' } });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/admin-products-action.test.ts`
Expected: FAIL — `Cannot find module '@/app/actions/admin/products'`.

- [ ] **Step 3: Реализовать actions**

Создать `stride-app/app/actions/admin/products.ts`:

```ts
'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';
import { productSchema, type ProductValues } from '@/services/dto/product.dto';
import { productDenormFromColorways } from '@/lib/product-aggregates';

export type ProductActionResult = { ok: true; id: string } | { ok: false; error: string };

const LIST_PATH = '/admin/catalog/products';

function firstError(error: import('zod').ZodError): string {
  return error.issues[0]?.message ?? 'Проверьте поля';
}

// Денорм из дерева формы: порядок расцветок = индекс массива (как при записи sortOrder).
function denormOf(v: ProductValues): { minPrice: number; discountPct: number } {
  return productDenormFromColorways(
    v.colorways.map((c, i) => ({
      isDefault: c.isDefault,
      sortOrder: i,
      variants: c.variants.map((vr) => ({ price: vr.price, compareAtPrice: vr.compareAtPrice ?? null, active: vr.active })),
    })),
  );
}

function specsToJson(v: ProductValues): Prisma.InputJsonValue {
  return Object.fromEntries(v.specs.map((s) => [s.key, s.value]));
}

function scalarData(v: ProductValues) {
  return {
    name: v.name,
    slug: v.slug,
    brand: v.brand,
    gender: v.gender,
    categoryId: v.categoryId,
    description: v.description ?? null,
    fitNote: v.fitNote ?? null,
    specs: specsToJson(v),
    isBestseller: v.isBestseller,
    active: v.active,
    sortOrder: v.sortOrder,
    ...denormOf(v),
  };
}

function mapP2002(e: unknown): ProductActionResult | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return { ok: false, error: 'SKU занят: проверьте артикулы вариантов' };
  }
  return null;
}

export async function createProduct(raw: unknown): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;

  try {
    const id = await prisma.$transaction(async (txn) => {
      const product = await txn.product.create({ data: scalarData(v) });
      for (let ci = 0; ci < v.colorways.length; ci++) {
        const c = v.colorways[ci];
        const cw = await txn.productColorway.create({
          data: {
            productId: product.id,
            name: c.name,
            slug: c.slug,
            swatchHex: c.swatchHex ?? null,
            isDefault: c.isDefault,
            sortOrder: ci,
          },
        });
        if (c.images.length > 0) {
          await txn.productImage.createMany({
            data: c.images.map((img, ii) => ({
              colorwayId: cw.id,
              url: img.url,
              publicId: img.publicId ?? null,
              alt: img.alt ?? null,
              sortOrder: ii,
            })),
          });
        }
        for (const vr of c.variants) {
          await txn.productVariant.create({
            data: {
              colorwayId: cw.id,
              sizeEu: vr.sizeEu,
              sku: vr.sku,
              price: vr.price,
              compareAtPrice: vr.compareAtPrice ?? null,
              stock: vr.stock,
              active: vr.active,
            },
          });
        }
      }
      return product.id;
    });
    revalidatePath(LIST_PATH);
    return { ok: true, id };
  } catch (e) {
    const mapped = mapP2002(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function updateProduct(id: string, raw: unknown): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      colorways: {
        select: { id: true, images: { select: { id: true } }, variants: { select: { id: true } } },
      },
    },
  });
  if (!existing) return { ok: false, error: 'Товар не найден' };

  const existingColorwayIds = new Set(existing.colorways.map((c) => c.id));
  const existingVariantIds = new Set(existing.colorways.flatMap((c) => c.variants.map((vr) => vr.id)));
  const incomingColorwayIds = new Set(v.colorways.map((c) => c.id).filter(Boolean) as string[]);
  const incomingVariantIds = new Set(
    v.colorways.flatMap((c) => c.variants.map((vr) => vr.id).filter(Boolean) as string[]),
  );

  const removedColorwayIds = [...existingColorwayIds].filter((cid) => !incomingColorwayIds.has(cid));
  const removedVariantIds = [...existingVariantIds].filter((vid) => !incomingVariantIds.has(vid));

  // Guard: нельзя удалить variant, на который ссылается заказ.
  if (removedVariantIds.length > 0) {
    const refs = await prisma.orderItem.findMany({
      where: { productVariantId: { in: removedVariantIds } },
      select: { productVariantId: true },
      take: 1,
    });
    if (refs.length > 0) {
      return { ok: false, error: 'Вариант используется в заказах — деактивируйте вместо удаления' };
    }
  }

  try {
    await prisma.$transaction(async (txn) => {
      await txn.product.update({ where: { id }, data: scalarData(v) });

      if (removedColorwayIds.length > 0) {
        // cascade удалит images+variants удаляемых расцветок (variants проверены guard'ом).
        await txn.productColorway.deleteMany({ where: { id: { in: removedColorwayIds } } });
      }
      if (removedVariantIds.length > 0) {
        // variants выживших расцветок, которых нет во входе (cascade'нутые уже исчезли — idempotent).
        await txn.productVariant.deleteMany({ where: { id: { in: removedVariantIds } } });
      }

      for (let ci = 0; ci < v.colorways.length; ci++) {
        const c = v.colorways[ci];
        let colorwayId: string;
        if (c.id && existingColorwayIds.has(c.id)) {
          await txn.productColorway.update({
            where: { id: c.id },
            data: { name: c.name, slug: c.slug, swatchHex: c.swatchHex ?? null, isDefault: c.isDefault, sortOrder: ci },
          });
          colorwayId = c.id;
        } else {
          const created = await txn.productColorway.create({
            data: { productId: id, name: c.name, slug: c.slug, swatchHex: c.swatchHex ?? null, isDefault: c.isDefault, sortOrder: ci },
          });
          colorwayId = created.id;
        }

        // Картинки: на них нет входящих FK → полная замена.
        await txn.productImage.deleteMany({ where: { colorwayId } });
        if (c.images.length > 0) {
          await txn.productImage.createMany({
            data: c.images.map((img, ii) => ({
              colorwayId,
              url: img.url,
              publicId: img.publicId ?? null,
              alt: img.alt ?? null,
              sortOrder: ii,
            })),
          });
        }

        // Варианты: diff-upsert (НЕ replace — FK OrderItem).
        for (const vr of c.variants) {
          const data = {
            sizeEu: vr.sizeEu,
            sku: vr.sku,
            price: vr.price,
            compareAtPrice: vr.compareAtPrice ?? null,
            stock: vr.stock,
            active: vr.active,
          };
          if (vr.id && existingVariantIds.has(vr.id)) {
            await txn.productVariant.update({ where: { id: vr.id }, data });
          } else {
            await txn.productVariant.create({ data: { colorwayId, ...data } });
          }
        }
      }
    });
    revalidatePath(LIST_PATH);
    return { ok: true, id };
  } catch (e) {
    const mapped = mapP2002(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function deleteProduct(id: string): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, colorways: { select: { images: { select: { publicId: true } }, variants: { select: { id: true } } } } },
  });
  if (!product) return { ok: false, error: 'Товар не найден' };

  const variantIds = product.colorways.flatMap((c) => c.variants.map((vr) => vr.id));
  if (variantIds.length > 0) {
    const refs = await prisma.orderItem.findMany({
      where: { productVariantId: { in: variantIds } },
      select: { productVariantId: true },
      take: 1,
    });
    if (refs.length > 0) {
      return { ok: false, error: 'Товар есть в заказах — деактивируйте вместо удаления' };
    }
  }

  await prisma.product.delete({ where: { id } }); // cascade: colorways → images + variants

  // Best-effort чистка Cloudinary (не блокирует).
  const publicIds = product.colorways.flatMap((c) => c.images.map((im) => im.publicId).filter(Boolean) as string[]);
  for (const pid of publicIds) {
    try {
      await deleteAsset(pid);
    } catch {
      /* best-effort */
    }
  }
  revalidatePath(LIST_PATH);
  return { ok: true, id };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/admin-products-action.test.ts`
Expected: PASS (все группы create/update/delete).

- [ ] **Step 5: Прогнать существующие тесты денорма (регрессия)**

Run: `cd stride-app && npx vitest run tests/product-aggregates.test.ts`
Expected: PASS (функцию не меняли, только переиспользуем).

- [ ] **Step 6: Commit**

```bash
git add stride-app/app/actions/admin/products.ts stride-app/tests/admin-products-action.test.ts
git commit -m "feat(products): create/update/delete server actions with diff-upsert, denorm recompute, FK guard"
```

---

## Task 5: Таб-хаб Catalog + переезд категорий 3.2

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/layout.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/_components/catalog-tabs.tsx`
- Modify (replace): `stride-app/app/(admin)/admin/catalog/page.tsx` → redirect
- Move: `catalog/_components/category-table.tsx` → `catalog/categories/_components/category-table.tsx`
- Move: `catalog/_components/category-form.tsx` → `catalog/categories/_components/category-form.tsx`
- Move: `catalog/new/page.tsx` → `catalog/categories/new/page.tsx`
- Move: `catalog/[id]/edit/page.tsx` → `catalog/categories/[id]/edit/page.tsx`
- Move (content): текущая `catalog/page.tsx` (список категорий) → `catalog/categories/page.tsx`
- Modify: `stride-app/app/actions/admin/categories.ts:13` (`LIST_PATH`)

- [ ] **Step 1: Перенести файлы категорий в `categories/`**

```bash
cd stride-app/app/\(admin\)/admin/catalog
mkdir -p categories/_components categories/new "categories/[id]/edit"
git mv _components/category-table.tsx categories/_components/category-table.tsx
git mv _components/category-form.tsx categories/_components/category-form.tsx
git mv new/page.tsx categories/new/page.tsx
git mv "[id]/edit/page.tsx" "categories/[id]/edit/page.tsx"
git mv page.tsx categories/page.tsx
```

- [ ] **Step 2: Поправить пути в перенесённых файлах категорий**

В `categories/page.tsx`: ссылка добавления и импорт компонента таблицы:
- `<Link href="/admin/catalog/new">` → `<Link href="/admin/catalog/categories/new">`
- импорт `from './_components/category-table'` остаётся (относительный, переехал вместе).

В `categories/_components/category-table.tsx`:
- `<Link href={`/admin/catalog/${row.id}/edit`}>` → `<Link href={`/admin/catalog/categories/${row.id}/edit`}>`

В `categories/_components/category-form.tsx`:
- оба `router.push('/admin/catalog')` → `router.push('/admin/catalog/categories')`
- импорт `from '@/app/actions/admin/categories'` без изменений; `ImageUploader folder="stride/categories"` без изменений.

В `categories/new/page.tsx` и `categories/[id]/edit/page.tsx`:
- импорт формы `from '../_components/category-form'` (new) / `from '../../_components/category-form'` (edit) — проверить относительный путь после переезда; если использовался `'./_components/...'`, обновить на корректную глубину.

- [ ] **Step 3: Обновить `LIST_PATH` в categories action**

`stride-app/app/actions/admin/categories.ts:13`:

```ts
const LIST_PATH = '/admin/catalog/categories';
```

- [ ] **Step 4: Создать таб-нав**

Создать `stride-app/app/(admin)/admin/catalog/_components/catalog-tabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Товары', href: '/admin/catalog/products' },
  { label: 'Категории', href: '/admin/catalog/categories' },
];

export function CatalogTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-admin-outline-variant">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors',
              active
                ? 'border-admin-primary text-admin-on-surface'
                : 'border-transparent text-admin-on-surface-variant hover:text-admin-on-surface',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Создать catalog layout (общий для товаров и категорий)**

Создать `stride-app/app/(admin)/admin/catalog/layout.tsx`:

```tsx
import { CatalogTabs } from './_components/catalog-tabs';

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <CatalogTabs />
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Заменить `catalog/page.tsx` на redirect**

Создать `stride-app/app/(admin)/admin/catalog/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function CatalogIndex() {
  redirect('/admin/catalog/products');
}
```

- [ ] **Step 7: Проверить, что не осталось ссылок на старые пути**

Run: `cd stride-app && grep -rn "admin/catalog/new\|admin/catalog/\[id\]\|href=\"/admin/catalog\"" app components | grep -v categories | grep -v products`
Expected: пусто (все ссылки категорий теперь под `/categories`, навигация сайдбара `/admin/catalog` ведёт на redirect → products).

- [ ] **Step 8: Типчек + существующие тесты категорий**

Run: `cd stride-app && npx tsc --noEmit && npx vitest run tests/categories-action.test.ts tests/category-dto.test.ts`
Expected: tsc чисто; тесты категорий зелёные (логика не менялась, только `LIST_PATH`-строка).

- [ ] **Step 9: Commit**

```bash
git add -A stride-app/app/\(admin\)/admin/catalog stride-app/app/actions/admin/categories.ts
git commit -m "refactor(catalog): tabbed catalog hub, move categories under /admin/catalog/categories"
```

---

## Task 6: Список товаров — страница + фильтры + таблица

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/products/page.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/product-filters.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/product-table.tsx`

- [ ] **Step 1: Создать таблицу товаров (client)**

Создать `stride-app/app/(admin)/admin/catalog/products/_components/product-table.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/admin/ui/dialog';
import { formatPrice } from '@/lib/format';
import { deleteProduct } from '@/app/actions/admin/products';

export interface ProductRow {
  id: string;
  name: string;
  brand: string;
  categoryName: string;
  coverImage: string | null;
  minPrice: number;
  totalStock: number;
  active: boolean;
}

export function ProductTable({ rows }: { rows: ProductRow[] }) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<ProductRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [blockMsg, setBlockMsg] = React.useState<string | null>(null);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteProduct(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
  }

  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Фото</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Бренд</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Цена от</TableHead>
            <TableHead>Остаток</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
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
              <TableCell className="text-admin-on-surface-variant">{row.brand}</TableCell>
              <TableCell className="text-admin-on-surface-variant">{row.categoryName}</TableCell>
              <TableCell>{formatPrice(row.minPrice)}</TableCell>
              <TableCell>
                {row.totalStock === 0 ? (
                  <span className="text-admin-error text-xs font-medium">нет в наличии</span>
                ) : (
                  row.totalStock
                )}
              </TableCell>
              <TableCell>
                <span className={row.active ? 'text-admin-on-surface' : 'text-admin-on-surface-variant'}>
                  {row.active ? 'Активен' : 'Черновик'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/catalog/products/${row.id}/edit`}>Изменить</Link>
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

      <AlertModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Удалить товар?"
        description={toDelete ? `«${toDelete.name}» будет удалён безвозвратно.` : undefined}
      />

      <Dialog open={blockMsg !== null} onOpenChange={(open) => !open && setBlockMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нельзя удалить товар</DialogTitle>
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

- [ ] **Step 2: Создать фильтр-бар (client, обновляет query-параметры)**

Создать `stride-app/app/(admin)/admin/catalog/products/_components/product-filters.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/admin/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';

export interface ProductFilterOptions {
  brands: string[];
  categories: { id: string; name: string }[];
}

const GENDERS = [
  { value: 'MEN', label: 'Мужские' },
  { value: 'WOMEN', label: 'Женские' },
  { value: 'UNISEX', label: 'Унисекс' },
  { value: 'KIDS', label: 'Детские' },
];
const STATUSES = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Черновики' },
];
const ALL = '__all__';

export function ProductFilters({ options }: { options: ProductFilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete('page'); // сбрасываем пагинацию при смене фильтра
    router.push(`/admin/catalog/products?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="w-64">
        <Input
          placeholder="Поиск: название, slug, SKU"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim() || undefined);
          }}
        />
      </div>
      <Select value={params.get('brand') ?? ALL} onValueChange={(v) => setParam('brand', v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Бренд" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все бренды</SelectItem>
          {options.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get('gender') ?? ALL} onValueChange={(v) => setParam('gender', v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Пол" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Любой пол</SelectItem>
          {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get('category') ?? ALL} onValueChange={(v) => setParam('category', v)}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Категория" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все категории</SelectItem>
          {options.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get('status') ?? 'all'} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Статус" /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 3: Создать страницу списка (RSC, серверная пагинация/фильтры)**

Создать `stride-app/app/(admin)/admin/catalog/products/page.tsx`:

```tsx
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Heading } from '@/components/admin/heading';
import { Button } from '@/components/admin/ui/button';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { GENDER_VALUES } from '@/services/dto/product.dto';
import { ProductFilters } from './_components/product-filters';
import { ProductTable, type ProductRow } from './_components/product-table';

export const metadata = { title: 'Товары' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const brand = readEnumParam(sp, 'brand', await brandValues());
  const gender = readEnumParam(sp, 'gender', GENDER_VALUES);
  const categoryId = typeof sp.category === 'string' ? sp.category : undefined;
  const status = readEnumParam(sp, 'status', ['active', 'inactive'] as const);

  const where: Prisma.ProductWhereInput = {
    ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
    ...(brand ? { brand } : {}),
    ...(gender ? { gender } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { colorways: { some: { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } } } },
          ],
        }
      : {}),
  };

  const [total, products, categories, brandList] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true, name: true, brand: true, minPrice: true, active: true,
        category: { select: { name: true } },
        colorways: {
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            variants: { select: { stock: true } },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
  ]);

  const meta = buildPaginationMeta({ page, limit }, total);
  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    categoryName: p.category.name,
    coverImage: p.colorways[0]?.images[0]?.url ?? null,
    minPrice: p.minPrice,
    totalStock: p.colorways.reduce((s, c) => s + c.variants.reduce((a, v) => a + v.stock, 0), 0),
    active: p.active,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Heading title="Товары" description="Управление товарами каталога" />
        <Button asChild>
          <Link href="/admin/catalog/products/new">Добавить товар</Link>
        </Button>
      </div>

      <ProductFilters options={{ brands: brandList.map((b) => b.brand), categories }} />

      {rows.length > 0 ? (
        <>
          <ProductTable rows={rows} />
          <Pagination page={meta.page} totalPages={meta.totalPages} sp={sp} />
        </>
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Товары не найдены.
        </div>
      )}
    </div>
  );
}

// distinct-бренды как readonly-кортеж для readEnumParam (валидация значения фильтра).
async function brandValues(): Promise<readonly string[]> {
  const rows = await prisma.product.findMany({ distinct: ['brand'], select: { brand: true } });
  return rows.map((r) => r.brand);
}

function Pagination({ page, totalPages, sp }: { page: number; totalPages: number; sp: SP }) {
  if (totalPages <= 1) return null;
  const mk = (next: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'page') params.set(k, v);
    params.set('page', String(next));
    return `/admin/catalog/products?${params.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-admin-on-surface-variant">
      <span>Стр. {page} из {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={mk(page - 1)} className="px-3 py-1.5 rounded-lg border border-admin-outline-variant hover:bg-admin-surface-high">Назад</Link>}
        {page < totalPages && <Link href={mk(page + 1)} className="px-3 py-1.5 rounded-lg border border-admin-outline-variant hover:bg-admin-surface-high">Вперёд</Link>}
      </div>
    </div>
  );
}
```

> Замечание: список использует серверную пагинацию через URL + plain `Table` (как категории 3.2), а не tanstack `DataTable` (он для клиентского режима) — это сознательное упрощение под server-driven список.

- [ ] **Step 4: Типчек**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок. (Если `Prisma.ProductWhereInput.mode` ругается — это поддерживается Postgres-провайдером; убедиться, что `mode: 'insensitive'` типизируется; иначе обернуть в `Prisma.QueryMode.insensitive`.)

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/page.tsx stride-app/app/\(admin\)/admin/catalog/products/_components/product-filters.tsx stride-app/app/\(admin\)/admin/catalog/products/_components/product-table.tsx
git commit -m "feat(products): list page with brand/gender/category/status filters and pagination"
```

---

## Task 7: Variant-matrix (EU-грид + строки)

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/variant-matrix.tsx`

- [ ] **Step 1: Реализовать компонент** (работает с `useFieldArray` родителя через переданные `fields`/`append`/`remove`/`register`)

Создать `stride-app/app/(admin)/admin/catalog/products/_components/variant-matrix.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { Icon } from '@/components/admin/icon';
import type {
  Control, UseFieldArrayReturn, UseFormRegister, UseFormSetValue, UseFormGetValues, FieldValues,
} from 'react-hook-form';
import { suggestSku } from '@/lib/sku';

// Размерный грид по умолчанию: 35.0 … 48.0 с шагом 0.5
const GRID_SIZES = Array.from({ length: (48 - 35) * 2 + 1 }, (_, i) => 35 + i * 0.5);

export interface VariantMatrixProps {
  ci: number; // индекс расцветки
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldArray: UseFieldArrayReturn<any, `colorways.${number}.variants`, 'key'>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValues: UseFormGetValues<any>;
  referencedVariantIds: Set<string>; // variants, удаление которых заблокировано (в заказах)
}

export function VariantMatrix({ ci, register, fieldArray, setValue, getValues, referencedVariantIds }: VariantMatrixProps) {
  const { fields, append, remove } = fieldArray;
  const base = `colorways.${ci}.variants` as const;

  function activeSizes(): Set<number> {
    const vs = (getValues(base) as { sizeEu: number }[]) ?? [];
    return new Set(vs.map((v) => Number(v.sizeEu)));
  }

  function toggleSize(size: number) {
    const current = getValues(base) as { id?: string; sizeEu: number }[];
    const idx = current.findIndex((v) => Number(v.sizeEu) === size);
    if (idx >= 0) {
      if (current[idx].id && referencedVariantIds.has(current[idx].id!)) return; // нельзя убрать referenced
      remove(idx);
    } else {
      const product = getValues() as { brand: string; name: string; colorways: { slug: string }[] };
      append({
        sizeEu: size,
        sku: suggestSku({ brand: product.brand, productName: product.name, colorwaySlug: product.colorways[ci]?.slug ?? '', sizeEu: size }),
        price: 0,
        compareAtPrice: null,
        stock: 0,
        active: true,
      });
    }
  }

  function bulkPrice(value: number) {
    (getValues(base) as unknown[]).forEach((_, i) => setValue(`${base}.${i}.price`, value));
  }
  function bulkStock(value: number) {
    (getValues(base) as unknown[]).forEach((_, i) => setValue(`${base}.${i}.stock`, value));
  }

  const selected = activeSizes();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {GRID_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => toggleSize(size)}
            className={
              'px-2.5 py-1 rounded-lg text-xs border ' +
              (selected.has(size)
                ? 'bg-admin-primary text-admin-on-primary border-admin-primary'
                : 'border-admin-outline-variant text-admin-on-surface-variant hover:bg-admin-surface-high')
            }
          >
            {size}
          </button>
        ))}
      </div>

      {fields.length > 0 && (
        <>
          <div className="flex gap-2 items-center">
            <BulkInput label="Цена всем" onApply={bulkPrice} />
            <BulkInput label="Остаток всем" onApply={bulkStock} />
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => {
              const id = (f as { id?: string }).id;
              const locked = Boolean(id && referencedVariantIds.has(id));
              return (
                <div key={(f as { key: string }).key} className="grid grid-cols-[60px_1fr_110px_110px_90px_auto_auto] gap-2 items-center">
                  <span className="text-sm text-admin-on-surface-variant">{String((f as { sizeEu: number }).sizeEu)}</span>
                  <Input placeholder="SKU" {...register(`${base}.${i}.sku`)} />
                  <Input type="number" placeholder="Цена" {...register(`${base}.${i}.price`, { valueAsNumber: true })} />
                  <Input type="number" placeholder="Старая цена" {...register(`${base}.${i}.compareAtPrice`, { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? null : Number(v)) })} />
                  <Input type="number" placeholder="Сток" {...register(`${base}.${i}.stock`, { valueAsNumber: true })} />
                  <Switch
                    checked={(getValues(`${base}.${i}.active`) as boolean) ?? true}
                    onCheckedChange={(c) => setValue(`${base}.${i}.active`, c)}
                  />
                  <button
                    type="button"
                    aria-label="Удалить размер"
                    disabled={locked}
                    title={locked ? 'В заказах — только деактивация' : undefined}
                    onClick={() => remove(i)}
                    className="text-admin-on-surface-variant hover:text-admin-error disabled:opacity-30"
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function BulkInput({ label, onApply }: { label: string; onApply: (v: number) => void }) {
  const [v, setV] = React.useState('');
  return (
    <div className="flex items-center gap-1">
      <Input className="w-28" type="number" placeholder={label} value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="button" variant="outline" size="sm" onClick={() => onApply(Number(v) || 0)}>OK</Button>
    </div>
  );
}
```

- [ ] **Step 2: Типчек**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/variant-matrix.tsx
git commit -m "feat(products): EU-grid variant matrix with SKU suggest, bulk price/stock, referenced-lock"
```

---

## Task 8: Specs-редактор + Colorway-card (галерея через ImageUploader)

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/specs-editor.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/colorway-card.tsx`

- [ ] **Step 1: Specs-редактор (key→value)**

Создать `stride-app/app/(admin)/admin/catalog/products/_components/specs-editor.tsx`:

```tsx
'use client';

import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Icon } from '@/components/admin/icon';

export function SpecsEditor({
  control,
  register,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'specs' });
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={f.id} className="flex gap-2 items-center">
          <Input placeholder="Характеристика" {...register(`specs.${i}.key`)} />
          <Input placeholder="Значение" {...register(`specs.${i}.value`)} />
          <button type="button" aria-label="Удалить" onClick={() => remove(i)} className="text-admin-on-surface-variant hover:text-admin-error">
            <Icon name="delete" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ key: '', value: '' })}>
        Добавить характеристику
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Colorway-card** (галерея = `ImageUploader` напрямую; variant-matrix внутри)

Создать `stride-app/app/(admin)/admin/catalog/products/_components/colorway-card.tsx`:

```tsx
'use client';

import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue, type UseFormGetValues } from 'react-hook-form';
import { Input } from '@/components/admin/ui/input';
import { Button } from '@/components/admin/ui/button';
import { ImageUploader } from '@/components/admin/media/image-uploader';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { VariantMatrix } from './variant-matrix';

export interface ColorwayCardProps {
  ci: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValues: UseFormGetValues<any>;
  isDefault: boolean;
  onMakeDefault: () => void;
  onRemove: () => void;
  removable: boolean;
  referencedVariantIds: Set<string>;
}

export function ColorwayCard({
  ci, control, register, setValue, getValues, isDefault, onMakeDefault, onRemove, removable, referencedVariantIds,
}: ColorwayCardProps) {
  const variantsArray = useFieldArray({ control, name: `colorways.${ci}.variants` as const, keyName: 'key' });

  // Картинки храним как UploadedImage[] в поле формы; ImageUploader уже умеет upload/reorder/alt/delete.
  const images = (useWatch({ control, name: `colorways.${ci}.images` }) as UploadedImage[] | undefined) ?? [];

  return (
    <div className="border border-admin-outline-variant rounded-xl p-4 space-y-4 bg-admin-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="defaultColorway" checked={isDefault} onChange={onMakeDefault} />
            Основная
          </label>
          {removable && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Удалить расцветку</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Название</label>
          <Input placeholder="Чёрный" {...register(`colorways.${ci}.name`)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Slug</label>
          <Input placeholder="black" {...register(`colorways.${ci}.slug`)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Цвет (HEX)</label>
          <Input placeholder="#000000" {...register(`colorways.${ci}.swatchHex`)} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-admin-on-surface">Галерея</label>
        <ImageUploader
          value={images}
          onChange={(imgs) => setValue(`colorways.${ci}.images`, imgs, { shouldDirty: true })}
          folder="stride/products"
          max={8}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-admin-on-surface">Размеры и варианты</label>
        <VariantMatrix
          ci={ci}
          control={control}
          register={register}
          fieldArray={variantsArray}
          setValue={setValue}
          getValues={getValues}
          referencedVariantIds={referencedVariantIds}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Типчек**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/specs-editor.tsx stride-app/app/\(admin\)/admin/catalog/products/_components/colorway-card.tsx
git commit -m "feat(products): specs key/value editor and colorway card (gallery + variant matrix)"
```

---

## Task 9: Product-form оркестратор + страницы new/edit

**Files:**
- Create: `stride-app/app/(admin)/admin/catalog/products/_components/product-form.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/products/new/page.tsx`
- Create: `stride-app/app/(admin)/admin/catalog/products/[id]/edit/page.tsx`

- [ ] **Step 1: Product-form (вложенная rhf, оркестратор)**

Создать `stride-app/app/(admin)/admin/catalog/products/_components/product-form.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';
import { slugify } from '@/lib/slugify';
import { productSchema, type ProductValues, GENDER_VALUES } from '@/services/dto/product.dto';
import { createProduct, updateProduct } from '@/app/actions/admin/products';
import { ColorwayCard } from './colorway-card';
import { SpecsEditor } from './specs-editor';

export interface ProductFormInitial extends ProductValues {
  id: string;
}

const GENDER_LABELS: Record<(typeof GENDER_VALUES)[number], string> = {
  MEN: 'Мужские', WOMEN: 'Женские', UNISEX: 'Унисекс', KIDS: 'Детские',
};

const EMPTY: ProductValues = {
  name: '', slug: '', brand: '', gender: 'UNISEX', categoryId: '',
  description: '', fitNote: '', specs: [], isBestseller: false, active: false, sortOrder: 0, colorways: [],
};

export function ProductForm({
  initial,
  categories,
  brands,
  referencedVariantIds = [],
}: {
  initial?: ProductFormInitial;
  categories: { id: string; name: string }[];
  brands: string[];
  referencedVariantIds?: string[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const slugDirty = React.useRef(Boolean(initial));
  const refSet = React.useMemo(() => new Set(referencedVariantIds), [referencedVariantIds]);

  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? EMPTY,
  });
  const { register, handleSubmit, control, setValue, getValues, watch, formState: { errors, isSubmitting } } = form;

  const colorways = useFieldArray({ control, name: 'colorways', keyName: 'key' });
  const watchedColorways = watch('colorways');

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugDirty.current) setValue('slug', slugify(e.target.value));
  }

  function makeDefault(index: number) {
    const cws = getValues('colorways');
    cws.forEach((_, i) => setValue(`colorways.${i}.isDefault`, i === index));
  }

  function addColorway() {
    const isFirst = getValues('colorways').length === 0;
    colorways.append({ name: '', slug: '', swatchHex: undefined, isDefault: isFirst, images: [], variants: [] });
  }

  async function onSubmit(values: ProductValues) {
    setServerError(null);
    const res = initial ? await updateProduct(initial.id, values) : await createProduct(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/catalog/products');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
      {/* Скаляры */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Название" error={errors.name?.message}>
          <Input {...register('name', { onChange: onNameChange })} placeholder="Air Max 90" />
        </Field>
        <Field label="Slug" error={errors.slug?.message}>
          <Input {...register('slug', { onChange: () => { slugDirty.current = true; } })} placeholder="air-max-90" />
        </Field>
        <Field label="Бренд" error={errors.brand?.message}>
          <Input list="brand-list" {...register('brand')} placeholder="Nike" />
          <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Пол" error={errors.gender?.message}>
          <Select value={watch('gender')} onValueChange={(v) => setValue('gender', v as ProductValues['gender'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENDER_VALUES.map((g) => <SelectItem key={g} value={g}>{GENDER_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Категория" error={errors.categoryId?.message}>
          <Select value={watch('categoryId')} onValueChange={(v) => setValue('categoryId', v)}>
            <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Порядок (sortOrder)" error={errors.sortOrder?.message}>
          <Input type="number" {...register('sortOrder', { valueAsNumber: true })} />
        </Field>
      </div>

      <Field label="Описание" error={errors.description?.message}>
        <textarea {...register('description')} rows={4} className="w-full rounded-lg border border-admin-outline-variant bg-admin-surface px-3 py-2 text-sm" />
      </Field>
      <Field label="Примечание по посадке" error={errors.fitNote?.message}>
        <Input {...register('fitNote')} placeholder="Маломерит на полразмера" />
      </Field>

      <div className="space-y-2">
        <label className="text-sm font-medium text-admin-on-surface">Характеристики</label>
        <SpecsEditor control={control} register={register} />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch('isBestseller')} onCheckedChange={(c) => setValue('isBestseller', c)} /> Хит продаж
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch('active')} onCheckedChange={(c) => setValue('active', c)} /> Активен (виден на витрине)
        </label>
      </div>

      {/* Расцветки */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-admin-head text-lg text-admin-on-surface">Расцветки</h3>
          <Button type="button" variant="outline" size="sm" onClick={addColorway}>Добавить расцветку</Button>
        </div>
        {colorways.fields.map((f, ci) => (
          <ColorwayCard
            key={f.key}
            ci={ci}
            control={control}
            register={register}
            setValue={setValue}
            getValues={getValues}
            isDefault={Boolean(watchedColorways?.[ci]?.isDefault)}
            onMakeDefault={() => makeDefault(ci)}
            onRemove={() => colorways.remove(ci)}
            removable={colorways.fields.length > 0}
            referencedVariantIds={refSet}
          />
        ))}
        {typeof errors.colorways?.message === 'string' && <p className="text-sm text-admin-error">{errors.colorways.message}</p>}
        {typeof errors.active?.message === 'string' && <p className="text-sm text-admin-error">{errors.active.message}</p>}
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>{initial ? 'Сохранить' : 'Создать'}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/catalog/products')}>Отмена</Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-admin-on-surface">{label}</label>
      {children}
      {error && <p className="text-sm text-admin-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Страница создания**

Создать `stride-app/app/(admin)/admin/catalog/products/new/page.tsx`:

```tsx
import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { ProductForm } from '../_components/product-form';

export const metadata = { title: 'Новый товар' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const [categories, brandRows] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
  ]);
  return (
    <div className="space-y-6">
      <Heading title="Новый товар" description="Создание товара каталога" />
      <ProductForm categories={categories} brands={brandRows.map((b) => b.brand)} />
    </div>
  );
}
```

- [ ] **Step 3: Страница редактирования** (грузит дерево, маппит specs Json→entries, помечает referenced-variants)

Создать `stride-app/app/(admin)/admin/catalog/products/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { ProductForm, type ProductFormInitial } from '../../_components/product-form';
import type { ProductValues } from '@/services/dto/product.dto';

export const metadata = { title: 'Редактирование товара' };
export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, brandRows] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        colorways: {
          orderBy: { sortOrder: 'asc' },
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            variants: { orderBy: { sizeEu: 'asc' }, include: { _count: { select: { orderItems: true } } } },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
  ]);
  if (!product) notFound();

  const specsObj = (product.specs ?? {}) as Record<string, string>;
  const referencedVariantIds: string[] = [];

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    gender: product.gender,
    categoryId: product.categoryId,
    description: product.description ?? '',
    fitNote: product.fitNote ?? '',
    specs: Object.entries(specsObj).map(([key, value]) => ({ key, value: String(value) })),
    isBestseller: product.isBestseller,
    active: product.active,
    sortOrder: product.sortOrder,
    colorways: product.colorways.map((c): ProductValues['colorways'][number] => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      swatchHex: c.swatchHex ?? undefined,
      isDefault: c.isDefault,
      images: c.images.map((im) => ({ url: im.url, publicId: im.publicId ?? undefined, alt: im.alt ?? undefined })),
      variants: c.variants.map((v) => {
        if (v._count.orderItems > 0) referencedVariantIds.push(v.id);
        return {
          id: v.id,
          sizeEu: Number(v.sizeEu),
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          active: v.active,
        };
      }),
    })),
  };

  return (
    <div className="space-y-6">
      <Heading title="Редактирование товара" description={product.name} />
      <ProductForm initial={initial} categories={categories} brands={brandRows.map((b) => b.brand)} referencedVariantIds={referencedVariantIds} />
    </div>
  );
}
```

> Примечание: для галереи `ImageUploader` ожидает полный `UploadedImage` (с `width/height/format/bytes`). При загрузке из БД этих метаданных нет — они не нужны для отображения превью и записи (сохраняем только `url/publicId/alt`). Если TS ругается на форму initial-картинок, расширить `imageSchema`/тип формы до `{ url, publicId?, alt?, width?, height?, bytes?, format? }` или мапить превью через минимальный объект. Проверить на Step 4 и при необходимости ослабить тип картинки в `product.dto.ts` (поля метаданных опциональны).

- [ ] **Step 4: Типчек**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок. (Если несовпадение типа картинки form↔ImageUploader — применить примечание из Step 3: сделать метаданные картинки опциональными в DTO и прокинуть в onChange.)

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/\(admin\)/admin/catalog/products/_components/product-form.tsx stride-app/app/\(admin\)/admin/catalog/products/new/page.tsx "stride-app/app/(admin)/admin/catalog/products/[id]/edit/page.tsx"
git commit -m "feat(products): nested product form with colorways/variants/specs and new/edit pages"
```

---

## Task 10: Финальная верификация + ручной чек-лист

**Files:** (нет новых — сводная проверка)

- [ ] **Step 1: Полный typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 2: Полный прогон unit-тестов**

Run: `cd stride-app && npx vitest run`
Expected: все зелёные, включая новые `product-dto`, `sku`, `admin-products-action` и существующие категории/денорм (без регрессий).

- [ ] **Step 3: Grep — нет битых ссылок на старые catalog-пути**

Run: `cd stride-app && grep -rn "/admin/catalog/new\|/admin/catalog/\[id\]" app components`
Expected: пусто (только `/categories/...` и `/products/...`).

- [ ] **Step 4: Зафиксировать ручной чек-лист в PR-описании** (выполняется ПОСЛЕ деплоя preview — Neon локально не гоняем)

Проверить на Vercel preview:
1. `/admin/catalog` → редирект на `/admin/catalog/products`; табы `[Товары|Категории]` переключаются, активный подсвечен.
2. Категории работают на новых путях (список/создание/редактирование/reorder/удаление) — регрессий нет.
3. Создание draft-товара (active=off, без расцветок) → сохраняется, в списке «Черновик».
4. Добавление расцветки + грид размеров (тык → строка; SKU авто-заполнен), bulk price/stock; сохранение → minPrice = самый дешёвый активный вариант.
5. Включение active без активного варианта → ошибка формы «Активный товар требует хотя бы один активный вариант».
6. Загрузка картинок в галерею (Cloudinary), reorder ↑↓, alt; сохранение → витрина PDP/карточка показывают их.
7. Дубликат SKU между вариантами → «SKU занят…».
8. Удаление товара без заказов → удаляется; товар с вариантом из заказа → модалка-блок «деактивируйте».
9. Фильтры brand/gender/category/status + поиск (name/slug/sku) + пагинация.

- [ ] **Step 5: Финальный commit (если grep/чек-лист потребовал правок) и пуш ветки**

```bash
git push -u origin feat/phase3.3-products
```

PR создаётся вручную в web UI (gh CLI не установлен): база `main`, ветка `feat/phase3.3-products`.

---

## Self-Review (выполнено автором плана)

**1. Spec coverage:**
- §3.1 один слайс/одна форма/одна транзакция → Tasks 4, 9. ✓
- §3.2 таб-хаб + переезд категорий → Task 5. ✓
- §3.3 variant-matrix EU-грид + «вручную» (грид 35–48; ручной размер — через прямой ввод sizeEu, валидируется DTO [16,50]; см. примечание ниже) → Task 7. ✓
- §3.4 draft-shell + active-gate → DTO (Task 2) + create (Task 4). ✓
- §3.5 удаление block+deactivate → Task 4 (deleteProduct) + Task 6 (UI block-modal). ✓
- §3.6 SKU авто-подсказка → Task 3 + Task 7. ✓
- §3.7 specs key→value → Task 8 (specs-editor) + Task 4 (specsToJson). ✓
- §3.8 галерея reorder/alt → переиспользование ImageUploader, Task 8. ✓
- §3.9 publicId в ProductImage → Task 1. ✓
- §3.10 sortOrder числом, без reorder → форма (Task 9), список без ↑↓ (Task 6). ✓
- §4.4 diff-upsert + денорм в транзакции + FK-guard → Task 4. ✓
- §6 тесты (product-dto/sku/aggregates/admin-products-action) → Tasks 2,3,4 (+ регрессия aggregates в Task 4 Step 5). ✓

**2. Placeholder scan:** код приведён полностью во всех шагах. Два места с явными «если TS ругается → сделать так» (Task 6 Step 4 `mode:insensitive`, Task 9 Step 3/4 тип картинки) — это конкретные развязки с готовым решением, не заглушки.

**3. Type consistency:** `ProductActionResult`, `ProductValues`, `ProductRow`, `GENDER_VALUES`, `suggestSku`, `productDenormFromColorways`, `productSchema` используются согласованно между задачами. Экшены возвращают `{ ok: true; id } | { ok: false; error }` везде.

**Примечание по §3.3 «ручной размер вне грида»:** в Task 7 грид покрывает 35–48; добавление размеров вне грида (KIDS) делается прямым редактированием `sizeEu` в строке вместо кнопки грида. Если на preview потребуется явный инпут «+ размер» — добавить мелкий контрол поверх `append({...})` (тривиально, тем же `append`). DTO уже допускает [16,50], бэкенд готов.
