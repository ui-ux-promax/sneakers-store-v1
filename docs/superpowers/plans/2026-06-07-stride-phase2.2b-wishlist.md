# STRIDE — Фаза 2.2b (Wishlist / Избранное): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить избранное (♡): гость и юзер сохраняют товары, при логине списки сливаются; ♡ на карточке/PDP, счётчик в header, страница `/wishlist`.

**Architecture:** Подход A — зеркало `Cart`: таблицы `Wishlist`(token,userId?) + `WishlistItem`(productId, `@@unique`). Cookie-токен ставит Server Action. Чтение — RSC через `lib/wishlist.ts`. Toggle оптимистичный (client-остров), без денормализации. Merge при логине — `events.signIn` рядом с корзиной.

**Tech Stack:** Next 15.1 (App Router, RSC + Server Actions), Prisma 6.19 + `@prisma/adapter-neon` (WebSocket), Zod, `lucide-react` (`Heart`), Vitest, Playwright (+ axe), CI на Ubuntu.

**Спека:** `docs/superpowers/specs/2026-06-07-stride-phase2.2b-wishlist-design.md`. **Ветка:** `feat/phase2.2b-wishlist` (уже создана от `main`, spec закоммичен).

---

## Соглашения этого плана (прочитать перед стартом)

1. **Все пути — от `stride-app/`**, команды из `stride-app/`. Коммиты — английский, conventional-commits, **без `Co-Authored-By`**, автор `ui-ux-promax` ([[commit-pr-conventions]]).
2. **Neon — WebSocket**: транзакции доступны, но в этом слайсе НЕ нужны (toggle = одиночный create/delete; merge — поштучный upsert, идемпотентный). Не усложнять.
3. **TDD** для чистой логики (`lib/wishlist.ts`, `toggleWishlist`, `lib/wishlist-merge.ts`): RED → GREEN → commit. UI/интеграция — Playwright e2e.
4. **e2e только в CI (Ubuntu)** — локально Windows флакает (Neon-латентность, [[local-e2e-neon-latency]]). Локально: `typecheck` + `vitest` + `next build`.
5. **`db push` локально заблокирован (P1017)** — схему применит прод-build (`vercel.json`) и CI (`e2e.yml`). Локально для типов хватает `prisma:generate`.
6. **e2e: `getByRole('alert')` НЕ использовать** — ловит Next route-announcer (TROUBLESHOOTING P13). Целиться по тексту/роли.
7. **Тост-библиотеки в проекте НЕТ.** Ошибки ♡ → откат оптимистичного состояния + `aria-live` (sr-only) внутри кнопки. Не добавлять зависимость.
8. **♡ не трогает сток** → не конфликтует с бюджетом стока размера 42 ([[e2e-size42-stock-budget]]).

---

## Структура файлов

```
stride-app/
├─ prisma/schema.prisma                              # +Wishlist, +WishlistItem, relations (Task 1)
├─ constants/config.ts                               # +WISHLIST_COOKIE_* (Task 2)
├─ lib/wishlist-cookie.ts                            # cookie name/options (Task 2)
├─ lib/product-summary.ts                            # +id в ProductCardData (Task 3)
├─ lib/wishlist.ts                                   # resolveOwnerWishlist + read-хелперы (Task 4)
├─ services/dto/wishlist.dto.ts                      # wishlistToggleSchema (Task 5)
├─ app/actions/wishlist.ts                           # toggleWishlist (Task 6)
├─ lib/wishlist-merge.ts                             # mergeGuestWishlist + safe (Task 7)
├─ auth.ts                                           # вызов merge в events.signIn (Task 8)
├─ components/shared/wishlist/
│  ├─ wishlist-heart.tsx                             # клиентский toggle ♡ (Task 9)
│  ├─ wishlist-grid.tsx                              # сетка /wishlist (Task 14)
│  └─ wishlist-empty.tsx                             # пустое состояние (Task 14)
├─ components/shared/product-card.tsx                # ♡ top-right + wishlisted prop (Task 10)
├─ app/catalog/page.tsx, app/page.tsx,               # прокинуть wishlistedIds (Task 11)
│  components/shared/home/bestsellers-section.tsx
├─ app/product/[slug]/page.tsx                       # PDP ♡ + related wishlisted (Task 12)
├─ components/shared/wishlist/wishlist-badge.tsx     # счётчик header (Task 13)
├─ components/shared/site-header.tsx                 # вставить бейдж (Task 13)
├─ app/wishlist/page.tsx                             # страница /wishlist (Task 14)
├─ tests/wishlist.test.ts                            # unit read + merge (Task 4,7)
├─ tests/toggle-wishlist.test.ts                     # unit action (Task 6)
└─ e2e/wishlist.spec.ts + e2e/a11y.spec.ts           # e2e + a11y (Task 15)
```

---

## Task 1: Схема Prisma — Wishlist + WishlistItem

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить модели в конец `schema.prisma`**
```prisma
model Wishlist {
  id        String         @id @default(cuid())
  token     String         @unique
  userId    String?
  user      User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  items     WishlistItem[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([userId])
}

model WishlistItem {
  id         String   @id @default(cuid())
  wishlistId String
  wishlist   Wishlist @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  productId  String
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@unique([wishlistId, productId])
  @@index([wishlistId])
}
```

- [ ] **Step 2: Добавить relation-поля**

В модель `Product` (рядом с `reviews Review[]`):
```prisma
  wishlistItems WishlistItem[]
```
В модель `User` (рядом с `reviews Review[]`):
```prisma
  wishlists     Wishlist[]
```

- [ ] **Step 3: Сгенерировать клиент**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client`; в типах появились `Wishlist`, `WishlistItem`; у `Product` — `wishlistItems`, у `User` — `wishlists`.

- [ ] **Step 4: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок. (Локальный `db push` НЕ запускать — P1017.)

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(stride-app): Wishlist + WishlistItem models + relations"
```

---

## Task 2: Cookie-константы + `lib/wishlist-cookie.ts`

**Files:**
- Modify: `constants/config.ts`
- Create: `lib/wishlist-cookie.ts`

- [ ] **Step 1: Добавить константы в `constants/config.ts`** (под строкой `CART_COOKIE_MAX_AGE`)
```ts
export const WISHLIST_COOKIE_NAME = 'wishlistToken';
export const WISHLIST_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 дней
```

- [ ] **Step 2: Создать `lib/wishlist-cookie.ts`** (копия паттерна `cart-cookie.ts`)
```ts
import { WISHLIST_COOKIE_NAME, WISHLIST_COOKIE_MAX_AGE } from '@/constants/config';

export const wishlistCookieName = WISHLIST_COOKIE_NAME;

export const wishlistCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: WISHLIST_COOKIE_MAX_AGE,
  path: '/',
};
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**
```bash
git add constants/config.ts lib/wishlist-cookie.ts
git commit -m "feat(stride-app): wishlist cookie constants + options"
```

---

## Task 3: `id` в `ProductCardData`

> ♡ на карточке требует `productId`. Карточка сейчас знает только `slug`. Добавляем `id` в DTO карточки — единая правка, далее используется в Task 10/12.

**Files:**
- Modify: `lib/product-summary.ts`

- [ ] **Step 1: Добавить поле `id` в интерфейс `ProductCardData`** (первой строкой полей)
```ts
export interface ProductCardData {
  id: string;
  slug: string;
  // ...остальное без изменений
```

- [ ] **Step 2: Заполнить `id` в `buildProductCardData`** (в возвращаемом объекте, перед `slug`)
```ts
  return {
    id: product.id,
    slug: product.slug,
    // ...остальное без изменений
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок (поле добавочное, существующие потребители не ломаются).

- [ ] **Step 4: Commit**
```bash
git add lib/product-summary.ts
git commit -m "feat(stride-app): expose product id in ProductCardData"
```

---

## Task 4: Логика чтения `lib/wishlist.ts` — TDD

**Files:**
- Create: `lib/wishlist.ts`
- Create: `tests/wishlist.test.ts`

- [ ] **Step 1: Падающий тест** — `tests/wishlist.test.ts`
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    wishlist: { findFirst: vi.fn(), create: vi.fn() },
    wishlistItem: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { resolveOwnerWishlist, getWishlistProductIds, getWishlistCount } from '@/lib/wishlist';
import { prisma } from '@/lib/prisma-client';

const wlFindFirst = prisma.wishlist.findFirst as unknown as ReturnType<typeof vi.fn>;
const wlCreate = prisma.wishlist.create as unknown as ReturnType<typeof vi.fn>;
const itemFindMany = prisma.wishlistItem.findMany as unknown as ReturnType<typeof vi.fn>;
const itemCount = prisma.wishlistItem.count as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('resolveOwnerWishlist', () => {
  it('залогинен → ищет по userId', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    const w = await resolveOwnerWishlist({ user: { id: 'u1' } } as never, 'guest-tok', { create: false });
    expect(w).toEqual({ id: 'w1', userId: 'u1', token: 't' });
    expect(wlFindFirst).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
  it('гость → ищет по token', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w2', userId: null, token: 'tok' });
    const w = await resolveOwnerWishlist(null, 'tok', { create: false });
    expect(w?.id).toBe('w2');
    expect(wlFindFirst).toHaveBeenCalledWith({ where: { token: 'tok' } });
  });
  it('нет владельца и create:false → null, без create', async () => {
    wlFindFirst.mockResolvedValue(null);
    const w = await resolveOwnerWishlist(null, 'tok', { create: false });
    expect(w).toBeNull();
    expect(wlCreate).not.toHaveBeenCalled();
  });
  it('гость без записи и create:true → создаёт по token', async () => {
    wlFindFirst.mockResolvedValue(null);
    wlCreate.mockResolvedValue({ id: 'w3', userId: null, token: 'tok' });
    const w = await resolveOwnerWishlist(null, 'tok', { create: true });
    expect(w?.id).toBe('w3');
    expect(wlCreate).toHaveBeenCalledWith({ data: { token: 'tok', userId: undefined } });
  });
  it('гость без token и create:false → null, без запроса', async () => {
    const w = await resolveOwnerWishlist(null, undefined, { create: false });
    expect(w).toBeNull();
    expect(wlFindFirst).not.toHaveBeenCalled();
  });
});

describe('getWishlistProductIds', () => {
  it('нет владельца → пустой Set, без запроса items', async () => {
    wlFindFirst.mockResolvedValue(null);
    const ids = await getWishlistProductIds(null, undefined);
    expect(ids.size).toBe(0);
    expect(itemFindMany).not.toHaveBeenCalled();
  });
  it('есть владелец → Set productId', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    itemFindMany.mockResolvedValue([{ productId: 'p1' }, { productId: 'p2' }]);
    const ids = await getWishlistProductIds({ user: { id: 'u1' } } as never, 't');
    expect([...ids].sort()).toEqual(['p1', 'p2']);
  });
});

describe('getWishlistCount', () => {
  it('нет владельца → 0', async () => {
    wlFindFirst.mockResolvedValue(null);
    expect(await getWishlistCount(null, undefined)).toBe(0);
    expect(itemCount).not.toHaveBeenCalled();
  });
  it('есть владелец → count', async () => {
    wlFindFirst.mockResolvedValue({ id: 'w1', userId: 'u1', token: 't' });
    itemCount.mockResolvedValue(3);
    expect(await getWishlistCount({ user: { id: 'u1' } } as never, 't')).toBe(3);
    expect(itemCount).toHaveBeenCalledWith({ where: { wishlistId: 'w1' } });
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/wishlist.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wishlist'`.

- [ ] **Step 3: Реализовать `lib/wishlist.ts`**
```ts
import type { Session } from 'next-auth';
import { prisma } from '@/lib/prisma-client';
import { productCardInclude, buildProductCardData, type ProductCardData } from '@/lib/product-summary';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD } from '@/constants/config';

const WISHLIST_TAKE = 100;

type OwnerWishlist = { id: string; userId: string | null; token: string };

// Резолв владельца: залогинен → по userId; гость → по token.
// create:true создаёт при отсутствии (token генерируется вызывателем для гостя;
// для user без token используется переданный token — он всегда есть, т.к. action
// гарантирует cookie перед резолвом).
export async function resolveOwnerWishlist(
  session: Session | null,
  token: string | undefined,
  { create }: { create: boolean },
): Promise<OwnerWishlist | null> {
  const userId = session?.user?.id ?? null;
  if (userId) {
    const existing = await prisma.wishlist.findFirst({ where: { userId } });
    if (existing) return existing;
    if (!create) return null;
    // user без wishlist: создаём, привязываем token (нужен — @unique NOT NULL).
    if (!token) return null;
    return prisma.wishlist.create({ data: { token, userId } });
  }
  if (!token) return null;
  const existing = await prisma.wishlist.findFirst({ where: { token } });
  if (existing) return existing;
  if (!create) return null;
  return prisma.wishlist.create({ data: { token, userId: undefined } });
}

export async function getWishlistProductIds(
  session: Session | null,
  token: string | undefined,
): Promise<Set<string>> {
  const owner = await resolveOwnerWishlist(session, token, { create: false });
  if (!owner) return new Set();
  const rows = await prisma.wishlistItem.findMany({
    where: { wishlistId: owner.id },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

export async function getWishlistCount(
  session: Session | null,
  token: string | undefined,
): Promise<number> {
  const owner = await resolveOwnerWishlist(session, token, { create: false });
  if (!owner) return 0;
  return prisma.wishlistItem.count({ where: { wishlistId: owner.id } });
}

export async function getWishlistItems(
  session: Session | null,
  token: string | undefined,
): Promise<ProductCardData[]> {
  const owner = await resolveOwnerWishlist(session, token, { create: false });
  if (!owner) return [];
  const rows = await prisma.wishlistItem.findMany({
    where: { wishlistId: owner.id, product: { active: true } },
    orderBy: { createdAt: 'desc' },
    take: WISHLIST_TAKE,
    include: { product: { include: productCardInclude } },
  });
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };
  return rows.map((r) => buildProductCardData(r.product, now, cfg));
}
```
> `getWishlistItems` не тестируется юнитом (тяжёлый include); покрывается e2e. Юнит-тесты — на резолвер/ids/count.

- [ ] **Step 4: GREEN**

Run: `npx vitest run tests/wishlist.test.ts`
Expected: PASS (все describe-блоки).

- [ ] **Step 5: typecheck + commit**
```bash
npm run typecheck
git add lib/wishlist.ts tests/wishlist.test.ts
git commit -m "feat(stride-app): wishlist read logic (resolve/ids/count/items) + unit tests"
```

---

## Task 5: DTO `services/dto/wishlist.dto.ts`

**Files:**
- Create: `services/dto/wishlist.dto.ts`

- [ ] **Step 1: Создать схему**
```ts
import { z } from 'zod';

export const wishlistToggleSchema = z.object({
  productId: z.string().min(1),
});
export type WishlistToggleValues = z.infer<typeof wishlistToggleSchema>;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**
```bash
git add services/dto/wishlist.dto.ts
git commit -m "feat(stride-app): wishlist toggle DTO (zod)"
```

---

## Task 6: Server Action `toggleWishlist` — TDD

**Files:**
- Create: `app/actions/wishlist.ts`
- Create: `tests/toggle-wishlist.test.ts`

- [ ] **Step 1: Падающий тест** — `tests/toggle-wishlist.test.ts`
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined),
    set: (k: string, v: string) => { store.set(k, v); },
  })),
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/wishlist', () => ({ resolveOwnerWishlist: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: { wishlistItem: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));

import { toggleWishlist } from '@/app/actions/wishlist';
import { auth } from '@/auth';
import { resolveOwnerWishlist } from '@/lib/wishlist';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const resolveMock = resolveOwnerWishlist as unknown as ReturnType<typeof vi.fn>;
const itemFindUnique = prisma.wishlistItem.findUnique as unknown as ReturnType<typeof vi.fn>;
const itemCreate = prisma.wishlistItem.create as unknown as ReturnType<typeof vi.fn>;
const itemDelete = prisma.wishlistItem.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  store.set('wishlistToken', 'tok');
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  resolveMock.mockResolvedValue({ id: 'w1', userId: 'u1', token: 'tok' });
});

describe('toggleWishlist', () => {
  it('нет item → create, active:true', async () => {
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockResolvedValue({ id: 'i1' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
    expect(itemCreate).toHaveBeenCalledWith({ data: { wishlistId: 'w1', productId: 'p1' } });
    expect(itemDelete).not.toHaveBeenCalled();
  });
  it('есть item → delete, active:false', async () => {
    itemFindUnique.mockResolvedValue({ id: 'i1' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: false });
    expect(itemDelete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(itemCreate).not.toHaveBeenCalled();
  });
  it('P2002 на create (гонка) → active:true', async () => {
    const { Prisma } = await import('@prisma/client');
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
  });
  it('невалидный productId (zod) → ok:false, без записи', async () => {
    const r = await toggleWishlist({ productId: '' });
    expect(r.ok).toBe(false);
    expect(itemCreate).not.toHaveBeenCalled();
    expect(itemDelete).not.toHaveBeenCalled();
  });
  it('гость без cookie → генерит token, ставит cookie', async () => {
    store.clear();
    authMock.mockResolvedValue(null);
    resolveMock.mockResolvedValue({ id: 'w9', userId: null, token: 'newtok' });
    itemFindUnique.mockResolvedValue(null);
    itemCreate.mockResolvedValue({ id: 'i9' });
    const r = await toggleWishlist({ productId: 'p1' });
    expect(r).toEqual({ ok: true, active: true });
    expect(store.get('wishlistToken')).toBeTruthy(); // cookie проставлена
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/toggle-wishlist.test.ts`
Expected: FAIL — модуль `@/app/actions/wishlist` не найден.

- [ ] **Step 3: Реализовать `app/actions/wishlist.ts`**
```ts
'use server';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { resolveOwnerWishlist } from '@/lib/wishlist';
import { wishlistCookieName, wishlistCookieOptions } from '@/lib/wishlist-cookie';
import { wishlistToggleSchema } from '@/services/dto/wishlist.dto';

export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string };

export async function toggleWishlist(raw: unknown): Promise<ToggleResult> {
  const parsed = wishlistToggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Некорректный товар' };
  const { productId } = parsed.data;

  const session = await auth();
  const store = await cookies();
  let token = store.get(wishlistCookieName)?.value;

  // Гость без token: генерим и ставим cookie (Server Action умеет писать cookie).
  if (!token) {
    token = randomUUID();
    store.set(wishlistCookieName, token, wishlistCookieOptions);
  }

  const owner = await resolveOwnerWishlist(session, token, { create: true });
  if (!owner) return { ok: false, error: 'Не удалось открыть избранное' };

  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: owner.id, productId } },
    select: { id: true },
  });

  try {
    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      revalidatePath('/wishlist');
      return { ok: true, active: false };
    }
    await prisma.wishlistItem.create({ data: { wishlistId: owner.id, productId } });
  } catch (e) {
    // P2002: гонка дубля на @@unique → товар уже в избранном.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      revalidatePath('/wishlist');
      return { ok: true, active: true };
    }
    // P2003: несуществующий productId (FK) → ошибка клиенту.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return { ok: false, error: 'Товар не найден' };
    }
    throw e;
  }

  revalidatePath('/wishlist');
  return { ok: true, active: true };
}
```

- [ ] **Step 4: GREEN + полный прогон**

Run: `npx vitest run tests/toggle-wishlist.test.ts && npm test`
Expected: новый сьют PASS; все прежние зелёные.

- [ ] **Step 5: typecheck + commit**
```bash
npm run typecheck
git add app/actions/wishlist.ts tests/toggle-wishlist.test.ts
git commit -m "feat(stride-app): toggleWishlist action (guest cookie, unique guard) + tests"
```

---

## Task 7: Merge при логине `lib/wishlist-merge.ts` — TDD

**Files:**
- Create: `lib/wishlist-merge.ts`
- Modify: `tests/wishlist.test.ts` (добавить describe-блок merge)

- [ ] **Step 1: Падающий тест** — добавить в конец `tests/wishlist.test.ts`

В начале файла расширить мок prisma (заменить `vi.mock('@/lib/prisma-client', ...)` на):
```ts
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    wishlist: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    wishlistItem: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  },
}));
```
Добавить импорт `mergeGuestWishlist` (из `lib/wishlist-merge.ts`) и хэндлы новых моков (рядом с прочими, после существующих `wlFindFirst`/`itemFindMany`/`itemCount`):
```ts
import { mergeGuestWishlist } from '@/lib/wishlist-merge';
const wlUpdate = prisma.wishlist.update as unknown as ReturnType<typeof vi.fn>;
const wlDelete = prisma.wishlist.delete as unknown as ReturnType<typeof vi.fn>;
const itemUpsert = prisma.wishlistItem.upsert as unknown as ReturnType<typeof vi.fn>;
```
Добавить блок:
```ts
describe('mergeGuestWishlist', () => {
  it('нет гостевого token → ничего', async () => {
    await mergeGuestWishlist(undefined, 'u1');
    expect(wlFindFirst).not.toHaveBeenCalled();
  });
  it('нет гостевой записи → ничего', async () => {
    wlFindFirst.mockResolvedValueOnce(null); // guest
    await mergeGuestWishlist('tok', 'u1');
    expect(itemUpsert).not.toHaveBeenCalled();
  });
  it('у юзера нет wishlist → привязать гостевой к userId', async () => {
    wlFindFirst
      .mockResolvedValueOnce({ id: 'g1', token: 'tok', userId: null }) // guest by token
      .mockResolvedValueOnce(null); // user wishlist
    await mergeGuestWishlist('tok', 'u1');
    expect(wlUpdate).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { userId: 'u1' } });
    expect(itemUpsert).not.toHaveBeenCalled();
  });
  it('у юзера есть wishlist → перенести items upsert + удалить гостевой', async () => {
    wlFindFirst
      .mockResolvedValueOnce({ id: 'g1', token: 'tok', userId: null }) // guest
      .mockResolvedValueOnce({ id: 'w1', token: 'ut', userId: 'u1' }); // user
    itemFindMany.mockResolvedValueOnce([{ productId: 'p1' }, { productId: 'p2' }]); // guest items
    await mergeGuestWishlist('tok', 'u1');
    expect(itemUpsert).toHaveBeenCalledTimes(2);
    expect(itemUpsert).toHaveBeenCalledWith({
      where: { wishlistId_productId: { wishlistId: 'w1', productId: 'p1' } },
      create: { wishlistId: 'w1', productId: 'p1' },
      update: {},
    });
    expect(wlDelete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });
  it('гостевой wishlist уже принадлежит userId → no-op привязки', async () => {
    wlFindFirst.mockResolvedValueOnce({ id: 'g1', token: 'tok', userId: 'u1' }); // guest already user's
    await mergeGuestWishlist('tok', 'u1');
    expect(wlUpdate).not.toHaveBeenCalled();
    expect(itemUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/wishlist.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wishlist-merge'`.

- [ ] **Step 3: Реализовать `lib/wishlist-merge.ts`** (зеркало `cart-merge.ts`)
```ts
import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

// Слияние гостевого избранного в избранное пользователя при входе.
// Neon без жёстких транзакций → идемпотентный/сходящийся дизайн:
//  - перенос позиций upsert по @@unique([wishlistId, productId]) (дедуп, защита от P2002);
//  - удаление гостевого wishlist ПОСЛЕ переноса → повтор после сбоя не двоит;
//  - повтор входа безопасен.
export async function mergeGuestWishlist(guestToken: string | undefined, userId: string): Promise<void> {
  if (!guestToken) return;

  const guest = await prisma.wishlist.findFirst({ where: { token: guestToken } });
  if (!guest) return;

  // Гостевой уже принадлежит этому пользователю — нечего сливать.
  if (guest.userId === userId) return;

  const userWishlist = await prisma.wishlist.findFirst({ where: { userId } });

  // У пользователя нет своего wishlist → просто привязываем гостевой.
  if (!userWishlist) {
    await prisma.wishlist.update({ where: { id: guest.id }, data: { userId } });
    return;
  }

  // Иначе переносим позиции и удаляем опустевший гостевой.
  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId: guest.id },
    select: { productId: true },
  });
  for (const it of items) {
    await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: userWishlist.id, productId: it.productId } },
      create: { wishlistId: userWishlist.id, productId: it.productId },
      update: {},
    });
  }
  await prisma.wishlist.delete({ where: { id: guest.id } });
}

// Обёртка для events.signIn: merge НИКОГДА не должен ронять аутентификацию.
export async function safeMergeGuestWishlist(guestToken: string | undefined, userId: string): Promise<boolean> {
  try {
    await mergeGuestWishlist(guestToken, userId);
    return true;
  } catch (err) {
    logger.error('wishlist_merge_on_signin_failed', err);
    return false;
  }
}
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run tests/wishlist.test.ts`
Expected: PASS (read + merge блоки).

- [ ] **Step 5: typecheck + commit**
```bash
npm run typecheck
git add lib/wishlist-merge.ts tests/wishlist.test.ts
git commit -m "feat(stride-app): guest wishlist merge on sign-in (idempotent) + tests"
```

---

## Task 8: Подключить merge в `auth.ts` `events.signIn`

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Добавить вызов merge избранного рядом с корзиной**

В `auth.ts`, внутри `events.signIn`, в блоке `try` — после `await safeMergeGuestCart(guestToken, user.id);` добавить:
```ts
        const { wishlistCookieName } = await import('@/lib/wishlist-cookie');
        const { safeMergeGuestWishlist } = await import('@/lib/wishlist-merge');
        const guestWishlistToken = store.get(wishlistCookieName)?.value;
        await safeMergeGuestWishlist(guestWishlistToken, user.id);
```
> `store` уже получен выше (`const store = await cookies();`). Оба merge независимы; оба glоtают ошибки.

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**
```bash
git add auth.ts
git commit -m "feat(stride-app): merge guest wishlist into account on sign-in"
```

---

## Task 9: Клиентский компонент `wishlist-heart.tsx`

**Files:**
- Create: `components/shared/wishlist/wishlist-heart.tsx`

> Оптимистичный toggle на `useState` + `useTransition`. Ошибка → откат + `aria-live` (sr-only) сообщение (тостов в проекте нет). `router.refresh()` после успеха — обновить счётчик header / страницу `/wishlist`.

- [ ] **Step 1: Создать компонент**
```tsx
'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toggleWishlist } from '@/app/actions/wishlist';
import { cn } from '@/lib/utils';

type Props = {
  productId: string;
  initialActive: boolean;
  variant?: 'card' | 'pdp';
};

export function WishlistHeart({ productId, initialActive, variant = 'card' }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (pending) return;
    const next = !active;
    setActive(next); // оптимистично
    setError(null);
    startTransition(async () => {
      const res = await toggleWishlist({ productId });
      if (!res.ok) {
        setActive(!next); // откат
        setError('Не удалось обновить избранное');
        return;
      }
      setActive(res.active);
      router.refresh(); // обновить счётчик/список
    });
  };

  const label = active ? 'Убрать из избранного' : 'В избранное';

  if (variant === 'pdp') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className="btn btn-secondary btn-md inline-flex items-center gap-2"
      >
        <Heart className={cn('w-5 h-5', active && 'fill-current text-[#e23b4e]')} aria-hidden />
        <span>{active ? 'В избранном' : 'В избранное'}</span>
        <span className="sr-only" role="status" aria-live="polite">{error ?? ''}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="absolute top-2 right-2 z-10 w-9 h-9 grid place-items-center rounded-full bg-white/90 shadow-sm hover:bg-white transition"
    >
      <Heart className={cn('w-[18px] h-[18px]', active ? 'fill-current text-[#e23b4e]' : 'text-ink-muted')} aria-hidden />
      <span className="sr-only" role="status" aria-live="polite">{error ?? ''}</span>
    </button>
  );
}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок (компонент пока не подключён — проверяем компиляцию).

- [ ] **Step 3: Commit**
```bash
git add components/shared/wishlist/wishlist-heart.tsx
git commit -m "feat(stride-app): WishlistHeart client component (optimistic toggle)"
```

---

## Task 10: ♡ на карточке товара

**Files:**
- Modify: `components/shared/product-card.tsx`

- [ ] **Step 1: Добавить prop `wishlisted` + ♡ в карточку**

В `product-card.tsx`:
1. Импорт сверху:
```ts
import { WishlistHeart } from '@/components/shared/wishlist/wishlist-heart';
```
2. Сигнатуру изменить на:
```tsx
export function ProductCard({ data, wishlisted = false }: { data: ProductCardData; wishlisted?: boolean }) {
```
3. Внутри `<div className="relative aspect-square ...">` (контейнер картинки), первым дочерним элементом (до бейджа) добавить:
```tsx
        <WishlistHeart productId={data.id} initialActive={wishlisted} variant="card" />
```
> ♡ сверху-справа (вариант A), бейдж остаётся сверху-слева, кнопка «+» снизу-справа — не конфликтуют.

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок. Существующие вызовы `<ProductCard data={p} />` валидны (`wishlisted` опционально, default false).

- [ ] **Step 3: Commit**
```bash
git add components/shared/product-card.tsx
git commit -m "feat(stride-app): heart toggle on product card (top-right)"
```

---

## Task 11: Прокинуть `wishlistedIds` в каталог/главную/бестселлеры

**Files:**
- Modify: `app/catalog/page.tsx`
- Modify: `app/page.tsx`
- Modify: `components/shared/home/bestsellers-section.tsx`

- [ ] **Step 1: Каталог** — `app/catalog/page.tsx`

Импорты:
```ts
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistProductIds } from '@/lib/wishlist';
```
После `const { products, total, page, totalPages, facets } = await findProducts(sp);` добавить:
```ts
  const [session, store] = await Promise.all([auth(), cookies()]);
  const wishlistedIds = await getWishlistProductIds(session, store.get(wishlistCookieName)?.value);
```
Рендер карточек заменить на:
```tsx
              {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted={wishlistedIds.has(p.id)} />)}
```

- [ ] **Step 2: Бестселлеры (главная)** — `components/shared/home/bestsellers-section.tsx`

Сигнатуру:
```tsx
export function BestsellersSection({ products, wishlistedIds }: { products: ProductCardData[]; wishlistedIds: Set<string> }) {
```
Рендер:
```tsx
        {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted={wishlistedIds.has(p.id)} />)}
```

- [ ] **Step 3: Главная** — `app/page.tsx`

Импорты (если ещё нет):
```ts
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistProductIds } from '@/lib/wishlist';
```
После строки `const bestsellers = bestRaw.map((p) => buildProductCardData(p, now, cfg));` добавить:
```ts
  const [session, store] = await Promise.all([auth(), cookies()]);
  const wishlistedIds = await getWishlistProductIds(session, store.get(wishlistCookieName)?.value);
```
В JSX, где рендерится `<BestsellersSection products={bestsellers} />`, передать проп:
```tsx
        <BestsellersSection products={bestsellers} wishlistedIds={wishlistedIds} />
```

- [ ] **Step 4: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/catalog` и `/` собираются.

- [ ] **Step 5: Commit**
```bash
git add app/catalog/page.tsx app/page.tsx components/shared/home/bestsellers-section.tsx
git commit -m "feat(stride-app): thread wishlisted state into catalog + home cards"
```

---

## Task 12: ♡ на PDP + related

**Files:**
- Modify: `app/product/[slug]/page.tsx`

- [ ] **Step 1: Прочитать wishlistedIds на PDP**

В `app/product/[slug]/page.tsx` импорты (auth/cookies скорее всего уже есть — `session` используется для отзывов; добавить недостающее):
```ts
import { cookies } from 'next/headers';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistProductIds } from '@/lib/wishlist';
import { WishlistHeart } from '@/components/shared/wishlist/wishlist-heart';
```
Рядом с чтением `session` (уже есть для отзывов) добавить:
```ts
  const store = await cookies();
  const wishlistedIds = await getWishlistProductIds(session, store.get(wishlistCookieName)?.value);
```
> Если `session` ещё не получена выше по странице — получить `const session = await auth();` (auth уже импортирован для отзывов).

- [ ] **Step 2: ♡-кнопка в buy-панель**

После `<h1 ...>{product.name}</h1>` (строка 87) — в той же правой колонке, рядом с агрегатом отзывов/ценой — добавить:
```tsx
          <div className="mt-3">
            <WishlistHeart productId={product.id} initialActive={wishlistedIds.has(product.id)} variant="pdp" />
          </div>
```
> Точное место — рядом с блоком покупки; не ломать существующий layout. Если есть отдельный buy-компонент — разместить ♡ под кнопкой «В корзину».

- [ ] **Step 3: ♡ на related-карточках**

Рендер related (строка ~120) заменить на:
```tsx
            {related.map((p) => <ProductCard key={p.slug} data={p} wishlisted={wishlistedIds.has(p.id)} />)}
```

- [ ] **Step 4: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/product/[slug]` собирается (ƒ Dynamic).

- [ ] **Step 5: Commit**
```bash
git add "app/product/[slug]/page.tsx"
git commit -m "feat(stride-app): heart on PDP buy panel + related cards"
```

---

## Task 13: Счётчик ♡ в header

**Files:**
- Create: `components/shared/wishlist/wishlist-badge.tsx`
- Modify: `components/shared/site-header.tsx`

- [ ] **Step 1: Создать RSC-бейдж** — `components/shared/wishlist/wishlist-badge.tsx`
```tsx
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistCount } from '@/lib/wishlist';

export async function WishlistBadge() {
  const [session, store] = await Promise.all([auth(), cookies()]);
  const count = await getWishlistCount(session, store.get(wishlistCookieName)?.value);
  return (
    <Link
      href="/wishlist"
      className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft"
      aria-label={count ? `Избранное, ${count}` : 'Избранное пусто'}
    >
      <Heart className="w-5 h-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 grid place-items-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground tnum">{count}</span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Вставить в header** — `components/shared/site-header.tsx`

Импорт:
```ts
import { WishlistBadge } from './wishlist/wishlist-badge';
```
В ряду иконок — между `<AuthNav />` и `<CartBadge />` добавить:
```tsx
          <WishlistBadge />
```

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок. Бейдж — async RSC, корректно внутри server-компонента header.

- [ ] **Step 4: Commit**
```bash
git add components/shared/wishlist/wishlist-badge.tsx components/shared/site-header.tsx
git commit -m "feat(stride-app): wishlist count badge in header"
```

---

## Task 14: Страница `/wishlist` + grid + empty

**Files:**
- Create: `components/shared/wishlist/wishlist-empty.tsx`
- Create: `components/shared/wishlist/wishlist-grid.tsx`
- Create: `app/wishlist/page.tsx`

- [ ] **Step 1: Пустое состояние** — `components/shared/wishlist/wishlist-empty.tsx`
```tsx
import Link from 'next/link';
import { Heart } from 'lucide-react';

export function WishlistEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-12 text-center">
      <Heart className="w-10 h-10 mx-auto text-ink-muted" aria-hidden />
      <h2 className="mt-3 font-semibold text-lg">В избранном пока пусто</h2>
      <p className="mt-1 text-sm text-ink-muted">Нажимайте ♡ на товарах, чтобы сохранить их сюда.</p>
      <Link href="/catalog" className="btn btn-primary btn-md mt-5 inline-flex">Смотреть каталог</Link>
    </div>
  );
}
```

- [ ] **Step 2: Сетка** — `components/shared/wishlist/wishlist-grid.tsx`
```tsx
import { ProductCard } from '@/components/shared/product-card';
import type { ProductCardData } from '@/lib/product-summary';

export function WishlistGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted />)}
    </div>
  );
}
```
> Все карточки на `/wishlist` — `wishlisted` (♡ залит); клик по ♡ убирает + `router.refresh()` обновляет список.

- [ ] **Step 3: Страница** — `app/wishlist/page.tsx`
```tsx
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { getWishlistItems } from '@/lib/wishlist';
import { WishlistGrid } from '@/components/shared/wishlist/wishlist-grid';
import { WishlistEmpty } from '@/components/shared/wishlist/wishlist-empty';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Избранное' };

export default async function WishlistPage() {
  const [session, store] = await Promise.all([auth(), cookies()]);
  const products = await getWishlistItems(session, store.get(wishlistCookieName)?.value);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8 pb-16">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">
        Избранное{products.length > 0 && <span className="text-ink-muted font-normal text-2xl"> ({products.length})</span>}
      </h1>
      {products.length === 0 ? <WishlistEmpty /> : <WishlistGrid products={products} />}
    </div>
  );
}
```

- [ ] **Step 4: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/wishlist` в списке маршрутов (ƒ Dynamic).

- [ ] **Step 5: Commit**
```bash
git add app/wishlist/page.tsx components/shared/wishlist/wishlist-grid.tsx components/shared/wishlist/wishlist-empty.tsx
git commit -m "feat(stride-app): /wishlist page (grid + empty state)"
```

---

## Task 15: E2E + a11y

**Files:**
- Create: `e2e/wishlist.spec.ts`
- Modify: `e2e/a11y.spec.ts`

- [ ] **Step 1: `e2e/wishlist.spec.ts`**

> Хелпер регистрации — как в `e2e/review.spec.ts`/`checkout.spec.ts`. ♡ на карточке — `getByRole('button', { name: 'В избранное' })`.
```ts
import { test, expect, type Page } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

test('гость лайкает товар → виден в /wishlist; счётчик растёт; убрать → пусто', async ({ page }) => {
  await page.goto('/catalog');
  const firstHeart = page.getByRole('button', { name: 'В избранное' }).first();
  await firstHeart.click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного' }).first()).toBeVisible();

  await page.goto('/wishlist');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();

  // Убрать с /wishlist
  await page.getByRole('button', { name: 'Убрать из избранного' }).first().click();
  await expect(page.getByText('В избранном пока пусто')).toBeVisible();
});

test('merge: гость лайкнул → регистрация → товар в /wishlist', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного' }).first()).toBeVisible();

  await register(page);

  await page.goto('/wishlist');
  await expect(page.locator('article').first()).toBeVisible();
});
```
> Примечание: если на карточке sold-out ♡ всё равно есть — `.first()` берёт любую. Инвариант теста: после лайка появляется «Убрать из избранного», `/wishlist` непустой, после удаления — пустое состояние.

- [ ] **Step 2: a11y — добавить `/wishlist`** в `e2e/a11y.spec.ts`

Если в файле есть список путей — добавить `/wishlist`. Если отдельные тесты — добавить по образцу:
```ts
test('a11y: /wishlist (гость, пусто)', async ({ page }) => {
  await page.goto('/wishlist');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```
> Имя импортируемого `AxeBuilder` и хелпера — сверить с существующим `a11y.spec.ts`.

- [ ] **Step 3: Локальный прогон (ожидаемо флак — финал в CI)**

Run: `npx playwright test e2e/wishlist.spec.ts`
Expected (CI/Ubuntu): зелёные. Локально допускается сетевой флак (Neon-латентность).

- [ ] **Step 4: Commit**
```bash
git add e2e/wishlist.spec.ts e2e/a11y.spec.ts
git commit -m "test(stride-app): e2e for wishlist toggle/merge + a11y"
```

---

## Task 16: Финал — гейты, ревью, spec, PR

**Files:** (проверки + отметки)

- [ ] **Step 1: Полная проверка**
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest зелёные (+ wishlist/toggle-wishlist сьюты); build OK.

- [ ] **Step 2: Чек-лист §12 спеки**
- [ ] Гость лайкает → token+cookie+wishlist; список и счётчик видны.
- [ ] Залогиненный лайкает → пишется в user-wishlist.
- [ ] Merge при логине: union+дедуп, идемпотентно, не роняет вход.
- [ ] ♡ на карточке (top-right), PDP, header-счётчик, `/wishlist` (сетка+пусто).
- [ ] Оптимистичный toggle с откатом при ошибке.
- [ ] Owner только из сессии/cookie.
- [ ] Unit + e2e + a11y зелёные (e2e в CI).

- [ ] **Step 3: Адверсариальное ревью диффа**

Прогнать `/code-review` (как в P2.1c/P2.2a): фокус — обход владельца (owner из сессии/cookie, не из клиента), zod на `productId`, отсутствие N+1 (`getWishlistProductIds` — один запрос на страницу, не на карточку), merge-идемпотентность (повтор входа не двоит), оптимистичный откат при ошибке. Подтверждённое — пофиксить по TDD.

- [ ] **Step 4: Пометить spec реализованным**

В `docs/superpowers/specs/2026-06-07-stride-phase2.2b-wishlist-design.md` сменить «**Статус:** на ревью» → «**Статус:** реализовано (P2.2b)».
```bash
git add docs/superpowers/specs/2026-06-07-stride-phase2.2b-wishlist-design.md
git commit -m "docs: mark Phase 2.2b wishlist spec implemented"
```

- [ ] **Step 5: Завершение ветки**

`superpowers:finishing-a-development-branch`: push `feat/phase2.2b-wishlist`, дождаться зелёного CI (e2e + seed-reset), PR → `main`. **Мержит пользователь.** Прод-build применит таблицы `Wishlist`/`WishlistItem` к прод-Neon (`db push` в `vercel.json`). Доп. env не нужны.

---

## Self-Review (против спеки `2026-06-07-stride-phase2.2b-wishlist-design.md`)

**1. Покрытие требований:**

| Раздел спеки | Задача |
|---|---|
| §3 Модель Wishlist/WishlistItem + relations | Task 1 |
| §4 Cookie-константы + wishlist-cookie | Task 2 |
| §5 resolveOwnerWishlist + read-хелперы | Task 4 |
| §6 DTO wishlistToggleSchema | Task 5 |
| §7 toggleWishlist (guest cookie, P2002/P2003) | Task 6 |
| §8 merge при логине (idempotent) | Tasks 7, 8 |
| §9.1 WishlistHeart (optimistic) | Task 9 |
| §9.2 точки: card / PDP / header / page | Tasks 10, 12, 13, 14 |
| §9.2 передача wishlistedIds (нет N+1) | Tasks 11, 12 |
| §9.3 wishlist-grid / wishlist-empty | Task 14 |
| §10 состояния (guest/optimistic/empty/sold-out) | Tasks 9, 14 |
| §11 тесты unit + e2e + a11y | Tasks 4, 6, 7, 15 |
| §12 критерии готовности | Task 16 |
| (доп.) id в ProductCardData (предпосылка ♡) | Task 3 |

**2. Скан плейсхолдеров:** код всех шагов приведён целиком. «Сверить slug/имя AxeBuilder/buy-компонент» (Task 12, 15) — сверка с реальным DOM/файлом, не «доделать позже»; инварианты тестов заданы явно.

**3. Консистентность типов/имён:** `resolveOwnerWishlist(session, token, {create})→Wishlist|null` (Task 4) ↔ потребители (Tasks 6,7,11,12,13,14); read-хелперы `getWishlistProductIds/Count/Items(session, token)` единообразны; `toggleWishlist(raw)→ToggleResult{ok,active}` (Task 6) ↔ `WishlistHeart` (Task 9); `wishlistToggleSchema.productId` (Task 5) ↔ action ↔ heart; `mergeGuestWishlist/safeMergeGuestWishlist` (Task 7) ↔ auth (Task 8); `ProductCardData.id` (Task 3) ↔ карточка/каталог/PDP; `wishlistCookieName/wishlistCookieOptions` (Task 2) единообразно; уникальный ключ `wishlistId_productId` единообразен (Tasks 6,7).

**Зафиксированные допущения:** товар-уровень; гость+merge (cookie token); ♡ top-right всегда; `/wishlist`+header; без снапшота цены/стока; без жёсткого лимита (take 100); тостов нет → aria-live + откат; счётчик header через RSC + `router.refresh()`.

---

## Ручная проверка на preview (после деплоя ветки)

> Гоняется на **preview-деплое** ветки (не локально — Neon-латентность + локальный db push заблокирован). Сначала убедись, что **preview build зелёный** (build применил `db push` → таблицы `Wishlist`/`WishlistItem`).

### A. Гость
1. [ ] Каталог → ♡ на карточке → залит; перезагрузка страницы — ♡ остаётся залит.
2. [ ] Счётчик ♡ в header вырос.
3. [ ] `/wishlist` → товар виден; клик по ♡ убирает → пустое состояние «В избранном пока пусто».

### B. Merge при логине
1. [ ] Гость лайкнул 1–2 товара → войти/зарегистрироваться → `/wishlist` содержит те товары (слиты, без дублей).
2. [ ] Повторный вход — список не двоится.

### C. Авторизованный
1. [ ] Лайк на PDP (кнопка «В избранное» → «В избранном») → товар в `/wishlist`.
2. [ ] ♡ на sold-out товаре работает (избранное ≠ покупка).

### D. Регрессия
1. [ ] Каталог/PDP/главная/корзина — без изменений в поведении; карточки рендерятся, «+» и бейджи на месте.

### На что смотреть при сбое
- ♡ не сохраняется у гостя → cookie `wishlistToken` не ставится (проверь, что `toggleWishlist` пишет cookie); owner-резолв по token.
- После логина список пуст → merge: гостевой `wishlistToken` должен читаться в `events.signIn`; проверь лог `wishlist_merge_on_signin_failed`.
- Счётчик не обновился после лайка на карточке → `router.refresh()` в `WishlistHeart` (RSC-бейдж пересчитывается на refresh).
