# STRIDE — Фаза 3.3: Products (design)

> Артефакт design-фазы (оформлен 2026-06-13 в brainstorming, ДО кода). Слайс P3.3 (ядро админ-каталога).
> Предпосылка: P3.2 (Categories) в main. **P3.3 ветвится от `main` после merge P3.2** — он трогает те же
> `/admin/catalog` маршруты; если 3.2 ещё не в main, ветка `feat/phase3.3-products` от `feat/phase3.2-categories`
> с последующим rebase на main.
> Research-карта: research-workflow по кодовой базе (schema / aggregates / 3.2-паттерн / storefront / admin-infra / pizza-ref), 2026-06-13.

## 1. Проблема и цель

Админка stride имеет фундамент (3.0), медиа-пайплайн (3.1) и CRUD категорий (3.2), но **нет управления
товарами**. Товар — трёхуровневое дерево `Product → ProductColorway → (ProductImage[] + ProductVariant[])`
с денормализованными полями `minPrice`/`discountPct`, которые сейчас считаются только в seed. Это самый
тяжёлый доменный слайс роадмапа 3.x.

**Цель P3.3**: список товаров с фильтрами/пагинацией + одна вложенная форма создания/редактирования всего
дерева с атомарным сохранением (`$transaction`), обязательным пересчётом денорм-полей, уникальностью SKU
и защитой ссылочной целостности по `OrderItem`. Реализуется **одним слайсом** (ветка `feat/phase3.3-products`,
один spec/plan/PR).

**Out of scope** (явно): Orders (3.4), Customers (3.5), Dashboard (3.6), Coupons (3.7); модель Brand
(остаётся `String` на Product + distinct-фильтр); drag-n-drop библиотеки (reorder только `↑↓`); изменения
витрины (она читает те же поля); массовые операции / импорт-экспорт / bulk-recompute.

## 2. Контекст-якоря (проверено в коде)

- **Дерево и связи** (`stride-app/prisma/schema.prisma`):
  - `Product` (31-63): `id`, `name`, `slug @unique`, `brand String`, `gender Gender @default(UNISEX)`,
    `categoryId → Category`, `description?`, `fitNote?`, `specs Json?`, `isBestseller`, `active @default(true)`,
    `sortOrder @default(0)`, `salesCount`, `minPrice`, `discountPct`, `createdAt`. Индексы по
    `categoryId,sortOrder` / `brand` / `gender` / `active` / `salesCount` / `minPrice`.
  - `ProductColorway` (65-79): `name`, `slug`, `swatchHex?`, `isDefault @default(false)`, `sortOrder`;
    `@@unique([productId, slug])`; `onDelete: Cascade` к Product.
  - `ProductImage` (81-90): `url`, `alt?`, `sortOrder`; `onDelete: Cascade` к Colorway. **`publicId` отсутствует.**
  - `ProductVariant` (92-107): `sizeEu Decimal(3,1)`, `sku @unique`, `price Int`, `compareAtPrice?`, `stock`,
    `active @default(true)`; `@@unique([colorwayId, sizeEu])`; `onDelete: Cascade` к Colorway.
- **FK-якорь:** `OrderItem.productVariantId → ProductVariant` **без `onDelete` ⇒ RESTRICT** (228-245);
  `CartItem` — то же (175-185). Variant, на который ссылается заказ, физически удалить нельзя.
- **Enum `Gender`** (11-16): MEN / WOMEN / UNISEX / KIDS. **Brand** — строка, не модель (35).
- **Денорм:** `productDenormFromColorways(colorways) → {minPrice, discountPct}` берёт дефолтную расцветку
  (`isDefault desc, sortOrder asc`), её самый дешёвый **active** variant; нет active → `{0,0}`
  (`lib/product-aggregates.ts:22-38`). Вызывается **только в seed** (`prisma/seed.ts:98-102`). Комментарий
  схемы (45-48) требует пересчёта на любом write-пути, меняющем price/isDefault/active — это задача 3.3.
  Витринная сортировка (`lib/catalog-filters.ts:89-103`) и карточки опираются на эти колонки.
- **Паттерн 3.2** (шаблон): `page.tsx (RSC)` → `_components/*-table.tsx (client)` → `_components/*-form.tsx
  (rhf + zodResolver)` → `app/actions/admin/*.ts`. Экшены: `requireAdminAction()` guard
  (`lib/admin/require-admin.ts:37-43`), конверт `{ok:true} | {ok:false,error}`, zod-DTO, `P2002`-обработка,
  `revalidatePath`, best-effort Cloudinary `deleteAsset`. `moveCategory` — swap sortOrder соседей (инлайн,
  отдельного сервиса нет). `slugify` RU→латынь (`lib/slugify.ts`).
- **Admin-инфра готова:** `DataTable` (tanstack, server-pagination), Radix `Select`/`DropdownMenu`/`Switch`,
  `Dialog`/`AlertModal`, `Button`(+`outline`)/`Input`/`Heading`/`Table`; `parsePaginationParams` /
  `buildPaginationMeta` / `readEnumParam` / `readSearchQuery` (`lib/admin/pagination.ts`); `api-error`
  конверт `{message, issues}`; `ImageUploader` (multi `max=8`, signed upload + best-effort delete,
  `components/admin/media/image-uploader.tsx`); `buildImageUrl(publicId, preset)`; `validateImageFile`;
  `deleteAsset`. `ALLOWED_FOLDERS` в sign-route = `['stride/uploads','stride/categories']`.
- **Зазоры:** нет variant-matrix; нет галереи с reorder/alt (ImageUploader = upload+delete); у `ProductImage`
  нет `publicId`; нет folder `stride/products` в sign-route.
- **CI/deploy/конвенции:** `vercel.json` buildCommand `prisma db push --skip-generate && next build`;
  `db push`/seed/e2e локально на Neon **не гонять** (Windows hang); коммиты EN, без Co-Authored-By, автор
  ui-ux-promax; spec/plan RU; vitest `environment:'node'`, только чистая логика, UI — typecheck+ручное.
  `next lint` не настроен.

## 3. Зафиксированные решения (юзер, 2026-06-13)

1. **Гранулярность:** один мега-слайс 3.3 (одна вложенная форма, одна транзакция, один PR).
2. **Маршруты:** `/admin/catalog` → таб-хаб **[Товары | Категории]**; товары `/admin/catalog/products/*`,
   категории **переезжают** в `/admin/catalog/categories/*`. Оба namespaced.
3. **Variant-matrix:** EU-грид (35–48 + полуразмеры) — тык по размеру создаёт строку variant; bulk «price/stock на все».
4. **Валидность create:** разрешён **draft-shell** (`active=false`, пустое дерево можно сохранить);
   `active=true` требует ≥1 colorway с ≥1 active-variant.
5. **Удаление товара:** hard-delete только если ни один variant не в `OrderItem`; иначе блок + модалка «деактивируйте».
6. **SKU:** авто-подсказка (brand+model+colorway+size), редактируемая; уникальность через `P2002`→409.
7. **specs:** редактор key→value, хранится как Json-объект (`Record<string,string>`).
8. **Галерея:** `↑↓`-reorder + поле `alt` поверх `ImageUploader` (без dnd-библиотеки).
9. **Схема:** добавить `publicId String?` в `ProductImage` (nullable, обратносовместимо).
10. **sortOrder товара:** числовое поле в форме, **без `↑↓`-reorder** в списке (пагинация, много записей).

## 4. Архитектура

### 4.1 Маршруты и переезд категорий

`/admin/catalog/layout.tsx` (новый) — общий таб-нав `[Товары | Категории]` + рендер `children`.
`/admin/catalog/page.tsx` — `redirect('/admin/catalog/products')`.

- **Товары (new):** `products/page.tsx` (список), `products/_components/{product-table,product-form,
  colorway-card,image-gallery-field,variant-matrix}.tsx`, `products/new/page.tsx`, `products/[id]/edit/page.tsx`.
- **Категории (переезд 3.2):** `categories/page.tsx`, `categories/_components/{category-table,category-form}.tsx`,
  `categories/new/page.tsx`, `categories/[id]/edit/page.tsx` — перенос из `catalog/*` с правкой:
  ссылок `/admin/catalog/new` → `/admin/catalog/categories/new`, `[id]/edit` аналогично, и строк
  `revalidatePath('/admin/catalog')` → `revalidatePath('/admin/catalog/categories')` в `actions/admin/categories.ts`.

Сайдбар «Catalog» остаётся `/admin/catalog` (редирект уводит на товары). URL-инвариант проверяется grep'ом
ссылок + `next build` route-table на preview.

### 4.2 Форма (вложенная rhf + useFieldArray, дроблёная)

- **`product-form.tsx`** — оркестратор. Скаляры: `name` (onChange → автогенерация `slug` через `lib/slugify`,
  только пока поле slug «не грязное» и для create), `slug`, `brand` (`<input list>` + datalist из distinct-брендов,
  переданных пропом из RSC), `gender` (Radix `Select` по enum), `categoryId` (Radix `Select`, список категорий
  пропом), `description`, `fitNote`, **specs** (key→value editor → Json), `isBestseller` (`Switch`),
  `active` (`Switch`), `sortOrder` (number). Внутри — `useFieldArray('colorways')`.
- **`colorway-card.tsx`** (на каждый colorway): `name`, `slug`, `swatchHex` (color input), `isDefault`
  (radio-семантика — ровно один default на товар), `sortOrder`; кнопка удалить colorway (disabled, если хоть
  один его variant `referenced`). Содержит галерею и матрицу.
- **`image-gallery-field.tsx`** — обёртка над `ImageUploader` (folder `stride/products`): загрузка → элементы
  `{url, publicId, alt, sortOrder}`; `↑↓`-reorder; поле `alt` на картинку; удаление вызывает best-effort
  `/api/admin/media/delete`.
- **`variant-matrix.tsx`** — EU-грид: набор кнопок размеров (по умолчанию 35.0–48.0, шаг 0.5); клик
  добавляет/убирает строку variant в `useFieldArray('variants')`. Поле «+ размер вручную» добавляет строку с
  произвольным `sizeEu` вне грида (для KIDS и редких размеров; валидируется DTO-диапазоном [16.0, 50.0]).
  Колонки строки: `sizeEu`, `sku` (prefill `suggestSku`, редактируемо), `price`, `compareAtPrice?`, `stock`,
  `active` (`Switch`). Bulk-кнопки «price на все» / «stock на все». У `referenced`-variant кнопка удаления
  **disabled** (сервер отдаёт флаг при edit-загрузке) — только toggle `active`.

### 4.3 DTO, валидация, инварианты (`services/dto/product.dto.ts`)

Вложенная zod-схема: product-скаляры + `colorways: colorwaySchema[]`, каждый с `images: imageSchema[]` и
`variants: variantSchema[]`. Правила:
- `name` 1–160 trim; `slug` `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; `brand` 1–80; `gender ∈ Gender`; `categoryId` cuid;
  `sortOrder ≥ 0`; `specs` — массив `{key,value}` (UI) → объект (запись), пустые ключи отбрасываются.
- `colorway.slug` уникален в пределах товара (проверка в normalize до записи; БД-инвариант `@@unique`).
- `variant.sizeEu` ∈ [16.0, 50.0], кратно 0.5; `sku` 1–64 trim; `price ≥ 0`; `compareAtPrice` — если задан,
  `> price` (иначе ошибка поля); `stock ≥ 0`.
- **Инвариант default:** ≥1 colorway ⇒ ровно один `isDefault` (normalize: нет → первый; несколько → первый, остальные false).
- **Инвариант variants/colorway:** `sizeEu` уникален в colorway (UI-грид это гарантирует; БД `@@unique` — страховка).
- **active-gate:** `active === true` валиден только если есть ≥1 colorway с ≥1 `active` variant; иначе ошибка формы.
- **draft:** `active === false` допускает пустые `colorways`/`variants`.

### 4.4 Запись — diff-upsert в одном `$transaction`

`app/actions/admin/products.ts`: `createProduct(raw)`, `updateProduct(id, raw)`, `deleteProduct(id)` —
обёртка `requireAdminAction`, конверт `{ok:true} | {ok:false, error, issues?}`. Транзакция через Neon WebSocket
(`lib/prisma-client.ts`). **НЕ delete-recreate** (variants под `OrderItem` RESTRICT).

`updateProduct`:
1. `requireAdminAction` → guard.
2. zod-parse → fail: `{ok:false, error, issues: flatten}`.
3. Загрузка текущего дерева (id'ы colorways/images/variants) + множество `referencedVariantIds`
   (`prisma.orderItem.findMany({ where:{ productVariantId:{ in } }, select:{ productVariantId } })`).
4. **Guard удаления:** если удаляемый (отсутствующий во входе) variant ∈ referenced — reject
   `{ok:false, error:"Вариант SKU … используется в заказах — деактивируйте вместо удаления"}`. Удаление
   colorway с referenced-variant — тот же reject.
5. `$transaction`:
   - `product.update` скаляров;
   - colorways: `update` по id / `create` новых / `delete` отсутствующих (cascade images+variants — безопасно, проверено п.4);
   - per colorway: images `update`/`create`/`delete`; variants `update`/`create`/`delete` (только unreferenced);
   - **пересчёт денорма:** `productDenormFromColorways(новое дерево)` → `product.update({ minPrice, discountPct })`.
6. SKU-дубль (`P2002` на `sku`) внутри tx → rollback → `{ok:false, error:"SKU занят: …"}` (семантика 409).
7. `revalidatePath('/admin/catalog/products')` (+ `[id]/edit`).

`createProduct`: то же без шага diff (всё `create` в одной tx); draft (`active=false`) допускает пустое дерево;
денорм считается из созданного дерева (пусто → `{0,0}`).

`deleteProduct`: если какой-либо variant товара ∈ referenced → блок `{ok:false, error}` (модалка «деактивируйте»);
иначе `product.delete` (cascade всё дерево) + best-effort `deleteAsset` по всем `publicId` картинок.

### 4.5 Список + фильтры

`products/page.tsx` (RSC, `force-dynamic`): `parsePaginationParams` (page/limit/skip) + `readSearchQuery('q')`
(name/slug/sku — через `where` OR) + `readEnumParam` для brand/gender/category/status. `where`: status
(active/inactive/all), brand, gender, categoryId. `orderBy: [{sortOrder:'asc'},{createdAt:'desc'}]`. Считаем
`_count`/aggregate stock при необходимости. В клиент — `DataTable` (server-pagination, meta из `buildPaginationMeta`).
Колонки: cover-thumb (первая картинка дефолтной расцветки), name (ссылка на edit), brand, category, `minPrice` ₽
(`lib/format`), суммарный stock (бейдж «нет в наличии» при stock=0), active-бейдж, действия (Изменить / Удалить
через `AlertModal`, блок-модалка при referenced). Фасеты фильтров (distinct brand, список категорий) —
отдельными лёгкими запросами в RSC. (Сводка Low-Stock с порогом — задача дашборда 3.6, не здесь.)

### 4.6 Схема — `ProductImage.publicId`

Добавить `publicId String?` в `ProductImage` (nullable, обратносовместимо: seed-картинки = null, просто не
чистятся в Cloudinary). На upload храним `url` (secure_url, как сейчас читает витрина) **и** `publicId`
(для best-effort delete). Применяется через CI/Vercel `prisma db push`; локально только `prisma generate`
(офлайн, обновить типы). Добавить `'stride/products'` в `ALLOWED_FOLDERS` sign-route.

### 4.7 SKU авто-подсказка (`lib/sku.ts`)

`suggestSku({ brand, productName, colorwaySlug, sizeEu }) → string` — uppercase, латиница/цифры, разделитель `-`,
санитизация (как slugify, но UPPER). Только prefill в UI; уникальность обеспечивает БД (`@unique` + `P2002`).

## 5. Зависимости

**Новых пакетов нет** — вся инфра (tanstack-table, radix select/switch/dropdown, cloudinary, rhf, zod) уже
в проекте с фаз 3.0–3.2. Только schema-правка (`ProductImage.publicId`) + новый Cloudinary-folder в whitelist.

## 6. Тестирование (vitest `node`, моки `@/auth` / `@/lib/prisma-client` / `next/cache` / `cloudinary/server`)

- `tests/product-dto.test.ts` — скаляры; `sizeEu` range/step; `sku` required; `compareAtPrice > price`;
  specs key→value→object (пустые ключи); isDefault-normalize (0 / 1 / много); active-gate (active без active-variant → fail);
  draft (active=false, пустое дерево → ok).
- `tests/sku-suggest.test.ts` — деривация + санитизация + стабильность.
- `tests/product-aggregates.test.ts` — расширить: нет active → `{0,0}`; выбор дефолтной расцветки; самый дешёвый active.
- `tests/admin-products-action.test.ts` — create draft / create full; update diff-upsert (update/create/delete веток);
  **reject удаления referenced-variant**; `P2002`→`{ok:false}`; delete-block при referenced; вызов
  `productDenormFromColorways` и запись `minPrice/discountPct`.

React-части (форма / matrix / gallery / table) — typecheck + ручная проверка на preview. Build/e2e — CI/Vercel.

## 7. Риски и развязки

1. **Мега-форма сложна** → дробление на `product-form` → `colorway-card` → `image-gallery-field` + `variant-matrix`;
   каждый файл фокусный, тестируется DTO-логика отдельно.
2. **FK variant в заказе** → diff-upsert (не delete-recreate) + серверный guard по `OrderItem` + UI disables
   удаление referenced-variant (флаг с сервера).
3. **Денорм-дрейф каталога** → пересчёт `productDenormFromColorways` в той же транзакции после записи детей +
   интеграционный тест.
4. **Neon локально** → никакого локального `db push`/seed/e2e; schema-push на Vercel/CI; первая проверка build — на preview.
5. **Переезд 3.2-маршрутов** → grep ссылок (`/admin/catalog/new`, `[id]/edit`), URL-строки в e2e (group-invisible),
   правка `revalidatePath`; страховка — route-table в `next build`.
6. **`isDefault` рассинхрон** → normalize-инвариант (ровно один) до записи + при отсутствии дефолта денорм даёт `{0,0}`.
7. **SKU-гонка/дубль** → `@unique` + `P2002`-обработка → понятная ошибка поля (а не 500).
8. **`next lint` не настроен** → верификация tsc + vitest.

## 8. Точка продолжения

→ writing-plans: `docs/superpowers/plans/2026-06-13-stride-phase3.3-products.md` (build-order: schema+folder →
DTO+sku-util+tests → server actions+tests → переезд категорий+таб-хаб → список+фильтры → форма
(product → colorway → gallery → matrix) → ручная верификация на preview).
