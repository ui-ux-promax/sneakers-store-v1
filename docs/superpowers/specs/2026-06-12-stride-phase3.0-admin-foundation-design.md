# STRIDE — Фаза 3.0: Admin Foundation (design)

> Артефакт design-фазы (ретроспективный — оформлен 2026-06-12 после реализации, фиксирует фактически
> принятый дизайн). Слайс P3.0 (фундамент админки). Предпосылка: P2.3 (rate-limit + Sentry) в main.
> Research: `docs/superpowers/research/2026-06-12-phase3-admin-pizza-portability-audit.md`.

## 1. Проблема и цель

stride-app (storefront) не имеет админки. Нужен фундамент, на котором встанут доменные фазы 3.1–3.7
(images, categories, products, orders, customers, dashboard, coupons). Эталон pizza-admin даёт паттерны,
но это отдельное приложение на устаревшем стеке (next-auth v4 / Int-id / плоский каталог) — копировать
файлами нельзя (см. research).

**Цель P3.0**: каркас админки ВНУТРИ stride с гейтом `role==='ADMIN'`, изолированной light/dark темой,
shared UI-примитивами, оболочкой (sidebar+topbar), заглушками разделов и безопасным посевом первого админа.
Доменных фич здесь нет.

**Не-цель** (out of scope, явно): любые CRUD/доменные экраны (каталог/заказы/клиенты/купоны/дашборд —
фазы 3.1+); image-пайплайн (3.1); recharts; миграции схемы (enum `UserRole.ADMIN` уже есть → только seed);
гранулярный RBAC (только бинарный ADMIN).

## 2. Контекст-якоря (проверено в коде на момент старта)

- **Один root `app/layout.tsx`** оборачивает всё в storefront-chrome (`PromoTopBar`/`SiteHeader`/`SiteFooter`/
  `VerificationGateHost`); globals.css — light-only `:root` токены + lime-градиент на `body` + глобальный
  `* { border-color }`. Admin не должен наследовать ни chrome, ни эти базовые стили.
- **Auth.js v5**: `auth.ts` (`{ handlers, auth, signIn, signOut }`), `auth.config.ts` (`authorized()` колбэк —
  редиректит залогиненных с /login,/register; защищает /profile,/checkout,/orders), `middleware.ts` (matcher).
  `types/next-auth.d.ts`: `session.user.role: 'CUSTOMER'|'ADMIN'` (jwt+session колбэки готовы). `auth.config.ts`
  edge-safe (без prisma/argon2 — они alias'ятся в `false` для edge в next.config). **Инвариант сохранить.**
- **prisma** (`lib/prisma-client.ts`): Neon **WebSocket**-транспорт (`PrismaNeon`) — поддерживает
  `$transaction`/nested/createMany; `retryOnTransient` встроен. Импорт `@/lib/prisma-client`.
- **UI stride**: cva `Button` (`.btn-*`, БЕЗ варианта `outline`), `Input` (`.inp`), `Badge` — на storefront-warm
  токенах. `cn` (`@/lib/utils`), `formatPrice`→₽ (`lib/format.ts`), `hashPassword` argon2 (`lib/password.ts`).
- **seed** (`prisma/seed.ts`): `main()` = `down()` (TRUNCATE каталог/корзину, **НЕ User**) + `up()`; идемпотентные
  upsert. `User.passwordHash` (НЕ `password`). Gate входа требует `emailVerified` (lib/auth-credentials).
- **CI/deploy**: `vercel.json` buildCommand = `prisma db push --skip-generate && next build` (Vercel пушит схему
  на каждый деплой). `.github/workflows`: `e2e.yml` (on push: prisma:push + prisma:seed + e2e), `db-push.yml`
  (manual). `next lint` НЕ настроен (нет eslint в devDeps). Build/seed локально на Neon — НЕ гонять (Windows hang).
- Отсутствуют: cloudinary/recharts/next-themes; `@tanstack/react-table`; `@radix-ui/react-{select,dropdown-menu,switch}`.

## 3. Архитектура

### 3.1 Изоляция layout — route-groups (решение заказчика)

Storefront-страницы переезжают в `app/(shop)/` со своим chrome-layout; админка — `app/(admin)/` со своим;
root худеет до `<html><body>` + шрифты. **URL не меняются** (группы невидимы в пути). Альтернатива
(условный chrome через middleware-header в root) отвергнута — делала бы root dynamic (перф-штраф всему storefront).

- `app/layout.tsx` (слим): `<html className={manrope+unbounded+anybody}><body className="font-sans">{children}</body></html>` + metadata.
- `app/(shop)/layout.tsx`: фрагмент с chrome (PromoTopBar/SiteHeader/main/SiteFooter/VerificationGateHost). НЕ `<html>`.
- `app/(admin)/layout.tsx`: server, `requireAdminPage()` + чтение cookie темы + `.admin-root` wrapper + AdminShell. НЕ `<html>`.

**Безопасность переноса** (проверено): все `@/app/*` импорты → `actions/`+`api/` (остаются в root); относительных
sibling-импортов в страницах нет; e2e/тесты — на URL-строках (group-invisible); `(shop)/(auth)/login` → URL `/login`.

### 3.2 Тема (scoped, не трогает storefront)

CSS-vars под `.admin-root`, тёмная — класс `dark` на самом wrapper'е (`.admin-root.dark`), НЕ на `<html>`
(изоляция от storefront `darkMode:['class']`). Палитры из двух прототипов. `.admin-root` гасит lime-градиент
body (`background: var(--admin-bg)`) и перебивает глобальный `* {border-color}`. Material Symbols `font-variation-settings`.
Tailwind: namespace `colors.admin.*` → `var(--admin-*)`, `font-admin-head` (Anybody) / `admin-body` (Manrope).
**Токены сами свопаются через CSS-var на `.admin-root.dark` → Tailwind `dark:` варианты НЕ используются.**
Тоггл — cookie `admin-theme` + класс на `.admin-root` (без `next-themes`; default light; SSR читает cookie → нет флика).

### 3.3 Гейт (бинарный ADMIN)

- `lib/admin/require-admin.ts` — 3 флавора над `auth()`: `requireAdminApi()` (→401/403 NextResponse|null),
  `requireAdminPage()` (→redirect `/login?callbackUrl=/admin` аноним / `/` customer), `requireAdminAction()`
  (→`{ok:false,error}`|`{ok:true,session}`).
- `auth.config.ts` — ветка `/admin` в `authorized()` ПЕРЕД storefront-блоком, edge-safe (только `auth.user.role`):
  не залогинен→`false`; не ADMIN→`Response.redirect('/')`; иначе `true`.
- `middleware.ts` — matcher += `/admin`, `/admin/:path*`.
- Не-ADMIN на `/admin` → **redirect `/`** (не 404): гейт обеспечивают middleware+RSC, redirect — UX.
- Вход админа — через storefront `/login`, затем `/admin` (отдельной admin-login в 3.0 нет).

### 3.4 Shared UI + Shell

`components/admin/ui/*`: button (вариант `outline` для data-table), input, table, data-table (порт tanstack),
select/dropdown-menu/switch (radix), dialog, alert-modal. `components/admin/`: icon (Material Symbols),
heading (Anybody), theme-toggle, admin-shell (280px sidebar: Dashboard/Catalog/Orders/Customers/Marketing +
topbar: search-stub/theme-toggle/profile+signOut). На `admin:` утилитах, БЕЗ глобальных `.btn`/`.inp`.

### 3.5 Порт инфра

`lib/admin/pagination.ts` (порт почти как есть), `lib/admin/api-error.ts` (в stride-конверт `{message, issues}`,
не pizza `{message,details}`), `app/api/admin/health/warmup/route.ts` (Neon `SELECT 1`).

### 3.6 Seed первого админа (безопасно)

`prisma/seed-admin.ts` — `upsertAdmin(prisma, email, password)`: идемпотентный upsert ADMIN **без down()/truncate**
(безопасно на любой БД, вкл. прод), `passwordHash` (argon2), `emailVerified` сразу (пройти hard-gate).
Основной `seed.ts` переиспользует `upsertAdmin` (env-gated). npm `prisma:seed-admin` + workflow `admin-seed.yml`
(workflow_dispatch, секреты `ADMIN_EMAIL`/`ADMIN_PASSWORD`). **Полный `prisma:seed` на прод ОПАСЕН** (down()
TRUNCATE каталога) — для прод-админа только `seed-admin`.

## 4. Зависимости

`@tanstack/react-table`, `@radix-ui/react-{select,dropdown-menu,switch}` (prod). Cloudinary/recharts — фазы 3.1/3.6.

## 5. Тестирование

Инвариант: vitest `environment:'node'`, `tests/**/*.test.ts`, только чистая логика (UI — e2e/ручное).
- `tests/require-admin.test.ts` — 3 флавора × (anon/customer/admin), мок `@/auth` + `next/navigation`.
- `tests/admin-pagination.test.ts` — defaults/clamps/skip/meta/readEnum.
- `tests/admin-api-error.test.ts` — stride-конверт `{message,issues}`, `apiZodError`→flatten, `apiInternalError`→logger.
React-части (shell/theme-toggle/UI) — typecheck + ручная проверка. Build/e2e — CI/preview (Neon).

## 6. Риски и развязки

1. **Перенос storefront ломает маршруты** → проверено grep'ом (импорты на actions/api, URL-строки в тестах);
   финальная страховка — route-table в `next build` на Vercel.
2. **Тема протекает в storefront** → всё под `.admin-root`, `dark` на wrapper'е (не html), storefront `:root` не тронут.
3. **v4-идиомы из pizza** (getServerSession/useSession) → не портим auth вовсе, гейт поверх v5 `auth()`.
4. **Денорм-дрейф каталога** (3.3) → вне 3.0; зафиксировано как инвариант для будущих write-путей.
5. **seed сносит прод-каталог** → отдельный `seed-admin` без truncate; полный seed на прод не гонять.
6. **next lint не настроен** → верификация на typecheck+vitest; не вводим eslint в этом слайсе.

## 7. Точка продолжения

→ plan `docs/superpowers/plans/2026-06-12-stride-phase3.0-admin-foundation.md`.
