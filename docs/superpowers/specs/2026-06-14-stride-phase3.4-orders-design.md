# STRIDE — Фаза 3.4: Orders MVP (design)

> Дата: 2026-06-14. Ветка: `feat/phase3.4-orders` (от `origin/main` после мержа 3.3).
> Следующая фаза после 3.3 Products. Цикл артефактов: brainstorming → **этот spec** → plan → код.

## 1. Проблема и цель

Админка (Phase 3) умеет управлять каталогом (категории 3.2, товары 3.3), но заказы покупателей
видны только заглушкой `/admin/orders`. Цель 3.4 — дать администратору **просматривать заказы и
вести их по жизненному циклу**: список с фильтрами + пагинацией, детальная карточка заказа, смена
статуса по управляемому пайплайну и отмена с корректным возвратом стока.

MVP-границы (зафиксировано юзером): без новых моделей, без редактирования контактов/адреса, без
возвратов/рефандов, без удаления заказов, без печати/инвойсов, без аналитики (это Dashboard 3.6).

## 2. Контекст-якоря (проверено в коде)

- **Схема** (`prisma/schema.prisma`): `enum OrderStatus { PENDING PROCESSING SHIPPED DELIVERED CANCELLED }`
  (стр. 188). `Order` (стр. 196): `id` cuid, `orderNumber` Int @unique autoincrement, `userId`→User,
  `status` @default(PENDING), контакты (`contactName/Phone/Email`), доставка (`shippingMethod/city/
  addressLine/addressComment?`), денормализованные суммы в **целых рублях** (`itemsTotal`,
  `discountAmount` @default 0, `shippingAmount`, `totalAmount`), `couponCode?`, `paymentMethod`,
  `items OrderItem[]`, `payment Payment?`, `createdAt/updatedAt`. Индексы `[userId,createdAt]`, `[status]`.
- **`OrderItem`** (стр. 229): снапшот-поля захвачены при оформлении (`sku`, `productName`,
  `colorwayName`, `sizeEu` String, `imageUrl?`, `unitPrice`, `quantity`, `lineTotal`), FK
  `productVariantId`→ProductVariant (аудит), `orderId` onDelete: Cascade.
- **`Payment`** (стр. 248): `id` String = внешний YooKassa-id (без @default), `orderId` @unique,
  `status` String @default("pending") — значения `'pending' | 'succeeded' | 'canceled'` (НЕ enum,
  строчные), `confirmationUrl?`, `amount`, `paidAt?`. Связь 0:1, Payment владеет FK.
- **Сток списывается при ОФОРМЛЕНИИ** (`app/actions/order.ts` `placeOrder`, стр. 88-91), не при оплате.
  Значит любая отмена активного заказа обязана вернуть сток. `salesCount` инкрементится при
  оформлении (стр. 172), декрементится при отмене — симметрично.
- **`lib/payment-sync.ts`** — эффекты оплаты: `applyPaymentSucceeded(paymentId)` (Payment→succeeded,
  Order→PROCESSING, идемпотентно), `applyPaymentCanceled(paymentId)` (Payment→canceled,
  Order PENDING→CANCELLED **через guard `WHERE status='PENDING'`**, возврат стока, `salesCount −1`).
  **Две дыры для админки:** (а) функция требует `paymentId` — у COD-заказов платежа НЕТ; (б) guard
  только `PENDING` — отмену из `PROCESSING` она не покрывает. → нужна отдельная админ-функция.
- **`lib/order.ts`**: `ORDER_STATUS_META` (RU-лейблы + badge-классы: Оформлен/Обрабатывается/В пути/
  Доставлен/Отменён), `orderStatusView(status, paymentStatus?)` (PENDING+`'pending'` → «Ожидает оплаты»).
  Переиспользуем для бейджей. `calcShipping`, `buildOrderSnapshot` — для 3.4 не нужны.
- **`app/actions/order.ts` `cancelOrder(orderId)`** (клиентская отмена): тот же guarded-паттерн
  `update WHERE id AND userId AND status='PENDING'`, затем `cancelPayment` (если платёж pending) +
  возврат стока + `adjustSalesCount(-1)` + `pruneReviewsAfterCancel`. Эталон для админ-отмены.
- **Admin-паттерны** (3.2/3.3): envelope `{ok:true,...}|{ok:false,error}`, `requireAdminAction()`
  (`lib/admin/require-admin.ts`, читает `session.user.role` из JWT), zod-DTO `safeParse`,
  `Prisma.PrismaClientKnownRequestError` по `e.code`, `revalidatePath`. Структура
  `page.tsx (RSC) → _components/{filters,table}.tsx (client) → app/actions/admin/*.ts → services/dto/*`.
  Серверная пагинация: `lib/admin/pagination.ts` (`parsePaginationParams/buildPaginationMeta/
  readSearchQuery/readEnumParam`). Список товаров — собственная таблица + URL-пагинация (не tanstack).
- **Сайдбар** (`components/admin/admin-shell.tsx`): пункт Orders уже есть (label «Orders», href
  `/admin/orders`, icon `shopping_cart`, exact: false → подсвечивает и `/admin/orders/[id]`).
- **`formatPrice(rub)`** (`lib/format.ts`) — рубли; `formatAddedAgo` (`lib/relative-time.ts`) — «N назад».
- **Бейджи**: глобальные `.badge .badge-{success,info,warning,danger}` (`app/globals.css` стр. 154-163),
  токены `--color-*` на `:root` → резолвятся и внутри `.admin-root`.

## 3. Зафиксированные решения (юзер, 2026-06-14)

1. **Статус-модель — управляемый пайплайн + отмена.** Дропдаун/кнопки показывают только *следующий*
   статус по цепочке `PENDING→PROCESSING→SHIPPED→DELIVERED` и кнопку «Отменить» (если применимо).
   Невалидные прыжки (например `PENDING→SHIPPED`, откат назад) запрещены на уровне action.
2. **Отмена — только из `PENDING` и `PROCESSING`** (до отгрузки). Отмена = возврат стока +
   `salesCount −1` (+ отмена pending-платежа). `SHIPPED/DELIVERED/CANCELLED` — терминальны для отмены.
3. **Без удаления заказов** — заказ это финансовая запись; единственный «деструктив» — отмена.
4. **Фильтры списка** — `OrderStatus` + `Payment.status` (+ «Без оплаты/COD») + текст-поиск
   (`orderNumber` / `contactName` / `contactPhone` / `contactEmail`). Серверная пагинация (page/limit).
5. **Смена статуса — на странице детали** заказа (не инлайн в строке списка); строка списка кликабельна
   и ведёт в деталь. (Инлайн-действия в строке — возможная будущая мелочь, вне MVP.)
6. **Платёж при forward-переходах не трогаем** (lifecycle платежа ведёт вебхук ЮKassa). Отмена pending-
   платежа — единственное исключение. Отмена УЖЕ оплаченного (succeeded) заказа **не делает рефанд** —
   деньги возвращаются вручную в кабинете ЮKassa; админ-отмена лишь вернёт сток и пометит Order CANCELLED.

## 4. Архитектура

### 4.1. Маршруты (изменений схемы НЕТ)
- `app/(admin)/admin/orders/page.tsx` — переписать заглушку в список (RSC).
- `app/(admin)/admin/orders/[id]/page.tsx` — деталь заказа (RSC), `notFound()` если нет.
- `_components/order-filters.tsx`, `_components/order-table.tsx`, `_components/order-status-actions.tsx`.

Схема не меняется — **`prisma db push` для 3.4 не нужен** (ниже риск, нет Neon-миграции).

### 4.2. Переходы — `lib/order-admin.ts` (чистые функции, юнит-тестируемы)
- `ORDER_FLOW: Record<OrderStatus, OrderStatus | null>` — следующий вперёд:
  `PENDING→PROCESSING`, `PROCESSING→SHIPPED`, `SHIPPED→DELIVERED`, `DELIVERED→null`, `CANCELLED→null`.
- `nextOrderStatus(s): OrderStatus | null`, `canCancelOrder(s): boolean` (`s ∈ {PENDING,PROCESSING}`).
- `FORWARD_ACTION_LABEL: Record<OrderStatus,string>` — текст кнопки по *текущему* статусу
  («Взять в обработку» / «Отметить отгруженным» / «Отметить доставленным»).
- `PAYMENT_STATUS_META: Record<'pending'|'succeeded'|'canceled', {label,badge}>` (+ безопасный фолбэк
  для `null`/COD → «Без оплаты»). RU-лейблы: Ожидает оплаты / Оплачен / Отменён.
- `ORDER_STATUS_VALUES`, `PAYMENT_STATUS_VALUES` — кортежи для `readEnumParam`.

### 4.3. DTO — `services/dto/order-admin.dto.ts`
- `orderStatusUpdateSchema = z.object({ orderId: z.string().min(1),
  toStatus: z.enum(['PROCESSING','SHIPPED','DELIVERED']) })` — **forward-таргеты только**; `CANCELLED`
  идёт через отдельный action, `PENDING` никогда не таргет.

### 4.4. Server actions — `app/actions/admin/orders.ts`
Обе возвращают `OrderActionResult = {ok:true}|{ok:false,error:string}`, гейт `requireAdminAction()`.

- **`advanceOrderStatus(input)`**: `safeParse` → загрузить `order.status` → проверить
  `nextOrderStatus(current) === toStatus` (иначе «Недопустимый переход») → **guarded**
  `updateMany({ where:{ id, status: current }, data:{ status: toStatus } })`; `count===0` → «Статус
  изменился, обновите страницу». Стока/платежа/salesCount **не трогает** — чистая прогрессия.
- **`cancelOrderByAdmin(orderId)`**: загрузить заказ (`items.productVariant.colorway.productId`,
  `payment`, `userId`, `orderNumber`) → **guarded** `updateMany({ where:{ id,
  status:{ in:['PENDING','PROCESSING'] } }, data:{ status:'CANCELLED' } })`; `count===0` → «Этот заказ
  нельзя отменить» (терминальный/гонка — без побочек). Затем: если `payment?.status==='pending'` →
  `cancelPayment(payment.id)` (best-effort) + `payment.update status='canceled'`; возврат стока по
  позициям (`stock: { increment }`, best-effort per item); `adjustSalesCount(items, -1)`;
  `pruneReviewsAfterCancel(userId, productIds)`. Ревалидация: `/admin/orders`, `/admin/orders/[id]`,
  `/profile`, `/orders/[orderNumber]`.

**Почему `updateMany`, а не `update`:** `update.where` берёт ровно одно значение `status`; для отмены
нужен набор `{PENDING,PROCESSING}` атомарно. `updateMany` + проверка `count` = тот же one-shot guard,
что и `update WHERE status` в `payment-sync` (идемпотентность против гонки с вебхуком: вебхук правит
только PENDING; кто первый сделал `count===1`, тот применил побочки ровно раз). `updateMany` поддержан
Neon WebSocket-адаптером (AGENTS.md §3).

### 4.5. Список — `page.tsx` + фильтры + таблица
- Парс: `parsePaginationParams`, `readSearchQuery('q')`, `readEnumParam('status', ORDER_STATUS_VALUES)`,
  `readEnumParam('payment', [...PAYMENT_STATUS_VALUES,'none'])`.
- `where: Prisma.OrderWhereInput`: `status` (если задан); платёж: `succeeded/pending/canceled` →
  `{ payment: { is: { status } } }`, `none` → `{ payment: { is: null } }`; поиск `q` — **режим по
  типу запроса**: если `q` целочисленный → точное `orderNumber: Number(q)` (БЕЗ контактов, иначе цифры
  из email/телефона дают ложные строки); иначе `OR` из `contactName/Phone/Email` (`contains`,
  `mode:'insensitive'`). orderNumber — Int, `contains` к нему неприменим.
- Запрос `Promise.all`: `count(where)`, `findMany(where, orderBy:[{createdAt:'desc'}], skip, take,
  select: { id, orderNumber, status, totalAmount, paymentMethod, contactName, contactEmail, createdAt,
  payment:{ select:{ status } }, items:{ select:{ imageUrl, quantity }} })`, плюс лёгкая сводка
  `groupBy(['status'], _count)` для счётчиков-чипов сверху.
- Маппинг в `OrderRow { id, orderNumber, status, paymentStatus, paymentMethod, contactName,
  contactEmail, itemCount, totalAmount, coverImage, addedAgo }`. `<OrderTable>` (клиент) рендерит
  строки + пагинацию (калька `product-table.tsx`: собственная таблица + `goPage` через URLSearchParams),
  строка-ссылка `/admin/orders/[id]`.

### 4.6. Деталь — `[id]/page.tsx`
`findUnique({ where:{ id }, include:{ items, payment, user:{ select:{ name, email } } } })` → `notFound()`.
Блоки: шапка (Заказ #orderNumber, дата, бейдж статуса + бейдж оплаты) и `<OrderStatusActions
orderId status />`; покупатель (контакты); доставка (метод/город/адрес/коммент); позиции (таблица
снапшотов: фото, товар, расцветка, размер, sku, цена×кол-во = сумма); итоги (товары, скидка+`couponCode`,
доставка, **итого**); платёж (метод, бейдж, сумма, `paidAt`).

### 4.7. `<OrderStatusActions>` (клиент-остров)
Пропсы `{ orderId, status }`. `forward = nextOrderStatus(status)` → кнопка с `FORWARD_ACTION_LABEL`
(вызывает `advanceOrderStatus({orderId, toStatus: forward})`, `ok→router.refresh()`, иначе показать
ошибку). `canCancelOrder(status)` → кнопка «Отменить заказ» с `AlertModal`-подтверждением
(`cancelOrderByAdmin(orderId)`, `ok→refresh`, иначе `Dialog` с текстом ошибки). Терминальные статусы —
кнопок нет, показываем «Заказ завершён»/«Заказ отменён». Лоадеры на время запроса.

## 5. Зависимости

Новых npm-пакетов НЕТ. Переиспользуем: `@/lib/admin/{require-admin,pagination}`, `@/lib/order`
(`ORDER_STATUS_META`, `orderStatusView`), `@/lib/sales-count` (`adjustSalesCount`), `@/lib/yookassa`
(`cancelPayment`), `@/lib/review` (`pruneReviewsAfterCancel`), `@/lib/format`, `@/lib/relative-time`,
`@/lib/logger`, admin-UI (`button/select/dropdown-menu/dialog/alert-modal/icon/heading`). Бейджи —
глобальные `.badge-*`.

## 6. Тестирование (vitest `node`, моки `@/auth` / `@/lib/prisma-client` / `next/cache` / `@/lib/yookassa` / `@/lib/review` / `@/lib/sales-count`)

- `tests/order-admin.test.ts` — чистые хелперы: `nextOrderStatus` для всех 5 статусов, `canCancelOrder`
  (true только PENDING/PROCESSING), `PAYMENT_STATUS_META` лейблы + фолбэк для `null`.
- `tests/admin-orders-action.test.ts` — экшены с моканой prisma (как `admin-products-action.test.ts`):
  - `advanceOrderStatus`: PENDING→PROCESSING (`updateMany` вызван, `count:1` → ok); PENDING→SHIPPED
    (невалидный переход → error, `updateMany` НЕ вызван); `count:0` → error «обновите страницу»;
    не-админ → error.
  - `cancelOrderByAdmin`: PENDING COD (без payment) → `count:1`, сток восстановлен (`productVariant.update`
    с `increment` на каждую позицию), `adjustSalesCount(-1)`, `pruneReviewsAfterCancel`, `cancelPayment`
    НЕ вызван; PENDING online (payment pending) → `cancelPayment` + `payment.update status canceled`;
    PROCESSING с payment succeeded → отмена без `cancelPayment` (не рефандим); SHIPPED → `count:0` →
    error, сток НЕ трогаем; идемпотентность: `count:0` → ровно error, без повторного возврата.

UI-компоненты не юнит-тестим (vitest node-only) — ручная проверка на Vercel preview.

## 7. Риски и развязки

- **Гонка админ-отмены и вебхука ЮKassa** (оба на PENDING online): оба делают guarded-переход; `count===1`
  ровно у одного, второй — `count===0` без побочек. ✔ покрыто.
- **Отмена succeeded-заказа без рефанда**: осознанное MVP-решение (§3.6). UI пишет, что возврат денег —
  вручную. Сток возвращается (товар не уехал по бизнес-смыслу «до отгрузки»).
- **`Payment.status` — сырая строка**: маппим через `PAYMENT_STATUS_META` с фолбэком на неизвестное
  значение (не падаем).
- **Поиск по `orderNumber` (Int)**: `contains` неприменим. Числовой `q` ищет ТОЛЬКО точное
  `orderNumber` (контакты исключены — иначе цифры из email/телефона зашумляют выдачу, см. правку
  2026-06-14 после preview); нечисловой `q` — по контактам. Поиск по части телефона цифрами при этом
  не работает (осознанный размен против шума; e2e-заказы делят телефон). Гард `q ≤ 2147483647` (Int4).
- **Бейджи `.badge-*` внутри `.admin-root`**: токены `--color-*` на `:root`, резолвятся; проверить
  визуально на preview (шаг чек-листа).
- **`prisma db push` не нужен** (схема не тронута) — `vercel.json` всё равно гоняет push (no-op diff).

## 8. Точка продолжения

После 3.4: **3.5 Customers** (список/деталь/история, тоггл роли ADMIN/CUSTOMER + self-demotion guard),
затем 3.6 Dashboard (аналитика по OrderItem). Связано: [[phase3-admin-planning]], [[phase3.3-products-state]].
