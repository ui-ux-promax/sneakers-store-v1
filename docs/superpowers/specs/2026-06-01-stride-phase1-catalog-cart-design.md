# STRIDE — Фаза 1: Каталог + Корзина (дизайн-спецификация)

- **Дата:** 2026-06-01
- **Проект:** STRIDE — интернет-магазин кроссовок (Next.js e-commerce)
- **Фаза:** 1 из N (витрина: каталог и корзина, без оплаты/auth/админки)
- **Статус:** на ревью
- **Референс:** `D:/Projects/next-pizza-reference` (read-only образец архитектуры)
- **UI-контракт:** `ui-designe and prototypes/` (прототипы витрины + `prototypes-app/ui-design-system.html`)

---

## 1. Контекст и цель

Старт нового e-commerce магазина кроссовок STRIDE. Архитектура и инфраструктура переносятся
из изученного референса next-pizza (пиццерия на Next.js + Prisma + Neon), доменная модель
переосмысляется под обувь. UI реализует **существующие** прототипы STRIDE (не выдумываем свой).

**Цель Фазы 1:** работающая витрина для просмотра каталога и сбора анонимной корзины —
лендинг, каталог с фильтрами, страница товара с выбором расцветки и размера, корзина.
Без оформления заказа, оплаты, авторизации и админки (это следующие фазы).

---

## 2. Решения брейнсторминга (трассируемость)

| # | Развилка | Решение |
|---|----------|---------|
| 1 | Каноничная дизайн-система | **Прототипы = истина.** Витрина светлая (Unbounded/Manrope/скругления). `DESIGN.md` тёмные токены (Archivo Narrow/radius 0) — устаревший экспорт, игнорируются. Админка (будущая) — Anybody/Manrope, light+dark. |
| 2 | Моно/мультибренд | `Product.brand` — **простое поле** (String) + фильтр в каталоге. Работает и как моно (всё STRIDE), и как мультибренд. Не отдельная сущность. |
| 3 | Модель вариантов | **Расцветка — сущность.** `Product` → `ProductColorway` (своя галерея/бейджи) → `ProductVariant`/SKU (`sizeEu` + `stock` + `price`). |
| 4 | Архитектура | **Два приложения**, одна Neon-БД, общая `schema.prisma`. В этом репозитории: `stride-app` (витрина, Фаза 1) и `stride-admin` (позже). |
| 5 | Объём первой итерации | **Фаза 1 = каталог + корзина.** Дальше: checkout/оплата, затем админка. |
| 6 | gender | Добавить `Product.gender` (enum) + фильтр в каталоге. |
| 7 | Дропы | **Без отдельной сущности `Drop`** в MVP. «Лимитка» — обычный флаг/бейдж. |
| 8 | Размерная система | **EU с полуразмерами** (39–46, вкл. 42.5). US/UK — только в справочной таблице, не отдельные SKU. |
| 9 | Версия/расположение | **`stride-app`, Next.js 15** + Prisma 6 + Neon HTTP-адаптер. |
| 10 | Отзывы | Отложить (нет модели Review/auth). Секция на PDP скрыта/плейсхолдер. |
| 11 | Подписка на рассылку | UI-форма без бэкенда (задел). |
| 12 | Избранное (♡) | Скрыть в Фазе 1 (требует auth). |
| 13 | Legal-страницы | Отложить. Ссылки в футере — заглушки (`#`). |
| 14 | БД для разработки | Новая Neon-БД STRIDE (пользователь создаёт, даёт `POSTGRES_URL`). |

**Принято по умолчанию (можно оспорить):** заказ — JSON-снапшот (Фаза 2); auth — phone-OTP + email/пароль + Google (Фаза 2);
сток — per-variant с резервом через условный `update`; ингредиенты/питательность/сторис/blacklist — убрать;
деньги — ₽ целыми; бизнес-числа (порог бесплатной доставки 10 000 ₽ и т.п.) — единый конфиг.

---

## 3. Объём Фазы 1

### В объёме
- Общая `schema.prisma` — срез каталог+корзина (см. §6).
- Приложение `stride-app` (витрина):
  - `/` — лендинг (по `home.html`).
  - `/catalog` — каталог с фильтрами/сортировкой/пагинацией/состояниями (по `catalog.html`).
  - `/product/[slug]` — страница товара (по `product.html`): галерея по расцветке, выбор расцветки+размера со стоком, related.
  - `/cart` — анонимная корзина по cookie-токену (по `cart.html`).
  - Общий layout: промо top-bar, glass-header (лого/навигация/поиск/бейдж корзины), футер.
- Сид: 5 демо-моделей с расцветками/размерами/стоком.
- UI подписки на рассылку (hero/футер) — без бэкенда.

### Вне объёма (явно, с обоснованием)
| Не делаем | Почему / когда |
|-----------|----------------|
| Авторизация, пользователи, профиль | Фаза 2 (checkout требует контактов; корзина — анонимная) |
| Checkout, оплата (ЮKassa), заказы | Фаза 2 |
| Промокоды | Фаза 2 (нет движка скидок) |
| Отзывы (Review) | Отложено (нет модели/auth) |
| Избранное / wishlist (♡) | Скрыто (требует auth) |
| Дропы как сущность, резерв размера, countdown-логика | Вне MVP (флаг «Лимитка» остаётся) |
| Legal-страницы | Отложено (ссылки — заглушки) |
| Back-in-stock уведомления | Фаза 2+ |
| Бэкенд рассылки | Позже (форма без endpoint) |
| Приложение `stride-admin` | Отдельная фаза |

### Шов к Фазе 2
Кнопка «Оформить заказ» в `/cart` — граница Фазы 1. В Фазе 1 ведёт на заглушку/disabled
(checkout появится в Фазе 2). `Cart.userId` зарезервирован под будущую привязку к пользователю.

---

## 4. Стек и структура проекта

- **`D:/Projects/sneakers-store-v1/stride-app`** — Next.js 15 (App Router) + React 18 + TypeScript 5.
- Prisma 6 + `@prisma/adapter-neon` (`PrismaNeonHTTP`) + `@neondatabase/serverless`.
- Tailwind CSS + Radix UI primitives + **lucide-react** (заменяет эмодзи-заглушки прототипов).
- Zustand (стор корзины), React Hook Form + Zod (формы/валидация — минимально в Фазе 1).
- Шрифты через `next/font`: **Unbounded** (display) + **Manrope** (body).
- Тесты: Vitest (unit) + Playwright (e2e smoke + a11y).
- Точные актуальные API (Next 15 async `params`/`searchParams`, Prisma 6, Neon adapter, Zod, RHF) сверяются через **context7 MCP** на этапе реализации — не по памяти.

**Замечание по Next.js 15:** референс-витрина (pizza-app) на Next 14, поэтому при переносе паттернов
учитываем отличия Next 15: `params`/`searchParams` в страницах — асинхронные (Promise); за основу
`prisma-client.ts` берём вариант из pizza-admin (Next 15 + Prisma 6 + Neon HTTP, `NEON_FETCH_TIMEOUT_MS≈15000`).

```
sneakers-store-v1/
├─ docs/superpowers/specs/      # этот и будущие spec-документы
├─ ui-designe and prototypes/   # UI-контракт (read-only источник дизайна)
├─ stride-app/                  # витрина (Фаза 1)
│  ├─ app/                      # роуты (см. §7)
│  ├─ components/{ui,shared}/   # ui-примитивы + компоненты витрины
│  ├─ lib/                      # доменные хелперы + инфра (см. §9)
│  ├─ store/                    # Zustand (cart)
│  ├─ services/                 # axios-клиент Api.* (cart) + DTO/Zod
│  ├─ constants/                # config (пороги доставки, размерные сетки, бейдж-окна)
│  ├─ prisma/                   # schema.prisma, prisma-client.ts, seed.ts
│  ├─ @types/                   # ambient-типы
│  ├─ e2e/                      # Playwright
│  └─ tests/                    # Vitest unit
└─ stride-admin/                # позже
```

---

## 5. Дизайн-система (витрина)

Источник: `prototypes-app/ui-design-system.html` + 7 прототипов. Токены — CSS-переменные HSL
в `globals.css`, проброшены в `tailwind.config`.

- **Цвета:** `bg` 42 33% 97% (тёплый off-white), `surface` #fff, `surface-soft` 48 36% 94%,
  `text/ink` 220 13% 10%, `text-muted` 220 8% 42%, `border` 220 12% 88%,
  **primary (lime)** 75 100% 50% (≈#bfff00), **accent (lavender)** 250 28% 70%,
  **warm-accent** 42 100% 52% (скидки), `footer` 240 18% 11%, семантика success/warning/danger/info.
- **Типографика:** Unbounded 600/700 (display, заголовки), Manrope 400–700 (body/UI).
  Display 40→56→80px; H1 34→48→56; H2 28→40; body 16/1.55; micro 12 uppercase; `.tnum` (tabular-nums) для цен.
- **Форма (radius):** кнопки/бейджи/счётчики — pill 999px; карточки — 16px (`rounded-2xl`);
  инпуты — 12px; таблицы/чипы — 8px; крупные панели/hero — 24px; футер — 24–28px.
- **Сетка:** контейнер `max-w-[1080px]`, поля 32px (desktop) / 16px (mobile); базовая единица 4px;
  секционные отступы 72–96px (desktop) / 40–56px (mobile); сетка карточек товара 2 (mobile) / 4 (desktop), gap 16–20px.
- **Паттерны:** glass-header (`backdrop-blur(24px)` + `@supports`-fallback); focus-ring двойное кольцо
  (surface + primary) через `:focus-visible`; body-градиент (lime→white, `attachment:fixed`);
  `::selection` lime; `scroll-behavior:smooth` с уважением `prefers-reduced-motion`.
- **Кнопки:** размеры sm/md/lg (36/44/52px); варианты primary(lime)/dark/secondary/accent(lavender)/ghost/danger/link;
  состояния hover(brightness)/focus(ring)/disabled(opacity .45)/loading(spinner).
- **Бейджи товара:** Новинка (lime), Бестселлер (ink), Скидка (warm), Лимитка (accent); абсолютные, pill, 11px bold.

---

## 6. Доменная модель (срез `schema.prisma`, общий для будущей админки)

```prisma
enum Gender { MEN WOMEN UNISEX KIDS }

model Category {
  id         String    @id @default(cuid())
  name       String
  slug       String    @unique
  tagline    String?
  coverImage String?
  sortOrder  Int       @default(0)
  products   Product[]
  @@index([sortOrder])
}

model Product {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  brand        String                       // простое поле + фильтр (моно/мульти)
  gender       Gender   @default(UNISEX)
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id])
  description  String?
  fitNote      String?                       // «маломерят на полразмера»
  specs        Json?                         // верх/подошва/сезон/страна/вес/артикул (display-only)
  isBestseller Boolean  @default(false)      // ручной флаг для бейджа «Бестселлер»
  active       Boolean  @default(true)
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())      // → вычисляемый бейдж «Новинка» (окно из конфига)
  colorways    ProductColorway[]
  @@index([categoryId, sortOrder])
  @@index([brand])
  @@index([gender])
  @@index([active])
}

model ProductColorway {          // расцветка как сущность — своя галерея
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  name      String                            // «Lime Flash»
  slug      String                            // для url ?color=lime-flash
  swatchHex String?                           // цвет свотча в каталоге/фильтре
  isDefault Boolean @default(false)
  sortOrder Int     @default(0)
  images    ProductImage[]
  variants  ProductVariant[]
  @@unique([productId, slug])
}

model ProductImage {
  id         String          @id @default(cuid())
  colorwayId String
  colorway   ProductColorway @relation(fields: [colorwayId], references: [id], onDelete: Cascade)
  url        String                            // Cloudinary (позже) / локальный путь демо-фото
  alt        String?
  sortOrder  Int             @default(0)       // вид: общий/сбоку/сверху/подошва/деталь
  @@index([colorwayId, sortOrder])
}

model ProductVariant {          // = SKU = расцветка × размер
  id             String          @id @default(cuid())
  colorwayId     String
  colorway       ProductColorway @relation(fields: [colorwayId], references: [id], onDelete: Cascade)
  sizeEu         Decimal         @db.Decimal(3,1)   // 42.5
  sku            String          @unique
  price          Int                                // ₽ целыми (копейки/ЮKassa — Фаза 2)
  compareAtPrice Int?                                // старая цена → бейдж «−%»
  stock          Int             @default(0)
  active         Boolean         @default(true)
  cartItems      CartItem[]
  @@unique([colorwayId, sizeEu])
  @@index([colorwayId])
}

model Cart {
  id          String     @id @default(cuid())
  token       String     @unique               // cookie cartToken (анонимно)
  userId      String?                            // задел под Фазу 2 (привязка к пользователю)
  totalAmount Int        @default(0)
  items       CartItem[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model CartItem {
  id               String         @id @default(cuid())
  cartId           String
  cart             Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productVariantId String
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id])
  quantity         Int            @default(1)
  createdAt        DateTime       @default(now())
  @@unique([cartId, productVariantId])           // дедуп по варианту
}
```

**Бейджи (источники):** «Новинка» — `createdAt` в пределах окна (конфиг, напр. 30 дней);
«−%» — наличие `compareAtPrice`; «Бестселлер» — ручной `isBestseller`; «Распродано»/«Осталось N пар» —
агрегат `sum(stock)` по вариантам активной расцветки (порог low-stock — конфиг).
Несколько бейджей одновременно — допустимо; приоритет показа задаётся в UI-хелпере.

**Замечания по типам:**
- `sizeEu` — `Decimal(3,1)`; в TS читается как `Prisma.Decimal`, для отображения нормализуется (39, 42.5).
- Цена per-variant (по решению), обычно одинаковая по размерам; `compareAtPrice` — для распродажи.
- Без транзакций Neon — каждая мутация выполняется отдельными `await prisma.x` (см. §10).

---

## 7. Роуты и страницы (`stride-app/app/`)

Общий layout (`app/layout.tsx`): шрифты, токены, промо top-bar, glass-header
(лого→`/`, навигация→`/catalog` и категории, поиск `?q=`, бейдж корзины из стора), футер
(колонки-ссылки; legal-ссылки — заглушки; форма подписки — без бэкенда). SEO: `metadata`,
`sitemap.ts`, `robots.ts`, canonical.

### 7.1 `/` — Лендинг (RSC, по `home.html`)
- Секции: hero (бейдж/заголовок/CTA→`/catalog`, product-shot), bento-категории (4, с counts моделей),
  бестселлеры (4 карточки, `isBestseller`/топ), feature-блок «STRIDE Engineered» (статический контент),
  trust-полоса, футер.
- Данные: категории (с counts через `groupBy`), бестселлеры (limit 4). Остальное — статический контент/конфиг.
- Динамики дропа (countdown) нет — «Лимитка» как обычный бейдж.

### 7.2 `/catalog` — Каталог (RSC, URL-driven фильтры, по `catalog.html`)
- Sidebar-фильтры: категория (checkbox + counts), размер EU (кнопки-сетка, недоступные disabled),
  цена (range min/max), цвет (свотчи из `ProductColorway.swatchHex`), **бренд** (distinct), **gender**, «только в наличии».
- Тулбар: счётчик найденного, сортировка (новинки/цена↑/цена↓/со скидкой/популярные*),
  активные filter-chips (удаляемые), кнопка «Сбросить».
- Сетка карточек (2/4 кол.), пагинация, состояния loading (skeleton) / empty.
- Карточка: фото дефолтной расцветки, бейдж(и), quick-add (требует выбор размера → переход на PDP
  или мини-выбор; в Фазе 1 — ссылка на PDP, без «слепого» добавления), категория, название, цена (+старая) — из дефолтной расцветки (мин. цена активных вариантов).
- Фильтры строятся `URL searchParams → Prisma where/orderBy`; counts — отдельные `groupBy` с учётом активных фильтров.
- *Сортировка «популярные» в Фазе 1 — по `sortOrder`/`createdAt` (нет данных о продажах).

### 7.3 `/product/[slug]` — Страница товара (RSC, по `product.html`)
- Всегда отдельная страница (никаких intercepting-модалок — слой `@modal` НЕ переносим).
- Галерея: изображения **выбранной расцветки** (`ProductColorway.images`), thumbnails, главное фото; lightbox — опц. (можно отложить).
- Селектор расцветки (свотчи) → переключает галерею и набор размеров. Реализация: query-параметр `?color=<slug>` (дефолт — расцветка с `isDefault`); переключение меняет URL и ре-рендерит RSC, так каждая расцветка индексируема (SEO) и ссылка шарится.
- Селектор размера: `ProductVariant` активной расцветки; недоступные (`stock=0`/`!active`) — disabled/перечёркнуты; ссылка «Таблица размеров» (справочно).
- Цена/скидка, статус наличия, `fitNote`, add-to-cart (требует выбранный размер) → обновляет бейдж корзины.
- Specs (`specs` Json: верх/подошва/сезон/страна/вес/артикул), related (та же категория, exclude self, limit 4).
- Отзывы — секция скрыта/плейсхолдер. Избранное (♡) — скрыто. 404-состояние для несуществующего slug.

### 7.4 `/cart` — Корзина (client + Zustand, по `cart.html`)
- Анонимная корзина по cookie `cartToken` (httpOnly, secure в prod, sameSite lax, 30 дней).
- Позиции: фото/название/расцветка/размер, stepper количества, удаление; подытог; индикатор «Бесплатно от 10 000 ₽».
- Поле промокода и кнопка «Оформить заказ» — присутствуют как шов к Фазе 2 (промо неактивно, CTA — заглушка/disabled).
- Пустое состояние корзины.

---

## 8. Данные и состояние

- **Чтения** (лендинг/каталог/PDP) — серверные компоненты, напрямую через `prisma` из `@/prisma/prisma-client`.
  Никакого прямого `new PrismaClient()`. Фильтры/сортировка/пагинация — из URL.
- **Корзина** — REST `app/api/cart` (GET/POST/PATCH/DELETE) + Zustand-стор + cookie `cartToken`.
  - POST: `findOrCreateCart(token)` → проверка `active`/`stock` варианта → дедуп по `productVariantId`
    (`@@unique`) → инкремент/создание `CartItem` → пересчёт `Cart.totalAmount`.
  - После каждой мутации стор делает `set(getCartDetails(data))` (паттерн референса).
- DTO + Zod-схемы корзины в `services/dto` (устойчивость к дрейфу — `.passthrough()` при необходимости).

**Рассмотренные альтернативы:** full client-side (tRPC/React Query везде) — отвергнуто: RSC-чтения проще,
SEO-friendly и точно соответствуют статике прототипов; cart-as-API+Zustand — проверенный паттерн референса.

---

## 9. Инфраструктура (перенос из референса, с минимальной адаптацией)

| Модуль | Назначение | Адаптация |
|--------|-----------|-----------|
| `prisma/prisma-client.ts` | Neon HTTP + retry-обёртка транзиентных ошибок + singleton | вариант Next15/Prisma6 (как pizza-admin); `SERVICE='stride-app'` |
| `lib/logger.ts` + `lib/pii-scrub.ts` | структурный лог + маскирование PII | префикс сервиса |
| `lib/request-context.ts` | `AsyncLocalStorage` requestId, `runWithRequestContext` | как есть |
| `lib/rate-limit.ts` | Upstash sliding-window | минимально (на cart-API); полноценно в Фазе 2 |
| `next.config` | security-заголовки, `images.remotePatterns` | Cloudinary-хосты (демо-фото пока локально) |
| Sentry (`instrumentation.ts`, `sentry.*.config`) | мониторинг | опц., только при наличии DSN |

---

## 10. Обработка ошибок и ограничение Neon

- **Neon HTTP adapter не поддерживает транзакции** (`$transaction` падает в рантайме). Все мультизаписи —
  последовательными `await prisma.x.update/create()` с ручной компенсацией в `catch`
  (эталон — `app/api/cart/route.ts` референса). Пример: при сбое после создания `CartItem` —
  удалить полу-созданную запись и не оставлять рассинхрон с `Cart.totalAmount`.
- Доступ к БД — только через `prisma` из `@/prisma/prisma-client` (обходить retry-wrapper запрещено).
- Резерв стока (на будущее, Фаза 2 при заказе) — условный `update` с проверкой остатка (без транзакций).
- В Фазе 1: проверка `stock>0` и `active` при add-to-cart; 404 для неизвестного `slug`;
  состояния loading/empty/sold-out строго по прототипам.

---

## 11. Тесты (TDD: RED → GREEN → REFACTOR)

**Vitest (unit), пишутся ПЕРЕД реализацией:**
- Построитель фильтров: `URL searchParams → Prisma where/orderBy` (категория/размер/цена/цвет/бренд/gender/in-stock; сортировки).
- Вычисление бейджей (Новинка по окну `createdAt`; «−%» по `compareAtPrice`; sold-out/low-stock по `sum(stock)`).
- Корзина: дедуп по варианту, пересчёт `totalAmount`, инкремент quantity, проверка стока/active.
- Нормализация размера (`Decimal` → «42.5»), формат цены (`.tnum`, ₽).

**Playwright (e2e smoke + a11y):**
- Лендинг рендерится (hero, категории, бестселлеры).
- Каталог: применение фильтра меняет выдачу; пагинация; empty-state.
- PDP: переключение расцветки меняет галерею; выбор размера + add-to-cart → бейдж корзины +1.
- Корзина: stepper, удаление, корректный подытог.
- a11y: focus-ring виден, aria-метки на иконочных кнопках, контраст.

---

## 12. Сид-данные (`prisma/seed.ts`)

5 демо-моделей из `ui-designe and prototypes/docs/design/product-images`
(Nike Air Max 270, Adidas Ultraboost, Converse Chuck 70, New Balance 550, Puma RS-X):
у каждой — 1–3 расцветки (с галереей и `swatchHex`), размерный ряд EU 39–46 (с полуразмерами),
реалистичный `stock` (включая нулевые для демонстрации sold-out), часть с `compareAtPrice` (скидка)
и `isBestseller`. Категории: Беговые / Лайфстайл / Платформы. Бренд — поле (демо: реальные бренды
или «STRIDE» — на усмотрение, фильтр работает в обоих случаях).

---

## 13. Конфигурация и окружение

- `.env` (значения даёт пользователь): `POSTGRES_URL` (pooled, neon.tech), `POSTGRES_URL_NON_POOLING` (direct),
  опц. `NEON_FETCH_TIMEOUT_MS`, `SENTRY_DSN`, Cloudinary `NEXT_PUBLIC_CLOUDINARY_*` (позже).
- Команды: `prisma:push` (схема без файлов миграций — как в референсе), `prisma:seed`.
- `constants/config`: порог бесплатной доставки (10 000 ₽), окно «Новинка» (дни), порог low-stock,
  размерная сетка EU (39–46 + полуразмеры), таблица конвертации US/UK (справочно).

---

## 14. Открытые допущения (зафиксировать при реализации)

- Quick-add с карточки каталога: в Фазе 1 — переход на PDP (размер обязателен), без «слепого» добавления.
- Lightbox/zoom галереи — опционально, можно отложить без влияния на критический путь.
- Поиск `?q=` — фильтрация каталога по `name contains` (отдельная страница поиска не нужна).
- Footer legal-ссылки — `#`-заглушки до фазы legal-страниц.
- Цена хранится в ₽ целыми; перевод в копейки и интеграция ЮKassa — Фаза 2.

---

## 15. Критерии готовности Фазы 1

- `prisma:push` + `prisma:seed` создают рабочую БД с 5 моделями.
- Лендинг, каталог (с фильтрами/сортировкой/пагинацией/состояниями), PDP (расцветки+размеры+add-to-cart),
  корзина (stepper/удаление/подытог) — работают и визуально соответствуют прототипам.
- Все unit- и e2e-тесты зелёные; a11y-проверки проходят.
- Корзина переживает перезагрузку (cookie-токен); сток/active учитываются при добавлении.
