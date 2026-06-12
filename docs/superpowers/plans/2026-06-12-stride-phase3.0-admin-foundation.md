# P3.0 — Admin Foundation Implementation Plan

> **Ретроспективный план** (оформлен 2026-06-12 после реализации). Чекбоксы отмечены как выполненные;
> фиксирует фактический ход + коммиты + верификацию. Будущие фазы (3.1+) ведём проспективно
> (brainstorming → spec → writing-plans → executing-plans) ДО кода.

**Goal:** Фундамент админки ВНУТРИ stride: route-group `app/(admin)/admin/*`, гейт `role==='ADMIN'`,
изолированная light/dark тема, shared UI-примитивы, AdminShell, заглушки разделов, безопасный seed админа.

**Architecture:** Storefront → `app/(shop)/` (свой chrome), admin → `app/(admin)/` (свой shell+тема),
root слим до `<html><body>`+шрифты (URL не меняются). Гейт поверх Auth.js v5 `auth()` (бинарный ADMIN).
Тема — CSS-vars под `.admin-root`, dark = класс на wrapper'е, cookie-тоггл без `next-themes`. UI — на
`admin:` Tailwind-утилитах. Из pizza перенесены паттерны + `pagination`/`api-error`/data-table/warmup.

**Tech Stack:** Next 15.1.11, React 18.3, Prisma+Neon (WebSocket), Auth.js v5, Tailwind 3, vitest (node-only),
+deps `@tanstack/react-table`, `@radix-ui/react-{select,dropdown-menu,switch}`.

**Спека:** `docs/superpowers/specs/2026-06-12-stride-phase3.0-admin-foundation-design.md`
**Research:** `docs/superpowers/research/2026-06-12-phase3-admin-pizza-portability-audit.md`
**Ветка:** `feat/phase3.0-admin-foundation` (от `origin/main`). Коммиты: `6892935`, `ba9bfbd`, `b0c6bd6`.

---

## Инварианты (не нарушать)

- `auth.config.ts` / `middleware.ts` — edge-safe, без prisma/argon2; admin-ветка читает только `auth.user.role`.
- Только `app/layout.tsx` рендерит `<html>/<body>`; `(shop)`/`(admin)` layout'ы — фрагменты.
- Тема строго под `.admin-root`; storefront `:root`/`.btn`/`.inp`/`colors` не трогать; admin НЕ использует `dark:` варианты.
- vitest node-only (`tests/**/*.test.ts`); React/тема — typecheck+ручное.
- Build/seed локально на Neon НЕ гонять — CI/Vercel.

## Локальная верификация

`npm run typecheck` + `npx vitest run` (моки, без БД). `next build` — только на Vercel (SSG бьёт в Neon).
`next lint` не настроен в репо — пропускаем.

---

## Task 1: ветка + зависимости
- [x] Ветка `feat/phase3.0-admin-foundation` от `origin/main`.
- [x] `npm i @tanstack/react-table @radix-ui/react-select @radix-ui/react-dropdown-menu @radix-ui/react-switch`.

## Task 2: перенос storefront → `(shop)` + слим root (коммит `6892935`)
- [x] `git mv` в `app/(shop)/`: `(auth)`, `cart`, `catalog`, `checkout`, `legal`, `orders`, `product`, `profile`, `unsubscribe`, `wishlist`, `page.tsx` (16 renames).
- [x] `app/(shop)/layout.tsx` — chrome-фрагмент (PromoTopBar/SiteHeader/main/SiteFooter/VerificationGateHost).
- [x] `app/layout.tsx` — слим `<html><body>` + шрифты (+Anybody `--font-anybody`) + metadata.
- [x] `app/robots.ts` — `/admin` в disallow.
- [x] Верификация изолированно: `tsc` чисто (после `rm -rf .next` от stale-типов), vitest 235 зелёных.

## Task 3: admin-тема (коммит `ba9bfbd`)
- [x] `app/globals.css` — `@layer base`: `.admin-root` (light) + `.admin-root.dark` (dark) токены из прототипов;
  `.admin-root` гасит body-градиент + перебивает глобальный `* {border-color}`; Material Symbols rule.
- [x] `tailwind.config.ts` — `colors.admin.*` → `var(--admin-*)`; `font-admin-head`/`admin-body`.
  (Примечание: `--admin-bg` light = `#ffffff` из admin-main.html; свериться визуально vs `#f7f8f4`.)

## Task 4: гейт доступа (коммит `ba9bfbd`)
- [x] `lib/admin/require-admin.ts` — `requireAdminApi`/`requireAdminPage`/`requireAdminAction` (тип `Session|null`,
  т.к. `ReturnType<typeof auth>` берёт не ту перегрузку v5 — фикс при интеграции).
- [x] `auth.config.ts` — `/admin` ветка в `authorized()` (edge-safe).
- [x] `middleware.ts` — matcher += `/admin`, `/admin/:path*`.

## Task 5: порт lib + warmup (коммит `ba9bfbd`)
- [x] `lib/admin/pagination.ts` (порт), `lib/admin/api-error.ts` (stride-конверт `{message,issues}` + `apiZodError`/`apiInternalError`),
  `app/api/admin/health/warmup/route.ts` (`SELECT 1`, `force-dynamic`).

## Task 6: admin UI primitives (коммит `ba9bfbd`)
- [x] `components/admin/ui/`: button (вариант `outline`), input, table, data-table (порт tanstack), select,
  dropdown-menu, switch, dialog, alert-modal. `components/admin/`: icon, heading, theme-toggle. На `admin:` утилитах, без `dark:`.

## Task 7: AdminShell + layout + заглушки (коммит `ba9bfbd`)
- [x] `components/admin/admin-shell.tsx` — 280px sidebar (5 разделов, Material Symbols, active по `usePathname`) +
  topbar (search-stub/theme-toggle/profile+`signOut`).
- [x] `app/(admin)/layout.tsx` — server: `requireAdminPage()` + cookie `admin-theme` → `.admin-root[.dark]` wrapper +
  `<link>` Material Symbols + metadata + AdminShell.
- [x] Заглушки: `admin/page.tsx` (dashboard bento) + catalog/orders/customers/marketing + `loading.tsx` + `error.tsx` (Sentry).

## Task 8: seed (коммиты `ba9bfbd` → `b0c6bd6`)
- [x] `prisma/seed.ts` — env-gated admin-апсерт.
- [x] **Безопасный bootstrap** (`b0c6bd6`): `prisma/seed-admin.ts` (`upsertAdmin` без down()/truncate), seed.ts
  переиспользует; npm `prisma:seed-admin`; `.github/workflows/admin-seed.yml` (workflow_dispatch, секреты ADMIN_EMAIL/PASSWORD).

## Task 9: тесты (коммит `ba9bfbd`)
- [x] `tests/require-admin.test.ts` (9), `tests/admin-pagination.test.ts` (25), `tests/admin-api-error.test.ts` (18).

## Task 10: финальная верификация + пуш
- [x] `tsc` чисто; **vitest 287 зелёных** (44 файла, +52 admin).
- [x] 3 коммита, `git push -u origin feat/phase3.0-admin-foundation`.
- [ ] PR в web UI (заказчик; `gh` не установлен).
- [ ] Vercel preview build (первая реальная проверка `next build`) + e2e.yml on push.
- [ ] Завести GH-секреты `ADMIN_EMAIL`/`ADMIN_PASSWORD` → Actions → `admin-seed` (нацелив `POSTGRES_URL`) для бута админа.

---

## Acceptance

- Storefront URL без изменений (route-table = только +`/admin*`). ✅ (typecheck/тесты; финал — Vercel build).
- `tsc`/vitest зелёные. ✅
- Аноним `/admin`→`/login`; CUSTOMER→`/`; ADMIN→shell. ✅ (логикой; ADMIN-вход — после seed на preview).
- Тема light/dark тоггл без флика; storefront визуально не затронут. ✅ (по построению; визуал — на ревью).
- seed создаёт ровно одного ADMIN при заданных env, no-op иначе, re-run безопасен; прод-бут без сноса каталога. ✅

## Процессный вывод (почему план ретроспективный)

3.0 изначально велась через audit-workflow → AskUserQuestion → встроенный plan-mode (план в `.claude/plans/`,
вне репо), без артефактов `docs/superpowers/{research,specs,plans}`, как было в фазах 1–2. Пробел устранён
ретроспективно (этот набор из 3 доков). **С фазы 3.1 — полный цикл brainstorming → spec → writing-plans →
executing-plans с версионируемыми артефактами ДО кода.**
