# STRIDE — Фаза 2.2a (Reviews + рейтинги): дизайн

> **Статус:** реализовано (P2.2a). Правка после адверс-ревью: `slug` НЕ принимается от клиента — `submitReview` re-derive'ит его из `productId` на сервере для `revalidatePath` (не доверяем клиентскому slug → нет cache-bust произвольных страниц). `isValidRating` вызывается как defense-in-depth после zod.
> **Дата:** 2026-06-06. **Ветка:** `feat/phase2.2a-reviews` (от `main`).
> **Предшественник:** P2.1 (ядро конверсии) в проде. Neon-транспорт = WebSocket (`$transaction` доступен). Research-карта: `docs/superpowers/research/2026-06-02-phase2-candidates.md` (раздел P2.2).
> **Прототип UI:** нет (отзывов в прототипах нет; верстаем в стиле дизайн-системы Фазы 1).

## §1. Цель и граница слайса

Первый слайс **P2.2 Discovery** — отзывы со звёздами на странице товара (PDP). Социальное доказательство для конверсии. Закрывает кандидата «Reviews + рейтинги».

**В объёме:**
- Модель `Review` (привязка к `Product`, рейтинг 1–5, опциональный текст, имя автора из профиля).
- **Verified-purchase гейт:** отзыв может оставить только пользователь, у которого есть **не-CANCELLED** заказ с этим товаром (PENDING/PROCESSING/SHIPPED/DELIVERED). Так фича работает сразу, без admin-флоу до DELIVERED.
- **1 отзыв на товар от пользователя** (`@@unique([productId, userId])`).
- Публикация **сразу** (без премодерации — admin в Phase 3).
- Агрегат рейтинга (средняя + количество) — **on-read** (`Review.aggregate`), показ на PDP. Без денормализации.
- Server Action `submitReview` + чистая логика eligibility.
- UI: секция отзывов на PDP (агрегат-шапка ★ + список + форма), компоненты звёзд/списка/формы.
- Seed demo-отзывов (чтобы PDP не пустовал из коробки).

**Вне объёма:**
- Редактирование/удаление отзыва пользователем — отложено.
- Модерация/премодерация (admin) — Phase 3.
- ★ на карточках каталога + сортировка по рейтингу — отложено в слайс **DB-sort/популярность** P2.2 (там денормализация `ratingAvg`/`ratingCount`, чтобы избежать N+1).
- Per-variant отзывы (привязка к расцветке/размеру) — нет, отзыв к `Product`.
- Helpful-голоса, фото в отзывах, ответы магазина.

## §2. Предрешённые ограничения / решения брейнсторминга

- **Автор = только купивший** (verified). Гейт = любой **не-CANCELLED** заказ товара (DELIVERED недостижим без admin — осознанно ослаблено). Все отзывы по определению verified → бейдж «Покупка подтверждена» на каждом, без отдельного флага в модели.
- **Привязка к `Product`** (не к variant). Агрегат — по товару.
- **Контент:** `rating` 1–5 (обязателен), `body` (текст, опционален), имя автора берётся из `User.name` (не дублируется в Review).
- **Публикация сразу**, 1 на товар (unique).
- **Агрегат on-read** — `Review.aggregate({_avg, _count})` на PDP. Денормализация НЕ вводится (YAGNI; добавится в DB-sort-слайсе).
- **Деньги/транзакции:** отзыв — одиночный `create`, транзакция не нужна. `rating` валидируется в коде (1..5), fail-closed (как `coupon.percent`, P2.1c) — Prisma не выражает CHECK.
- **Схема применяется на деплое/CI** — `db push` в `vercel.json` + `e2e.yml` (P7). Локальный db push заблокирован (P1017).

## §3. Доменная модель

```prisma
model Review {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int                       // 1..5 (валидация в коде, fail-closed)
  body      String?                   // опциональный текст
  createdAt DateTime @default(now())

  @@unique([productId, userId])       // 1 отзыв на товар от пользователя
  @@index([productId, createdAt])     // список отзывов товара по дате
}
```

Relation-поля (добавить в существующие модели):
- `Product` → `reviews Review[]`
- `User` → `reviews Review[]`

> `onDelete: Cascade` на обеих связях: удаление товара/пользователя убирает его отзывы (одиночный каскадный DELETE — Neon-safe).

## §4. Логика eligibility (`lib/review.ts`)

```ts
// Чистая проверка диапазона рейтинга — переиспользуется в DTO и тесте.
export function isValidRating(r: number): boolean {
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

// Есть ли у пользователя право оставить отзыв о товаре:
// (1) есть не-CANCELLED заказ с позицией этого товара И (2) ещё не оставлял отзыв.
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

> Связь `OrderItem → ProductVariant → ProductColorway → Product`: `items.some.productVariant.colorway.productId`. `OrderItem` хранит снапшот (sku/productName), но `productVariantId` — реальный FK, по нему доходим до `productId`. Обе операции — одиночные read (Neon-safe).

## §5. DTO + Server Action

### DTO (`services/dto/review.dto.ts`)
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

### `app/actions/review.ts`
```ts
'use server';
export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(raw: unknown): Promise<SubmitReviewResult> {
  // 1. auth() → userId, иначе { ok:false, error:'Войдите, чтобы оставить отзыв' }
  // 2. reviewSchema.safeParse(raw) → иначе 'Проверьте поля'
  // 3. canReview(userId, productId) → иначе 'Отзыв доступен после покупки'  (источник истины — клиенту не доверяем)
  // 4. prisma.review.create({ data: { productId, userId, rating, body: body?.trim() || null } })
  //    catch P2002 (unique productId+userId) → 'Вы уже оставили отзыв'
  // 5. revalidatePath(`/product/${slug}`)
  // 6. { ok:true }
}
```
> **`slug` для revalidate:** `reviewSchema` включает `slug: z.string().min(1)` (форма уже на странице товара — slug известен), используется ТОЛЬКО для `revalidatePath`; запись идёт по `productId`. Так избегаем лишнего lookup. (Доверять клиентскому slug безопасно — он влияет лишь на инвалидацию кэша своей же страницы.)

## §6. PDP-интеграция

### Чтение (`app/product/[slug]/page.tsx`, RSC)
```ts
const [agg, reviews] = await Promise.all([
  prisma.review.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true }),
  prisma.review.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
    take: 50,
  }),
]);
const session = await auth();
const eligible = session?.user?.id ? await canReview(session.user.id, product.id) : false;
```
`Promise.all` — независимые read'ы (Neon-safe, параллельные).

### Показ
- **Агрегат-шапка:** `★ {avg.toFixed(1)} ({count})` рядом с заголовком/`purchase-panel`. Если `count===0` — «Пока нет отзывов».
- **Секция отзывов** (`reviews-section.tsx`) — после `specs-table`/related: список + форма.
- **Форма** (`review-form.tsx`, client):
  - `session && eligible` → форма (звёзды 1–5 + textarea + «Оставить отзыв»).
  - не вошёл → «Войдите, чтобы оставить отзыв» (ссылка `/login`).
  - вошёл, но `!eligible` из-за отсутствия покупки → «Отзыв можно оставить после покупки».
  - уже оставил (eligible=false по этой причине) → его отзыв виден в списке; форму не показываем. (Различие «не покупал» vs «уже оставил» — опц.: можно показать общий «Отзыв можно оставить после покупки»; точное сообщение про дубль ловится при submit через P2002.)

### Компоненты (`components/shared/product/`)
- `rating-stars.tsx` — звёзды по числовому значению (полные/половина — округление до 0.5 для агрегата; целое для per-review). Display-only.
- `star-input.tsx` (или внутри формы) — интерактивный выбор 1–5 (radiogroup, a11y).
- `review-list.tsx` — `<ul>`: на отзыв — звёзды, имя автора (или «Покупатель» если name пуст), дата, текст, бейдж «Покупка подтверждена».
- `review-form.tsx` — client (`useState` для rating/body/pending/error), вызывает `submitReview`, на успех `router.refresh()`.
- `reviews-section.tsx` — композиция шапки + списка + формы (RSC, форму рендерит как client-островок).

## §7. Seed demo-отзывов

Seed не создаёт юзеров/заказы. Для непустого PDP — вставить напрямую (гейт только на write-пути `submitReview`, seed пишет в обход):
- создать 1–2 demo-`User` (например `review-demo-1@stride.local`, без пароля — только для авторства отзывов; `name` задать);
- вставить несколько `Review` (`upsert` по `@@unique([productId, userId])`) для бестселлеров (разные rating 4–5, часть с текстом).

> Идемпотентно (`upsert`). Demo-юзеры помечены явным комментарием. Не аутентифицируемы (passwordHash null, Google не линкуется).

## §8. Тестирование

**Юнит (Vitest, мок prisma):**
- `isValidRating`: 1..5 → true; 0/6/2.5/NaN → false.
- `canReview`: есть не-CANCELLED заказ + нет отзыва → true; нет заказа → false; есть отзыв → false; заказ только CANCELLED → false.
- `submitReview`: не вошёл → отказ; не покупал → отказ; happy → `review.create` вызван с rating/body; дубль (`create` бросает P2002) → «уже оставили»; rating вне 1..5 → zod-отказ (create не вызван).

**Интеграция (e2e, CI/Ubuntu):** `e2e/review.spec.ts`:
- Регистрация → оформить не-CANCELLED заказ сид-товара (COD, как в checkout.spec) → PDP товара → форма видна → поставить звёзды + текст → submit → отзыв в списке, агрегат показывает счётчик/среднюю.
- Повторный отзыв того же товара → «Вы уже оставили отзыв» (или формы нет).
- Гость на PDP → формы нет, видит «Войдите, чтобы оставить отзыв».
- a11y: PDP с секцией отзывов проходит axe (звёздный инпут — radiogroup с label).

> e2e создаёт заказ → списывает сток (P10) → seed-сброс в `e2e.yml` уже есть. Купоны/seed-отзывы в CI появятся через `prisma:seed`.

## §9. Конфигурация
Новых env не требуется.

## §10. Критерии готовности
- [ ] typecheck 0, vitest зелёные (+ review-сьюты), build OK, middleware ~86 kB.
- [ ] Гейт: отзыв только при не-CANCELLED заказе товара; повтор отклоняется (unique).
- [ ] PDP: агрегат ★+count (on-read), список отзывов, форма по eligibility; пустое состояние «Пока нет отзывов».
- [ ] `submitReview` валидирует rating 1..5 (fail-closed), не доверяет клиенту (повторный canReview).
- [ ] seed заводит demo-отзывы идемпотентно; PDP бестселлеров не пустой.
- [ ] e2e зелёные в CI.

## §11. Зафиксированные допущения
- Verified-гейт ослаблен до «не-CANCELLED заказ» (нет DELIVERED-флоу без admin) — пересмотреть, когда появится admin/доставка.
- Агрегат on-read; денормализация и сортировка-по-рейтингу — отдельный слайс (DB-sort).
- Отзыв к `Product`, 1 на пользователя, без edit/delete, без модерации.
- Имя автора из `User.name` (пусто → «Покупатель»); demo-отзывы — через seed-юзеров в обход гейта.
