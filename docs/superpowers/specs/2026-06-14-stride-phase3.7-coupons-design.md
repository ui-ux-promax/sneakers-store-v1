# STRIDE — Фаза 3.7: Coupons admin CRUD (design)

> Дата: 2026-06-14. Ветка: `feat/phase3.7-coupons`. Цикл артефактов: brainstorming → **этот spec** → plan → код.
> Финальная фаза роадмапа Phase 3 Admin (3.0→3.7).

## 1. Проблема и цель

Купоны (процентные скидки) сейчас создаются ТОЛЬКО через seed-файл. Админ не может завести/выключить/удалить промокод без правки кода и деплоя. Стаб `/admin/marketing` сам помечен «Phase 3.7».

**Цель:** тонкий admin-CRUD поверх существующей модели `Coupon` и `lib/coupon.ts`. **Схема НЕ меняется** → ноль миграций, ноль риска на чек-аут. Чек-аут (`checkCoupon`/`placeOrder`) НЕ трогаем.

**Не делаем (YAGNI, зафиксировано в роадмапе):** usageLimit/usageCount, minSubtotal, промо-движок пиццы (kinds/limits/redemptions), пагинация, любые изменения схемы или checkout-пути.

## 2. Контекст-якоря (проверено в коде, 2026-06-14)

- **Модель** `prisma/schema.prisma:260-267` — `Coupon { id, code @unique, percent Int, active Boolean @default(true), expiresAt DateTime?, createdAt }`. FK на Coupon нет ниоткуда.
- **`Order.couponCode`** — денормализованный `String?` (без FK), `discountAmount Int @default(0)`. Удаление/правка купона старые заказы не ломает (там просто строка для отображения).
- **`lib/coupon.ts`** (импортит `@/lib/prisma-client`, строка 1):
  - `normalizeCouponCode(input) → input.trim().toUpperCase()` (`lib/coupon.ts:4`)
  - `checkCoupon(rawCode)` — `findUnique`, отказ если `!active`, если `expiresAt.getTime() < Date.now()` (`lib/coupon.ts:24`), fail-closed на `percent ∉ [1..100]`.
- **`app/actions/admin/categories.ts`** — эталон паттерна server-actions: gate `requireAdminAction()` → `safeParse` → prisma в `try/catch` на `Prisma…P2002` → `revalidatePath(LIST_PATH)` → envelope `{ ok: true } | { ok: false; error }`. Redirect делает клиент (`router.push`).
- **`services/dto/category.dto.ts`** — эталон zod-DTO.
- **UI-примитивы** `components/admin/ui/`: `button, input, table, dialog, alert-modal, select, switch, dropdown-menu, data-table`. `switch.tsx` есть. `Heading` — `components/admin/heading.tsx`, `Icon` — `components/admin/icon.tsx`.
- **Гейт** `lib/admin/require-admin.ts`: `requireAdminAction()` (actions), `requireAdminPage()` (RSC через `(admin)/layout.tsx`).
- **Nav** `components/admin/admin-shell.tsx` — пункт `{ label: 'Marketing', href: '/admin/marketing', icon: 'campaign' }` уже есть, active-state по `pathname.startsWith`. **Nav не трогаем.**
- **Дизайн-система** `docs/admin-design-system.md`: только `bg-admin-*`/`text-admin-*` (никаких `dark:`), Radix-поповеры порталятся в `.admin-root`, деньги через `@/lib/format`, тексты на русском.
- **Тесты** `tests/` (vitest node-only): `admin-customers-action.test.ts`, `admin-orders-action.test.ts` — эталон мок-структуры. `coupon.test.ts` уже занят (storefront-lib).

## 3. Зафиксированные решения (юзер, 2026-06-14)

1. **Scope схемы:** чистый CRUD поверх 5 существующих полей. Без новых колонок.
2. **Маршрут/IA:** страница `/admin/marketing` САМА становится списком купонов (+ `/new`, `/[id]/edit`). Лишнего хопа нет, nav-href не меняется.
3. **Аффордансы списка:** поиск по `code` + фильтр статуса (active/inactive/expired). Без пагинации (купонов мало).
4. **Edit/Delete:** `code` редактируемый; Switch `active` для быстрого вкл/выкл; жёсткое удаление (FK нет → гард только «существует»).

## 4. Архитектура

### 4.1. Маршруты (route-group `(admin)`, гейт через `(admin)/layout.tsx`)

| Путь | Файл | Роль |
|---|---|---|
| `/admin/marketing` | `app/(admin)/admin/marketing/page.tsx` | **заменяет стаб** — RSC-список, `force-dynamic`, читает `?q=`, `?status=` |
| `/admin/marketing/new` | `app/(admin)/admin/marketing/new/page.tsx` | RSC-обёртка `<CouponForm />` |
| `/admin/marketing/[id]/edit` | `app/(admin)/admin/marketing/[id]/edit/page.tsx` | async `params`, `findUnique`, `notFound()`, `<CouponForm initial>` |

`new` (статичный сегмент) резолвится раньше `[id]` — коллизии нет.

### 4.2. Pure-хелпер статуса (client-safe) — `lib/coupon-status.ts`

`lib/coupon.ts` импортит prisma → клиентский остров не может тянуть его (грабли [[phase3.6-dashboard-state]]: `'use client'` не импортит prisma-модуль). Выносим чистую функцию в отдельный файл БЕЗ импорта prisma:

```ts
export type CouponStatus = 'active' | 'inactive' | 'expired';

// Чистая, без БД. now передаётся (детерминизм в тестах, единый источник на сервере).
export function couponStatus(
  c: { active: boolean; expiresAt: Date | null },
  now: Date,
): CouponStatus {
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return 'expired';
  if (!c.active) return 'inactive';
  return 'active';
}
```

Приоритет: **expired важнее inactive** (истёкший выключенный купон показываем «Expired» — это финальное состояние). Используют и серверный WHERE-фильтр (для бейджа на строке), и клиентский бейдж в таблице. Лейблы/тон бейджа — в самом компоненте таблицы (RU-строки + admin-токены), хелпер возвращает только enum.

### 4.3. DTO — `services/dto/coupon-admin.dto.ts`

```ts
import { z } from 'zod';

// code: латиница/цифры + дефис/подчёркивание между символами, начинается с буквы/цифры.
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]*$/;

export const couponSchema = z.object({
  code: z.string().trim().min(3, 'Код от 3 символов').max(32, 'Код до 32 символов')
    .regex(CODE_RE, 'Код: латиница в верхнем регистре, цифры, - и _'),
  percent: z.coerce.number().int('Целое число').min(1, 'От 1%').max(100, 'До 100%'),
  active: z.boolean().default(true), // вход всегда реальный boolean из RHF Switch; coerce не нужен (footgun на строке "false")
  // '' → null (бессрочный). Формат входа 'YYYY-MM-DD' из <input type="date">.
  expiresAt: z.string().trim().optional(),
});

export type CouponValues = z.infer<typeof couponSchema>;
```

Замечание: `code` валидируется в УЖЕ нормализованном виде (UPPERCASE) — `normalize()` в action прогоняет `normalizeCouponCode` ПЕРЕД `safeParse`, поэтому regex по `[A-Z]`. Парсинг `expiresAt` в `Date|null` — в action (см. 4.4), не в zod, чтобы держать DTO транспортно-чистым.

### 4.4. Server actions — `app/actions/admin/coupons.ts`

Envelope и паттерн 1:1 с `categories.ts`. `LIST_PATH = '/admin/marketing'`.

```ts
export type CouponActionResult = { ok: true } | { ok: false; error: string };

// '' / undefined → null (бессрочный). 'YYYY-MM-DD' → конец дня UTC 23:59:59.999.
// Купон валиден ВЕСЬ выбранный день: checkCoupon сравнивает expiresAt.getTime() < Date.now().
function parseExpiresAt(raw?: string): Date | null { … }   // невалидная дата → throw → action вернёт {ok:false}

function normalize(raw): { code, percent, active, expiresAt } // code через normalizeCouponCode
```

- `createCoupon(raw)` — gate → `normalize` → `couponSchema.safeParse` → `parseExpiresAt` → `prisma.coupon.create` в `try/catch P2002` («Код уже занят») → `revalidatePath` → `{ ok: true }`.
- `updateCoupon(id, raw)` — gate → `safeParse` → `findUnique` exists («Купон не найден») → `prisma.coupon.update` (`try/catch P2002`) → `revalidatePath`.
- `toggleCoupon(id, next: boolean)` — тонкий флип `active` из Switch в списке. gate → `update { active: next }` → `revalidatePath`. (Не гоняет полную форму.)
- `deleteCoupon(id)` — gate → `findUnique` exists → `prisma.coupon.delete` → `revalidatePath`. FK нет → доп. гарда не требуется.

Все — `'use server'`, ошибки только через envelope (api-error.ts — для route-handlers, тут не нужен).

### 4.5. Список — `app/(admin)/admin/marketing/page.tsx`

```ts
export const dynamic = 'force-dynamic';
// searchParams: Promise<SP> (Next 15) → await
// q → normalizeCouponCode(q) (коды в БД UPPERCASE → contains точный, case не теряется)
// status ∈ {active,inactive,expired} через readEnumParam(sp,'status',['active','inactive','expired'])
```

WHERE (`Prisma.CouponWhereInput`), `now = new Date()`:
- `q` → `code: { contains: UPPER(q) }`
- `status === 'active'`  → `{ active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }`
- `status === 'inactive'`→ `{ active: false }`
- `status === 'expired'` → `{ expiresAt: { lt: now } }`

`findMany({ where, orderBy: { createdAt: 'desc' } })` → маппинг строк (+ `status` через `couponStatus(c, now)`) → `<CouponTable rows q status />`. Заголовок — `Heading` + `Button asChild → /admin/marketing/new`. Пустое состояние — `<div>` (как Categories).

### 4.6. Клиентский список — `_components/coupon-table.tsx`

`'use client'`. Сырой `<Table>` (как Categories, не DataTable). Колонки: **Code · Percent (`{n}%`) · Status-бейдж · Expires · Created · Actions**.
- Фильтр-бар: pill-`Input` поиска (`q`, submit/debounce → `router.push('?q=…&status=…')`) + Radix `Select` статуса (All/Active/Inactive/Expired) → пишет `status` в URL. Select порталится в `.admin-root`.
- Status-бейдж по `row.status`: `active`=lime (`bg-admin-primary text-admin-on-primary`), `inactive`=`bg-admin-surface-high`, `expired`=`bg-admin-error/…` (или violet `secondary-container`). Pill `rounded-full text-xs font-bold`.
- Actions per row: inline `Switch` (`active`, `onCheckedChange → toggleCoupon(id, next)` → `router.refresh`), Edit-link → `/admin/marketing/[id]/edit`, Delete-кнопка → `AlertModal` confirm → `deleteCoupon` → на ошибке показать `res.error`, на успехе `router.refresh`.
- `Expires`: `formatExpiry(expiresAt)` — дата (`ru`) или «Бессрочный». `Created`: дата или `formatAddedAgo`.

### 4.7. Форма — `_components/coupon-form.tsx`

`'use client'`, `react-hook-form` + `zodResolver(couponSchema)`. Поля:
- `code` — `Input`, на blur приводим к UPPERCASE (визуально); финальную нормализацию делает action.
- `percent` — `Input type="number"` (1..100).
- `active` — `Switch` (controlled через `setValue`/`watch`), default `true`.
- `expiresAt` — `Input type="date"` (optional; на edit — `initial.expiresAt` срезать до `YYYY-MM-DD`).

Submit → `initial ? updateCoupon(id, values) : createCoupon(values)`; на `!ok` → `setServerError(res.error)`; на успех → `router.push('/admin/marketing')`. Кнопка `Button type="submit" loading={isSubmitting}`.

### 4.8. Карта файлов

**Новые:** `lib/coupon-status.ts`, `services/dto/coupon-admin.dto.ts`, `app/actions/admin/coupons.ts`, `app/(admin)/admin/marketing/new/page.tsx`, `app/(admin)/admin/marketing/[id]/edit/page.tsx`, `app/(admin)/admin/marketing/_components/coupon-table.tsx`, `app/(admin)/admin/marketing/_components/coupon-form.tsx`, `tests/coupon-status.test.ts`, `tests/admin-coupons-action.test.ts`.
**Изменяемые:** `app/(admin)/admin/marketing/page.tsx` (стаб → список).
**Не трогаем:** schema.prisma, lib/coupon.ts, checkout, admin-shell nav, seed.

## 5. Зависимости

Новых npm-пакетов НЕТ (RHF, zod, Radix select/switch уже стоят с 3.0–3.5). Переиспользуем: `normalizeCouponCode` (`lib/coupon.ts`), `requireAdminAction` (`lib/admin/require-admin.ts`), `readEnumParam`/`readSearchQuery` (`lib/admin/pagination.ts`), `formatPrice` не нужен (проценты, не деньги), UI-примитивы `components/admin/ui/*`.

## 6. Тестирование (vitest node-only)

- `tests/coupon-status.test.ts` — `couponStatus`: active (active+null-expiry), active (active+future-expiry), inactive (!active+null), expired (past-expiry перебивает active), expired перебивает inactive, граница `expiresAt === now`.
- `tests/admin-coupons-action.test.ts` (мок-структура как `admin-orders-action.test.ts`): для каждого экшена — gate non-admin → `{ok:false}` без prisma; `create`: zod-reject (percent 0/101, короткий code), happy-path (assert `normalizeCouponCode` дал UPPERCASE, `expiresAt` = end-of-day 23:59:59.999, `revalidatePath('/admin/marketing')`), P2002 → «Код уже занят»; `update`: not-found, happy; `toggleCoupon`: флип active; `delete`: not-found, happy (`prisma.coupon.delete` вызван).
- **UI** (table/form) — НЕ юнит-тестим (vitest node-only), проверка на Vercel preview.

Команды: `npx tsc --noEmit` (из `stride-app/`), `npx vitest run` (полный прогон). Локально prisma/e2e НЕ гоняем ([[never-run-db-against-neon-locally]]).

## 7. Риски и развязки

- **expiresAt end-of-day UTC.** «Истекает 2026-12-31» хранится как `…T23:59:59.999Z` → купон валиден весь день (для МСК даже +3ч лояльности, безвредно). Альтернатива (МСК-полночь) — overkill для MVP. **Решение: UTC end-of-day, задокументировано.**
- **Schema-guard.** Ничего в `prisma/schema.prisma` не меняем; финальная Task проверяет `git diff --stat origin/main -- stride-app/prisma/schema.prisma` = пусто.
- **client-safe split** статус-хелпера — обязателен (иначе prisma в клиентском бандле). Прецедент: `lib/admin/analytics-config.ts` в 3.6.
- **case поиска.** Коды в БД UPPERCASE; `q` нормализуем перед `contains` → не нужен Prisma `mode: 'insensitive'`.
- **Удаление активного купона.** FK нет → безопасно; старые заказы хранят строку `couponCode`. Confirm через `AlertModal` достаточно.

## 8. Точка продолжения

Spec утверждён → `writing-plans` (TDD, bite-sized tasks, по одному коммиту на task) → ветка `feat/phase3.7-coupons` (уже создана от main@c68ff89) → subagent-driven исполнение ([[subagent-parallel-sonnet]]) → 3 адверсар. ревью → preview + PR в web UI (gh не установлен). Финальная фаза Phase 3 — после мержа роадмап 3.0→3.7 закрыт.
