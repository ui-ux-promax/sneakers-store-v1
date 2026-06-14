# STRIDE — Фаза 3.6: Dashboard (design)

> Дата: 2026-06-14. Ветка: `feat/phase3.6-dashboard` (от `main` после мержа 3.5).
> Следующая фаза после 3.5 Customers. Цикл артефактов: brainstorming → **этот spec** → plan → код.

## 1. Проблема и цель

Главная страница админки `/admin` — заглушка с «—» KPI. Цель 3.6 — **живой аналитический дашборд**:
KPI за выбранный период с трендами, график выручки по дням, распределение заказов по статусам,
топ товаров по выручке, алёрты низкого стока, последние заказы. Все данные из существующих таблиц
(read-only), схема не трогается.

MVP-границы (зафиксировано юзером): без метрик трафика (нет источника) → **без Conv.Rate**; без
экспорта CSV (кнопка прототипа опускается); без кастомных диапазонов дат (фикс 7/30/90); без realtime.

## 2. Контекст-якоря (проверено в коде)

- **Деньги — целые рубли** (`Order.totalAmount` Int, `OrderItem.lineTotal/unitPrice` Int). `formatPrice(rub)`
  (`lib/format.ts`) → «42 800 ₽». Даты — `formatDateTime`/`formatDate` (MSK, `Europe/Moscow`).
- **`Order`** (schema стр. 196): `totalAmount` Int, `status OrderStatus`, `createdAt`, `userId`. Индексы
  `@@index([status])`, `@@index([userId,createdAt])` (нет одиночного `[createdAt]` — диапазонные count по
  времени идут фильтр-сканом, приемлемо на текущем масштабе).
- **`OrderItem`** (стр. 229): `quantity` Int, `lineTotal` Int, `productVariantId`→ProductVariant. **Нет
  прямого `productId`** — цепочка `OrderItem→ProductVariant→ProductColorway→Product`. Best-sellers по
  выручке = `$queryRaw` с 3-уровневым JOIN. `@@index([orderId])`.
- **`Product`** (стр. 31): `salesCount` Int (денормализован, **`@@index([salesCount])`**), `name`, `brand`,
  `slug`, `minPrice`, `active`. salesCount движется при оформлении/отмене (`lib/sales-count.ts`,
  best-effort). Картинка — НЕ на Product: через `colorways[isDefault].images[0].url` (`ProductImage{url,
  sortOrder}`, `@@index([colorwayId,sortOrder])`).
- **`ProductVariant`** (стр. 93): `stock` Int, `active` Bool, `sku`, `sizeEu` Decimal, `colorwayId`. Low-stock
  = `findMany` active + stock в диапазоне. Порог `LOW_STOCK_THRESHOLD=3` (`constants/config.ts:6`).
- **`User`** (стр. 128): `role UserRole`, `createdAt`. Новые клиенты = `count` role=CUSTOMER + createdAt≥окно.
- **`OrderStatus`** = `PENDING PROCESSING SHIPPED DELIVERED CANCELLED`. `ORDER_STATUS_META` (`lib/order.ts`:
  RU-лейблы + `.badge-*`) и `ORDER_STATUS_VALUES` (`lib/order-admin.ts`) — переиспользуем для donut и
  recent-orders бейджей.
- **Агрегаты сегодня:** только `groupBy` фасетов каталога (`lib/find-products.ts`) + price `aggregate`. **`_sum`
  по заказам нигде** — пишем с нуля. `prisma.order.groupBy(['status'])` покрыт индексом.
- **Prisma 6.19 + Neon WebSocket** (`@prisma/adapter-neon`, `lib/prisma-client.ts`): `$queryRaw`/`$transaction`
  доступны. Обычные колонки — без `::text`-граблей [[prisma-neon-name-cast]].
- **Дизайн-система** (`docs/admin-design-system.md`): карточка-контейнер `bg-admin-surface border
  border-admin-outline-variant rounded-xl`; KPI-бенто `... rounded-xl p-6 hover:border-admin-primary group`;
  шрифты `font-admin-head` (Anybody)/`font-admin-body` (Manrope); акцент `--admin-primary #b2f700`; виолет
  `--admin-secondary-container`; `--admin-error`; `<Icon name=.../>` (Material Symbols). **Без `dark:`** —
  токены свопаются через CSS-var на `.admin-root.dark`. Деньги в прототипе $ → в реале ₽.
- **Прототип** `ui-designe and prototypes/prototypes-admin/admin-main.html` (+ dark): layout «Performance Hub»
  + period-toggle → 6 KPI → [Revenue area-chart col-8 + Donut col-4] → [Best Sellers col-5 + [Low-Stock +
  Recent Orders] col-7]. Чарты в прототипе — inline SVG; в реале — Recharts (решение юзера).
- **Recharts НЕ установлен** — новая зависимость (единственная в фазе).
- **Сайдбар** (`admin-shell.tsx`): пункт Dashboard (href `/admin`, icon `dashboard`, **exact:true**) уже есть.

## 3. Зафиксированные решения (юзер, 2026-06-14)

1. **Charts — Recharts** (клиентские острова, данные через props из RSC).
2. **5 реальных KPI** (без Conv.Rate — нет данных трафика, фейк-метрика хуже отсутствия): Выручка, Заказы,
   Средний чек, Новые клиенты, Units Sold.
3. **Период-тоггл 7/30/90 дней** (`?period=`, дефолт 30) + **реальные тренды**: текущее окно `[now−N, now)`
   против предыдущего равного `[now−2N, now−N)`. KPI/Revenue-график/Best-sellers — за период; donut статусов —
   all-time (текущее распределение состояний нагляднее периода); low-stock/recent — текущее состояние.
4. **Best Sellers — по выручке за период** (`$queryRaw` JOIN, `SUM(lineTotal)` desc, take 5).
5. **Схема не трогается** (всё read-only) → нет `prisma db push`, нет Neon-миграции.

**Принятые мелочи (design):** donut — all-time; low-stock два тира **critical ≤3 / warning 4–10**; revenue-series
— дневные бакеты в МСК, пустые дни добиваются нулём в JS; CANCELLED исключён из выручки/среднего чека/units/
best-sellers (как в метриках клиентов 3.5).

## 4. Архитектура

### 4.1. Маршруты (изменений схемы НЕТ)
- `app/(admin)/admin/page.tsx` — переписать заглушку в дашборд (RSC).
- `_components/`: `period-toggle.tsx`, `revenue-chart.tsx`, `status-donut.tsx` (client); `kpi-card.tsx`,
  `best-sellers.tsx`, `low-stock.tsx`, `recent-orders.tsx` (server).

`prisma db push` для 3.6 не нужен (`vercel.json` гоняет push, no-op diff).

### 4.2. Аналитика-слой — `lib/admin/analytics.ts` (чистые async-функции + чистые хелперы)

**Чистые хелперы (юнит-тест без БД):**
- `PERIOD_VALUES = [7, 30, 90] as const`; `DEFAULT_PERIOD = 30`.
- `resolvePeriod(sp, now): { days, current: {gte, lt}, previous: {gte, lt} }` — парс `?period=` (валид →
  число, иначе дефолт 30); `current = [now−days, now)`, `previous = [now−2·days, now−days)`. `now`
  инъектируется параметром (тестируемость, без `Date.now()` в чистой функции).
- `computeTrend(current: number, previous: number): { pct: number | null; dir: 'up'|'down'|'flat' }` —
  `prev>0` → `pct = round(((curr−prev)/prev)*100, 1)`, dir по знаку; `prev===0 && curr>0` → `{pct:null,
  dir:'up'}` («новое», без деления на 0); оба 0 → `{pct:0, dir:'flat'}`.

**Data-функции (принимают `prisma`, `range` от resolvePeriod):**
- `getKpis(prisma, range)` → `{ revenue, orders, avgOrder, newCustomers, unitsSold }`, каждый
  `{ value: number, trend: ReturnType<computeTrend> }`. Внутри — current+previous:
  - revenue: `order.aggregate({ _sum: { totalAmount }, where: { status: { not: 'CANCELLED' },
    createdAt: {gte,lt} } })`.
  - orders: `order.count({ where: { status: { not: 'CANCELLED' }, createdAt } })`.
  - avgOrder: `orders>0 ? Math.round(revenue/orders) : 0` (без отдельного запроса).
  - newCustomers: `user.count({ where: { role: 'CUSTOMER', createdAt } })`.
  - unitsSold: `$queryRaw SUM(oi.quantity)::int` по OrderItem JOIN Order, status≠CANCELLED, createdAt в окне.
- `getRevenueSeries(prisma, range)` → `{ label: string; revenue: number }[]` длиной `days`. `$queryRaw`:
  `date_trunc('day', o."createdAt" AT TIME ZONE 'Europe/Moscow')` день-бакет, `SUM(totalAmount)::int`,
  status≠CANCELLED, createdAt в current-окне, GROUP BY день. Пустые дни добиваются нулём в JS (полный ряд
  от gte до lt), label = `dd.mm` через formatter.
- `getStatusDistribution(prisma)` → `{ status, label, count }[]` по `groupBy(['status'], _count)` (**all-time**),
  + `total`. Лейблы из `ORDER_STATUS_META`.
- `getBestSellers(prisma, range)` → топ-5 `{ productId, name, brand, imageUrl, units, revenue }`. `$queryRaw`:
  JOIN `OrderItem→ProductVariant→ProductColorway→Product`, `SUM(oi."lineTotal")::int` revenue +
  `SUM(oi.quantity)::int` units, status≠CANCELLED, createdAt в окне, GROUP BY product, ORDER BY revenue desc,
  LIMIT 5. Фото — добивка: `findMany` нужных productId с default-colorway первой картинкой (или null).
- `getLowStock(prisma)` → `{ id, productName, colorwayName, sizeEu, sku, stock, tier: 'critical'|'warning' }[]`.
  `productVariant.findMany({ where: { active: true, stock: { gt: 0, lte: 10 } }, orderBy: { stock: 'asc' },
  take: 12, include: colorway→product })`. `tier = stock <= LOW_STOCK_THRESHOLD(3) ? 'critical' : 'warning'`.
- `getRecentOrders(prisma)` → 10 последних `findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: {
  id, orderNumber, status, totalAmount, createdAt, contactName, user: { select: { email } } } })`.

**Raw-безопасность:** значения через `$queryRaw`/`Prisma.sql` placeholders (даты, числа) → инъекций нет; нет
интерполяции пользовательского ввода (period валидируется в число до окон). `::int` на COUNT/SUM → JS number.

### 4.3. Страница — `page.tsx` (RSC)
- `export const dynamic = 'force-dynamic'`. Гейт — общий `(admin)/layout.tsx` `requireAdminPage()` (как
  orders/customers, на странице не дублируем).
- `const range = resolvePeriod(await searchParams, new Date())`.
- `Promise.all([ getKpis, getRevenueSeries, getStatusDistribution, getBestSellers, getLowStock,
  getRecentOrders ])`.
- Раскладка (прототип, $→₽):
  1. Шапка: `<h2>Performance Hub</h2>` + подзаголовок + `<PeriodToggle>` (справа).
  2. KPI: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6` из `<KpiCard>` ×5.
  3. `grid grid-cols-12 gap-6`: `<RevenueChart>` (col-span-12 xl:col-span-8) + `<StatusDonut>` (xl:col-span-4).
  4. `grid grid-cols-12 gap-6`: `<BestSellers>` (col-span-12 lg:col-span-5) + правая колонка
     `lg:col-span-7 space-y-6` с `<LowStock>` + `<RecentOrders>`.

### 4.4. Клиентские острова (Recharts)
- `<PeriodToggle>` (client): пилюля 7/30/90; `useRouter`+`useSearchParams`, `setParam('period', v)` (как
  customer-filters), активный = `bg-admin-primary text-admin-on-primary`.
- `<RevenueChart>` (client): props `{ data: {label, revenue}[] }`. Recharts `<ResponsiveContainer>
  <AreaChart>` — area+line, цвет `#b2f700` (gradient fill), `<XAxis dataKey=label>`, `<YAxis>` (формат ₽
  компактный), `<Tooltip>` (значение через formatPrice), grid. Высота ~320px.
- `<StatusDonut>` (client): props `{ data: {label, count, status}[]; total }`. Recharts `<PieChart><Pie
  innerRadius outerRadius>` с `<Cell>` по статусу (палитра из admin-токенов: lime/violet/error/surface-high),
  центр-лейбл total, легенда сбоку с count.

### 4.5. Серверные виджеты
- `<KpiCard>` (server): props `{ icon, label, value, trend }`. Иконка-чип, лейбл uppercase, значение
  `font-admin-head`, trend-стрелка: `dir==='up'` зелёный/lime + «↑ N%», `down` — `text-admin-error` + «↓ N%»,
  `flat`/`pct===null` — нейтрально («—» или «новое»). value — уже отформатированная строка (₽ через formatPrice
  для денежных, число для штук).
- `<BestSellers>` (server): топ-5 строк (фото 64×64 / имя+бренд / выручка+units справа), пусто-стейт «Продаж за
  период нет».
- `<LowStock>` (server): сетка 2-кол; critical (`border-admin-error bg-admin-error/слой`, qty `text-admin-error`)
  / warning (виолет `border-admin-secondary-container`); header-бейдж «N позиций»; пусто-стейт «Сток в норме».
- `<RecentOrders>` (server): таблица 10 строк (№-ссылка `/admin/orders/[id]`, имя/email, статус-бейдж через
  `orderStatusView`, сумма, дата MSK); пусто-стейт «Заказов нет».

## 5. Зависимости

**Новая:** `recharts` (единственный новый npm-пакет; ~client-only). Переиспользуем: `@/lib/format`,
`@/lib/order` (ORDER_STATUS_META, orderStatusView), `@/lib/order-admin` (ORDER_STATUS_VALUES),
`@/lib/prisma-client`, `@/constants/config` (LOW_STOCK_THRESHOLD), admin-UI (`icon/heading/button`-классы),
глобальные `.badge-*`.

## 6. Тестирование (vitest `node`, моки `@/lib/prisma-client`)

- `tests/admin-analytics.test.ts` — чистые хелперы:
  - `computeTrend`: рост (`prev=100,curr=120` → `{pct:20,dir:'up'}`), падение (`down`, отриц.), flat
    (`curr===prev`), `prev=0 && curr>0` → `{pct:null,dir:'up'}`, оба 0 → `{pct:0,dir:'flat'}`.
  - `resolvePeriod`: дефолт при отсутствии/мусоре → 30; валидные 7/30/90; current/previous окна смежны и не
    пересекаются (`current.gte === previous.lt`, ширина равна); `now` инъектируется.
  - `PERIOD_VALUES` содержит 7/30/90.
- Data-функции с моканой prisma — выборочно: `getKpis` (shape + avgOrder=round(rev/orders), avgOrder=0 при
  orders=0, тренд считается), `getLowStock` (tier-классификация: stock 3→critical, 4→warning, граница 10),
  `getRevenueSeries` (пустые дни → 0, длина=days). Raw-SQL глубоко не мокаем (как orders/customers actions).
- Recharts-острова и серверные виджеты не юнит-тестим (UI) — ручная проверка на Vercel preview.

## 7. Риски и развязки

- **Recharts + SSR**: `<ResponsiveContainer>` требует клиента → острова `'use client'`, данные считаются в RSC
  и передаются props (графики не дёргают БД). Размер бандла admin-only (не влияет на витрину).
- **Raw daily-bucket в МСК**: `AT TIME ZONE 'Europe/Moscow'` для корректных суток (хост Vercel UTC). Пустые дни
  заполняются в JS — SQL вернёт только дни с заказами.
- **salesCount drift** не используется для best-sellers (взяли точную выручку из OrderItem) → дрейф счётчика не
  искажает топ. salesCount живёт для каталожной сортировки, не для дашборда.
- **Нет индекса `[createdAt]` на Order**: диапазонные агрегаты идут фильтр-сканом. На текущем масштабе (сотни
  заказов) приемлемо; добавление индекса — вне scope (не трогаем схему).
- **Тренд при пустом previous**: `pct:null` рендерится как «новое»/«—», не «∞%» и не падение.
- **CANCELLED**: исключён из выручки/orders/units/best-sellers; в donut статусов присутствует (это его смысл).
- **`prisma db push` не нужен** (схема не тронута).

## 8. Точка продолжения

После 3.6: **3.7 Coupons** (тонкий percent-only CRUD поверх `lib/coupon.ts` — финальная фаза роадмапа admin).
Связано: [[phase3-admin-planning]], [[phase3.5-customers-state]], [[phase-artifacts-convention]].
