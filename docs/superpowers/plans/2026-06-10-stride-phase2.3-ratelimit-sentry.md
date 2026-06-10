# P2.3 — реальный rate-limit (Upstash) + Sentry (errors-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Достроить две NOOP-заглушки rate-limit до реальных Upstash-лимитеров (register + add-to-cart), показать пользователю отлуп лимита с обратным отсчётом, и поднять Sentry errors-only (client/server/edge) с мостом из `logger.error`.

**Architecture:** Rate-limit достраивается поверх готового `makeLimiter` (P2.2c) — те же lazy + fail-open паттерны. 429-ответ — общий хелпер; UI-таймер — общий хук `useCountdown`. Sentry — ручная установка (4 init-файла + `withSentryConfig`), `enabled` по наличию DSN (fail-open как rate-limit), edge-инвариант middleware сохранён.

**Tech Stack:** Next 15.1.11 (webpack-билд), React 18.3, `@upstash/ratelimit`/`@upstash/redis` (установлены), `@sentry/nextjs` (новый), vitest (node-only, `.test.ts`), axios.

**Спека:** `docs/superpowers/specs/2026-06-10-stride-phase2.3-ratelimit-sentry-design.md`
**Ветка:** `feat/phase2.3-ratelimit-sentry` (от `origin/main`).

---

## Инварианты (не нарушать)

- `lib/rate-limit.ts` **НЕ импортирует `logger`** — его dynamic-import'ит `auth.config.ts` (edge-бандл). Логов в нём нет.
- `auth.config.ts` / `middleware.ts` **НЕ импортируют `logger`** → `logger` остаётся Node-only (поэтому мост в Sentry в нём безопасен).
- `next.config.mjs` `webpack`-fn глушит в edge: argon2/prisma/neon/ws/upstash/**crypto** — `withSentryConfig` обязан сохранить весь объект.
- vitest: `environment: 'node'`, `include: ['tests/**/*.test.ts']` — только чистая логика. React/Sentry-конфиги — НЕ vitest (typecheck/build/manual).

## Локальная верификация (важно)

- Локально: `npm run typecheck` (tsc, без БД) и `npx vitest run <file>` (моки, без БД). Команды — из `stride-app/`.
- **`next build` НЕ гонять локально** — SSG каталога бьёт в Neon (зависает, см. memory «Never run DB against Neon locally»). Build + e2e + edge-бандл-чек + Sentry source-maps — только в CI/Vercel (push).
- Upstash env в CI нет → лимиты fail-open, тесты зелёные. Реальное лимитирование — ручной чек на preview/prod.

---

## Task 1: 429-хелпер `lib/rate-limit-response.ts` (+ тест)

**Files:**
- Create: `stride-app/lib/rate-limit-response.ts`
- Test: `stride-app/tests/rate-limit-response.test.ts`

Содержит обе функции: чистую `retryAfterSeconds` (импортируется в action — поэтому файл должен грузиться в vitest; тест это и доказывает) и `tooManyRequests` (для API-роута).

- [ ] **Step 1: Написать падающий тест**

`stride-app/tests/rate-limit-response.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { retryAfterSeconds, tooManyRequests } from '@/lib/rate-limit-response';

describe('retryAfterSeconds', () => {
  it('reset в прошлом → 0', () => {
    expect(retryAfterSeconds(0)).toBe(0);
    expect(retryAfterSeconds(Date.now() - 5000)).toBe(0);
  });
  it('reset через ~30с → 30 (округление вверх)', () => {
    const v = retryAfterSeconds(Date.now() + 29_400);
    expect(v).toBeGreaterThanOrEqual(29);
    expect(v).toBeLessThanOrEqual(31);
  });
});

describe('tooManyRequests', () => {
  it('429 + Retry-After + JSON {message, retryAfterSec}', async () => {
    const res = tooManyRequests({ success: false, remaining: 0, reset: Date.now() + 10_000 }, 'Слишком часто');
    expect(res.status).toBe(429);
    const ra = Number(res.headers.get('Retry-After'));
    expect(ra).toBeGreaterThanOrEqual(9);
    const body = await res.json();
    expect(body.message).toBe('Слишком часто');
    expect(body.retryAfterSec).toBeGreaterThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/rate-limit-response.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rate-limit-response'`.

- [ ] **Step 3: Реализовать**

`stride-app/lib/rate-limit-response.ts`:
```ts
import { NextResponse } from 'next/server';
import type { RateLimitResult } from './rate-limit';

// reset — epoch-ms (от Upstash). Date.now() допустим в рантайме.
export function retryAfterSeconds(reset: number): number {
  return Math.max(0, Math.ceil((reset - Date.now()) / 1000));
}

// 429 для API-роутов: тело { message, retryAfterSec } + заголовок Retry-After (сек).
export function tooManyRequests(result: RateLimitResult, message = 'Слишком много запросов'): NextResponse {
  const retryAfterSec = retryAfterSeconds(result.reset);
  return NextResponse.json(
    { message, retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npx vitest run tests/rate-limit-response.test.ts`
Expected: PASS (2 файла, 3 теста). Доказывает, что `next/server` грузится в vitest → импорт в server-action безопасен.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/rate-limit-response.ts stride-app/tests/rate-limit-response.test.ts
git commit -m "feat(stride): rate-limit 429 response helper (retryAfterSeconds + tooManyRequests)"
```

---

## Task 2: реальные `checkAuthRateLimit` / `checkCartRateLimit` + константы (+ fail-open guard)

**Files:**
- Modify: `stride-app/constants/config.ts` (добавить константы в конец)
- Modify: `stride-app/lib/rate-limit.ts` (две NOOP → makeLimiter)
- Test: `stride-app/tests/rate-limit.test.ts` (новый, fail-open guard)

> Примечание TDD: при ОТСУТСТВИИ Upstash-env выход NOOP и реального лимитера идентичен (`success:true`) → red-green-перехода для свопа нет. Тест — **регрессионный guard** (без env не падаем, не отказываем). Реальное лимитирование проверяется вручную с Upstash (чек-лист Task 11).

- [ ] **Step 1: Добавить константы лимитов**

`stride-app/constants/config.ts` — в конец файла:
```ts
// --- P2.3 Rate-limit (Upstash sliding-window) ---
// window — шаблон `${number} ${'s'|'m'|'h'}`, совместимый с makeLimiter (lib/rate-limit.ts).
export const AUTH_RATE_LIMIT = { points: 5, window: '10 m' } as const;  // регистрация на IP (анти-argon2-DoS)
export const CART_RATE_LIMIT = { points: 60, window: '1 m' } as const;  // add-to-cart на IP (щедро; режет абуз)
```

- [ ] **Step 2: Написать guard-тест**

`stride-app/tests/rate-limit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkAuthRateLimit, checkCartRateLimit } from '@/lib/rate-limit';

// vitest env НЕ задаёт KV_REST_API_* → isRateLimitConfigured()=false → fail-open.
describe('rate-limit fail-open без Upstash', () => {
  it('checkAuthRateLimit → success', async () => {
    expect((await checkAuthRateLimit('1.2.3.4')).success).toBe(true);
  });
  it('checkCartRateLimit → success', async () => {
    expect((await checkCartRateLimit('1.2.3.4')).success).toBe(true);
  });
});
```

- [ ] **Step 3: Запустить — должен пройти уже сейчас (NOOP)**

Run: `npx vitest run tests/rate-limit.test.ts`
Expected: PASS (NOOP сейчас тоже возвращает success). Это guard — фиксирует контракт ДО свопа.

- [ ] **Step 4: Заменить NOOP-тела на makeLimiter**

`stride-app/lib/rate-limit.ts`:

4a. Вверху файла добавить импорт констант (constants/config.ts — чистый, edge-safe):
```ts
import { AUTH_RATE_LIMIT, CART_RATE_LIMIT } from '@/constants/config';
```

4b. Заменить функцию `checkCartRateLimit` (NOOP) на:
```ts
const cartSlot = { v: null as Limiter };
export async function checkCartRateLimit(ip: string): Promise<RateLimitResult> {
  const l = await makeLimiter(cartSlot, CART_RATE_LIMIT.points, CART_RATE_LIMIT.window, 'stride-app:cart');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(ip);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
```

4c. Заменить функцию `checkAuthRateLimit` (NOOP) на:
```ts
const authSlot = { v: null as Limiter };
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  const l = await makeLimiter(authSlot, AUTH_RATE_LIMIT.points, AUTH_RATE_LIMIT.window, 'stride-app:auth');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(ip);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
```

> `Limiter`, `makeLimiter`, `NOOP_RESULT`, `getEnv`, `isRateLimitConfigured` уже определены в файле (P2.2c). Слоты `cartSlot`/`authSlot` объявлять РЯДОМ со своими функциями (после `makeLimiter`). Старые комментарии «Фаза 1 заглушён»/«fail-open NOOP» над функциями — удалить/заменить актуальным однострочником.

- [ ] **Step 5: Запустить guard + typecheck — зелёно**

Run: `npx vitest run tests/rate-limit.test.ts && npm run typecheck`
Expected: PASS; tsc без ошибок (литералы `'10 m'`/`'1 m'` присваиваемы к window-типу makeLimiter).

- [ ] **Step 6: Commit**

```bash
git add stride-app/constants/config.ts stride-app/lib/rate-limit.ts stride-app/tests/rate-limit.test.ts
git commit -m "feat(stride): real Upstash limiters for register + add-to-cart (fill NOOP stubs)"
```

---

## Task 3: подключить cart-лимит к `POST /api/cart`

**Files:**
- Modify: `stride-app/app/api/cart/route.ts` (только `POST`)

- [ ] **Step 1: Добавить импорты**

В шапку `stride-app/app/api/cart/route.ts`:
```ts
import { extractClientIp, checkCartRateLimit } from '@/lib/rate-limit';
import { tooManyRequests } from '@/lib/rate-limit-response';
```

- [ ] **Step 2: Гейт в начале `POST` (внутри `runWithRequestContext`, в начале `try`)**

Первой строкой `try {` в `POST` (до `auth()`):
```ts
      const ip = extractClientIp(req); // NextRequest.headers: Headers
      const rl = await checkCartRateLimit(ip);
      if (!rl.success) return tooManyRequests(rl, 'Слишком часто. Попробуйте позже');
```
GET/PATCH/DELETE — не трогать (выбран минимальный охват).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`extractClientIp({headers})` принимает `req` — у `NextRequest` есть `.headers: Headers`.)

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/api/cart/route.ts
git commit -m "feat(stride): rate-limit gate on POST /api/cart (429 + Retry-After)"
```

---

## Task 4: `RegisterResult.retryAfterSec` в server-action (+ тест)

**Files:**
- Modify: `stride-app/app/actions/auth.ts`
- Test: `stride-app/tests/register-user.test.ts` (расширить существующий кейс #3)

- [ ] **Step 1: Сделать тест #3 красным**

В `stride-app/tests/register-user.test.ts`, кейс `'превышен rate-limit — отказ ДО argon2 и до запроса в БД (#10)'` — заменить тело на:
```ts
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 600_000 });
    const r = await registerUser(valid);
    expect(r.ok).toBe(false);
    expect((r as { retryAfterSec?: number }).retryAfterSec).toBeGreaterThan(0);
    expect(hashMock).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run tests/register-user.test.ts`
Expected: FAIL — `retryAfterSec` сейчас `undefined` (не `> 0`).

- [ ] **Step 3: Реализовать в action**

`stride-app/app/actions/auth.ts`:

3a. Импорт:
```ts
import { retryAfterSeconds } from '@/lib/rate-limit-response';
```

3b. Расширить тип:
```ts
export type RegisterResult =
  | { ok: true; needsVerification: true }
  | { ok: false; error: string; retryAfterSec?: number };
```

3c. Заменить строку лимита:
```ts
    if (!limit.success) return { ok: false, error: 'Слишком много попыток. Попробуйте позже', retryAfterSec: retryAfterSeconds(limit.reset) };
```

- [ ] **Step 4: Запустить — зелёно**

Run: `npx vitest run tests/register-user.test.ts`
Expected: PASS (все кейсы). Мок лимита возвращает `reset = now + 600000` → `retryAfterSec ≈ 600 > 0`.

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/actions/auth.ts stride-app/tests/register-user.test.ts
git commit -m "feat(stride): registerUser returns retryAfterSec on rate-limit"
```

---

## Task 5: хук `hooks/use-countdown.ts`

**Files:**
- Create: `stride-app/hooks/use-countdown.ts`

> Тривиальный клиентский хук. Vitest-теста нет (node-only suite, см. инварианты). Проверка — typecheck + использование в Task 6/7.

- [ ] **Step 1: Реализовать**

`stride-app/hooks/use-countdown.ts`:
```ts
'use client';
import { useEffect, useState } from 'react';

// Обратный отсчёт в секундах. start(sec) запускает/перезапускает; тикает к 0 и останавливается.
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

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add stride-app/hooks/use-countdown.ts
git commit -m "feat(stride): useCountdown hook (shared 429 retry timer)"
```

---

## Task 6: таймер в `register-form.tsx`

**Files:**
- Modify: `stride-app/components/shared/auth/register-form.tsx`

- [ ] **Step 1: Подключить хук**

После `import { registerUser } ...` добавить:
```ts
import { useCountdown } from '@/hooks/use-countdown';
```
Внутри компонента, после `const [error, setError] = useState<string | null>(null);`:
```ts
  const { seconds: retry, start: startRetry } = useCountdown();
```

- [ ] **Step 2: Стартовать отсчёт на лимит**

В `onSubmit`, ветку `if (!res.ok)` заменить на:
```ts
    if (!res.ok) {
      setError(res.error);
      if (res.retryAfterSec && res.retryAfterSec > 0) startRetry(res.retryAfterSec);
      return;
    }
```

- [ ] **Step 3: Показать таймер + дизейбл сабмита**

Строку вывода ошибки заменить:
```tsx
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}{retry > 0 ? ` Попробуйте через ${retry} сек` : ''}
        </p>
      )}
```
Кнопке добавить `disabled`:
```tsx
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting} disabled={retry > 0}>
        Зарегистрироваться
      </Button>
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add stride-app/components/shared/auth/register-form.tsx
git commit -m "feat(stride): register form shows rate-limit countdown + disables submit"
```

---

## Task 7: обработка 429 в `purchase-panel.tsx`

**Files:**
- Modify: `stride-app/components/shared/product/purchase-panel.tsx`

- [ ] **Step 1: Импорты + хук**

В шапку:
```ts
import axios from 'axios';
import { useCountdown } from '@/hooks/use-countdown';
```
Внутри компонента, рядом с `const [adding, setAdding] = useState(false);`:
```ts
  const { seconds: cooldown, start: startCooldown } = useCountdown();
```

- [ ] **Step 2: Разобрать 429 в `onAdd`**

Заменить `onAdd` на:
```ts
  const onAdd = async () => {
    if (!selected || cooldown > 0) return;
    setAdding(true);
    try {
      await addCartItem({ productVariantId: selected.id });
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        startCooldown(Number(e.response.data?.retryAfterSec) || 0);
      }
      /* прочие ошибки — стор выставит error */
    } finally {
      setAdding(false);
    }
  };
```

- [ ] **Step 3: Сообщение + дизейбл кнопки**

Кнопку «В корзину» заменить на:
```tsx
      <Button variant="primary" size="lg" className="w-full" disabled={!selected || soldOut || cooldown > 0} loading={adding} onClick={onAdd}>
        {added ? 'Добавлено ✓' : cooldown > 0 ? `Подождите ${cooldown} сек` : !selected ? 'Выберите размер' : `В корзину · ${formatPrice(shownPrice)}`}
      </Button>
      {cooldown > 0 && (
        <p className="text-danger text-xs" role="alert">Слишком часто. Попробуйте через {cooldown} сек</p>
      )}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add stride-app/components/shared/product/purchase-panel.tsx
git commit -m "feat(stride): add-to-cart 429 handling with cooldown timer"
```

---

## Task 8: установить Sentry + init-файлы + global-error

**Files:**
- Modify: `stride-app/package.json` (через `npm install`)
- Create: `stride-app/sentry.server.config.ts`, `stride-app/sentry.edge.config.ts`, `stride-app/instrumentation-client.ts`, `stride-app/instrumentation.ts`, `stride-app/app/global-error.tsx`

> npm install безопасен локально (БД не трогает; postinstall = `prisma generate` — кодоген). Сборку Sentry проверяем в CI (Task 11).

- [ ] **Step 1: Установить SDK**

Run (из `stride-app/`): `npm install @sentry/nextjs@latest`
Expected: добавлен в `dependencies`. (Версия ≥9.12 для `captureRouterTransitionStart`, ≥8.28 для `captureRequestError` — latest покрывает.)

- [ ] **Step 2: Server config**

`stride-app/sentry.server.config.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn), // нет DSN → Sentry выключен (fail-open, как rate-limit)
  tracesSampleRate: 0,   // errors-only: трейсинг выключен
  sendDefaultPii: false, // не слать cookies/headers/ip по умолчанию
});
```

- [ ] **Step 3: Edge config**

`stride-app/sentry.edge.config.ts`:
```ts
// Edge-рантайм (middleware/edge-роуты). Edge-совместимый Sentry SDK; Node-API не тянуть.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
```

- [ ] **Step 4: Client config**

`stride-app/instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0, // errors-only: ни performance, ни replay
});

// App Router navigation tracing hook (нужен экспорт даже при tracing=0; вреда нет).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 5: Instrumentation (server+edge register)**

`stride-app/instrumentation.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Ловит ошибки серверных хендлеров/RSC (Next 15 + SDK ≥8.28).
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 6: Global error boundary**

`stride-app/app/global-error.tsx`:
```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="font-sans">
        <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="font-display text-2xl font-bold">Что-то пошло не так</h1>
          <p className="text-ink-muted text-sm max-w-md">
            Мы уже знаем о проблеме. Попробуйте обновить страницу.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--color-text))] px-6 py-3 text-sm font-semibold text-white"
          >
            Попробовать снова
          </button>
        </main>
      </body>
    </html>
  );
}
```
> `global-error` рендерит свой `<html>` (заменяет RootLayout) — поэтому inline-классы кнопки, не компонент `Button` (надёжность при сломанном дереве). Импорт `./globals.css` даёт Tailwind. Шрифт-переменные RootLayout тут не действуют — допустим fallback.

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add stride-app/package.json stride-app/package-lock.json stride-app/sentry.server.config.ts stride-app/sentry.edge.config.ts stride-app/instrumentation-client.ts stride-app/instrumentation.ts stride-app/app/global-error.tsx
git commit -m "feat(stride): add Sentry (errors-only) client/server/edge init + global-error boundary"
```

---

## Task 9: обернуть `next.config.mjs` в `withSentryConfig`

**Files:**
- Modify: `stride-app/next.config.mjs`

- [ ] **Step 1: Импорт + обёртка (сохранить весь nextConfig)**

В `stride-app/next.config.mjs`:
1. Первой строкой: `import { withSentryConfig } from '@sentry/nextjs';`
2. `const nextConfig = { ... }` — **без изменений** (весь `webpack`-fn с edge-алиасами incl. `crypto:false`, `serverExternalPackages`, `headers`, `images` сохранить).
3. Заменить `export default nextConfig;` на:
```js
export default withSentryConfig(nextConfig, {
  silent: true,              // без шумного вывода в обычной сборке
  widenClientFileUpload: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // source-map upload — best-effort: без SENTRY_AUTH_TOKEN билд не падает.
});
```

- [ ] **Step 2: Typecheck (build — в CI)**

Run: `npm run typecheck`
Expected: PASS. `next build` локально НЕ запускать (Neon SSG). Edge-бандл-чистоту (отсутствие argon2/prisma/upstash/crypto) валидируем в CI Task 11.

- [ ] **Step 3: Commit**

```bash
git add stride-app/next.config.mjs
git commit -m "build(stride): wrap next config with withSentryConfig (preserve edge aliases)"
```

---

## Task 10: мост `logger.error` → Sentry

**Files:**
- Modify: `stride-app/lib/logger.ts`

- [ ] **Step 1: Подтвердить edge-безопасность**

Run: `grep -rl "@/lib/logger" stride-app/auth.config.ts stride-app/middleware.ts`
Expected: ПУСТО (logger не в edge-графе). Если найдётся — СТОП, вынести мост в отдельный `lib/report-error.ts` (fallback из спеки §5.4) вместо правки logger.

- [ ] **Step 2: Добавить импорт Sentry**

В шапку `stride-app/lib/logger.ts` (рядом с `import { scrubPii } ...`):
```ts
import * as Sentry from '@sentry/nextjs';
```

- [ ] **Step 3: Захват в методе `error` (где есть сырой `err`)**

В `makeLogger`, метод `error` заменить на:
```ts
    error: (m, err, f) => {
      emit('error', m, { ...baseFields, ...normalizeError(err), ...(f ?? {}) });
      // Мост в Sentry (noop без DSN). PII скрабится перед передачей.
      Sentry.captureException(err instanceof Error ? err : new Error(m), {
        tags: { event: m },
        extra: scrubPii({ ...baseFields, ...(f ?? {}) }),
      });
    },
```

- [ ] **Step 4: Тесты + typecheck**

Run: `npx vitest run tests/register-user.test.ts && npm run typecheck`
Expected: PASS. (`register-user.test` мокает `@/lib/logger` целиком → реальный Sentry-импорт там не исполняется; другие тесты, импортирующие реальный logger, видят `captureException` как noop без DSN.)

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/logger.ts
git commit -m "feat(stride): bridge logger.error to Sentry.captureException (PII-scrubbed)"
```

---

## Task 11: env-доки + финальная верификация + ручной чек-лист

**Files:**
- Create/Modify: `stride-app/.env.example` (добавить переменные; если файла нет — создать с уже используемыми + новыми)

- [ ] **Step 1: env-доки**

В `stride-app/.env.example` добавить блок (значения — пустые/плейсхолдеры, НЕ реальные секреты):
```dotenv
# --- P2.3 Rate-limit (Upstash) ---
# Через Vercel Marketplace → Upstash Redis (проставляется авто в Preview/Prod):
KV_REST_API_URL=
KV_REST_API_TOKEN=
# (fallback-имена при raw-аккаунте: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)

# --- P2.3 Sentry (errors-only) ---
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 2: Полный прогон тестов + typecheck**

Run: `npm run test && npm run typecheck`
Expected: все vitest зелёные (вкл. новые `rate-limit-response`, `rate-limit`, обновлённый `register-user`), tsc без ошибок.

- [ ] **Step 3: Commit**

```bash
git add stride-app/.env.example
git commit -m "docs(stride): document Upstash + Sentry env vars for P2.3"
```

- [ ] **Step 4: Push → CI (build + e2e + edge-бандл)**

```bash
git push -u origin feat/phase2.3-ratelimit-sentry
```
CI должен: собрать (`next build` с `withSentryConfig`), прогнать e2e, не уронить edge-бандл. Если edge падает `UnhandledSchemeError`/подобным из-за logger→Sentry — применить fallback Task 10 Step 1.

- [ ] **Step 5: Ручной чек-лист (preview/prod, с заведённым Upstash + Sentry DSN)**

- [ ] Спам-регистрация одним IP >5 раз/10мин → форма: «Слишком много попыток. Попробуйте через N сек», сабмит disabled, отсчёт идёт.
- [ ] Спам add-to-cart >60 раз/мин → кнопка «Подождите N сек» + текст под ней; ответ 429 с `Retry-After` (DevTools).
- [ ] Без Upstash env (или CI) → лимиты не срабатывают (fail-open), регистрация/корзина работают.
- [ ] Бросить тестовую ошибку (например временный throw в server-роуте) → событие появилось в Sentry; PII (email/phone) замаскированы.
- [ ] `/login`, `/checkout` и навигация работают (middleware/edge не сломан Sentry-обёрткой).

---

## Self-Review (выполнено при написании плана)

**1. Покрытие спеки:**
- §3.1 checkAuthRateLimit → Task 2. §3.2 checkCartRateLimit+роут → Task 2+3. §4.1 хелпер → Task 1.
  §4.2 register UX → Task 4+6. §4.3 cart UX → Task 7. §4.4 useCountdown → Task 5.
  §5.2 Sentry-файлы → Task 8. §5.3 next.config → Task 9. §5.4 logger-мост → Task 10. §5.5 PII → Task 8(sendDefaultPii)+10(scrub).
  §6 константы/env → Task 2+11. §7 тесты → Task 1/2/4. Пробелов нет.

**2. Плейсхолдеры:** код во всех code-шагах реальный; «плейсхолдеры» только в `.env.example` (по дизайну — пустые секреты).

**3. Консистентность типов/имён:** `RateLimitResult`, `makeLimiter(slot,points,window,prefix)`, `Limiter`, `retryAfterSeconds(reset)`, `tooManyRequests(result,message)`, `useCountdown()→{seconds,start}`, `RegisterResult` с `retryAfterSec?` — совпадают между задачами. `AUTH_RATE_LIMIT`/`CART_RATE_LIMIT` `{points,window}` используются единообразно.

---

## Execution Handoff

План сохранён в `docs/superpowers/plans/2026-06-10-stride-phase2.3-ratelimit-sentry.md`. Два варианта исполнения:

1. **Subagent-Driven (рекомендую)** — свежий субагент на задачу, ревью между задачами (superpowers:subagent-driven-development).
2. **Inline** — задачи в этой сессии чекпоинтами (superpowers:executing-plans).

Какой подход?

---

## Ручная проверка на preview (после деплоя ветки)

> Гоняется на **preview-деплое** ветки (не локально — Neon-латентность + локальный build/e2e заблокированы [[never-run-db-against-neon-locally]]).
> Перед проверкой убедись, что выполнены **пред-условия**:
> 1. **preview build зелёный** (`next build` с `withSentryConfig` собрался, edge-бандл не упал);
> 2. в Vercel (preview) заданы env: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash), `NEXT_PUBLIC_SENTRY_DSN`,
>    `SENTRY_DSN` (+ опц. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` для source maps);
> 3. **Upstash Redis** заведён (Vercel Marketplace → Upstash) и привязан к проекту; **Sentry**-проект создан, DSN валиден.
>
> ⚠️ **Без Upstash-env лимиты fail-open** (не срабатывают) — для проверки групп A/B env обязателен. **Без DSN Sentry выключен** — для группы D нужен DSN.
> Для спам-проверок удобно с одного браузера/IP; `+`-алиасы email (`ты+1@gmail.com`) = новые «пользователи» для регистрации.

### A. Rate-limit регистрации (`checkAuthRateLimit`, 5/10м на IP)
1. [ ] До лимита: `/register` новым email → обычный флоу (поднимается gate-модалка верификации из P2.2c).
2. [ ] Сделай **>5 сабмитов `/register` за 10 мин** с одного IP → форма показывает **«Слишком много попыток. Попробуйте через N сек»**, кнопка «Зарегистрироваться» **disabled**, **таймер N тикает** к 0.
3. [ ] Когда N дойдёт до 0 → кнопка снова активна, сабмит проходит. (Окно sliding — отпускает постепенно.)
4. [ ] Отказ происходит **до** создания юзера/отправки кода (argon2 не считается) — повторные спам-попытки не плодят письма.

### B. Rate-limit add-to-cart (`checkCartRateLimit` + `POST /api/cart`, 60/1м на IP)
1. [ ] До лимита: на PDP выбери размер → «В корзину» → товар добавляется как обычно.
2. [ ] **Быстрый спам add-to-cart (>60/мин)** → кнопка переключается на **«Подождите N сек»** (disabled), под ней текст **«Слишком часто. Попробуйте через N сек»**.
3. [ ] В DevTools → Network: ответ `POST /api/cart` = **429**, есть заголовок **`Retry-After: <сек>`**, тело `{message, retryAfterSec}`.
4. [ ] По истечении N кнопка снова рабочая, добавление проходит.

### C. Fail-open без Upstash
1. [ ] На окружении **без** `KV_REST_API_*` (напр. предыдущий preview или временно убрать env) → спам регистрации/корзины **НЕ блокируется**, оба флоу работают штатно (отсутствие redis не ломает приложение).

### D. Sentry — захват ошибок (errors-only)
1. [ ] **Серверная ошибка**: временно вставь `throw new Error('p23-sentry-test')` в каком-нибудь server-роуте/RSC (или используй `/sentry-example-page`, если сгенерён) → в **Sentry dashboard появляется issue** (через `onRequestError`). Убери throw после проверки.
2. [ ] **Клиентская ошибка** (необработанная в рендере) → показывается **`app/global-error.tsx`**: заголовок «Что-то пошло не так» + кнопка **«Попробовать снова»** (нажатие = `reset()` перерисовывает), issue в Sentry (`captureException`).
3. [ ] **Проглоченная ошибка**: спровоцируй сбой, который логируется (напр. `cart_get_failed` при недоступной БД) → в Sentry событие с **`tags.event = <message>`**; в `extra` поля присутствуют, но **email/phone/token замаскированы** (`scrubPii`).
4. [ ] **Без DSN**: на окружении без `SENTRY_DSN` → ошибки только в `console`, в Sentry ничего (Sentry `enabled:false`, fail-open).

### E. Регрессия
1. [ ] `/login`, `/checkout`, `/orders`, переходы по сайту работают — **middleware/edge не сломан** обёрткой `withSentryConfig` (edge-бандл собрался без argon2/prisma/upstash/crypto).
2. [ ] Корзина/вишлист, оформление заказа, верификация почты (P2.2c) — без регрессий.
3. [ ] CI: `npm test` (**225 зелёных**) + e2e (`e2e.yml`) проходят; сток размера 42 не просел ([[e2e-size42-stock-budget]]).

### На что смотреть при сбое
- **Лимит не срабатывает даже при спаме** → Upstash env не задан/неверен (`isRateLimitConfigured()=false` → fail-open). Проверь `KV_REST_API_URL`/`KV_REST_API_TOKEN` (или fallback `UPSTASH_REDIS_REST_*`) в Vercel.
- **429 без таймера на форме регистрации** → `registerUser` не вернул `retryAfterSec` ИЛИ форма не вызвала `startRetry`; проверь `RegisterResult` и `register-form.tsx`.
- **add-to-cart 429 не показывает cooldown** → проверь ветку `axios.isAxiosError(e) && e.response?.status===429` в `purchase-panel.tsx` и что `store/cart.ts addCartItem` пробрасывает ошибку (`throw e`).
- **В Sentry нет событий** → DSN не задан/неверен (`enabled:false`). Клиент берёт `NEXT_PUBLIC_SENTRY_DSN`, сервер/edge — `SENTRY_DSN`; проверь, что DSN совпадает с проектом Sentry.
- **build падает на edge** (`UnhandledSchemeError` argon2/prisma/crypto) → `withSentryConfig` уронил `webpack` edge-алиасы; убедись, что весь `nextConfig` (с `webpack`-fn и `serverExternalPackages`) сохранён внутри обёртки.
- **Стектрейсы в Sentry минифицированы** → нет `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` (source-map upload = best-effort, билд не ломает) — добавь для читаемых трейсов.
- **PII в событии Sentry** (реальный email/phone) → ключ не покрыт `scrubPii` ИЛИ `sendDefaultPii` включён; проверь `sendDefaultPii:false` во всех `sentry.*.config.ts`.
- **Логаут/навигация сломаны после Sentry** → `instrumentation.ts register()` кидает в edge; убедись, что `sentry.edge.config.ts` edge-safe и `logger` не утёк в edge-граф ([[never-run-db-against-neon-locally]] — проверки только в CI/preview).
