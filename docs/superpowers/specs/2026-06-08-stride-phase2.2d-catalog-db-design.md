# STRIDE — Фаза 2.2d: DB-уровень сортировки/пагинации + реальная популярность (design)

> Артефакт design-фазы. Дата: 2026-06-08. Слайс P2.2d (Discovery).
> Предпосылка: P2.1 (Orders) реализован → есть данные продаж; каталог Фазы 1 сортирует/пагинирует в памяти.

## 1. Проблема и цель

**Сейчас** (`lib/find-products.ts`): каталог грузит ВСЕ совпадения (`findMany` без `take`),
сортирует функцией `sortCards` в памяти и режет `.slice()` по странице. Корректно для демо
(каталог < PAGE_SIZE), но не масштабируется: каждый рендер тянет весь матчинг-набор из Neon.

Параллельно `buildOrderBy`/`buildPagination` в `lib/catalog-filters.ts` — **мёртвый код**:
экспортируются и юнит-тестируются, но `find-products` их не импортирует.

«Популярность» (`sort=popular`) — прокси: `isBestseller desc, sortOrder asc`. Реальных продаж
не отражает, хотя `Order`/`OrderItem` уже наполняются (P2.1).

**Цель**: перенести сортировку и пагинацию на уровень БД (`orderBy` + `skip`/`take` + `count`),
сделать `popular` реальной метрикой продаж, сохранив идентичный сегодняшнему порядок выдачи.

## 2. Ключевой инсайт: отображаемые minPrice/discount — фильтро-НЕзависимые агрегаты

`buildProductCardData` (`lib/product-summary.ts`) считает `minPrice`/`minCompareAtPrice` из
**дефолтной расцветки** (`colorways[0]` после сортировки `isDefault desc, sortOrder asc`),
по её **самому дешёвому активному варианту** — ВСЕГДА из полного `productCardInclude`,
**независимо** от фильтров размера/цены в URL. Фильтры влияют на то, КАКИЕ товары попадут
в выдачу (`buildProductWhere`), но не на отображаемую на карточке цену.

Следствие: `minPrice`/`discountPct` — функция только от данных товара, не от запроса. Их можно
**денормализовать** в колонки `Product` и получить **байт-в-байт тот же порядок**, что даёт
текущая ин-メмори сортировка по `data.minPrice` / `discountPercent(...)`. Цена в рантайме не
меняется (admin-фазы ещё нет) → колонки считаются один раз, на сиде.

## 3. Решение: 3 денормализованные колонки сортировки на Product

| Колонка       | Тип               | Источник                                                              | Когда пишется |
|---------------|-------------------|----------------------------------------------------------------------|---------------|
| `salesCount`  | `Int @default(0)` | сумма проданных единиц (по позициям заказов)                         | рантайм (заказы) |
| `minPrice`    | `Int @default(0)` | цена самого дешёвого активного варианта дефолтной расцветки          | сид           |
| `discountPct` | `Int @default(0)` | `discountPercent(minPrice, minCompareAtPrice)` той же позиции, или 0 | сид           |

Индексы: `@@index([salesCount])`, `@@index([minPrice])`. (`createdAt`-сорт уже покрыт; `discountPct`
не индексируем — низкая кардинальность, сорт после фильтра по малой выборке.)

**Инвариант (зафиксировать комментарием в schema + seed):** `minPrice`/`discountPct` —
денормализация дефолтной расцветки; их обязан пересчитывать ЛЮБОЙ будущий путь записи цены
варианта/`isDefault`/`active` (admin Phase 3). Сегодня единственный такой путь — сид.

## 4. salesCount: жизненный цикл = как сток

Решение пользователя: `salesCount` движется ровно там, где `ProductVariant.stock`.

| Точка                              | Действие                                  | Файл |
|------------------------------------|-------------------------------------------|------|
| `placeOrder` (после декремента стока, успех) | `+qty` агрегированно по товару      | `app/actions/order.ts` |
| `cancelOrder` (PENDING → CANCELLED)| `−qty` по товару                          | `app/actions/order.ts` |
| `applyPaymentCanceled`             | `−qty` по товару                          | `lib/payment-sync.ts`  |

- **Агрегация по товару**: один заказ может содержать несколько вариантов одного товара
  (разные размеры/расцветки) → суммируем `qty` по `productId`, один `update` на товар
  (`{ salesCount: { increment: n } }`). Хелпер `salesDeltaByProduct()`.
- **Считаются и неоплаченные online-заказы** (PENDING): как сток, списываемый при оформлении.
  Отмена (юзером или вебхуком ЮKassa) возвращает и сток, и `salesCount`. Симметрично и просто.
- **Не-транзакционно, best-effort**: как stock-апдейты рядом. Сбой инкремента `salesCount`
  логируется (`logger.error`), но НЕ откатывает заказ (популярность — не деньги/не сток).
  Заказ уже создан, сток списан — потеря инкремента популярности приемлема (как и
  существующие best-effort stock-restore в этом коде).
- **Идемпотентность отмены (ОБЯЗАТЕЛЬНА — `salesCount` индексируется и сортируется):** возврат
  стока и `−salesCount` РЕЛЯТИВНЫ. `applyPaymentCanceled` (вебхук ЮKassa at-least-once + поллинг
  страницы заказа) и `cancelOrder` (ручная отмена) — несколько живых писателей одного заказа.
  Поэтому обе точки делают побочки ТОЛЬКО через условный переход `PENDING→CANCELLED`
  (`update where:{ id, [userId,] status:'PENDING' }`, одиночный UPDATE; `P2025` → ранний выход).
  Это гарантирует «ровно один раз»: вторичный вызов не найдёт PENDING и не повторит инкремент.
  Без гейта `salesCount` уходил бы в минус (ломая сортировку), а сток — пере-восстанавливался.
  (Гейт заодно чинит латентный двойной возврат стока — но добавлен ради корректности нового
  индексируемого `salesCount`.) Найдено adversarial-review воркфлоу P2.2d.
- **Без backfill** исторических заказов: пред-лонч демо, ре-сид сбрасывает БД. `salesCount`
  стартует с 0 у всех; накапливается с новых заказов. (Зафиксировать в плане как осознанный скоуп.)

## 5. buildOrderBy → реальные колонки + детерминированный tiebreak

```ts
export function buildOrderBy(sort: SortValue): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'popular':    return [{ salesCount: 'desc' }, { isBestseller: 'desc' }, { id: 'asc' }];
    case 'price-asc':  return [{ minPrice: 'asc' },  { id: 'asc' }];
    case 'price-desc': return [{ minPrice: 'desc' }, { id: 'asc' }];
    case 'discount':   return [{ discountPct: 'desc' }, { id: 'asc' }];
    case 'new':
    default:           return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}
```

- **`{ id: 'asc' }` финальный tiebreak** в КАЖДОМ варианте → строгий тотальный порядок →
  стабильная пагинация (товары с равным ключом не «прыгают» между страницами).
- `popular` сохраняет `isBestseller` вторичным ключом: при равных продажах (старт = всё 0)
  бестселлеры впереди — близко к текущему демо-поведению, плавная деградация до реальных продаж.
- Старый `sortCards` (in-memory) удаляется; единственный источник порядка — `buildOrderBy`.

## 6. find-products: DB sort/pagination

```ts
const params = parseCatalogParams(sp);
const where = buildProductWhere(params);
const { skip, take } = buildPagination(params.page); // существующий хелпер

const [total, raw, ...facets] = await Promise.all([
  prisma.product.count({ where }),
  prisma.product.findMany({ where, include: productCardInclude, orderBy: buildOrderBy(params.sort), skip, take }),
  /* facet groupBy — без изменений */
]);

const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
const products = raw.map((p) => buildProductCardData(p, now, cfg));
```

- `total` — `count(where)` вместо `cards.length`. Фасеты (`groupBy`/`findMany` категорий/цветов) —
  без изменений (они и так на уровне БД и от пагинации не зависят).
- `page` клампится к `totalPages` как сейчас, но через отдельный пере-расчёт: если запрошенная
  страница > totalPages (напр., фильтр сузил выдачу), берём последнюю валидную и НЕ нужен второй
  запрос — данные первой выборки уже корректны для большинства; **edge**: запросили page=5,
  реально 2 страницы → `skip` промахивается → пустая выборка. Поэтому: сперва `count`, кламп `page`,
  ПОТОМ `findMany` со `skip` от клампнутой страницы. Делаем `count` и фасеты параллельно, затем
  `findMany` (зависит от клампнутой `page`). (Один доп. round-trip только когда page вне диапазона —
  редко; в норме `count`+`findMany` обе нужны.)

  Финальный план: `count` + фасеты параллельно → кламп page → `findMany`. Либо проще и в один
  «волну»: `findMany` со `skip` от исходной (валидированной ≥1) `page`, а если выборка пуста и
  `page > 1` и `total > 0` — это допустимый пустой результат «страница за пределами» (показываем
  Empty/Pagination уводит назад). **Выбор**: оставить как сейчас (кламп до выборки) ради UX
  «нет битых пустых страниц» → последовательность `count → клампнуть → findMany`.

## 7. Расширение seed-данных (>12 товаров)

Сейчас 6 товаров < `CATALOG_PAGE_SIZE`(12) → всегда 1 страница, пагинация невидима.
Добавляем ~8 товаров (итого ~14) поверх существующих 6.

- **Существующие 6 — не трогаем** (их сток — бюджет e2e: `stride-velocity-trail` 42=5 и т.д.,
  см. memory `e2e-size42-stock-budget`). Новые товары — новые slug/SKU, свой сток.
- Переиспользуем хелпер `mk()` и наборы строк `RUN/LIFE/PLAT`; картинки — из существующего пула
  `/products/*.jpeg` (Cloudinary ещё не подключён, все ассеты локальные).
- Разброс цен/скидок/брендов/gender/категорий → наблюдаемые price-asc/price-desc/discount/popular.
- Сид пишет денормализованные колонки: после upsert вариантов товара считаем
  `productDenormFromColorways(colorways)` → `prisma.product.update({ minPrice, discountPct })`.
  `salesCount` сид НЕ трогает (default 0; накапливается заказами; ре-сид TRUNCATE сбросит в 0).

## 8. Новый модуль: lib/product-aggregates.ts (чистые хелперы)

```ts
// Денормализация дефолтной расцветки для сортировочных колонок Product.
export function productDenormFromColorways(colorways): { minPrice: number; discountPct: number }
// Дельта продаж по товару из позиций заказа: productId → суммарный qty.
export function salesDeltaByProduct(items: { productId: string; quantity: number }[]): Map<string, number>
```

Чистые, юнит-тестируемые, без Prisma. `productDenormFromColorways` повторяет логику
`buildProductCardData` (дефолтная расцветка = первая по `isDefault desc, sortOrder asc`;
самый дешёвый активный вариант) — но над seed-структурой/include-выборкой. `discountPct`
через существующий `discountPercent()` из `product-badges`.

## 9. Тесты

- **unit `tests/product-aggregates.test.ts`**: minPrice = дешёвый активный вариант дефолтной
  расцветки; неактивные варианты исключены; нет вариантов → 0/0; discountPct из compareAt;
  salesDeltaByProduct агрегирует дубли productId.
- **unit `tests/catalog-filters.test.ts`** (правка): новые ожидания `buildOrderBy` (реальные
  колонки + `{id:'asc'}` tiebreak в каждой ветке).
- **e2e `e2e/catalog.spec.ts`** (добавить): (a) пагинация видна (`totalPages>1`), переход на
  стр. 2 меняет URL `?page=2` и набор карточек; (b) `sort=price-asc` → первая карточка дешевле
  последней (или ASC-монотонность по видимой цене). Существующие 2 теста — зелёные (счёт
  `article` на стр.1 капнут 12, фильтр-тест не зависит от объёма).

## 10. Миграция и выкатка

- Схема: +3 `Int @default(0)` колонки + 2 индекса. **Аддитивно** (дефолты) → `prisma db push`
  без `--accept-data-loss`. Применяется существующим workflow `.github/workflows/db-push.yml`
  (Ubuntu-раннер близко к Neon) и/или CI `e2e.yml` (`prisma:push` перед e2e). Локальный push
  заблокирован латентностью Neon (memory).
- `minPrice`/`discountPct` существующих строк наполнит `prisma:seed` (TRUNCATE+пере-сид);
  на проде — прогон сида или ре-сид демо-данных. `salesCount` остаётся 0 до новых заказов.
- **Транспорт**: WebSocket/PrismaNeon (`$transaction`/`createMany` доступны) — но этот слайс
  их не требует; все апдейты — одиночные (как соседний stock-код).

## 11. Границы (out of scope)

- Поддержка денормализованных колонок со стороны admin (Phase 3) — фиксируем инвариант, не строим.
- Backfill `salesCount` из исторических заказов — пред-лонч, ре-сид сбрасывает.
- `/search`, back-in-stock — отдельные слайсы.
- Гонка read→increment salesCount — приемлема (как существующая гонка stock decrement, MVP).

## 12. Критерии готовности

1. `prisma db push` аддитивно создаёт 3 колонки + 2 индекса (CI/preview зелёный билд).
2. Каталог: `findMany` с `take:12` + `skip` + `orderBy` из `buildOrderBy`; `total` = `count`.
3. `sortCards` удалён; `buildOrderBy`/`buildPagination` подключены (не dead code).
4. `salesCount` инкрементится при placeOrder, декрементится при cancelOrder/applyPaymentCanceled,
   агрегированно по товару, best-effort с логом.
5. Seed >12 товаров; денорм-колонки заполнены; стоки существующих 6 не изменены.
6. typecheck + vitest зелёные локально; e2e (пагинация+price-sort) зелёные в CI.
```
