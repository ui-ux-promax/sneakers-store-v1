# STRIDE — Фаза 2.2a (Reviews + рейтинги): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить отзывы со звёздами на страницу товара (PDP): пользователь с не-CANCELLED заказом товара ставит рейтинг 1–5 + текст; на PDP виден агрегат ★ и список отзывов.

**Architecture:** Модель `Review` (привязка к `Product`, `@@unique([productId, userId])`). Verified-гейт = не-CANCELLED заказ товара (без admin/DELIVERED). Агрегат — **on-read** (`review.aggregate`), без денормализации. Запись — одиночный `create` (транзакция не нужна). Серверная повторная проверка eligibility (клиенту не доверяем). Публикация сразу, 1 отзыв на товар от юзера.

**Tech Stack:** Next 15.1 (App Router, RSC + Server Actions), Prisma 6.19 + `@prisma/adapter-neon` (**WebSocket**), Zod, React Hook Form не нужен (простая форма на `useState`), `lucide-react` (звёзды), Vitest, Playwright (+ axe), CI на Ubuntu.

**Спека:** `docs/superpowers/specs/2026-06-06-stride-phase2.2a-reviews-design.md`. **Ветка:** `feat/phase2.2a-reviews` (от `main`).

---

## Соглашения этого плана (прочитать перед стартом)

1. **Все пути — от `stride-app/`**, команды из `stride-app/`. Коммиты — английский, conventional-commits, **без `Co-Authored-By`**, автор `ui-ux-promax` ([[commit-pr-conventions]]).
2. **Neon — WebSocket** (миграция выполнена): `$transaction`/`createMany` доступны, НО в этом слайсе они не нужны (отзыв = одиночный `create`; агрегат on-read). Не усложнять.
3. **TDD** для чистой логики (`isValidRating`, `canReview`, `submitReview`): RED → GREEN → commit. UI/интеграция — Playwright e2e.
4. **e2e только в CI (Ubuntu)** — локально Windows флакает (Neon-латентность, [[local-e2e-neon-latency]]). Локально: `typecheck` + `vitest` + `next build`.
5. **`db push` локально заблокирован (P1017)** — схему применит прод-build (`vercel.json`) и CI (`e2e.yml` `prisma:push`). Локально для типов хватает `prisma:generate`.
6. **e2e: `getByRole('alert')` НЕ использовать** — ловит Next route-announcer (TROUBLESHOOTING P13). Целиться по тексту.
7. **e2e создаёт заказы → списывает сток** — seed-сброс перед e2e уже в `e2e.yml` (P10).

---

## Структура файлов

```
stride-app/
├─ prisma/schema.prisma                 # +Review; Product.reviews; User.reviews (Task 1)
├─ prisma/seed.ts                        # demo-юзеры + demo-отзывы (Task 7)
├─ lib/review.ts                         # isValidRating, canReview (Task 2)
├─ services/dto/review.dto.ts            # reviewSchema (Task 3)
├─ app/actions/review.ts                 # submitReview server action (Task 4)
├─ components/shared/product/
│  ├─ rating-stars.tsx                   # display звёзд по значению (Task 5)
│  ├─ review-list.tsx                    # список отзывов (Task 5)
│  ├─ review-form.tsx                    # client-форма (звёзды+текст) (Task 5)
│  └─ reviews-section.tsx                # композиция агрегат+список+форма (Task 5)
├─ app/product/[slug]/page.tsx           # чтение агрегата/списка/eligibility + рендер секции + JSON-LD (Task 6)
├─ tests/                                # review.test.ts, submit-review.test.ts (Task 2,4)
└─ e2e/review.spec.ts + e2e/a11y.spec.ts # e2e + a11y (Task 8)
```

---

## Task 1: Схема Prisma — Review + связи

**Files:**
- Modify: `stride-app/prisma/schema.prisma`

- [ ] **Step 1: Добавить модель `Review` в конец `schema.prisma`**
```prisma
model Review {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int                       // 1..5 (валидация в коде, fail-closed)
  body      String?
  createdAt DateTime @default(now())

  @@unique([productId, userId])
  @@index([productId, createdAt])
}
```

- [ ] **Step 2: Добавить relation-поля в `Product` и `User`**

В модель `Product` (рядом с `colorways ProductColorway[]`) добавить:
```prisma
  reviews   Review[]
```
В модель `User` (рядом с `orders Order[]`) добавить:
```prisma
  reviews   Review[]
```

- [ ] **Step 3: Сгенерировать клиент**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client`; в типах появляется `Review`, у `Product`/`User` — `reviews`.

- [ ] **Step 4: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок. (Локальный `db push` НЕ запускать — P1017; схему применит CI/прод.)

- [ ] **Step 5: Commit**
```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): Review model + Product/User relations"
```

---

## Task 2: Логика отзыва (`lib/review.ts`) — TDD

**Files:**
- Create: `stride-app/lib/review.ts`
- Create: `stride-app/tests/review.test.ts`

- [ ] **Step 1: Падающий тест**

`tests/review.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    order: { findFirst: vi.fn() },
    review: { findUnique: vi.fn() },
  },
}));

import { isValidRating, canReview } from '@/lib/review';
import { prisma } from '@/lib/prisma-client';

const orderFindFirst = prisma.order.findFirst as unknown as ReturnType<typeof vi.fn>;
const reviewFindUnique = prisma.review.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('isValidRating', () => {
  it('1..5 целые → true', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(3)).toBe(true);
  });
  it('вне диапазона / не целое → false', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(2.5)).toBe(false);
    expect(isValidRating(NaN)).toBe(false);
  });
});

describe('canReview', () => {
  it('есть не-CANCELLED заказ + нет отзыва → true', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue(null);
    expect(await canReview('u1', 'p1')).toBe(true);
  });
  it('нет заказа → false (и отзыв не проверяется)', async () => {
    orderFindFirst.mockResolvedValue(null);
    expect(await canReview('u1', 'p1')).toBe(false);
    expect(reviewFindUnique).not.toHaveBeenCalled();
  });
  it('есть заказ, но уже оставил отзыв → false', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue({ id: 'r1' });
    expect(await canReview('u1', 'p1')).toBe(false);
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/review.test.ts`
Expected: FAIL — `Cannot find module '@/lib/review'`.

- [ ] **Step 3: Реализовать `lib/review.ts`**
```ts
import { prisma } from '@/lib/prisma-client';

export function isValidRating(r: number): boolean {
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

// Право оставить отзыв: есть не-CANCELLED заказ с этим товаром И ещё не оставлял отзыв.
export async function canReview(userId: string, productId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      items: { some: { productVariant: { colorway: { productId } } } },
    },
    select: { id: true },
  });
  if (!order) return false;
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  return !existing;
}
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run tests/review.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**
```bash
git add stride-app/lib/review.ts stride-app/tests/review.test.ts
git commit -m "feat(stride-app): review eligibility logic (isValidRating/canReview) + unit tests"
```

---

## Task 3: DTO (`services/dto/review.dto.ts`)

**Files:**
- Create: `stride-app/services/dto/review.dto.ts`

- [ ] **Step 1: Создать схему**
```ts
import { z } from 'zod';

export const reviewSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),          // только для revalidatePath страницы товара
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});
export type ReviewValues = z.infer<typeof reviewSchema>;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**
```bash
git add stride-app/services/dto/review.dto.ts
git commit -m "feat(stride-app): review DTO (zod)"
```

---

## Task 4: Server Action `submitReview` — TDD

**Files:**
- Create: `stride-app/app/actions/review.ts`
- Create: `stride-app/tests/submit-review.test.ts`

- [ ] **Step 1: Падающий тест**

`tests/submit-review.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/review', () => ({ canReview: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { review: { create: vi.fn() } } }));

import { submitReview } from '@/app/actions/review';
import { auth } from '@/auth';
import { canReview } from '@/lib/review';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const canReviewMock = canReview as unknown as ReturnType<typeof vi.fn>;
const reviewCreate = prisma.review.create as unknown as ReturnType<typeof vi.fn>;

const valid = { productId: 'p1', slug: 'velocity-trail', rating: 5, body: 'Отличные' };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  canReviewMock.mockResolvedValue(true);
  reviewCreate.mockResolvedValue({ id: 'r1' });
});

describe('submitReview', () => {
  it('happy → review.create с rating/body, ok', async () => {
    const r = await submitReview(valid);
    expect(r).toEqual({ ok: true });
    const data = reviewCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ productId: 'p1', userId: 'u1', rating: 5, body: 'Отличные' });
  });
  it('не вошёл → отказ, без create', async () => {
    authMock.mockResolvedValue(null);
    const r = await submitReview(valid);
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('не покупал (canReview=false) → отказ, без create', async () => {
    canReviewMock.mockResolvedValue(false);
    const r = await submitReview(valid);
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('rating вне 1..5 → zod-отказ, без create', async () => {
    const r = await submitReview({ ...valid, rating: 7 });
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('дубль (P2002) → «уже оставили»', async () => {
    const { Prisma } = await import('@prisma/client');
    reviewCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await submitReview(valid);
    expect(r).toEqual({ ok: false, error: 'Вы уже оставили отзыв' });
  });
  it('пустой body → null', async () => {
    await submitReview({ ...valid, body: '   ' });
    expect(reviewCreate.mock.calls[0][0].data.body).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/submit-review.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `app/actions/review.ts`**
```ts
'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { canReview } from '@/lib/review';
import { reviewSchema } from '@/services/dto/review.dto';

export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(raw: unknown): Promise<SubmitReviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Войдите, чтобы оставить отзыв' };
  const userId = session.user.id;

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };
  const { productId, slug, rating, body } = parsed.data;

  // Источник истины — клиентскому праву на отзыв не доверяем.
  if (!(await canReview(userId, productId))) {
    return { ok: false, error: 'Отзыв доступен после покупки' };
  }

  try {
    await prisma.review.create({
      data: { productId, userId, rating, body: body?.trim() ? body.trim() : null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Вы уже оставили отзыв' };
    }
    throw e;
  }

  revalidatePath(`/product/${slug}`);
  return { ok: true };
}
```
> `canReview` уже проверяет «не оставлял отзыв», но гонка между проверкой и `create` ловится `P2002` (unique) — это и есть надёжная защита от дубля.

- [ ] **Step 4: GREEN + полный прогон**

Run: `npx vitest run tests/submit-review.test.ts && npm test`
Expected: новый сьют PASS; все прежние зелёные.

- [ ] **Step 5: Commit**
```bash
git add stride-app/app/actions/review.ts stride-app/tests/submit-review.test.ts
git commit -m "feat(stride-app): submitReview action (verified-purchase gate, unique guard)"
```

---

## Task 5: UI-компоненты отзывов

**Files:**
- Create: `stride-app/components/shared/product/rating-stars.tsx`
- Create: `stride-app/components/shared/product/review-list.tsx`
- Create: `stride-app/components/shared/product/review-form.tsx`
- Create: `stride-app/components/shared/product/reviews-section.tsx`

> Стиль — дизайн-система Фазы 1 (`text-ink`, `text-ink-muted`, `border-line`, `bg-surface`, `rounded-2xl`, `font-display`). Звёзды — `lucide-react` `Star` с `fill-current`.

- [ ] **Step 1: `rating-stars.tsx` (display)**
```tsx
import { Star } from 'lucide-react';

// value 0..5; звёзды округляются до целого, число показывается точно.
export function RatingStars({ value, count, size = 16 }: { value: number; count?: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} strokeWidth={1.5}
            className={i <= full ? 'text-amber-400 fill-current' : 'text-line'} />
        ))}
      </span>
      {count !== undefined && (
        <span className="text-sm text-ink-muted tnum">
          {count > 0 ? `${value.toFixed(1)} (${count})` : 'Пока нет отзывов'}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: `review-list.tsx`**
```tsx
import { RatingStars } from './rating-stars';

export type ReviewItem = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  authorName: string;
};

export function ReviewList({ reviews }: { reviews: ReviewItem[] }) {
  if (reviews.length === 0) {
    return <p className="text-ink-muted text-sm">Пока нет отзывов. Будьте первым после покупки.</p>;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{r.authorName}</span>
            <RatingStars value={r.rating} size={14} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <span>{r.createdAt.toLocaleDateString('ru-RU')}</span>
            <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2 py-0.5">Покупка подтверждена</span>
          </div>
          {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `review-form.tsx` (client)**
```tsx
'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { submitReview } from '@/app/actions/review';

export function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating < 1) { setError('Поставьте оценку'); return; }
    setPending(true);
    const res = await submitReview({ productId, slug, rating, body });
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    setRating(0); setBody('');
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      <div role="radiogroup" aria-label="Оценка" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} из 5`}
            onClick={() => setRating(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            className="p-0.5">
            <Star size={24} strokeWidth={1.5}
              className={i <= (hover || rating) ? 'text-amber-400 fill-current' : 'text-line'} />
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000}
        placeholder="Поделитесь впечатлением (необязательно)" className="inp min-h-24 w-full" />
      {error && <p className="text-danger text-sm" role="status">{error}</p>}
      <Button type="submit" variant="primary" loading={pending}>Оставить отзыв</Button>
    </form>
  );
}
```
> Класс `inp` — общий стиль инпутов проекта (используется в checkout-form `textarea`). `Button` поддерживает `loading`. Сообщение об ошибке — `role="status"` (НЕ `alert`, чтобы e2e не клешился с route-announcer, P13).

- [ ] **Step 4: `reviews-section.tsx` (композиция, RSC)**
```tsx
import Link from 'next/link';
import { RatingStars } from './rating-stars';
import { ReviewList, type ReviewItem } from './review-list';
import { ReviewForm } from './review-form';

type Props = {
  productId: string;
  slug: string;
  avg: number;
  count: number;
  reviews: ReviewItem[];
  state: 'eligible' | 'guest' | 'not-eligible';
};

export function ReviewsSection({ productId, slug, avg, count, reviews, state }: Props) {
  return (
    <section className="mt-16" id="reviews">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-display font-bold text-2xl">Отзывы</h2>
        <RatingStars value={avg} count={count} />
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 items-start">
        <ReviewList reviews={reviews} />
        <div>
          {state === 'eligible' && <ReviewForm productId={productId} slug={slug} />}
          {state === 'guest' && (
            <p className="text-sm text-ink-muted rounded-2xl border border-line bg-surface p-4">
              <Link href="/login" className="underline">Войдите</Link>, чтобы оставить отзыв.
            </p>
          )}
          {state === 'not-eligible' && (
            <p className="text-sm text-ink-muted rounded-2xl border border-line bg-surface p-4">
              Отзыв можно оставить после покупки этого товара.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок (компоненты пока не подключены — проверяем, что компилируются).

- [ ] **Step 6: Commit**
```bash
git add stride-app/components/shared/product/rating-stars.tsx stride-app/components/shared/product/review-list.tsx stride-app/components/shared/product/review-form.tsx stride-app/components/shared/product/reviews-section.tsx
git commit -m "feat(stride-app): review UI components (stars/list/form/section)"
```

---

## Task 6: PDP-интеграция

**Files:**
- Modify: `stride-app/app/product/[slug]/page.tsx`

- [ ] **Step 1: Импорты + чтение агрегата/списка/eligibility**

В `page.tsx` добавить импорты:
```ts
import { auth } from '@/auth';
import { canReview } from '@/lib/review';
import { ReviewsSection } from '@/components/shared/product/reviews-section';
import type { ReviewItem } from '@/components/shared/product/review-list';
```
После получения `product` (после `if (!active) notFound();`) добавить:
```ts
  const [agg, reviewRows, session] = await Promise.all([
    prisma.review.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
    }),
    auth(),
  ]);
  const reviews: ReviewItem[] = reviewRows.map((r) => ({
    id: r.id, rating: r.rating, body: r.body, createdAt: r.createdAt,
    authorName: r.user.name?.trim() ? r.user.name : 'Покупатель',
  }));
  const avg = agg._avg.rating ?? 0;
  const count = agg._count;
  const eligible = session?.user?.id ? await canReview(session.user.id, product.id) : false;
  const reviewState: 'eligible' | 'guest' | 'not-eligible' =
    !session?.user?.id ? 'guest' : eligible ? 'eligible' : 'not-eligible';
```

- [ ] **Step 2: Агрегат-шапка под `<h1>`**

Сразу после `<h1>…{product.name}</h1>` (строка с заголовком в правой колонке) добавить:
```tsx
          {count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex"><RatingStars value={avg} count={count} /></a>
          )}
```
И добавить импорт `RatingStars`:
```ts
import { RatingStars } from '@/components/shared/product/rating-stars';
```

- [ ] **Step 3: Секция отзывов после related**

Перед закрывающим JSON-LD `<script>` (после блока Related) добавить:
```tsx
      <ReviewsSection
        productId={product.id} slug={product.slug}
        avg={avg} count={count} reviews={reviews} state={reviewState}
      />
```

- [ ] **Step 4: (SEO-бонус) aggregateRating в JSON-LD**

В объекте JSON-LD (`@type: 'Product'`) добавить поле (только если есть отзывы) — заменить объект на вычисляемый:
```tsx
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: product.name,
        image: galleryImages.map((g) => g.url), description: product.description ?? undefined, brand: product.brand,
        ...(count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: count } } : {}),
        offers: { '@type': 'AggregateOffer', priceCurrency: 'RUB', availability: active.variants.some((v) => v.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', lowPrice: Math.min(...active.variants.map((v) => v.price)) },
      }) }} />
```

- [ ] **Step 5: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/product/[slug]` собирается (ƒ Dynamic).

- [ ] **Step 6: Commit**
```bash
git add "stride-app/app/product/[slug]/page.tsx"
git commit -m "feat(stride-app): reviews on PDP (aggregate header, list, form, JSON-LD rating)"
```

---

## Task 7: Seed demo-отзывов

**Files:**
- Modify: `stride-app/prisma/seed.ts`

- [ ] **Step 1: Добавить demo-юзеров и отзывы в `up()`**

В `up()` после блока купонов (или в конце функции) добавить:
```ts
// Demo-отзывы: seed не создаёт заказы, поэтому пишем напрямую (verified-гейт только на write-пути
// submitReview). Demo-юзеры неаутентифицируемы (passwordHash null). Идемпотентно через upsert.
const demoUsers = [
  { email: 'review-demo-1@stride.local', name: 'Алексей' },
  { email: 'review-demo-2@stride.local', name: 'Марина' },
];
const userIdByEmail = new Map<string, string>();
for (const u of demoUsers) {
  const created = await prisma.user.upsert({
    where: { email: u.email }, update: { name: u.name }, create: { email: u.email, name: u.name },
  });
  userIdByEmail.set(u.email, created.id);
}

// Отзывы к бестселлерам (productId — по slug). rating 4..5, часть с текстом.
const demoReviews = [
  { slug: 'stride-velocity-trail', email: 'review-demo-1@stride.local', rating: 5, body: 'Отличная амортизация, беру второй раз.' },
  { slug: 'stride-velocity-trail', email: 'review-demo-2@stride.local', rating: 4, body: 'Хорошие, но размер чуть великоват.' },
];
for (const r of demoReviews) {
  const product = await prisma.product.findUnique({ where: { slug: r.slug }, select: { id: true } });
  const userId = userIdByEmail.get(r.email);
  if (!product || !userId) continue;
  await prisma.review.upsert({
    where: { productId_userId: { productId: product.id, userId } },
    update: { rating: r.rating, body: r.body },
    create: { productId: product.id, userId, rating: r.rating, body: r.body },
  });
}
console.log(`Seeded ${demoReviews.length} reviews`);
```
> Сверить slug `stride-velocity-trail` с `seed-data.ts` (бестселлер Task знает его из e2e — он же используется в checkout/cart e2e). Если в seed-data другой slug бестселлера — взять оттуда.

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок. (Сам seed локально не гонять — Neon-латентность; отработает в CI/проде.)

- [ ] **Step 3: Commit**
```bash
git add stride-app/prisma/seed.ts
git commit -m "feat(stride-app): seed demo reviews (+demo users)"
```

---

## Task 8: E2E + a11y

**Files:**
- Create: `stride-app/e2e/review.spec.ts`
- Modify: `stride-app/e2e/a11y.spec.ts` (если PDP ещё не покрыт)

- [ ] **Step 1: `e2e/review.spec.ts`**

Переиспользовать хелперы из `e2e/checkout.spec.ts` (регистрация + добавление в корзину + оформление COD-заказа — заказ делает товар «купленным»).
```ts
import { test, expect, type Page } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

async function registerAndLogin(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

async function buyVelocityTrail(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
  await page.goto('/checkout');
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тверская 1');
  await page.getByRole('radio', { name: /При получении/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);
}

test('купивший оставляет отзыв → виден в списке; повтор отклоняется', async ({ page }) => {
  await registerAndLogin(page);
  await buyVelocityTrail(page);

  await page.goto('/product/stride-velocity-trail');
  // Поставить 5 звёзд (radiogroup «Оценка») + текст.
  await page.getByRole('radio', { name: '5 из 5' }).click();
  await page.getByPlaceholder(/Поделитесь впечатлением/).fill('Супер кроссовки e2e');
  await page.getByRole('button', { name: 'Оставить отзыв' }).click();

  await expect(page.getByText('Супер кроссовки e2e')).toBeVisible();

  // Повторный отзыв — форма больше не показывается (уже оставил) ИЛИ ошибка дубля.
  await page.reload();
  await expect(page.getByText(/после покупки|Войдите/)).toHaveCount(0); // мы eligible-были, но уже оставили
});

test('гость на PDP → формы нет, видит «Войдите»', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByText(/Войдите/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0);
});
```
> Примечание ко 2-му assert первого теста: после успешного отзыва пользователь `eligible=false` (уже оставил) → секция показывает ветку `not-eligible` («после покупки») ИЛИ просто список без формы. Уточнить ожидание под реальный рендер при прогоне; ключевой инвариант — **формы «Оставить отзыв» больше нет**. Заменить хрупкий assert на: `await expect(page.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0)`.

- [ ] **Step 2: a11y — PDP уже в наборе?**

Проверить `e2e/a11y.spec.ts`: если `/product/stride-velocity-trail` уже в списке проверяемых — секция отзывов (гость) покроется axe автоматически. Если нет — добавить путь. Звёздный инпут — `role="radiogroup"` с `aria-label`, каждая звезда `role="radio"` + `aria-label` (уже в компоненте).

- [ ] **Step 3: Локальный прогон (ожидаемо флак — финал в CI)**

Run: `npx playwright test e2e/review.spec.ts`
Expected (CI/Ubuntu): зелёные. Локально допускается сетевой флак.

- [ ] **Step 4: Commit**
```bash
git add stride-app/e2e/review.spec.ts stride-app/e2e/a11y.spec.ts
git commit -m "test(stride-app): e2e for review submit/guest + a11y"
```

---

## Task 9: Финал — гейты, ревью, spec, PR

**Files:** (проверки + отметки)

- [ ] **Step 1: Полная проверка**
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest зелёные (+ review/submit-review сьюты); build OK, middleware ~86 kB.

- [ ] **Step 2: Чек-лист §10 спеки**
- [ ] Гейт: отзыв только при не-CANCELLED заказе; повтор отклоняется (unique).
- [ ] PDP: агрегат ★+count (on-read), список, форма по eligibility; пустое состояние.
- [ ] `submitReview` валидирует rating 1..5 (fail-closed), повторный `canReview`.
- [ ] seed заводит demo-отзывы идемпотентно.
- [ ] e2e зелёные в CI.

- [ ] **Step 3: Адверсариальное ревью диффа**

Прогнать code-review (как в P2.1c): фокус — eligibility-обход (клиентский productId/slug; canReview по серверной сессии), rating fail-closed (zod 1..5), отсутствие N+1 (агрегат — один `aggregate`, не на карточках), edge-бандл не затронут. Подтверждённое — пофиксить по TDD.

- [ ] **Step 4: Пометить spec реализованным**

В `docs/superpowers/specs/2026-06-06-stride-phase2.2a-reviews-design.md` сменить «Статус: на ревью» → «Статус: реализовано (P2.2a)».
```bash
git add docs/superpowers/specs/2026-06-06-stride-phase2.2a-reviews-design.md
git commit -m "docs: mark Phase 2.2a reviews spec implemented"
```

- [ ] **Step 5: Завершение ветки**

`superpowers:finishing-a-development-branch`: push `feat/phase2.2a-reviews`, дождаться зелёного CI (e2e + seed), PR → `main`. **Мержит пользователь.** Прод-build применит таблицу `Review` к прод-Neon (`db push` в `vercel.json`). Доп. env не нужны.

---

## Self-Review (против спеки `2026-06-06-stride-phase2.2a-reviews-design.md`)

**1. Покрытие требований:**

| Раздел спеки | Задача |
|---|---|
| §3 Модель Review + связи | Task 1 |
| §4 isValidRating/canReview | Task 2 |
| §5 DTO reviewSchema | Task 3 |
| §5 submitReview (гейт, P2002) | Task 4 |
| §6 PDP: агрегат on-read + список + форма + состояния | Tasks 5, 6 |
| §6 компоненты звёзд/списка/формы/секции | Task 5 |
| §7 seed demo-отзывов | Task 7 |
| §8 тесты unit + e2e + a11y | Tasks 2, 4, 8 |
| §10 критерии готовности | Task 9 |

**2. Скан плейсхолдеров:** весь код шагов приведён целиком. «Сверить slug с seed-data» (Task 7) и «уточнить ожидание assert под реальный рендер» (Task 8) — сверка эталона/реального DOM, не «доделать позже»; ключевой инвариант в Task 8 задан явно (`Оставить отзыв` → count 0).

**3. Консистентность типов:** `isValidRating`/`canReview` (Task 2) ↔ submitReview (Task 4) ↔ PDP (Task 6); `reviewSchema` поля `productId/slug/rating/body` (Task 3) ↔ submitReview ↔ форма (Task 5); `ReviewItem` (Task 5 review-list) ↔ маппинг в PDP (Task 6) ↔ `ReviewsSection` props (Task 5); `RatingStars({value,count})` единообразно. `submitReview` сигнатура `(raw)→SubmitReviewResult` согласована.

**Зафиксированные допущения:** verified-гейт ослаблен до не-CANCELLED; агрегат on-read (денормализация — слайс DB-sort); отзыв к Product, 1 на юзера, без edit/delete/модерации; demo-отзывы через seed-юзеров в обход гейта.

---

## Ручная проверка на preview (после деплоя ветки)

> Гоняется на **preview-деплое** ветки (не локально — Neon-латентность + локальный db push заблокирован, P1017/P4). Сначала убедись, что **preview build зелёный** в Vercel (build применяет `db push` → таблица `Review` в preview-Neon-ветке, P7). Seed на preview НЕ запускается автоматически → demo-отзывы будут только если завести их вручную (Neon SQL / `prisma:seed` на preview-URL); но это не обязательно — отзыв можно создать прямо во флоу (секция A).

### Шаг 0 — предусловия
- [ ] Vercel → деплой ветки `feat/phase2.2a-reviews` → build **зелёный** (в логе `prisma db push` / `in sync`; появилась таблица `Review`).
- [ ] Войти на preview под своим аккаунтом (auth в проде с P2.0).
- [ ] (Опц.) demo-отзывы в preview-Neon — если хочешь увидеть непустой PDP без оформления заказа.

### A. Отзыв купившего (основной путь)
1. [ ] Купить товар: карточка → корзина → `/checkout` → оформить **COD**-заказ (заказ становится не-CANCELLED).
2. [ ] Открыть PDP этого товара (`/product/stride-velocity-trail`) → видна **форма отзыва** (звёзды + текст).
3. [ ] Поставить звёзды (1–5) + текст → «Оставить отзыв» → отзыв появился в списке с бейджем **«Покупка подтверждена»**, имя — из профиля (или «Покупатель»).
4. [ ] Шапка секции и блок под `<h1>` показывают **★ среднюю и количество**; среднее пересчиталось.
5. [ ] (Опц. SEO) В исходнике страницы JSON-LD содержит `aggregateRating` (ratingValue/reviewCount).

### B. Гейт — негативные сценарии
1. [ ] **Гость** на PDP → формы нет, видно «Войдите, чтобы оставить отзыв» (ссылка на /login).
2. [ ] Вошёл, но **НЕ покупал** этот товар → «Отзыв можно оставить после покупки», формы нет.
3. [ ] **Уже оставил** отзыв (после секции A) → форма больше не показывается; второй отзыв оставить нельзя.

### C. Агрегат и пустое состояние
1. [ ] Товар **без отзывов** → секция показывает «Пока нет отзывов. Будьте первым после покупки», под `<h1>` ★ не показывается (count=0).
2. [ ] Несколько отзывов разных оценок → средняя считается корректно (звёзды округлены, число точное).

### D. Регрессия PDP
1. [ ] Галерея, панель покупки, выбор расцветки/размера, specs, «С этим смотрят» — работают как раньше (секция отзывов не сломала страницу).

### На что смотреть при сбое
- Форма не появляется у купившего → `canReview`: заказ должен быть **не CANCELLED** и содержать этот товар (связь `OrderItem→ProductVariant→ProductColorway→productId`). Проверь, что заказ создался (см. `/orders/<N>`).
- После отправки отзыв не виден / средняя не обновилась → `revalidatePath('/product/<slug>')`: slug из формы должен совпадать с маршрутом (проверь, что `slug` уходит в `submitReview`).
- «Вы уже оставили отзыв» сразу → в preview-Neon под твоим userId уже есть отзыв на этот товар (демо-seed/прошлый прогон) — это корректное поведение unique-гейта.
