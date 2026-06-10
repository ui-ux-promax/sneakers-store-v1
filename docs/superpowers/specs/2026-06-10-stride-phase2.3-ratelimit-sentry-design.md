# STRIDE — Фаза 2.3: реальный rate-limit (Upstash) + Sentry (errors-only) (design)

> Артефакт design-фазы. Дата: 2026-06-10. Слайс P2.3 (Infra-hardening).
> Предпосылка: P2.2c (email/newsletter) уже в main — `lib/rate-limit.ts` переписан под generic
> `makeLimiter` (Upstash sliding-window, lazy, fail-open) + реальные лимитеры login/verify/resend/newsletter.
> Этот слайс **достраивает** две оставшиеся NOOP-заглушки и добавляет Sentry с нуля.

## 1. Проблема и цель

**Rate-limit.** В `lib/rate-limit.ts` (на main) уже есть рабочий движок `makeLimiter` и реальные
лимитеры: `checkLoginRateLimit` (5/5м, ключ `ip:email`), `checkVerifyRateLimit` (10/10м),
`checkResendRateLimit` (5/1ч), `checkNewsletterRateLimit` (5/10м). Но **две заглушки всё ещё NOOP**:

- `checkAuthRateLimit(_ip)` — вызывается в `app/actions/auth.ts:25` (`registerUser`, анти-argon2-DoS),
  но возвращает `NOOP_RESULT` → троттлинга регистрации фактически нет.
- `checkCartRateLimit(_ip)` — возвращает NOOP **и не вызывается нигде** (POST `app/api/cart/route.ts`
  без лимита) → add-to-cart можно спамить.

**Sentry.** Наблюдаемость ошибок отсутствует: `lib/logger.ts` пишет только в `console.*` (JSON-строки).
Проглоченные `catch`-ошибки (`cart_get_failed`, `register_failed`, `auto_signin_after_register_failed`
и т.д.) нигде не агрегируются; прод-инциденты невидимы.

**Цель**: (1) сделать обе заглушки реальными лимитерами и подключить cart-лимит к роуту; (2) показать
пользователю отлуп лимита с обратным отсчётом (Retry-After); (3) поднять Sentry в режиме errors-only
(client + server + edge) с мостом из `logger.error`, не сломав edge-бандл middleware.

**Не-цель** (out of scope, явно): лимиты на DaData/checkout/wishlist/review/coupon и cart PATCH/DELETE;
Sentry performance-tracing и session-replay; back-in-stock; смена транспорта Upstash.

## 2. Контекст-якоря (проверено в коде на origin/main)

- `lib/rate-limit.ts`: `makeLimiter(slot, points, window, prefix)` — lazy-инициализация Upstash
  `Ratelimit.slidingWindow`, `isRateLimitConfigured()` (env `KV_REST_API_URL/TOKEN` ||
  `UPSTASH_REDIS_REST_URL/TOKEN`), `extractClientIp({headers})`. **Модуль НЕ импортирует `logger`** —
  его dynamic-import'ит `auth.config.ts` (edge-бандл middleware), а `logger`→`request-context` использует
  `eval('require')` для `node:async_hooks` (запрещён в Edge Runtime). Это инвариант — сохранить.
- `RateLimitResult = { success, remaining, reset }`. `reset` — epoch-ms (от Upstash).
- `app/actions/auth.ts` `registerUser` (P2.2c verification-gate): возвращает
  `{ ok:true, needsVerification:true } | { ok:false, error }`; вызывает `checkAuthRateLimit(ip)` ДО argon2
  (строки 22-24); есть дешёвая dup-проверка email перед хэшем; НЕ логинит — `setPending(email)` + `issueCode(email)`.
  Тест `tests/register-user.test.ts` уже содержит кейс лимита (#3: `success:false` → `ok:false`, без argon2/БД) — расширяем его.
- `app/api/cart/route.ts` `POST`: `runWithRequestContext` → `auth()` → resolve cart/variant → стоковые
  проверки → `cartItem` upsert → `recalcCartTotalByToken`. Ошибки → `logger.error` + 500.
- `store/cart.ts` `addCartItem`: `set({loading,error})`, при `catch` — `set({error:true}); throw e`
  (ошибка пробрасывается дальше). Стор хранит **boolean** `error`, не сообщение.
- `components/shared/product/purchase-panel.tsx` `onAdd`: `try { addCartItem } catch { /* стор выставит error */ }`
  — сейчас ошибка глотается, текст пользователю не показывается.
- `components/shared/auth/register-form.tsx`: показывает `res.error` в `<p role="alert">`; сабмит
  `loading={isSubmitting}`.
- `services/instance.ts`: axios, `baseURL = NEXT_PUBLIC_API_URL || '/api'`, `withCredentials`.
- `lib/logger.ts`: `emit(level, message, fields)` — скрабит PII (`scrubPii`) ДО вывода, `console.error`
  для `error`. `logger.error(message, err?, fields?)`.
- `lib/pii-scrub.ts`: `scrubPii(obj)` — есть, переиспользуем.
- `next.config.mjs`: `serverExternalPackages: [...@node-rs/argon2, @prisma/*, @neondatabase, ws,
  @upstash/ratelimit, @upstash/redis]`; `webpack(config,{nextRuntime})` для `edge` ставит alias
  этих пакетов в `false`; `headers()` (security); `images.remotePatterns`.
- `middleware.ts` → `auth.config.ts` (edge). `auth.config.ts` **не** импортирует `logger`. Инвариант.
- `constants/config.ts`: единый источник бизнес-чисел (паттерн для новых констант лимитов).
- Нет toast-системы; нет `instrumentation*.ts`/`sentry*.config.ts`/`app/global-error.tsx`.
- Версии: Next 15.1.11 (webpack-билд, не turbopack), React 18.3, `@upstash/*` установлены, `@sentry/nextjs` — нет.

## 3. Rate-limit: достройка заглушек

### 3.1 `checkAuthRateLimit` (register)

`lib/rate-limit.ts`: заменить NOOP-тело на `makeLimiter` с собственным слотом.

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| ключ     | `ip` (как сейчас передаётся из `registerUser`) | анти-argon2-DoS — лимит на источник |
| окно     | `AUTH_RATE_LIMIT` = **5 / 10 мин** на IP | регистрация — редкое легит-действие; dup-проверка email уже отсекает спам существующих |
| prefix   | `stride-app:auth` | пространство ключей Upstash |
| fail-open| да (нет Upstash → `success`) | согласовано с login/verify/... |

Дешёвая dup-проверка email ДО argon2 остаётся (defense-in-depth) — лимит её дополняет, не заменяет.

### 3.2 `checkCartRateLimit` (add-to-cart) + подключение

`lib/rate-limit.ts`: NOOP → `makeLimiter`.

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| ключ     | `ip` | add-to-cart до логина, токен корзины подделываем легко → IP надёжнее |
| окно     | `CART_RATE_LIMIT` = **60 / 1 мин** на IP | щедро: бёрст добавлений нормален; режет только явный абуз |
| prefix   | `stride-app:cart` | |
| fail-open| да | |

`app/api/cart/route.ts` `POST`: в начале `runWithRequestContext` (после получения `req`, до тяжёлой
работы) — `const ip = extractClientIp(req); const rl = await checkCartRateLimit(ip);` и при `!rl.success`
вернуть 429 (см. §4). GET/PATCH/DELETE — не трогаем (выбран минимальный охват).

## 4. 429 UX + Retry-After (выбран таймер обратного отсчёта)

### 4.1 Серверный хелпер `lib/rate-limit-response.ts` (новый)

```ts
import { NextResponse } from 'next/server';
import type { RateLimitResult } from './rate-limit';

// reset — epoch-ms; now() через Date.now() допустим в рантайме (не в workflow-скрипте).
export function retryAfterSeconds(reset: number): number {
  return Math.max(0, Math.ceil((reset - Date.now()) / 1000));
}

export function tooManyRequests(result: RateLimitResult, message = 'Слишком много запросов'): NextResponse {
  const retryAfterSec = retryAfterSeconds(result.reset);
  return NextResponse.json(
    { message, retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
```

`retryAfterSeconds` — чистая, юнит-тестируемая. Модуль импортирует `next/server` → только Node-роуты
(не edge), `logger` не тянет.

### 4.2 Register (server action)

`app/actions/auth.ts`: расширить контракт
`RegisterResult = { ok:true; needsVerification:true } | { ok:false; error:string; retryAfterSec?: number }`
(success-ветку P2.2c НЕ трогаем).
При `!limit.success` вернуть `{ ok:false, error:'Слишком много попыток. Попробуйте позже', retryAfterSec: retryAfterSeconds(limit.reset) }`.
(Импорт `retryAfterSeconds` из `lib/rate-limit-response` безопасен — action в Node.)

`components/shared/auth/register-form.tsx`: при `res.retryAfterSec` запустить обратный отсчёт
(`useCountdown`), показывать в `<p role="alert">` текст `Слишком много попыток. Попробуйте через N сек`
и держать сабмит `disabled` пока `N > 0`.

### 4.3 Cart (API route → client)

- Роут возвращает `tooManyRequests(rl, 'Слишком часто. Попробуйте позже')` (см. §3.2).
- `purchase-panel.tsx` `onAdd`: в `catch (e)` распознать axios-429
  (`axios.isAxiosError(e) && e.response?.status === 429`), прочитать `e.response.data.retryAfterSec`,
  показать inline-сообщение под кнопкой «В корзину» и держать кнопку `disabled` через `useCountdown`.
  (Стор `store/cart.ts` менять не нужно — он уже `throw e`; обработка на уровне панели.)

### 4.4 Общий хук `hooks/use-countdown.ts` (новый)

```ts
'use client';
import { useEffect, useState } from 'react';

// Возвращает оставшиеся секунды; тикает к нулю. start(sec) перезапускает.
export function useCountdown(): { seconds: number; start: (sec: number) => void } {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return { seconds, start: setSeconds };
}
```

Без новой UI-эстетики — текст в существующих классах (`text-danger text-xs/text-sm`), стиль Stride.

## 5. Sentry (errors-only)

### 5.1 Принципы

- `tracesSampleRate: 0`, **без** `replayIntegration`, `sendDefaultPii: false`.
- `enabled: Boolean(dsn)` — без DSN Sentry полностью выключен (fail-open, как rate-limit). CI/preview
  без секретов зелёные.
- Edge-инвариант: отдельный `sentry.edge.config.ts` (edge-совместимый SDK); не тянуть Node-API в edge.

### 5.2 Файлы (ручная установка, без wizard)

| Файл | Содержимое |
|------|------------|
| `sentry.server.config.ts` | `Sentry.init({ dsn: process.env.SENTRY_DSN, enabled, tracesSampleRate:0, sendDefaultPii:false })` |
| `sentry.edge.config.ts` | то же, `dsn: process.env.SENTRY_DSN` (edge runtime) |
| `instrumentation-client.ts` | `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, enabled, tracesSampleRate:0 })` + `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart` |
| `instrumentation.ts` | `register()` импортирует server/edge config по `NEXT_RUNTIME`; `export const onRequestError = Sentry.captureRequestError` |
| `app/global-error.tsx` | `'use client'`; в `useEffect` → `Sentry.captureException(error)`; reset-UI в стиле проекта (`<button onClick={reset}>`) |

### 5.3 `next.config.mjs` — обёртка

Обернуть экспорт в `withSentryConfig(nextConfig, options)`, **сохранив** существующие
`serverExternalPackages`, `webpack`-fn (edge-алиасы), `headers`, `images`. Options (минимум):
`{ silent: true, widenClientFileUpload: true, org, project }`. Source-map upload — best-effort: без
`SENTRY_AUTH_TOKEN` билд не падает (Sentry-плагин просто не загружает карты).

```js
import { withSentryConfig } from '@sentry/nextjs';
// ... const nextConfig = { ... } (без изменений)
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

### 5.4 Мост `logger.error` → Sentry

`lib/logger.ts`: в `emit`, при `level === 'error'`, после `console.error` →
`Sentry.captureException(err ?? new Error(message), { tags: { event: message }, extra: safeFields })`.
`safeFields` уже прошли `scrubPii` (PII не утекает). `captureException` — noop без init (DSN нет).

**Edge-безопасность**: `logger` импортируется только в Node-путях (роуты/actions/RSC); `auth.config.ts`
и `middleware.ts` его НЕ импортируют (проверено). `@sentry/nextjs` изоморфен. Инвариант «edge-бандл не
тянет logger» сохраняется. (Если линт/билд выявит протечку — fallback: вынести мост в отдельный
`lib/report-error.ts` и звать его рядом с `logger.error` в Node-коде; но базовый план — прямо в logger.)

### 5.5 PII

`sendDefaultPii: false` (cookies/headers/ip не шлются по умолчанию). Наш `logger`-мост передаёт уже
скрабленные поля. Auto-captured ошибки (onRequestError/global-error) — без доп. полей. Доп. `beforeSend`
со `scrubPii` — опционально (если в плане окажется дёшево); базово достаточно `sendDefaultPii:false`.

## 6. Константы и env

`constants/config.ts` — добавить:
```ts
export const AUTH_RATE_LIMIT = { points: 5, window: '10 m' } as const;  // регистрация на IP
export const CART_RATE_LIMIT = { points: 60, window: '1 m' } as const;  // add-to-cart на IP
```
(тип `window` — шаблон `` `${number} ${'s'|'m'|'h'}` `` совместим с `makeLimiter`.)

**env** (никаких значений в репозиторий):
- Upstash — через **Vercel Marketplace** (Upstash Redis integration) → `KV_REST_API_URL`/`KV_REST_API_TOKEN`
  проставляются авто в Preview/Prod. Код уже читает их (и fallback `UPSTASH_REDIS_REST_*`).
- Sentry — `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` (одинаковые DSN), опц. `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN` (source maps, билд-тайм).
- Заметка в README/`.env.example` про переменные.

## 7. Тестирование

**Инвариант проекта**: vitest `environment: 'node'`, `include: ['tests/**/*.test.ts']` — тестируется
**только чистая логика** (`.test.ts`, node). Компонентных/хук-тестов в проекте НЕТ (UI проверяется
Playwright e2e + вручную). План этому следует: React-части (`useCountdown`, формы) — НЕ vitest.

| Тест | Файл | Проверяет |
|------|------|-----------|
| fail-open без env | `tests/rate-limit.test.ts` (новый) | `checkAuthRateLimit`/`checkCartRateLimit` → `success:true` когда Upstash не сконфигурён (vitest env не задаёт `KV_REST_API_*`) |
| `retryAfterSeconds` | `tests/rate-limit-response.test.ts` (новый) | `reset` в прошлом → 0; `Date.now()+30000` → 30; округление вверх |
| register лимит | `tests/register-user.test.ts` (расширить кейс #3) | мок `checkAuthRateLimit`→`{success:false,reset}`: `registerUser` вернул `{ok:false, retryAfterSec≥0}`, argon2/`findUnique` НЕ вызваны |

**React-части** (`hooks/use-countdown.ts`, `register-form.tsx`, `purchase-panel.tsx`, `app/global-error.tsx`)
и **Sentry-конфиги** — декларативны/UI; проверяются `typecheck` + `build` + ручным чек-листом. Хук
`useCountdown` держим тривиальным (логика тика очевидна) — отдельный jsdom-сетап ради него не вводим
(YAGNI, не ломаем node-only suite).

**E2E** — пропускаем (нужен живой Upstash redis + детерминизм окна). Ручной чек-лист (в плане):
спам-регистрация → текст с таймером; спам add-to-cart → 429 + отсчёт; прод-проверка одного Sentry-события.

## 8. Файловая карта изменений

**Изменить:**
- `lib/rate-limit.ts` — 2 заглушки → реальные лимитеры (+2 слота).
- `app/api/cart/route.ts` — rate-limit gate в `POST`.
- `app/actions/auth.ts` — `RegisterResult.retryAfterSec`, проброс из лимита.
- `components/shared/auth/register-form.tsx` — таймер + disabled.
- `components/shared/product/purchase-panel.tsx` — обработка 429 + таймер.
- `lib/logger.ts` — мост в Sentry.
- `next.config.mjs` — `withSentryConfig` (сохранить webpack/serverExternalPackages).
- `constants/config.ts` — константы лимитов.
- `tests/register-user.test.ts` — кейс лимита.
- `README`/`.env.example` — переменные.

**Создать:**
- `lib/rate-limit-response.ts`, `hooks/use-countdown.ts`.
- `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`,
  `app/global-error.tsx`.
- `tests/rate-limit-response.test.ts`, `tests/rate-limit.test.ts`.

**Зависимость:** `@sentry/nextjs` (prod dep).

## 9. Риски и развязки

1. **`withSentryConfig` × ручной edge-webpack.** Обёртка должна сохранить наш `webpack(config,{nextRuntime})`.
   Проверка: `next build` + grep edge-бандла на отсутствие argon2/prisma/upstash (как в P1/P16 troubleshooting).
   Развязка: если Sentry-плагин конфликтует с alias — задать порядок (наш webpack-fn внутри объекта,
   Sentry оборачивает снаружи; обычно совместимо).
2. **`logger` протекает в edge через Sentry-импорт.** Маловероятно (logger не в edge-графе), но если
   билд edge упадёт `UnhandledSchemeError`/подобное — fallback из §5.4 (отдельный `report-error`).
3. **Upstash не сконфигурён в CI.** Fail-open → лимиты неактивны, тесты зелёные. Боевая проверка лимитов —
   только на preview/prod с env (ручной чек-лист).
4. **Шумный Sentry от ожидаемых ошибок** (например 404/валидация). errors-only + мост только из
   `logger.error` (а не warn/info) → шум ограничен реальными сбоями.

## 10. Точка продолжения

После твоей вычитки — `superpowers:writing-plans` → план в `docs/superpowers/plans/2026-06-10-stride-phase2.3-ratelimit-sentry.md`,
затем subagent-driven исполнение (TDD), code-review, PR.
