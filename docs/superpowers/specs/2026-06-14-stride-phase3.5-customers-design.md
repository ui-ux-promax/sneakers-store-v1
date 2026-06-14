# STRIDE — Фаза 3.5: Customers (design)

> Дата: 2026-06-14. Ветка: `feat/phase3.5-customers` (от `origin/main` после мержа 3.4).
> Следующая фаза после 3.4 Orders MVP. Цикл артефактов: brainstorming → **этот spec** → plan → код.

## 1. Проблема и цель

Админка (Phase 3) умеет управлять каталогом (3.2/3.3) и заказами (3.4), но раздел `/admin/customers`
пока заглушка. Цель 3.5 — дать администратору **видеть клиентскую базу и управлять ролями**: список
пользователей с поиском/фильтром/сортировкой и пагинацией, детальная карточка клиента (профиль +
сводка-метрики + история заказов + корзина) и переключение роли `ADMIN ↔ CUSTOMER` с защитой от
потери доступа.

«Customer» = существующая модель `User`. Отдельной модели Customer нет — раздел «Users» из роадмапа
сливается сюда. MVP-границы (зафиксировано юзером): без удаления/бана пользователей, без
редактирования профиля админом, без новых полей схемы. Единственная мутация — смена роли.

## 2. Контекст-якоря (проверено в коде)

- **Схема** (`prisma/schema.prisma`): `enum UserRole { CUSTOMER ADMIN }` (стр. 123). `User` (стр. 128):
  `id` cuid, `email` @unique, `emailVerified DateTime?`, `image String?`, `passwordHash String?`,
  `name String?`, `phone String?`, `birthdate DateTime?`, `role UserRole @default(CUSTOMER)`,
  `createdAt/updatedAt`. Relations: `accounts`, `carts`, `orders`, `reviews`, `wishlists`. Индекс
  `@@index([role])`. **Нет полей `banned/status/newsletter`** — бан/деактивация потребовали бы
  миграции, поэтому вне scope.
- **Гостевых заказов НЕ существует.** `Order.userId String` (стр. 199) — NOT NULL; `placeOrder`
  (`app/actions/order.ts:33`) хард-гейтит на `session.user.id` и иначе возвращает ошибку до записи в
  БД. Значит каждый заказ привязан к `User` — история заказов клиента всегда полна.
- **`Order`** (стр. 196): `orderNumber` Int @unique, `status OrderStatus`, `totalAmount` Int (целые ₽),
  `createdAt`, контакты-снапшот (`contactName/Phone/Email`). Индексы `[userId,createdAt]`, `[status]` —
  оба запроса детали (история по userId) и сортировка покрыты индексом.
- **`Review`** (стр. 269): `userId` NOT NULL, `rating` Int 1..5, `@@unique([productId,userId])`.
  Для сводки: `_count` + `_avg(rating)`.
- **`Wishlist`** (стр. 283): `userId String?` (nullable — анонимные есть), `items WishlistItem[]`.
  У юзера может быть несколько вишлистов (по токену сессии) → позиции считаем суммарно по всем его
  вишлистам.
- **`Cart`** (стр. 110): `userId String?`, `items CartItem[]`. Транзиентна; на детали показываем лишь
  кол-во позиций активной корзины (низкая ценность, но юзер выбрал блок).
- **`Subscriber`** (стр. 325): отдельная таблица newsletter, ключ `email` @unique, `unsubscribedAt
  DateTime?`. **Нет FK на User.** Статус подписки клиента = `subscriber.findUnique({where:{email}})` и
  `unsubscribedAt == null`.
- **Роль живёт в JWT** (`auth.config.ts:77-89`): `token.role`/`token.id` → `session.user.{role,id}`.
  Гейты `lib/admin/require-admin.ts`: `requireAdminPage()` (RSC, redirect), `requireAdminAction()`
  (envelope `{ok,session}` — **`gate.session.user.id` = id текущего админа** для self-demotion guard).
  Prisma для проверки роли не нужна.
- **Единственный путь, пишущий `role:'ADMIN'`** сегодня — `prisma/seed-admin.ts` (CLI). Защиты от
  «ноль админов» нигде нет → строим в action с нуля.
- **LTV/спенд клиента нигде не считается** — пишем агрегаты с нуля (`order.aggregate`/raw).
- **Admin-паттерн (3.2/3.3/3.4)**: `page.tsx (RSC) → _components/{filters,table,actions}.tsx (client)
  → app/actions/admin/*.ts → services/dto/*`; envelope `{ok:true}|{ok:false,error}`; zod `safeParse`;
  guarded `updateMany` + проверка `count`; `revalidatePath`. Серверная пагинация — `lib/admin/pagination.ts`
  (`parsePaginationParams` default limit 20, `buildPaginationMeta`, `readSearchQuery`, `readEnumParam`).
  Список — собственная `<table>` + URL-пагинация (не tanstack). Фильтры (`order-filters.tsx`): клон
  `URLSearchParams`, текст по Enter, селекты сразу, `next.delete('page')` при смене фильтра.
- **Сайдбар** (`components/admin/admin-shell.tsx:24`): пункт «Customers» (href `/admin/customers`,
  icon `group`, exact:false) уже есть — **менять не нужно**.
- **Форматтеры** (`lib/format.ts`): `formatPrice(rub)` → «1 500 ₽»; `formatDateTime(date)` →
  «14.06.2026 13:01» с `timeZone:'Europe/Moscow'` (корректно на UTC-хосте Vercel).
- **Бейджи статуса заказа**: `orderStatusView(status, paymentStatus?)` из `lib/order.ts` (RU-лейблы +
  `.badge-*`) — переиспользуем в истории заказов на детали. Глобальные `.badge .badge-{success,info,
  warning,danger}` (`app/globals.css:154-163`), токены `--color-*` на `:root` резолвятся в `.admin-root`.

## 3. Зафиксированные решения (юзер, 2026-06-14)

1. **Role guard — «себя + последний админ».** Понижение `ADMIN→CUSTOMER` блокируется если
   `target.id === me.id` («Нельзя снять роль с себя») ИЛИ `count(role=ADMIN) <= 1` («Последний
   администратор»). Повышение `CUSTOMER→ADMIN` — всегда разрешено. Смена роли на ту же — no-op.
2. **Список — поиск + фильтр роли + серверная сортировка** по: дате регистрации (дефолт, desc),
   числу заказов, сумме трат. Колонки: Клиент (имя+email) | Роль | Заказов | Потрачено | Регистрация.
   Серверная пагинация (20/стр).
3. **Деталь — 4 блока**: Профиль, Сводка-метрики, История заказов, Текущая корзина.
4. **Схема не трогается, действие одно — тоггл роли.** Без удаления/бана. → нет `prisma db push`, нет
   Neon-миграции, низкий риск (как 3.4).

**Правило согласованности метрик:** `orderCount` = ВСЕ заказы клиента; `totalSpent` = `SUM(totalAmount)`
по заказам со `status <> 'CANCELLED'` (реальные деньги; отменённые не считаются — то же правило в
сводке детали).

## 4. Архитектура

### 4.1. Маршруты (изменений схемы НЕТ)
- `app/(admin)/admin/customers/page.tsx` — переписать заглушку в список (RSC).
- `app/(admin)/admin/customers/[id]/page.tsx` — деталь клиента (RSC), `notFound()` если нет.
- `_components/customer-filters.tsx`, `_components/customer-table.tsx`, `_components/role-toggle.tsx`.

Схема не меняется — **`prisma db push` для 3.5 не нужен** (`vercel.json` всё равно гоняет push, no-op).

### 4.2. Стратегия запроса списка — единый `$queryRaw` (решение из brainstorming)

Сортировка по «потрачено» = `SUM(Order.totalAmount)` по relation; Prisma `orderBy` агрегат relation НЕ
поддерживает. Выбран **единый параметризованный raw-запрос** (а не гибрид и не денормализация — схему
не трогаем):

```sql
SELECT u.id, u.name, u.email, u.role, u.phone, u."emailVerified", u."createdAt",
       COUNT(o.id)                                                   AS order_count,
       COALESCE(SUM(o."totalAmount") FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total_spent
FROM "User" u
LEFT JOIN "Order" o ON o."userId" = u.id
WHERE (<role filter>) AND (<search>)
GROUP BY u.id
ORDER BY <whitelisted sort> 
LIMIT $limit OFFSET $skip
```
+ отдельный `SELECT COUNT(*) FROM "User" u WHERE <role+search>` для `buildPaginationMeta` (без джойна —
фильтры на User не зависят от заказов).

- **Параметризация**: значения (`q`, `limit`, `skip`, фильтр роли) — через `Prisma.sql`/`$queryRaw`
  плейсхолдеры → SQL-инъекций нет. `ORDER BY` — НЕ из ввода: `buildCustomerOrderBy(sort)` возвращает
  фиксированный `Prisma.sql` фрагмент из whitelist (`registered|orders|spent`), дефолт `registered`.
- **Поиск** `q`: `ILIKE '%q%'` по `u.name`, `u.email`, `u.phone` (OR). Спецсимволы `%`/`_` экранируем.
- **Фильтр роли**: `u.role = $role::"UserRole"` (если задан), иначе условие опускаем.
- **Neon**: `$queryRaw` идёт через WebSocket-адаптер; колонки User/Order — обычные text/int, грабли
  `::text`-каста (PG-тип `name` в системных таблицах, [[prisma-neon-name-cast]]) тут НЕ применимы.
- **Типизация результата**: интерфейс `CustomerListRow` вручную (raw не типизируется автоматически);
  `order_count`/`total_spent` приходят как `bigint`/`number` от PG — приводим к `Number` при маппинге.

`order_count` считает ВСЕ заказы (включая CANCELLED — общая активность); `total_spent` — только
не-CANCELLED (см. §3 правило).

### 4.3. `lib/customer-admin.ts` (чистые функции, юнит-тестируемы)
- `ROLE_FILTER_VALUES = ['ADMIN','CUSTOMER'] as const` — кортеж для `readEnumParam`.
- `CUSTOMER_SORT_VALUES = ['registered','orders','spent'] as const` — кортеж для `readEnumParam`.
- `roleView(role): {label, badge}` — `ADMIN` → «Администратор» `badge-info`; `CUSTOMER` → «Клиент»
  нейтральный бейдж.
- `buildCustomerOrderBy(sort): Prisma.Sql` — whitelist → фрагмент `ORDER BY`:
  `registered` → `u."createdAt" DESC`; `orders` → `order_count DESC, u."createdAt" DESC`;
  `spent` → `total_spent DESC, u."createdAt" DESC`. Неизвестное → дефолт `registered`.
- **`roleChangeGuard({ targetId, targetRole, requestedRole, actingAdminId, adminCount }): {ok:true} |
  {ok:false, error:string}`** — вся логика guard, чистая (без БД):
  - `targetRole === requestedRole` → `{ok:true}` (no-op, action просто вернёт ok).
  - понижение (`requestedRole === 'CUSTOMER'`): `targetId === actingAdminId` → error «Нельзя снять роль
    с себя»; `adminCount <= 1` → error «Нельзя разжаловать последнего администратора».
  - повышение (`requestedRole === 'ADMIN'`): `{ok:true}`.

### 4.4. DTO — `services/dto/customer-admin.dto.ts`
- `roleChangeSchema = z.object({ userId: z.string().min(1), role: z.enum(['ADMIN','CUSTOMER']) })`.
  Передаём ЦЕЛЕВУЮ роль (не «toggle») — устраняет гонку «состояние на клиенте устарело»: action сверит
  целевую роль с текущей и применит guarded-переход.

### 4.5. Server action — `app/actions/admin/customers.ts`
`type RoleActionResult = {ok:true} | {ok:false, error:string}`. Гейт `requireAdminAction()`.

- **`changeUserRole(input)`**:
  1. `gate = requireAdminAction()`; `!gate.ok` → error.
  2. `roleChangeSchema.safeParse(input)` → иначе «Некорректные данные».
  3. `target = user.findUnique({ where:{id:userId}, select:{ role } })` → нет → «Пользователь не найден».
  4. `adminCount = user.count({ where:{ role:'ADMIN' } })`.
  5. `roleChangeGuard({ targetId:userId, targetRole:target.role, requestedRole:role,
     actingAdminId:gate.session.user.id, adminCount })` → `!ok` → вернуть его error.
  6. если `target.role === role` → `{ok:true}` (no-op, без записи).
  7. **guarded** `updateMany({ where:{ id:userId, role:target.role }, data:{ role } })`;
     `count===0` → «Роль изменилась, обновите страницу» (one-shot race-guard как в 3.4).
  8. `revalidatePath('/admin/customers')`, `revalidatePath('/admin/customers/'+userId)` → `{ok:true}`.

**Почему целевая роль + `updateMany WHERE role=target.role`:** клиент шлёт желаемую роль; guard на
текущем снимке; запись применяется только если роль в БД всё ещё та, что видел админ (иначе count=0 →
просьба обновить). Тот же паттерн идемпотентности, что `advanceOrderStatus` в 3.4.

### 4.6. Список — `page.tsx` + фильтры + таблица
- `export const dynamic = 'force-dynamic'`. Гейт `requireAdminPage()`.
- Парс: `parsePaginationParams(sp,{limit:20})`, `readSearchQuery('q')`, `readEnumParam('role',
  ROLE_FILTER_VALUES)`, `readEnumParam('sort', CUSTOMER_SORT_VALUES)`.
- Данные: `Promise.all([ countQuery, listQuery(raw) ])` (§4.2). Маппинг в `CustomerRow { id, name,
  email, role, orderCount, totalSpent, createdAt }`.
- `<CustomerFilters>` (клиент): инпут поиска (Enter), `<Select>` роли (Все/Администратор/Клиент),
  `<Select>` сортировки (Регистрация/Заказов/Потрачено). Паттерн `order-filters.tsx`.
- `<CustomerTable>` (клиент): собственная `<table>` (калька `order-table.tsx`) — колонки Клиент
  (имя||«—» + email мелким), Роль (`roleView` бейдж), Заказов, Потрачено (`formatPrice`), Регистрация
  (`formatDateTime`); строка-ссылка `/admin/customers/[id]`; футер-пагинация через URLSearchParams.

### 4.7. Деталь — `[id]/page.tsx`
Гейт `requireAdminPage()`. Загрузка:
- `user = user.findUnique({ where:{id}, select:{ id,name,email,emailVerified,image,phone,birthdate,
  role,createdAt } })` → `notFound()`.
- сводка (`Promise.all`) — метрики согласованы со списком (§3: `orderCount`=ВСЕ, `totalSpent`=не-отм.):
  - `order.count({ where:{ userId:id } })` → заказов (ВСЕ, как колонка списка).
  - `order.aggregate({ where:{ userId:id, status:{ not:'CANCELLED' } }, _sum:{ totalAmount:true } })`
    → потрачено (не-CANCELLED).
  - `review.aggregate({ where:{ userId:id }, _count:{_all:true}, _avg:{ rating:true } })`.
  - `wishlistItem.count({ where:{ wishlist:{ userId:id } } })` — позиции по всем вишлистам клиента.
  - `cartItem.count({ where:{ cart:{ userId:id } } })` — позиции активной корзины (суммарно).
  - `subscriber.findUnique({ where:{ email:user.email }, select:{ unsubscribedAt } })` → newsletter
    active = найден && `unsubscribedAt == null`.
- история: `order.findMany({ where:{ userId:id }, orderBy:{ createdAt:'desc' }, take:50, select:{
  id, orderNumber, status, totalAmount, createdAt, payment:{ select:{ status } } } })`. Если заказов
  > 50 — подпись «показаны последние 50 из N».
- layout: 3-кол грид (как order detail). Левая 2/3 — История заказов (таблица: №-ссылка на
  `/admin/orders/[id]`, дата MSK, бейдж `orderStatusView`, сумма) + пусто-стейт «Заказов нет». Правая
  1/3 — Профиль (аватар `image`, name, email + значок «подтверждён/не подтверждён» по `emailVerified`,
  phone, birthdate, дата регистрации) + блок Сводка (4 метрики + newsletter) + `<RoleToggle>`.

### 4.8. `<RoleToggle>` (клиент-остров)
Пропсы `{ userId, currentRole }`. Кнопка: для CUSTOMER → «Назначить администратором»; для ADMIN →
«Снять роль администратора». Клик → `Dialog`-подтверждение (Radix портал в `.admin-root` уже настроен)
→ `changeUserRole({ userId, role: currentRole==='ADMIN' ? 'CUSTOMER' : 'ADMIN' })`. `ok` →
`router.refresh()`; иначе показать `res.error` (текст guard, напр. «последний администратор») в Dialog.
Локальные `busy/error`. Самозащиту дублируем визуально: можно либо скрыть кнопку понижения для своего
аккаунта, либо положиться на ответ action (источник истины — action). MVP: кнопка видна всегда, ошибка
guard приходит из action (как 3.4 cancel).

## 5. Зависимости

Новых npm-пакетов НЕТ. Переиспользуем: `@/lib/admin/{require-admin,pagination}`, `@/lib/order`
(`orderStatusView`), `@/lib/format` (`formatPrice`, `formatDateTime`), `@/lib/prisma-client`,
admin-UI (`button/select/dialog/icon/heading/badge`-классы). Бейджи — глобальные `.badge-*`.

## 6. Тестирование (vitest `node`, моки `@/auth` / `@/lib/prisma-client` / `next/cache`)

- `tests/customer-admin.test.ts` — чистые хелперы:
  - `roleView` — оба значения (label + badge-класс).
  - `buildCustomerOrderBy` — `registered/orders/spent` дают разные фрагменты; неизвестное → дефолт
    `registered` (проверяем по сериализованному `.sql`/`.strings`).
  - **`roleChangeGuard` все ветки**: self-demote (target==acting, →CUSTOMER) → error; last-admin
    (adminCount=1, →CUSTOMER, другой target) → error; demote-ok (adminCount≥2, другой target) → ok;
    promote (→ADMIN) → ok всегда (даже adminCount=0); no-op (targetRole==requestedRole) → ok.
- `tests/admin-customers-action.test.ts` — `changeUserRole` с моканой prisma (как
  `admin-orders-action.test.ts`):
  - promote CUSTOMER→ADMIN: `updateMany` вызван (`count:1`) → ok.
  - demote self: error «снять роль с себя», `updateMany` НЕ вызван.
  - demote last admin (`count:1`): error, `updateMany` НЕ вызван.
  - demote ok (другой админ, adminCount=2): `updateMany count:1` → ok.
  - guarded `count:0` (роль уже сменилась): error «обновите страницу».
  - не-админ (гейт): error.
  - целевой пользователь не найден: error.

UI-компоненты не юнит-тестим (vitest node-only) — ручная проверка на Vercel preview.

## 7. Риски и развязки

- **Raw-запрос на Neon**: обычные колонки User/Order — без `::text`-граблей. Параметризация через
  `$queryRaw`/`Prisma.sql` → инъекций нет; `ORDER BY` из whitelist-фрагмента, не из ввода. `bigint` от
  `COUNT/SUM` → `Number()` при маппинге (значения малы, переполнения нет).
- **Гонка zero-admin guard**: между `count(ADMIN)` и `updateMany` другой запрос мог разжаловать
  параллельно. Операция редкая, админов мало → приемлемо (известный минор, как миноры 3.4). Строгий
  фикс (atomic) — вне MVP.
- **`ILIKE` экранирование**: `%`/`_`/`\` в `q` экранируем перед подстановкой в паттерн, чтобы спецсимвол
  не ломал поиск.
- **Newsletter по email-джойну**: `Subscriber` без FK; статус определяется матчем `email`. Если у юзера
  email сменится — историческая подписка может «отвязаться» (вне scope, email юзера иммутабелен в UI).
- **Корзина-метрика**: транзиентна, низкая ценность; показываем кол-во позиций без действий (юзер
  выбрал блок).
- **`prisma db push` не нужен** (схема не тронута) — `vercel.json` гоняет push, no-op diff.

## 8. Точка продолжения

После 3.5: **3.6 Dashboard** (admin-analytics по OrderItem: Units Sold, Best Sellers, donut статусов,
Low-Stock по `ProductVariant.stock`, Recent Orders), затем 3.7 Coupons (тонкий percent-only CRUD).
Связано: [[phase3-admin-planning]], [[phase3.4-orders-state]].
