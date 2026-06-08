# План: P2.2d — DB-уровень сортировки/пагинации + реальная популярность

> Дата: 2026-06-08. Спека: `docs/superpowers/specs/2026-06-08-stride-phase2.2d-catalog-db-design.md`.
> Ветка: `feat/phase2.2d-catalog-db` (от `feat/phase2.2b-wishlist`).

## Контекст-якоря (проверено в коде)

- `lib/find-products.ts`: `sortCards` + `findMany(без take)` + `.slice()` — ин-メмори.
- `lib/catalog-filters.ts`: `buildOrderBy`/`buildPagination` — экспортированы, юнит-тест, НЕ импортированы (dead).
- `lib/product-summary.ts` `buildProductCardData`: minPrice/discount из дефолтной расцветки, фильтро-независимо.
- `app/actions/order.ts`: декремент стока в `placeOrder`, инкремент в `cancelOrder`; одиночные `update`.
- `lib/payment-sync.ts` `applyPaymentCanceled`: возврат стока по позициям.
- Транспорт: WebSocket/PrismaNeon (`lib/prisma-client.ts`).
- Выкатка схемы: `.github/workflows/db-push.yml` (ручной) + `e2e.yml` (`prisma:push`+`prisma:seed`).
- Каталог сейчас 6 товаров (`prisma/seed-data.ts`), PAGE_SIZE=12.

## Задачи

### Task 1 — schema: денорм-колонки
`prisma/schema.prisma`, model `Product`: добавить
`salesCount Int @default(0)`, `minPrice Int @default(0)`, `discountPct Int @default(0)`
+ `@@index([salesCount])`, `@@index([minPrice])`. Комментарий-инвариант: minPrice/discountPct —
денормализация дефолтной расцветки, пересчёт при любой записи цены/isDefault/active (admin Phase 3).

### Task 2 — lib/product-aggregates.ts (новый) + тест
`productDenormFromColorways(colorways) → { minPrice, discountPct }`:
дефолтная расцветка = первая по `isDefault desc, sortOrder asc`; самый дешёвый АКТИВНЫЙ вариант;
`discountPct = discountPercent(minPrice, minCompareAtPrice) ?? 0`; нет вариантов → `{0,0}`.
`salesDeltaByProduct(items) → Map<productId, qtySum>`.
`tests/product-aggregates.test.ts`: активный/неактивный, пусто, дубли productId, скидка.

### Task 3 — buildOrderBy (реальные колонки + tiebreak) + тест
`lib/catalog-filters.ts` `buildOrderBy`: см. спеку §5 (`{id:'asc'}` финальный в каждой ветке).
`tests/catalog-filters.test.ts`: обновить ожидания всех 5 сортировок.

### Task 4 — find-products: DB sort/pagination
`lib/find-products.ts`: убрать `sortCards`; `count(where)` для total; `findMany` c
`orderBy: buildOrderBy(params.sort)`, `skip`/`take` из `buildPagination`. Кламп page к totalPages
ДО `findMany` (последовательность: count+facets параллельно → кламп → findMany). Фасеты без изменений.

### Task 5 — salesCount в жизненном цикле заказа
- `app/actions/order.ts`:
  - `placeOrder`: после успешного создания заказа/позиций — `salesDeltaByProduct` по snapshot
    (нужен productId на позицию: snapshot его не несёт → достать из `cart.items[].productVariant.colorway.productId`,
    он уже в `cartInclude`? — проверить; если нет, расширить include или маппить из cart).
    Один `update` на товар `{ salesCount: { increment: n } }`, best-effort + лог.
  - `cancelOrder`: уже грузит `items.productVariant.colorway.productId` → декремент по товару, best-effort + лог.
- `lib/payment-sync.ts` `applyPaymentCanceled`: расширить include до `colorway.productId`,
  декремент salesCount по товару, best-effort + лог.

### Task 6 — расширить seed + денорм-колонки
- `prisma/seed-data.ts`: +8 товаров (новые slug/SKU, разброс цен/скидок/брендов/gender/категорий,
  картинки из `/products/*.jpeg`). Существующие 6 не трогать.
- `prisma/seed.ts`: после upsert вариантов товара — `productDenormFromColorways` →
  `product.update({ minPrice, discountPct })`. salesCount не трогаем (default 0).
- Обновить лог-счётчики при необходимости.

### Task 7 — e2e + верификация
- `e2e/catalog.spec.ts`: пагинация (totalPages>1, переход на page=2 меняет URL+карточки) +
  price-asc монотонность видимой цены.
- Локально: `npm run typecheck`, `npm test` — зелёные.
- **Действие пользователя (нельзя локально — Neon-латентность):** запустить `db-push` workflow
  (или пуш ветки → CI `e2e.yml` сделает `prisma:push`+`prisma:seed`+e2e). Затем preview-проверка
  пагинации/сортировки на деплое.

## Порядок исполнения
Task 1,2,3 независимы (parallel). → Task 4 (зависит 1,3). → Task 5 (зависит 1,2). →
Task 6 (зависит 1,2). → Task 7 (зависит 4,5,6).

## Скоуп-допущения (зафиксировано)
salesCount: старт 0, без backfill; считает неоплаченные PENDING (как сток); best-effort.
minPrice/discountPct: seed-time, инвариант для admin Phase 3. Гонка read→increment — MVP-приемлема.
```
