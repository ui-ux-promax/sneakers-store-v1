# STRIDE — Фаза 2.2b (Wishlist / Избранное): дизайн

> **Статус:** на ревью.
> **Дата:** 2026-06-07. **Ветка (план):** `feat/phase2.2b-wishlist` (от `main`).
> Артефакт брейнсторминга (superpowers:brainstorming). Прототипа не было — дизайн с нуля.

## 1. Цель

Пользователь сохраняет понравившиеся товары по ♡. Гость копит избранное (cookie-token), при логине список сливается в аккаунт. Просмотр — на отдельной `/wishlist` + вход через ♡-иконку со счётчиком в header.

## 2. Зафиксированные решения (брейнсторминг)

| Вопрос | Решение |
|---|---|
| Гранулярность | **Товар** (`Product`). ♡ = «нравится модель», без размера/цвета. Move-to-cart ведёт на PDP выбрать размер. |
| Доступ | **Гость + merge при логине** (cookie-token, как корзина). |
| Размещение списка | **Отдельная `/wishlist`** + ♡-иконка со счётчиком в header. |
| ♡ на карточке | **Сверху-справа, всегда видна** (вариант A — работает на тач). Toggle. |
| Страница `/wishlist` | Сетка `ProductCard` (♡ = убрать), клик по карточке → PDP. Пустое состояние «В избранном пусто» + «Смотреть каталог». |
| Хранение | **Подход A — зеркало `Cart`**: таблицы `Wishlist` + `WishlistItem`. |

## 3. Модель данных

Добавить в `prisma/schema.prisma` (зеркало `Cart`/`CartItem`):

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

  @@unique([wishlistId, productId])   // toggle-идемпотентность + дедуп при merge
  @@index([wishlistId])
}
```

Relation-поля: `Product.wishlistItems WishlistItem[]`, `User.wishlists Wishlist[]`.

**Заметки:**
- `onDelete: Cascade` на `WishlistItem.product` → удаление товара чистит избранное (нет сирот).
- `userId` nullable + `SetNull` — как `Cart`; гость = token без userId.
- Цена/сток НЕ снапшотятся (в отличие от `OrderItem`): wishlist показывает живой товар; sold-out/цена берутся из `Product` на чтении.

## 4. Cookie

Новые константы в `constants/config.ts`:
- `WISHLIST_COOKIE_NAME` = `wishlistToken`
- `WISHLIST_COOKIE_MAX_AGE` (как `CART_COOKIE_MAX_AGE`)

`lib/wishlist-cookie.ts` — экспорт `wishlistCookieName` + `wishlistCookieOptions` (копия `cartCookieOptions`: `httpOnly`, `sameSite: 'lax'`, `secure` в prod, `path: '/'`).

## 5. Логика чтения — `lib/wishlist.ts`

- `resolveOwnerWishlist(session, token, { create }: { create: boolean })` → `Wishlist | null` (внутренний резолвер).
  - залогинен → по `userId` (единственный user-wishlist, поддерживается merge-логикой §8);
  - гость → по `token`;
  - `create:true` → создаёт при отсутствии (для toggle), **`token` генерируется всегда** — в т.ч. для user-wishlist (поле `@unique`, NOT NULL); `create:false` → может вернуть `null` (для чтения).
- Публичные read-хелперы принимают `(session, token)` и резолвят владельца внутри с `create:false` (нет владельца → пустой результат, БЕЗ записи в БД при чтении):
  - `getWishlistProductIds(session, token)` → `Set<string>` `productId` — `initialActive` ♡ на карточках каталога/PDP (один запрос на страницу, без N+1). Нет wishlist → пустой `Set`.
  - `getWishlistItems(session, token)` → `ProductCardData[]` через `lib/product-summary` (как каталог). Фильтр `product.active = true`. `take: 100` (мягкий потолок). Нет wishlist → `[]`.
  - `getWishlistCount(session, token)` → `number` для бейджа header. Нет wishlist → `0`.

## 6. DTO — `services/dto/wishlist.dto.ts`

```ts
import { z } from 'zod';
export const wishlistToggleSchema = z.object({ productId: z.string().min(1) });
export type WishlistToggleValues = z.infer<typeof wishlistToggleSchema>;
```

## 7. Server Action — `app/actions/wishlist.ts`

```ts
'use server';
export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string };
export async function toggleWishlist(raw: unknown): Promise<ToggleResult>;
```

Поток:
1. `wishlistToggleSchema.safeParse(raw)` → `productId`. Невалид → `{ ok:false, error }`.
2. `session = await auth()`; `token = cookies().get(wishlistCookieName)`.
3. Гость без token → сгенерировать token, поставить cookie (Server Action умеет писать cookie).
4. `owner = resolveOwnerWishlist(session, token, { create: true })`.
5. `WishlistItem` по `@@unique([wishlistId, productId])` существует?
   - есть → `delete` → `active:false`;
   - нет → `create` → `active:true`.
6. Гонка дубля: `create` ловит `P2002` → трактуем как `active:true` (уже добавлен).
7. Несуществующий `productId`: `P2003` (FK) → `{ ok:false, error }`.
8. `revalidatePath('/wishlist')`. Возврат `{ ok:true, active }` для оптимистичного UI.

**Безопасность:** owner резолвится ТОЛЬКО из сессии/cookie на сервере. `productId` от клиента — что лайкаем (ок), владельца клиент задать не может (нельзя лайкнуть за другого).

## 8. Merge при логине — `lib/wishlist-merge.ts`

Зеркало `cart-merge.ts` (Neon без жёстких транзакций → идемпотентный/сходящийся дизайн):
- `mergeGuestWishlist(token, userId)`:
  - найти token-wishlist; нет → выход;
  - если у пользователя ещё нет wishlist → привязать token-wishlist (`userId`);
  - иначе перенести items в существующий user-wishlist через `upsert` по `@@unique([wishlistId, productId])` (дедуп), затем удалить опустевший token-wishlist;
  - идемпотентно: повтор входа безопасен.
- `safeMergeGuestWishlist(token, userId)` — обёртка, глотает и логирует ошибки (`wishlist_merge_on_signin_failed`); merge НИКОГДА не роняет аутентификацию.
- Вызов — в `auth.ts` `events.signIn`, рядом с `safeMergeGuestCart`.

Cookie-token после merge остаётся (привязан к userId) — зеркалит поведение корзины.

## 9. UI

### 9.1 `wishlist-heart.tsx` (`'use client'`)
- Props: `productId: string`, `initialActive: boolean`, `variant?: 'card' | 'pdp'`.
- Оптимистичный toggle: `useOptimistic` + `useTransition` (react-best-practices). Клик → мгновенный визуал → `toggleWishlist`. `!ok` → откат + тост. `pending` блокирует двойной клик.
- `variant='card'`: круглая кнопка top-right (вариант A). ♡ залит `#e23b4e` (active) / контур (inactive). `aria-pressed`, `aria-label` «В избранное» / «Убрать из избранного».
- `variant='pdp'`: вторичная кнопка-строка рядом с «В корзину»: «♡ В избранное» / «♥ В избранном».

### 9.2 Точки интеграции
1. `components/shared/product-card.tsx` — `<WishlistHeart variant="card" />` в `.pc-img` top-right. Карточка остаётся RSC; ♡ — клиентский остров. `initialActive` приходит с уровня списка.
2. PDP `app/product/[slug]/page.tsx` — `<WishlistHeart variant="pdp" />` в buy-панель; `initialActive` из `getWishlistProductIds`.
3. Header `components/shared/site-header.tsx` — ♡-иконка-ссылка на `/wishlist` с бейджем `getWishlistCount` (RSC), слева от корзины. Бейдж скрыт при 0.
4. `app/wishlist/page.tsx` (RSC) — заголовок «Избранное (N)», `wishlist-grid`, либо `wishlist-empty`.

### 9.3 Компоненты страницы
- `components/shared/wishlist/wishlist-grid.tsx` — сетка `ProductCard` (♡ active=true → клик убирает).
- `components/shared/wishlist/wishlist-empty.tsx` — пустое состояние (♡-иконка, текст, кнопка «Смотреть каталог»).

**Передача `wishlistedIds`:** каталог/PDP читают `getWishlistProductIds(session, token)` один раз и прокидывают `Set` вниз → ♡ знает `initialActive` без запроса на карточку (нет N+1).

## 10. Состояния и edge-cases

- **Оптимистичный ♡:** мгновенный визуал; ошибка → откат + тост; двойной клик защищён `pending`.
- **Гость:** первый ♡ создаёт token+cookie+wishlist; видит свой `/wishlist` и счётчик.
- **Merge:** union + дедуп; идемпотентно; не роняет вход.
- **Sold-out:** ♡ работает (избранное ≠ покупка); карточка грейскейл-бейдж как в каталоге.
- **`active:false` товар:** фильтруется на чтении `getWishlistItems` (не показываем снятые с продажи); связь живёт до Cascade-удаления товара.
- **Счётчик header:** RSC, обновляется через `revalidatePath`; короткая рассинхронизация после toggle на карточке приемлема.
- **Пустое состояние:** гость и юзер с пустым списком — один блок.
- **Лимит:** мягкий, без жёсткого капа в v1; `take: 100` на чтении.

## 11. Тестирование

**Unit (`tests/wishlist.test.ts`, mock prisma):**
- `resolveOwnerWishlist`: userId / token / `create:true`.
- `getWishlistProductIds` / `getWishlistCount`: верные множества/числа.
- merge: union+дедуп, привязка token→userId, идемпотентность.

**Unit (`tests/toggle-wishlist.test.ts`, mock auth/prisma/cookies):**
- нет item → create, `active:true`.
- есть item → delete, `active:false`.
- P2002 → `active:true`, без падения.
- гость без cookie → создаётся token+wishlist.
- невалидный `productId` (zod) → `ok:false`, без записи.

**E2E (`e2e/wishlist.spec.ts`):**
- гость лайкает в каталоге → ♡ залит → `/wishlist` показывает товар → счётчик header=1.
- убрать с `/wishlist` → пусто + пустое состояние.
- merge: гость лайкнул → регистрация/логин → товар в `/wishlist`.
- toggle вкл/выкл/вкл → конечное состояние верно.

**a11y:** `/wishlist` в `e2e/a11y.spec.ts` (axe); ♡ `aria-pressed`+`aria-label`; бейдж не ломает контраст.

**Гейты:** локально `typecheck` + `vitest` + `build`; e2e — в CI (Ubuntu). ♡ не трогает сток → не конфликтует с бюджетом стока размера 42.

## 12. Критерии готовности

- [ ] Схема `Wishlist`/`WishlistItem` + relation-поля; клиент сгенерирован; typecheck 0.
- [ ] Гость лайкает → token+cookie+wishlist; список и счётчик видны.
- [ ] Залогиненный лайкает → пишется в user-wishlist.
- [ ] Merge при логине: union+дедуп, идемпотентно, не роняет вход.
- [ ] ♡ на карточке (top-right, всегда), PDP, header-счётчик, `/wishlist` (сетка+пусто).
- [ ] Оптимистичный toggle с откатом при ошибке.
- [ ] Owner только из сессии/cookie (нельзя лайкнуть за другого).
- [ ] Unit + e2e + a11y зелёные (e2e в CI).

## 13. Вне скоупа (v1)

- Снапшот цены/стока, уведомления о снижении цены/back-in-stock (отдельный слайс P2.2).
- Жёсткий лимит размера списка, папки/коллекции, шаринг wishlist.
- Move-to-cart прямо со страницы (ведём на PDP — нужен выбор размера).
- Wishlist-гранулярность по расцветке/размеру.

## 14. Затрагиваемые/новые файлы

**Новые:** `lib/wishlist.ts`, `lib/wishlist-cookie.ts`, `lib/wishlist-merge.ts`, `services/dto/wishlist.dto.ts`, `app/actions/wishlist.ts`, `app/wishlist/page.tsx`, `components/shared/wishlist/wishlist-heart.tsx`, `components/shared/wishlist/wishlist-grid.tsx`, `components/shared/wishlist/wishlist-empty.tsx`, `tests/wishlist.test.ts`, `tests/toggle-wishlist.test.ts`, `e2e/wishlist.spec.ts`.

**Изменяемые:** `prisma/schema.prisma`, `constants/config.ts`, `components/shared/product-card.tsx`, `app/product/[slug]/page.tsx`, `app/catalog/*` (прокинуть `wishlistedIds`), `components/shared/site-header.tsx`, `auth.ts` (`events.signIn`), `e2e/a11y.spec.ts`.

## 15. Деплой

Прод-build (`vercel.json`) и CI (`e2e.yml`) применят `db push` → таблицы `Wishlist`/`WishlistItem` в Neon. Доп. env не нужны.
