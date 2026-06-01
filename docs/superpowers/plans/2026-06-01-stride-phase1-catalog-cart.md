# STRIDE — Фаза 1 (Каталог + Корзина): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять витрину STRIDE `stride-app` (Next.js 15 + Prisma 6 + Neon HTTP): лендинг, каталог с URL-фильтрами, страница товара с расцветками/размерами, анонимная корзина по cookie — визуально по прототипам, без оплаты/auth/админки.

**Architecture:** App Router. Чтения (лендинг/каталог/PDP) — RSC напрямую через singleton `prisma` (Neon HTTP-адаптер, без `$transaction`). Корзина — REST `app/api/cart/*` (cookie `cartToken`) + Zustand-стор + axios. Дизайн — CSS-токены прототипа в `globals.css` + Tailwind v3 (shadcn-стиль `hsl(var(--color-*))`), UI-примитивы поверх Radix + lucide. Доменная модель: `Product → ProductColorway → ProductImage/ProductVariant(SKU)`, `Cart → CartItem`.

**Tech Stack:** Next 15 (App Router, React 18, TS 5.7), Prisma 6.19 + `@prisma/adapter-neon` + `@neondatabase/serverless`, Tailwind 3.4 + `tailwindcss-animate` + CVA, Radix UI, lucide-react, Zustand 5, axios, React Hook Form + Zod, Vitest 2 (unit), Playwright 1.60 (e2e+a11y). Шрифты: Unbounded (display) + Manrope (body) через `next/font/google`.

---

## Соглашения этого плана (прочитать перед стартом)

1. **Источник истины по UI — закоммиченные прототипы** (решение брейнсторминга #1):
   `ui-designe and prototypes/prototypes-app/{home,catalog,product,cart,ui-design-system}.html`.
   Шаги задач витрины (14–17) дают **реальный JSX с точными className** и data-контрактом, и ссылаются на конкретные секции прототипа (файл + диапазон строк) как на эталон вёрстки. Это не плейсхолдер: HTML существует в репозитории — его нужно переносить «класс-в-класс», заменяя эмодзи на `lucide-react` и хардкод-данные на пропсы. Кастомные классы (`.btn`, `.size`, `.thumb`, `.skel`, `.glass-header`, `.count-btn`, `.tnum`, `.label`) определяются один раз в `globals.css` (Задача 3), поэтому разметка прототипа переносится почти дословно.

2. **Референс архитектуры — `D:/Projects/next-pizza-reference`** (read-only). Паттерны проверены; адаптации под Фазу 1 уже учтены в коде шагов. Главные отличия от референса (НЕ копировать вслепую):
   - **Next 15:** `params`/`searchParams` страниц — `Promise`, их надо `await` (референс на Next 14 — синхронные).
   - **id — `String @default(cuid())`** (не `Int autoincrement` референса) → устойчивый seed без «угадывания id».
   - **Neon-адаптер подключается в рантайме** (`prisma-client.ts`), НЕ через `previewFeatures` в schema (на Prisma 6 driverAdapters — GA).
   - **Корзина без `$transaction`:** мультизаписи — последовательные `await` + ручная компенсация в `catch`; `update` и перезагрузка с `include` — два отдельных запроса.

3. **Спека добавляет к прототипу** (прототип беднее — это нормально, спека авторитетна по объёму): фильтры **бренд** и **gender**, **реальные сортировки** (new/price-asc/price-desc/discount/popular), **facet-counts** через `groupBy`, индикатор «**Бесплатно от 10 000 ₽**». Размеры — **EU с полуразмерами** (label «EU», не «RU» как в прототипе).

4. **context7 MCP — на этапе реализации** сверять точные сигнатуры (Next 15 async `params`, `PrismaNeonHTTP`, Zod, Zustand v5, RHF). Шаги, где это критично, помечены `(context7)`.

5. **Деньги** — `Int` (рубли целыми). Размер — `Decimal(3,1)` (читается как `Prisma.Decimal`, нормализуется к строке для UI).

6. **TDD** (Задачи 6, 7, 9 и юнит-части прочих): сначала падающий тест → запуск (RED) → минимальная реализация → запуск (GREEN) → коммит. Чистая логика покрывается Vitest; интеграция (роуты, страницы) — Playwright e2e против поднятого приложения с сидом.

7. **Все пути — от корня `stride-app/`**, если не указано иное. Команды запускать из `stride-app/`.

8. **Коммиты** — частые, в конце каждого шага «Commit». Сообщения — на русском, conventional-commits. Реализация идёт на ветке/worktree (создаётся executing-skill), не на `main`.

---

## Структура файлов (создаётся по ходу плана)

```
stride-app/
├─ app/
│  ├─ layout.tsx                      # шрифты, токены, top-bar, header, footer (Задача 12)
│  ├─ globals.css                     # токены + @layer base/components (Задача 3)
│  ├─ page.tsx                        # лендинг (Задача 14)
│  ├─ catalog/page.tsx                # каталог (Задача 15)
│  ├─ product/[slug]/page.tsx         # PDP (Задача 16)
│  ├─ product/[slug]/not-found.tsx    # 404 товара (Задача 16)
│  ├─ cart/page.tsx                   # корзина (Задача 17)
│  ├─ api/cart/route.ts               # GET/POST корзины (Задача 10)
│  ├─ api/cart/[id]/route.ts          # PATCH/DELETE позиции (Задача 10)
│  ├─ sitemap.ts, robots.ts           # SEO (Задача 18)
│  └─ providers.tsx                   # client-провайдеры (Задача 12)
├─ components/
│  ├─ ui/                             # примитивы: button, badge, input, skeleton, counter (Задача 3)
│  └─ shared/                         # витрина: header, footer, product-card, фильтры, галерея… (12–17)
├─ lib/
│  ├─ prisma-client.ts                # Neon HTTP singleton + retry (Задача 2)
│  ├─ logger.ts, pii-scrub.ts, request-context.ts, rate-limit.ts, utils.ts  (Задача 2)
│  ├─ format.ts                       # formatPrice, normalizeSize (Задача 6)
│  ├─ product-badges.ts               # вычисление бейджей/стока (Задача 6)
│  ├─ catalog-filters.ts              # searchParams → where/orderBy + counts (Задача 7)
│  ├─ find-products.ts                # листинг каталога (Задача 7/15)
│  ├─ get-product.ts                  # PDP data-fetch по slug (Задача 16)
│  ├─ cart.ts                         # findOrCreateCart, recalcCartTotal, getCartDetails (Задачи 9/10)
│  └─ cart-cookie.ts                  # имя/опции cookie cartToken (Задача 10)
├─ services/
│  ├─ instance.ts, api-client.ts, cart.ts   # axios + Api.cart (Задача 11)
│  └─ dto/cart.dto.ts                 # типы/Zod корзины (Задача 9)
├─ store/cart.ts, store/index.ts       # Zustand (Задача 11)
├─ hooks/use-cart.ts                   # авто-fetch корзины (Задача 11)
├─ constants/config.ts                 # пороги, окна, EU-сетка, US/UK (Задача 5)
├─ prisma/schema.prisma                # доменная модель (Задача 4)
├─ prisma/seed.ts, prisma/seed-data.ts # сид (Задача 8)
├─ public/products/                     # демо-изображения (Задача 8)
├─ tests/                               # Vitest unit
├─ e2e/                                 # Playwright
├─ package.json, tsconfig.json, next.config.mjs, postcss.config.mjs,
│  tailwind.config.ts, vitest.config.ts, playwright.config.ts, .env.example
```

---

## Task 1: Скаффолд `stride-app` + тулинг

**Files:**
- Create: `stride-app/package.json`
- Create: `stride-app/tsconfig.json`
- Create: `stride-app/next.config.mjs`
- Create: `stride-app/postcss.config.mjs`
- Create: `stride-app/.env.example`
- Create: `stride-app/.gitignore`
- Create: `stride-app/app/layout.tsx` (временный заглушка-layout, переопределится в Задаче 12)
- Create: `stride-app/app/page.tsx` (временная заглушка)

- [ ] **Step 1: `package.json` с точными версиями (по референсу) и скриптами**

```json
{
  "name": "stride-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "prisma:push": "prisma db push",
    "prisma:studio": "prisma studio",
    "prisma:seed": "prisma db seed",
    "postinstall": "prisma generate"
  },
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "@hookform/resolvers": "^3.9.1",
    "@prisma/adapter-neon": "^6.19.3",
    "@prisma/client": "^6.19.3",
    "@radix-ui/react-checkbox": "^1.1.2",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-slot": "^1.1.1",
    "axios": "^1.7.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.469.0",
    "next": "15.1.11",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "^7.54.2",
    "tailwind-merge": "^2.5.5",
    "zod": "^3.24.1",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8",
    "prisma": "^6.19.3",
    "tailwindcss": "^3.4.1",
    "tailwindcss-animate": "^1.0.7",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.9"
  }
}
```
> `(context7)` Перед `npm install` сверить, что `next@15.1.x` — последняя стабильная в линейке 15 (спека фиксирует Next 15). При необходимости поднять патч-версию.

- [ ] **Step 2: `tsconfig.json` (Next 15, алиас `@/*`)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "e2e"]
}
```

- [ ] **Step 3: `next.config.mjs` (база — security-headers + images, по pizza-app, без Sentry-обёртки)**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
  images: {
    // Демо-фото в Фазе 1 — локальные (public/), remotePatterns понадобятся при Cloudinary (Фаза 2+).
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' }],
  },
};

export default nextConfig;
```
> Если при `next build`/Turbopack возникнет ошибка бандлинга Prisma — добавить `serverExternalPackages: ['@prisma/client', '.prisma/client']` (типовой подводный камень Next 15 + Prisma, в референсе не понадобился).

- [ ] **Step 4: `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: `.env.example` (значения даёт пользователь)**

```bash
# Neon Postgres (создаёт пользователь). Pooled — для рантайма, non-pooling — directUrl/seed.
POSTGRES_URL="postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/stride?sslmode=require"
POSTGRES_URL_NON_POOLING="postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/stride?sslmode=require"

# Таймаут одного fetch к Neon (cold start Neon Free ~10-15с)
NEON_FETCH_TIMEOUT_MS="15000"

# Базовый URL для axios клиента корзины (dev)
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
```

- [ ] **Step 6: `.gitignore` приложения**

```gitignore
node_modules/
.next/
out/
build/
*.tsbuildinfo
next-env.d.ts
.env
.env.*
!.env.example
coverage/
playwright-report/
test-results/
.DS_Store
```

- [ ] **Step 7: Временные `app/layout.tsx` и `app/page.tsx` (чтобы dev-сервер поднялся)**

`app/layout.tsx`:
```tsx
import './globals.css';

export const metadata = { title: 'STRIDE', description: 'Кроссовки STRIDE' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```
`app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8 text-2xl font-bold">STRIDE — скаффолд работает</main>;
}
```
> `app/globals.css` создаётся в Задаче 3; пока создать пустой файл `app/globals.css` с одной строкой `/* tokens in Task 3 */`, чтобы импорт не падал.

- [ ] **Step 8: Установить зависимости и проверить, что dev-сервер стартует**

Run: `cd stride-app && npm install`
Затем: `npm run dev`
Expected: `▲ Next.js 15.1.x` + `Local: http://localhost:3000`, страница отдаёт «STRIDE — скаффолд работает». Остановить (Ctrl+C).
> `npm install` потянет `prisma generate` через `postinstall` — он не упадёт даже без schema (сгенерит пустой клиент позже на Задаче 4; если упадёт из-за отсутствия `prisma/schema.prisma`, временно убрать `postinstall` и вернуть в Задаче 4).

- [ ] **Step 9: Установить браузеры Playwright**

Run: `npx playwright install --with-deps chromium`
Expected: загрузка Chromium завершается успехом.

- [ ] **Step 10: Commit**

```bash
git add stride-app
git commit -m "feat(stride-app): скаффолд Next 15 + тулинг (deps, tsconfig, next.config, env)"
```

---

## Task 2: Перенос инфраструктуры (prisma-client, logger, pii-scrub, request-context, rate-limit, utils)

**Files:**
- Create: `stride-app/lib/prisma-client.ts`
- Create: `stride-app/lib/utils.ts`
- Create: `stride-app/lib/pii-scrub.ts`
- Create: `stride-app/lib/request-context.ts`
- Create: `stride-app/lib/logger.ts`
- Create: `stride-app/lib/rate-limit.ts`

> Sentry в Фазе 1 НЕ вводим (спека: опц.). Поэтому `logger.ts` и `request-context.ts` переносятся **без** `@sentry/nextjs` (вызовы Sentry вырезаны). Если позже понадобится Sentry — вернуть по образцу референса.

- [ ] **Step 1: `lib/utils.ts` (cn — дословно из референса)**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: `lib/prisma-client.ts` (Neon HTTP singleton + retry, по pizza-admin)** `(context7)`

Полный файл (адаптировано: комментарии сжаты, `maxAttempts=2`, дефолт таймаута 15000; адаптер строится для любого непустого URL):
```ts
import { PrismaNeonHTTP } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaClient } from '@prisma/client';

// Neon HTTP-транспорт: каждый запрос — отдельный HTTPS-вызов (нет пула/идл-дисконнектов,
// работает в dev/node/edge). ВАЖНО: $transaction НЕ поддерживается в HTTP-режиме —
// мультизаписи делать последовательными await с ручной компенсацией.

const getConnectionString = () =>
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

const getNeonFetchTimeoutMs = () => {
  const value = Number(process.env.NEON_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 15000;
};

const NEON_FETCH_TIMEOUT_MS = getNeonFetchTimeoutMs();

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const parentSignal = init?.signal;
  const timeout = setTimeout(() => controller.abort(), NEON_FETCH_TIMEOUT_MS);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  try {
    const requestInit: RequestInit = init
      ? { ...init, signal: controller.signal }
      : { signal: controller.signal };
    return await fetch(input, requestInit);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};

neonConfig.fetchFunction = fetchWithTimeout;

const buildAdapter = () => {
  const url = getConnectionString();
  if (!url) return undefined;
  return new PrismaNeonHTTP(url, {});
};

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  'ENETDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR',
]);
const TRANSIENT_MESSAGE_FRAGMENTS = [
  'fetch failed', 'Connection terminated', 'Server has closed the connection',
  'socket hang up', 'network error', 'AbortError', 'aborted',
];

const isTransientError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };
  if (typeof e.code === 'string' && TRANSIENT_ERROR_CODES.has(e.code)) return true;
  if (e.name === 'AbortError') return true;
  if (typeof e.message === 'string' && TRANSIENT_MESSAGE_FRAGMENTS.some((f) => (e.message as string).includes(f))) return true;
  if (e.cause) return isTransientError(e.cause);
  if (e.sourceError) return isTransientError(e.sourceError);
  return false;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const retryOnTransient = async <T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isTransientError(err)) throw err;
      await sleep(100 * Math.pow(3, attempt - 1));
    }
  }
  throw lastError;
};

const prismaClientSingleton = () => {
  const adapter = buildAdapter();
  const baseClient = new PrismaClient({
    ...(adapter ? { adapter } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  return baseClient.$extends({
    name: 'retryOnTransient',
    query: { $allOperations({ args, query }) { return retryOnTransient(() => query(args)); } },
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
```
> Доступ к БД — ТОЛЬКО через этот `prisma` (обход retry-обёртки запрещён).

- [ ] **Step 3: `lib/pii-scrub.ts` (дословно из референса)**

```ts
const PII_FIELD_NAMES = new Set([
  'phone', 'email', 'address', 'password', 'fullName', 'firstName', 'lastName',
  'cardNumber', 'token', 'secret',
]);
const REDACTED = '[redacted]';

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return REDACTED;
  return `[redacted-${email.slice(at + 1)}]`;
}
function maskPhone(phone: string): string {
  if (phone.length < 4) return REDACTED;
  return `***${phone.slice(-4)}`;
}

export function scrubPii(obj: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (PII_FIELD_NAMES.has(key) || PII_FIELD_NAMES.has(lower)) {
      if (typeof value === 'string') {
        if (lower === 'email') obj[key] = maskEmail(value);
        else if (lower === 'phone') obj[key] = maskPhone(value);
        else obj[key] = REDACTED;
      }
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scrubPii(value as Record<string, unknown>);
    }
  }
  return obj;
}
```

- [ ] **Step 4: `lib/request-context.ts` (AsyncLocalStorage, без Sentry)**

```ts
export interface RequestContext {
  requestId: string;
}

type AsyncLocalStorageLike<T> = {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

const storage = createStorage();

function createStorage(): AsyncLocalStorageLike<RequestContext> | null {
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME !== 'nodejs') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-eval
    const requireFn = eval('require') as NodeJS.Require;
    const { AsyncLocalStorage } = requireFn('node:async_hooks') as typeof import('node:async_hooks');
    return new AsyncLocalStorage<RequestContext>();
  } catch {
    return null;
  }
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type HeadersLike = { get(name: string): string | null };

function extractIncomingRequestId(headers: HeadersLike | undefined): string | null {
  if (!headers || typeof headers.get !== 'function') return null;
  const value = headers.get('x-request-id');
  return value && value.length > 0 ? value : null;
}

export function getRequestId(): string | undefined {
  return storage?.getStore()?.requestId;
}

export async function runWithRequestContext<T>(
  source: { headers?: HeadersLike } | Request | undefined,
  handler: () => Promise<T> | T,
): Promise<T> {
  const headers = source && 'headers' in source ? (source.headers as HeadersLike | undefined) : undefined;
  const requestId = extractIncomingRequestId(headers) ?? generateRequestId();
  if (!storage) return handler();
  return storage.run({ requestId }, async () => handler());
}
```

- [ ] **Step 5: `lib/logger.ts` (console-JSON + scrubPii + requestId, без pino/Sentry для простоты Фазы 1)**

```ts
import { scrubPii } from './pii-scrub';
import { getRequestId } from './request-context';

const SERVICE = 'stride-app';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, err?: unknown, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function normalizeError(err: unknown): LogFields {
  if (err instanceof Error) return { err: { name: err.name, message: err.message, stack: err.stack } };
  if (err === undefined) return {};
  return { err: { value: err } };
}

function emit(level: LogLevel, message: string, fields: LogFields) {
  const safeFields = scrubPii({ ...fields });
  const requestId = getRequestId();
  const payload = {
    level, time: new Date().toISOString(), service: SERVICE,
    ...(requestId ? { requestId } : {}), message, ...safeFields,
  };
  const text = JSON.stringify(payload);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else if (level === 'debug') console.debug(text);
  else console.log(text);
}

function makeLogger(baseFields: LogFields): Logger {
  return {
    debug: (m, f) => emit('debug', m, { ...baseFields, ...(f ?? {}) }),
    info: (m, f) => emit('info', m, { ...baseFields, ...(f ?? {}) }),
    warn: (m, f) => emit('warn', m, { ...baseFields, ...(f ?? {}) }),
    error: (m, err, f) => emit('error', m, { ...baseFields, ...normalizeError(err), ...(f ?? {}) }),
    child: (bindings) => makeLogger({ ...baseFields, ...bindings }),
  };
}

export const logger: Logger = makeLogger({});
```

- [ ] **Step 6: `lib/rate-limit.ts` (Upstash, fail-open; минимально для cart-API)**

```ts
import { logger } from './logger';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const NOOP_RESULT: RateLimitResult = { success: true, remaining: -1, reset: 0 };

function getEnv(primary: string, fallback: string): string | undefined {
  return process.env[primary] || process.env[fallback] || undefined;
}

export function isRateLimitConfigured(): boolean {
  return Boolean(getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL') && getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'));
}

export function extractClientIp(req: { headers: Headers }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// Фаза 1: rate-limit заглушён (fail-open). Если Upstash не сконфигурирован — всегда success.
// Полноценные лимитеры (@upstash/ratelimit sliding window, prefix 'stride-app:*') добавляются в Фазе 2.
export async function checkCartRateLimit(_ip: string): Promise<RateLimitResult> {
  if (!isRateLimitConfigured()) return NOOP_RESULT;
  logger.debug('rate_limit_noop_phase1');
  return NOOP_RESULT;
}
```

- [ ] **Step 7: Smoke-проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок (модули компилируются; `@prisma/client` ещё пуст — типы `prisma` могут быть `any`/общими, это ок до Задачи 4).

- [ ] **Step 8: Commit**

```bash
git add stride-app/lib
git commit -m "feat(stride-app): инфра — prisma-client (Neon HTTP), logger, pii-scrub, request-context, rate-limit, cn"
```

---

## Task 3: Дизайн-система — `globals.css` (токены + утилиты прототипа) + Tailwind + UI-примитивы

**Files:**
- Create: `stride-app/tailwind.config.ts`
- Modify: `stride-app/app/globals.css` (заменить заглушку)
- Create: `stride-app/components/ui/button.tsx`
- Create: `stride-app/components/ui/badge.tsx`
- Create: `stride-app/components/ui/input.tsx`
- Create: `stride-app/components/ui/skeleton.tsx`
- Create: `stride-app/components/ui/counter.tsx`
- Create: `stride-app/components/ui/index.ts`

> Цель: один раз перенести CSS-токены и кастомные классы прототипа (`.btn*`, `.inp`, `.label`, `.tnum`, `.glass-header`, `.size`, `.thumb`, `.skel`, `.count-btn`, focus-ring, body-градиент) — тогда вёрстка прототипов переносится почти дословно. Значения — из `proto:design-system` (точные HSL/px).

- [ ] **Step 1: `tailwind.config.ts` (маппинг токенов прототипа в `hsl(var(--color-*))`, шрифты, радиусы)**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--color-bg))',
        surface: {
          DEFAULT: 'hsl(var(--color-surface))',
          soft: 'hsl(var(--color-surface-soft))',
        },
        ink: {
          DEFAULT: 'hsl(var(--color-text))',
          muted: 'hsl(var(--color-text-muted))',
        },
        primary: {
          DEFAULT: 'hsl(var(--color-primary))',
          foreground: 'hsl(var(--color-primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--color-accent))',
          foreground: 'hsl(var(--color-accent-foreground))',
        },
        warm: 'hsl(var(--color-warm-accent))',
        line: 'hsl(var(--color-border))',
        danger: 'hsl(var(--color-danger))',
        success: 'hsl(var(--color-success))',
        warning: 'hsl(var(--color-warning))',
        info: 'hsl(var(--color-info))',
        footer: 'hsl(var(--color-footer))',
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-unbounded)', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```
> Шрифтовые CSS-переменные `--font-manrope`/`--font-unbounded` придут из `next/font` в Задаче 12. `font-display`/`font-sans` Tailwind-утилиты будут работать после этого.

- [ ] **Step 2: `app/globals.css` — токены `:root` (точные значения прототипа)**

Заменить содержимое файла. Начало (токены + база):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-bg: 42 33% 97%;
    --color-surface: 0 0% 100%;
    --color-surface-soft: 48 36% 94%;
    --color-text: 220 13% 10%;
    --color-text-muted: 220 8% 42%;
    --color-primary: 75 100% 50%;
    --color-primary-foreground: 220 13% 10%;
    --color-accent: 250 28% 70%;
    --color-accent-foreground: 220 13% 10%;
    --color-warm-accent: 42 100% 52%;
    --color-border: 220 12% 88%;
    --color-danger: 0 72% 52%;
    --color-success: 145 63% 40%;
    --color-warning: 38 92% 50%;
    --color-info: 205 82% 48%;
    --color-footer: 240 18% 11%;
  }

  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

  * { border-color: hsl(var(--color-border)); }

  body {
    color: hsl(var(--color-text));
    background-color: hsl(0 0% 100%);
    background-image: linear-gradient(
      180deg,
      hsl(var(--color-primary) / 0.20) 0%,
      hsl(var(--color-primary) / 0.06) 22%,
      hsl(0 0% 100%) 52%
    );
    background-attachment: fixed;
    min-height: 100vh;
  }

  ::selection {
    background: hsl(var(--color-primary));
    color: hsl(var(--color-primary-foreground));
  }

  :focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px hsl(var(--color-surface)), 0 0 0 4px hsl(var(--color-primary));
  }
}
```

- [ ] **Step 3: `app/globals.css` — `@layer components` (кнопки/инпуты/бейджи/чипы/skeleton/glass — из прототипа)**

Дописать в тот же файл (точные значения из `proto:design-system`):
```css
@layer components {
  .tnum { font-variant-numeric: tabular-nums; }

  .label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: hsl(var(--color-text-muted));
  }

  .glass-header {
    -webkit-backdrop-filter: blur(24px);
    backdrop-filter: blur(24px);
    border-bottom: 1px solid hsl(var(--color-border));
  }
  @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    .glass-header { background: hsl(var(--color-surface) / 0.97); }
  }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    font-weight: 600; border-radius: 999px; cursor: pointer; white-space: nowrap;
    border: 1px solid transparent; line-height: 1;
    transition: filter 0.15s, transform 0.15s, box-shadow 0.15s, background-color 0.15s, border-color 0.15s;
  }
  .btn:active { transform: translateY(1px); }
  .btn[disabled], .btn.is-disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
  .btn-sm { height: 36px; padding: 0 16px; font-size: 13px; }
  .btn-md { height: 44px; padding: 0 22px; font-size: 14px; }
  .btn-lg { height: 52px; padding: 0 30px; font-size: 16px; }
  .btn-primary { background: hsl(var(--color-primary)); color: hsl(var(--color-primary-foreground)); }
  .btn-primary:hover { filter: brightness(0.93); }
  .btn-dark { background: hsl(var(--color-text)); color: #fff; }
  .btn-dark:hover { background: hsl(220 13% 22%); }
  .btn-secondary { background: hsl(var(--color-surface)); color: hsl(var(--color-text)); border-color: hsl(var(--color-border)); }
  .btn-secondary:hover { border-color: hsl(var(--color-text)); }
  .btn-accent { background: hsl(var(--color-accent)); color: hsl(var(--color-accent-foreground)); }
  .btn-accent:hover { filter: brightness(0.96); }
  .btn-ghost { background: transparent; color: hsl(var(--color-text)); }
  .btn-ghost:hover { background: hsl(var(--color-surface-soft)); }
  .btn-danger { background: hsl(var(--color-danger)); color: #fff; }
  .btn-danger:hover { filter: brightness(0.93); }
  .btn-link {
    background: transparent; color: hsl(var(--color-text)); text-decoration: underline;
    text-underline-offset: 4px; border-radius: 6px; padding: 0 4px; height: auto;
  }
  .btn-link:hover { color: hsl(220 8% 42%); }

  .inp {
    width: 100%; height: 44px; padding: 0 14px; border-radius: 12px;
    background: hsl(var(--color-surface)); border: 1px solid hsl(var(--color-border));
    font-size: 14px; color: hsl(var(--color-text)); transition: 0.15s;
  }
  .inp::placeholder { color: hsl(var(--color-text-muted)); }
  .inp:hover { border-color: hsl(220 12% 76%); }
  .inp:focus-visible { border-color: hsl(var(--color-primary)); }
  .inp.err { border-color: hsl(var(--color-danger)); }

  .size {
    display: grid; place-items: center; height: 44px; border-radius: 12px;
    border: 1px solid hsl(var(--color-border)); font-weight: 600;
    background: hsl(var(--color-surface)); cursor: pointer;
  }
  .size:hover:not([disabled]) { border-color: hsl(var(--color-text)); }
  .size[aria-pressed='true'] {
    border-color: hsl(var(--color-text)); border-width: 2px;
    background: hsl(var(--color-text)); color: #fff;
  }
  .size[disabled] {
    color: hsl(var(--color-text-muted)); text-decoration: line-through;
    cursor: not-allowed; opacity: 0.55;
  }

  .thumb {
    border-radius: 12px; border: 1px solid hsl(var(--color-border));
    overflow: hidden; background: hsl(var(--color-surface-soft)); cursor: pointer;
  }
  .thumb[aria-current='true'] { border-color: hsl(var(--color-text)); border-width: 2px; }

  .count-btn { background: hsl(var(--color-surface-soft)); border-radius: 999px; padding: 4px; }

  .skel { background-image: linear-gradient(90deg, hsl(var(--color-surface-soft)) 0%, hsl(48 30% 89%) 50%, hsl(var(--color-surface-soft)) 100%); background-size: 200% 100%; animation: shimmer 1.4s ease infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skel { animation: none; } }
}
```

- [ ] **Step 4: `components/ui/button.tsx` (CVA поверх классов прототипа + loading)**

```tsx
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva('btn', {
  variants: {
    variant: {
      primary: 'btn-primary',
      dark: 'btn-dark',
      secondary: 'btn-secondary',
      accent: 'btn-accent',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
      link: 'btn-link',
    },
    size: { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, disabled, loading, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

- [ ] **Step 5: `components/ui/badge.tsx` (бейджи товара: Новинка/Бестселлер/Скидка/Лимитка/Распродано)**

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full',
  {
    variants: {
      tone: {
        new: 'bg-primary text-primary-foreground',
        bestseller: 'bg-ink text-white',
        discount: 'bg-warm text-ink',
        limited: 'bg-accent text-accent-foreground',
        soldout: 'bg-ink/70 text-white',
      },
    },
    defaultVariants: { tone: 'new' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```

- [ ] **Step 6: `components/ui/input.tsx`, `skeleton.tsx`, `counter.tsx`**

`input.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn('inp', className)} {...props} />
  ),
);
Input.displayName = 'Input';
export { Input };
```
`skeleton.tsx`:
```tsx
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skel rounded-md', className)} {...props} />;
}
```
`counter.tsx` (степпер количества — по прототипу `.count-btn`):
```tsx
'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CounterProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function Counter({ value, onChange, min = 1, max = 99, disabled }: CounterProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn = 'w-8 h-8 grid place-items-center rounded-full bg-surface border border-line text-lg hover:border-ink disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <div className={cn('count-btn inline-flex items-center gap-2', disabled && 'opacity-50')}>
      <button type="button" className={btn} onClick={dec} disabled={disabled || value <= min} aria-label="Уменьшить количество">
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center font-semibold tnum">{value}</span>
      <button type="button" className={btn} onClick={inc} disabled={disabled || value >= max} aria-label="Увеличить количество">
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: `components/ui/index.ts` (barrel)**

```ts
export { Button, buttonVariants } from './button';
export { Badge } from './badge';
export { Input } from './input';
export { Skeleton } from './skeleton';
export { Counter } from './counter';
```

- [ ] **Step 8: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 9: Commit**

```bash
git add stride-app/app/globals.css stride-app/tailwind.config.ts stride-app/components/ui
git commit -m "feat(stride-app): дизайн-система — токены прототипа в globals.css + UI-примитивы (Button/Badge/Input/Skeleton/Counter)"
```

---

## Task 4: Prisma schema + push

**Files:**
- Create: `stride-app/prisma/schema.prisma`

- [ ] **Step 1: `schema.prisma` — datasource/generator (дословно по референсу, без previewFeatures/output) + модель**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_URL")
  directUrl = env("POSTGRES_URL_NON_POOLING")
}

enum Gender {
  MEN
  WOMEN
  UNISEX
  KIDS
}

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
  brand        String
  gender       Gender   @default(UNISEX)
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id])
  description  String?
  fitNote      String?
  specs        Json?
  isBestseller Boolean  @default(false)
  active       Boolean  @default(true)
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  colorways    ProductColorway[]

  @@index([categoryId, sortOrder])
  @@index([brand])
  @@index([gender])
  @@index([active])
}

model ProductColorway {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  name      String
  slug      String
  swatchHex String?
  isDefault Boolean @default(false)
  sortOrder Int     @default(0)
  images    ProductImage[]
  variants  ProductVariant[]

  @@unique([productId, slug])
  @@index([productId])
}

model ProductImage {
  id         String          @id @default(cuid())
  colorwayId String
  colorway   ProductColorway @relation(fields: [colorwayId], references: [id], onDelete: Cascade)
  url        String
  alt        String?
  sortOrder  Int             @default(0)

  @@index([colorwayId, sortOrder])
}

model ProductVariant {
  id             String          @id @default(cuid())
  colorwayId     String
  colorway       ProductColorway @relation(fields: [colorwayId], references: [id], onDelete: Cascade)
  sizeEu         Decimal         @db.Decimal(3, 1)
  sku            String          @unique
  price          Int
  compareAtPrice Int?
  stock          Int             @default(0)
  active         Boolean         @default(true)
  cartItems      CartItem[]

  @@unique([colorwayId, sizeEu])
  @@index([colorwayId])
}

model Cart {
  id          String     @id @default(cuid())
  token       String     @unique
  userId      String?
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

  @@unique([cartId, productVariantId])
}
```

- [ ] **Step 2: Сгенерировать клиент**

Run: `npm run prisma:generate` — если такого скрипта нет, `npx prisma generate`
Expected: `Generated Prisma Client` без ошибок.

- [ ] **Step 3: Применить схему к Neon (нужен заполненный `.env`)**

> Предусловие: пользователь создал Neon-БД и заполнил `.env` (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`). Если `.env` нет — остановиться и запросить у пользователя строки подключения.

Run: `npm run prisma:push`
Expected: `Your database is now in sync with your Prisma schema` + создаются таблицы Category/Product/ProductColorway/ProductImage/ProductVariant/Cart/CartItem.

- [ ] **Step 4: Проверка типов (теперь `prisma` строго типизирован)**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): доменная модель Prisma (Category/Product/Colorway/Image/Variant/Cart/CartItem)"
```

---

## Task 5: Конфигурация (`constants/config.ts`)

**Files:**
- Create: `stride-app/constants/config.ts`

- [ ] **Step 1: `config.ts` — пороги, окна, EU-сетка, US/UK-таблица, опции сортировки**

```ts
// Единый источник бизнес-чисел Фазы 1.

export const FREE_SHIPPING_THRESHOLD = 10_000; // ₽, индикатор «Бесплатно от …»
export const NEW_PRODUCT_WINDOW_DAYS = 30;     // окно бейджа «Новинка» по createdAt
export const LOW_STOCK_THRESHOLD = 3;          // «Осталось N пар»

export const CATALOG_PAGE_SIZE = 12;

export const CART_COOKIE_NAME = 'cartToken';
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

// EU-сетка с полуразмерами (строки — для UI; в БД sizeEu Decimal(3,1)).
export const EU_SIZE_GRID = [
  '39', '39.5', '40', '40.5', '41', '41.5', '42', '42.5',
  '43', '43.5', '44', '44.5', '45', '45.5', '46',
] as const;

// Справочная конвертация (display-only, не SKU).
export const SIZE_CONVERSION: { eu: string; uk: string; us: string }[] = [
  { eu: '39', uk: '6', us: '7' },
  { eu: '40', uk: '6.5', us: '7.5' },
  { eu: '41', uk: '7.5', us: '8.5' },
  { eu: '42', uk: '8', us: '9' },
  { eu: '42.5', uk: '8.5', us: '9.5' },
  { eu: '43', uk: '9', us: '10' },
  { eu: '44', uk: '9.5', us: '10.5' },
  { eu: '45', uk: '10.5', us: '11.5' },
  { eu: '46', uk: '11', us: '12' },
];

// Опции сортировки каталога (значение в URL ?sort=).
export const SORT_OPTIONS = [
  { value: 'new', label: 'Сначала новинки' },
  { value: 'popular', label: 'Популярные' },
  { value: 'price-asc', label: 'Цена: по возрастанию' },
  { value: 'price-desc', label: 'Цена: по убыванию' },
  { value: 'discount', label: 'Сначала со скидкой' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];
export const DEFAULT_SORT: SortValue = 'new';

export const GENDER_OPTIONS = [
  { value: 'MEN', label: 'Мужские' },
  { value: 'WOMEN', label: 'Женские' },
  { value: 'UNISEX', label: 'Унисекс' },
  { value: 'KIDS', label: 'Детские' },
] as const;
```

- [ ] **Step 2: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add stride-app/constants/config.ts
git commit -m "feat(stride-app): конфиг Фазы 1 (пороги доставки/новинки/low-stock, EU-сетка, US/UK, сортировки)"
```

---

## Task 6: Доменные хелперы (формат/размер/бейджи) — TDD

**Files:**
- Create: `stride-app/lib/format.ts`
- Create: `stride-app/lib/product-badges.ts`
- Create: `stride-app/vitest.config.ts`
- Create: `stride-app/tests/format.test.ts`
- Create: `stride-app/tests/product-badges.test.ts`

- [ ] **Step 1: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
```

- [ ] **Step 2: Написать падающий тест `tests/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatPrice, normalizeSize } from '@/lib/format';

describe('formatPrice', () => {
  it('форматирует рубли с неразрывным пробелом-разделителем тысяч и знаком ₽', () => {
    expect(formatPrice(12990)).toBe('12 990 ₽');
    expect(formatPrice(0)).toBe('0 ₽');
    expect(formatPrice(1000000)).toBe('1 000 000 ₽');
  });
});

describe('normalizeSize', () => {
  it('целые размеры — без дробной части', () => {
    expect(normalizeSize(42)).toBe('42');
    expect(normalizeSize('42.0')).toBe('42');
  });
  it('полуразмеры — с .5', () => {
    expect(normalizeSize(42.5)).toBe('42.5');
    expect(normalizeSize('42.50')).toBe('42.5');
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает (RED)**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `Cannot find module '@/lib/format'`.

- [ ] **Step 4: Реализовать `lib/format.ts` (минимум для GREEN)**

```ts
// Размер приходит как Prisma.Decimal | number | string. Нормализуем к '42' / '42.5'.
export function normalizeSize(size: number | string | { toString(): string }): string {
  const n = typeof size === 'number' ? size : Number(size.toString());
  if (!Number.isFinite(n)) return String(size);
  // округляем до 0.5
  const rounded = Math.round(n * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const RUB = new Intl.NumberFormat('ru-RU', { useGrouping: true });

export function formatPrice(rub: number): string {
  // Intl в ru-RU использует узкий неразрывный пробел; нормализуем к обычному пробелу для стабильности тестов/верстки.
  const grouped = RUB.format(Math.round(rub)).replace(/ | /g, ' ');
  return `${grouped} ₽`;
}
```

- [ ] **Step 5: Запустить тест — GREEN**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: Написать падающий тест `tests/product-badges.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  isNewByDate,
  discountPercent,
  stockSummary,
  computeBadges,
} from '@/lib/product-badges';

describe('isNewByDate', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('товар в пределах окна — новинка', () => {
    expect(isNewByDate(new Date('2026-05-20T00:00:00Z'), now, 30)).toBe(true);
  });
  it('товар старше окна — не новинка', () => {
    expect(isNewByDate(new Date('2026-04-01T00:00:00Z'), now, 30)).toBe(false);
  });
});

describe('discountPercent', () => {
  it('считает процент скидки и округляет', () => {
    expect(discountPercent(11240, 14990)).toBe(25); // (1-11240/14990)=25.01 -> 25
  });
  it('null/отсутствие старой цены или не-скидка → null', () => {
    expect(discountPercent(12990, null)).toBeNull();
    expect(discountPercent(12990, 12990)).toBeNull();
    expect(discountPercent(12990, 10000)).toBeNull();
  });
});

describe('stockSummary', () => {
  it('суммирует сток активных вариантов и классифицирует', () => {
    expect(stockSummary([{ stock: 0, active: true }, { stock: 0, active: true }]))
      .toEqual({ total: 0, soldOut: true, low: false });
    expect(stockSummary([{ stock: 2, active: true }, { stock: 0, active: true }], 3))
      .toEqual({ total: 2, soldOut: false, low: true });
    expect(stockSummary([{ stock: 10, active: true }], 3))
      .toEqual({ total: 10, soldOut: false, low: false });
  });
  it('неактивные варианты не учитываются', () => {
    expect(stockSummary([{ stock: 99, active: false }]))
      .toEqual({ total: 0, soldOut: true, low: false });
  });
});

describe('computeBadges', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('возвращает приоритезированный набор бейджей', () => {
    const badges = computeBadges(
      {
        createdAt: new Date('2026-05-25T00:00:00Z'),
        isBestseller: true,
        minPrice: 11240,
        minCompareAtPrice: 14990,
        stockTotal: 5,
      },
      now,
      { newWindowDays: 30, lowStock: 3 },
    );
    // soldout отсутствует; скидка/новинка/бестселлер присутствуют
    expect(badges.map((b) => b.tone)).toEqual(expect.arrayContaining(['discount', 'new', 'bestseller']));
  });
  it('распродано имеет наивысший приоритет и единственный', () => {
    const badges = computeBadges(
      { createdAt: now, isBestseller: true, minPrice: 12990, minCompareAtPrice: 15990, stockTotal: 0 },
      now,
      { newWindowDays: 30, lowStock: 3 },
    );
    expect(badges).toEqual([{ tone: 'soldout', label: 'Распродано' }]);
  });
});
```

- [ ] **Step 7: Запустить — RED**

Run: `npx vitest run tests/product-badges.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 8: Реализовать `lib/product-badges.ts`**

```ts
export type BadgeTone = 'new' | 'bestseller' | 'discount' | 'limited' | 'soldout';
export interface ProductBadge { tone: BadgeTone; label: string; }

export function isNewByDate(createdAt: Date, now: Date, windowDays: number): boolean {
  const ms = windowDays * 24 * 60 * 60 * 1000;
  return now.getTime() - createdAt.getTime() <= ms;
}

export function discountPercent(price: number, compareAtPrice: number | null | undefined): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round((1 - price / compareAtPrice) * 100);
}

export interface VariantStock { stock: number; active: boolean; }
export interface StockSummary { total: number; soldOut: boolean; low: boolean; }

export function stockSummary(variants: VariantStock[], lowThreshold = 3): StockSummary {
  const total = variants.filter((v) => v.active).reduce((acc, v) => acc + Math.max(0, v.stock), 0);
  return { total, soldOut: total === 0, low: total > 0 && total <= lowThreshold };
}

export interface BadgeInput {
  createdAt: Date;
  isBestseller: boolean;
  minPrice: number;
  minCompareAtPrice: number | null;
  stockTotal: number;
}

export function computeBadges(
  input: BadgeInput,
  now: Date,
  opts: { newWindowDays: number; lowStock: number },
): ProductBadge[] {
  if (input.stockTotal === 0) return [{ tone: 'soldout', label: 'Распродано' }];

  const badges: ProductBadge[] = [];
  const pct = discountPercent(input.minPrice, input.minCompareAtPrice);
  if (pct !== null) badges.push({ tone: 'discount', label: `−${pct}%` });
  if (isNewByDate(input.createdAt, now, opts.newWindowDays)) badges.push({ tone: 'new', label: 'Новинка' });
  if (input.isBestseller) badges.push({ tone: 'bestseller', label: 'Бестселлер' });
  return badges;
}
```

- [ ] **Step 9: Запустить все тесты — GREEN**

Run: `npx vitest run`
Expected: PASS (format + product-badges).

- [ ] **Step 10: Commit**

```bash
git add stride-app/vitest.config.ts stride-app/lib/format.ts stride-app/lib/product-badges.ts stride-app/tests
git commit -m "feat(stride-app): хелперы формата/размера/бейджей + unit-тесты (TDD)"
```

---

## Task 7: Построитель фильтров каталога (searchParams → Prisma where/orderBy + counts) — TDD

**Files:**
- Create: `stride-app/lib/catalog-filters.ts`
- Create: `stride-app/tests/catalog-filters.test.ts`

> Назначение: чистая трансформация URL searchParams в Prisma-аргументы. Чтобы тестировать без БД, функция возвращает объект `{ where, orderBy, skip, take, page }` — его проверяем юнит-тестами. Сам запрос делается в `find-products.ts` (Задача 15).

- [ ] **Step 1: Падающий тест `tests/catalog-filters.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseCatalogParams, buildProductWhere, buildOrderBy } from '@/lib/catalog-filters';

describe('parseCatalogParams', () => {
  it('дефолты при пустом вводе', () => {
    const p = parseCatalogParams({});
    expect(p.page).toBe(1);
    expect(p.sort).toBe('new');
    expect(p.categories).toEqual([]);
    expect(p.sizes).toEqual([]);
    expect(p.inStock).toBe(false);
  });
  it('парсит CSV-списки, цену, флаги', () => {
    const p = parseCatalogParams({
      category: 'running,lifestyle',
      size: '42,42.5',
      color: 'lime,black',
      brand: 'Nike',
      gender: 'MEN',
      priceFrom: '8000',
      priceTo: '16000',
      inStock: '1',
      sort: 'price-asc',
      page: '3',
      q: 'trail',
    });
    expect(p.categories).toEqual(['running', 'lifestyle']);
    expect(p.sizes).toEqual(['42', '42.5']);
    expect(p.colors).toEqual(['lime', 'black']);
    expect(p.brands).toEqual(['Nike']);
    expect(p.genders).toEqual(['MEN']);
    expect(p.priceFrom).toBe(8000);
    expect(p.priceTo).toBe(16000);
    expect(p.inStock).toBe(true);
    expect(p.sort).toBe('price-asc');
    expect(p.page).toBe(3);
    expect(p.query).toBe('trail');
  });
  it('некорректная сортировка/страница → дефолт', () => {
    const p = parseCatalogParams({ sort: 'bogus', page: '0' });
    expect(p.sort).toBe('new');
    expect(p.page).toBe(1);
  });
});

describe('buildProductWhere', () => {
  it('базовый инвариант — только active', () => {
    const where = buildProductWhere(parseCatalogParams({}));
    expect(where).toEqual({ active: true });
  });
  it('категория/бренд/gender — прямые фильтры; размер/цвет/цена/инсток — через colorways.variants', () => {
    const where = buildProductWhere(parseCatalogParams({
      category: 'running', brand: 'Nike', gender: 'MEN',
      size: '42', color: 'lime', priceFrom: '8000', priceTo: '16000', inStock: '1',
    }));
    expect(where.active).toBe(true);
    expect(where.category).toEqual({ slug: { in: ['running'] } });
    expect(where.brand).toEqual({ in: ['Nike'] });
    expect(where.gender).toEqual({ in: ['MEN'] });
    // colorways.some.variants.some с ценой/размером/active+stock, и colorways.some.slug для цвета
    expect(where.colorways).toBeDefined();
  });
  it('поиск по имени — insensitive contains', () => {
    const where = buildProductWhere(parseCatalogParams({ q: 'trail' }));
    expect(where.name).toEqual({ contains: 'trail', mode: 'insensitive' });
  });
});

describe('buildOrderBy', () => {
  it('маппит сортировки', () => {
    expect(buildOrderBy('new')).toEqual([{ createdAt: 'desc' }, { sortOrder: 'asc' }]);
    expect(buildOrderBy('popular')).toEqual([{ isBestseller: 'desc' }, { sortOrder: 'asc' }]);
    expect(buildOrderBy('price-asc')).toBeDefined();
    expect(buildOrderBy('price-desc')).toBeDefined();
    expect(buildOrderBy('discount')).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/catalog-filters.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/catalog-filters.ts`** `(context7)`

```ts
import type { Prisma } from '@prisma/client';
import { CATALOG_PAGE_SIZE, DEFAULT_SORT, SORT_OPTIONS, type SortValue } from '@/constants/config';

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface CatalogParams {
  categories: string[]; // slugs
  sizes: string[];      // '42','42.5'
  colors: string[];     // colorway slugs
  brands: string[];
  genders: string[];    // 'MEN'...
  priceFrom?: number;
  priceTo?: number;
  inStock: boolean;
  sort: SortValue;
  page: number;
  query?: string;
}

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const csv = (v: string | string[] | undefined): string[] => {
  const s = first(v);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as readonly string[];

export function parseCatalogParams(sp: RawSearchParams): CatalogParams {
  const sortRaw = first(sp.sort);
  const sort: SortValue = (SORT_VALUES.includes(sortRaw ?? '') ? sortRaw : DEFAULT_SORT) as SortValue;

  const pageNum = Number(first(sp.page));
  const page = Number.isInteger(pageNum) && pageNum > 1 ? pageNum : 1;

  const priceFromNum = Number(first(sp.priceFrom));
  const priceToNum = Number(first(sp.priceTo));

  return {
    categories: csv(sp.category),
    sizes: csv(sp.size),
    colors: csv(sp.color),
    brands: csv(sp.brand),
    genders: csv(sp.gender),
    priceFrom: Number.isFinite(priceFromNum) && priceFromNum > 0 ? priceFromNum : undefined,
    priceTo: Number.isFinite(priceToNum) && priceToNum > 0 ? priceToNum : undefined,
    inStock: first(sp.inStock) === '1' || first(sp.inStock) === 'true',
    sort,
    page,
    query: first(sp.q)?.trim() || undefined,
  };
}

// where для активного варианта (цена/размер/доступность) — переиспользуется в include.
function variantWhere(p: CatalogParams): Prisma.ProductVariantWhereInput {
  const price: Prisma.IntFilter = {};
  if (p.priceFrom !== undefined) price.gte = p.priceFrom;
  if (p.priceTo !== undefined) price.lte = p.priceTo;
  const w: Prisma.ProductVariantWhereInput = { active: true };
  if (Object.keys(price).length) w.price = price;
  if (p.sizes.length) w.sizeEu = { in: p.sizes };
  if (p.inStock) w.stock = { gt: 0 };
  return w;
}

export function buildProductWhere(p: CatalogParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { active: true };

  if (p.categories.length) where.category = { slug: { in: p.categories } };
  if (p.brands.length) where.brand = { in: p.brands };
  if (p.genders.length) where.gender = { in: p.genders as Prisma.EnumGenderFilter['in'] };
  if (p.query) where.name = { contains: p.query, mode: 'insensitive' };

  // Фильтры на уровне расцветок/вариантов: цвет — slug расцветки; размер/цена/инсток — её варианты.
  const colorwaySome: Prisma.ProductColorwayWhereInput = {};
  if (p.colors.length) colorwaySome.slug = { in: p.colors };
  const vWhere = variantWhere(p);
  const hasVariantFilter = p.sizes.length || p.priceFrom !== undefined || p.priceTo !== undefined || p.inStock;
  if (hasVariantFilter) colorwaySome.variants = { some: vWhere };
  if (Object.keys(colorwaySome).length) where.colorways = { some: colorwaySome };

  return where;
}

export function buildOrderBy(sort: SortValue): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'popular':
      return [{ isBestseller: 'desc' }, { sortOrder: 'asc' }];
    case 'price-asc':
      // Цена живёт в вариантах; для сортировки по цене на уровне Product используем sortOrder как прокси
      // + точную сортировку делаем в find-products по агрегированной minPrice (см. Задача 15).
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'price-desc':
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'discount':
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'new':
    default:
      return [{ createdAt: 'desc' }, { sortOrder: 'asc' }];
  }
}

export const PAGE_SIZE = CATALOG_PAGE_SIZE;

export function buildPagination(page: number) {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}
```
> Примечание по цене: точная сортировка по `minPrice`/`discount` требует агрегирования цены вариантов. В Фазе 1 на уровне Prisma `orderBy` это прокси по `sortOrder`; финальная досортировка по вычисленной `minPrice`/`discount` делается в памяти в `find-products.ts` (Задача 15, страница ≤ PAGE_SIZE). Это зафиксировано как допущение.

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/catalog-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Прогнать все тесты**

Run: `npm test`
Expected: PASS (format, product-badges, catalog-filters).

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/catalog-filters.ts stride-app/tests/catalog-filters.test.ts
git commit -m "feat(stride-app): построитель фильтров каталога (searchParams→where/orderBy) + unit-тесты (TDD)"
```

---

## Task 8: Сид (5 демо-моделей с расцветками/размерами/стоком)

**Files:**
- Create: `stride-app/public/products/` (копии демо-изображений)
- Create: `stride-app/prisma/seed-data.ts`
- Create: `stride-app/prisma/seed.ts`

- [ ] **Step 1: Скопировать демо-изображения в `public/products/`**

Run (из корня репозитория):
```bash
mkdir -p stride-app/public/products
cp "ui-designe and prototypes/docs/design/product-images/"*.jpeg stride-app/public/products/
cp "ui-designe and prototypes/docs/design/product-images/"*.png stride-app/public/products/
ls stride-app/public/products
```
Expected: 7 файлов (nike-air-max-270.jpeg, adidas-ultraboost.jpeg, converse-chuck-70.jpeg, new-balance-550.jpeg, puma-rs-x.jpeg, два Professional_*.png).

- [ ] **Step 2: `prisma/seed-data.ts` — категории + 5 моделей (расцветки/изображения/варианты)**

```ts
import type { Prisma } from '@prisma/client';

export const categories: Prisma.CategoryCreateManyInput[] = [
  { name: 'Беговые', slug: 'running', tagline: 'Скорость и амортизация', sortOrder: 1 },
  { name: 'Лайфстайл', slug: 'lifestyle', tagline: 'Город и стиль', sortOrder: 2 },
  { name: 'Платформы', slug: 'platform', tagline: 'Высота и характер', sortOrder: 3 },
];

// Хелпер: размерный ряд EU с индивидуальным стоком.
type SizeStock = { eu: string; stock: number };
function variants(skuBase: string, price: number, compareAtPrice: number | null, rows: SizeStock[]): Prisma.ProductVariantCreateWithoutColorwayInput[] {
  return rows.map((r) => ({
    sizeEu: r.eu,
    sku: `${skuBase}-${r.eu.replace('.', '_')}`,
    price,
    compareAtPrice: compareAtPrice ?? undefined,
    stock: r.stock,
    active: true,
  }));
}

const RUN = [
  { eu: '40', stock: 4 }, { eu: '41', stock: 3 }, { eu: '42', stock: 5 },
  { eu: '42.5', stock: 2 }, { eu: '43', stock: 0 }, { eu: '44', stock: 6 }, { eu: '45', stock: 1 },
];
const LIFE = [
  { eu: '39', stock: 2 }, { eu: '40', stock: 4 }, { eu: '41', stock: 0 },
  { eu: '42', stock: 3 }, { eu: '43', stock: 5 }, { eu: '44', stock: 2 },
];

export interface SeedProduct {
  product: Omit<Prisma.ProductCreateInput, 'category' | 'colorways'>;
  categorySlug: string;
  colorways: Prisma.ProductColorwayCreateWithoutProductInput[];
}

export const products: SeedProduct[] = [
  {
    categorySlug: 'running',
    product: {
      name: 'STRIDE Velocity Trail', slug: 'stride-velocity-trail', brand: 'Nike', gender: 'MEN',
      description: 'Беговые кроссовки STRIDE для города и трассы. Дышащий верх, мягкая амортизация, цепкий протектор.',
      fitNote: 'Маломерят на полразмера — бери на размер больше привычного.',
      specs: { 'Назначение': 'Бег, город', 'Верх': 'Текстиль, сетка', 'Подошва': 'EVA-пена', 'Сезон': 'Демисезон', 'Страна': 'Вьетнам', 'Артикул': '102270093' },
      isBestseller: true, sortOrder: 1,
    },
    colorways: [
      { name: 'Lime Flash', slug: 'lime-flash', swatchHex: '#bfff00', isDefault: true, sortOrder: 1,
        images: { create: [{ url: '/products/nike-air-max-270.jpeg', alt: 'STRIDE Velocity Trail Lime Flash', sortOrder: 0 }] },
        variants: { create: variants('SVT-LIME', 12990, null, RUN) } },
      { name: 'Trail Black', slug: 'trail-black', swatchHex: '#1a1a1a', sortOrder: 2,
        images: { create: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Velocity Trail Black', sortOrder: 0 }] },
        variants: { create: variants('SVT-BLK', 12990, null, RUN) } },
    ],
  },
  {
    categorySlug: 'lifestyle',
    product: {
      name: 'STRIDE Court Classic', slug: 'stride-court-classic', brand: 'Adidas', gender: 'UNISEX',
      description: 'Лайфстайл-классика на каждый день: чистый силуэт, премиальные материалы.',
      fitNote: 'Размер в размер.',
      specs: { 'Назначение': 'Город', 'Верх': 'Кожа', 'Подошва': 'Резина', 'Сезон': 'Всесезон', 'Страна': 'Вьетнам', 'Артикул': '102270080' },
      sortOrder: 2,
    },
    colorways: [
      { name: 'Court White', slug: 'court-white', swatchHex: '#ffffff', isDefault: true, sortOrder: 1,
        images: { create: [{ url: '/products/adidas-ultraboost.jpeg', alt: 'STRIDE Court Classic White', sortOrder: 0 }] },
        variants: { create: variants('SCC-WHT', 11240, 14990, LIFE) } },
    ],
  },
  {
    categorySlug: 'platform',
    product: {
      name: 'STRIDE Cloud Platform', slug: 'stride-cloud-platform', brand: 'New Balance', gender: 'WOMEN',
      description: 'Платформа с максимальной высотой и мягкой посадкой.',
      fitNote: 'Маломерят на полразмера.',
      specs: { 'Назначение': 'Город', 'Верх': 'Замша', 'Подошва': 'EVA', 'Сезон': 'Демисезон', 'Страна': 'Индонезия', 'Артикул': '102180550' },
      isBestseller: true, sortOrder: 3,
    },
    colorways: [
      { name: 'Beige Cloud', slug: 'beige-cloud', swatchHex: '#e8e0d0', isDefault: true, sortOrder: 1,
        images: { create: [{ url: '/products/new-balance-550.jpeg', alt: 'STRIDE Cloud Platform Beige', sortOrder: 0 }] },
        variants: { create: variants('SCP-BEI', 15490, null, [{ eu: '36', stock: 1 }, { eu: '37', stock: 2 }, { eu: '38', stock: 0 }, { eu: '39', stock: 1 }, { eu: '40', stock: 0 }]) } },
    ],
  },
  {
    categorySlug: 'running',
    product: {
      name: 'STRIDE Trail Pro', slug: 'stride-trail-pro', brand: 'Puma', gender: 'MEN',
      description: 'Трейловые кроссовки с агрессивным протектором и защитой носка.',
      fitNote: 'Размер в размер.',
      specs: { 'Назначение': 'Трейл', 'Верх': 'Сетка, TPU', 'Подошва': 'Резина Vibram-типа', 'Сезон': 'Лето', 'Страна': 'Вьетнам', 'Артикул': '102270111' },
      sortOrder: 4,
    },
    colorways: [
      { name: 'Forest', slug: 'forest', swatchHex: '#2f4030', isDefault: true, sortOrder: 1,
        images: { create: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Trail Pro Forest', sortOrder: 0 }] },
        variants: { create: variants('STP-FOR', 13490, null, RUN) } },
    ],
  },
  {
    categorySlug: 'lifestyle',
    product: {
      name: 'STRIDE Chuck Heritage', slug: 'stride-chuck-heritage', brand: 'Converse', gender: 'UNISEX',
      description: 'Вечная классика в обновлённом исполнении STRIDE.',
      fitNote: 'Маломерят на полный размер — бери на размер больше.',
      specs: { 'Назначение': 'Город', 'Верх': 'Текстиль', 'Подошва': 'Резина', 'Сезон': 'Всесезон', 'Страна': 'Вьетнам', 'Артикул': '102180610' },
      sortOrder: 5,
    },
    colorways: [
      { name: 'Off White', slug: 'off-white', swatchHex: '#f3efe6', isDefault: true, sortOrder: 1,
        images: { create: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Chuck Heritage Off White', sortOrder: 0 }] },
        variants: { create: variants('SCH-OWH', 8990, 10990, LIFE) } },
      { name: 'Black', slug: 'black', swatchHex: '#1a1a1a', sortOrder: 2,
        images: { create: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Chuck Heritage Black', sortOrder: 0 }] },
        variants: { create: variants('SCH-BLK', 8990, null, LIFE) } },
    ],
  },
];
```

- [ ] **Step 3: `prisma/seed.ts` — down() (FK-safe deleteMany) + up() (nested create) + раннер с throw**

```ts
import { prisma } from '../lib/prisma-client';
import { categories, products } from './seed-data';

async function down() {
  // Дети → родители (Neon HTTP: без $transaction, последовательно).
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productColorway.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
}

async function up() {
  await prisma.category.createMany({ data: categories });
  const cats = await prisma.category.findMany();
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]));

  for (const item of products) {
    const categoryId = bySlug.get(item.categorySlug);
    if (!categoryId) throw new Error(`Категория не найдена: ${item.categorySlug}`);
    await prisma.product.create({
      data: {
        ...item.product,
        category: { connect: { id: categoryId } },
        colorways: { create: item.colorways },
      },
    });
  }
}

async function main() {
  await down();
  await up();
  const count = await prisma.product.count();
  console.log(`Seed готов: ${count} моделей`);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Запустить сид**

Run: `npm run prisma:seed`
Expected: `Seed готов: 5 моделей`, без ошибок.
> Если `ts-node` не находит alias `@` — в seed/seed-data импорты относительные (`../lib/...`, `./seed-data`), alias не используется. Если падает на ESM — секция `prisma.seed` уже в CommonJS-режиме (Задача 1).

- [ ] **Step 5: Проверить данные в Studio (опц.)**

Run: `npm run prisma:studio` → открыть таблицы Product/ProductColorway/ProductVariant; убедиться, что у Velocity Trail 2 расцветки, есть размер `42.5`, есть варианты со `stock=0`. Закрыть.

- [ ] **Step 6: Commit**

```bash
git add stride-app/prisma/seed.ts stride-app/prisma/seed-data.ts stride-app/public/products
git commit -m "feat(stride-app): сид — 5 демо-моделей с расцветками/размерами/стоком + демо-изображения"
```

---

## Task 9: Доменная логика корзины (recalc/маппинг/DTO) — TDD

**Files:**
- Create: `stride-app/services/dto/cart.dto.ts`
- Create: `stride-app/lib/cart.ts`
- Create: `stride-app/tests/cart.test.ts`

- [ ] **Step 1: `services/dto/cart.dto.ts` — Zod-схемы входа + тип состояния**

```ts
import { z } from 'zod';

export const createCartItemSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.number().int().positive().max(99).optional(),
});
export type CreateCartItemValues = z.infer<typeof createCartItemSchema>;

export const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(99),
});
export type UpdateQuantityValues = z.infer<typeof updateQuantitySchema>;

// Плоская позиция корзины для клиента (Zustand-стор).
export interface CartStateItem {
  id: string;
  quantity: number;
  name: string;
  productSlug: string;
  colorwayName: string;
  sizeEu: string;
  imageUrl: string | null;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  available: boolean;
  disabled?: boolean;
}

export interface CartDetails {
  items: CartStateItem[];
  totalAmount: number;
}
```

- [ ] **Step 2: Падающий тест `tests/cart.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { calcLineTotal, getCartDetails, type CartWithItems } from '@/lib/cart';
import { createCartItemSchema, updateQuantitySchema } from '@/services/dto/cart.dto';

function fakeCart(): CartWithItems {
  return {
    id: 'cart1', token: 'tok', userId: null, totalAmount: 0,
    createdAt: new Date(), updatedAt: new Date(),
    items: [
      {
        id: 'i1', cartId: 'cart1', productVariantId: 'v1', quantity: 2, createdAt: new Date(),
        productVariant: {
          id: 'v1', colorwayId: 'c1', sizeEu: 42.5 as unknown as never, sku: 'X-42_5',
          price: 12990, compareAtPrice: null, stock: 5, active: true,
          colorway: {
            id: 'c1', productId: 'p1', name: 'Lime Flash', slug: 'lime-flash',
            swatchHex: '#bfff00', isDefault: true, sortOrder: 1,
            product: { name: 'STRIDE Velocity Trail', slug: 'stride-velocity-trail' },
            images: [{ id: 'im1', colorwayId: 'c1', url: '/products/x.jpeg', alt: null, sortOrder: 0 }],
          },
        },
      },
    ],
  } as unknown as CartWithItems;
}

describe('calcLineTotal', () => {
  it('цена варианта × количество', () => {
    expect(calcLineTotal(12990, 2)).toBe(25980);
  });
});

describe('getCartDetails', () => {
  it('разворачивает CartWithItems в плоские позиции + totalAmount', () => {
    const details = getCartDetails(fakeCart());
    expect(details.totalAmount).toBe(25980);
    expect(details.items).toHaveLength(1);
    const it0 = details.items[0];
    expect(it0).toMatchObject({
      id: 'i1', quantity: 2, name: 'STRIDE Velocity Trail', productSlug: 'stride-velocity-trail',
      colorwayName: 'Lime Flash', sizeEu: '42.5', imageUrl: '/products/x.jpeg',
      unitPrice: 12990, lineTotal: 25980, stock: 5, available: true,
    });
  });
  it('недоступная позиция (stock 0) → available=false', () => {
    const cart = fakeCart();
    (cart.items[0].productVariant as { stock: number }).stock = 0;
    const details = getCartDetails(cart);
    expect(details.items[0].available).toBe(false);
  });
});

describe('zod-схемы корзины', () => {
  it('createCartItemSchema принимает валидный ввод', () => {
    expect(createCartItemSchema.parse({ productVariantId: 'v1' }).productVariantId).toBe('v1');
    expect(createCartItemSchema.parse({ productVariantId: 'v1', quantity: 3 }).quantity).toBe(3);
  });
  it('createCartItemSchema отклоняет пустой id и quantity<=0', () => {
    expect(createCartItemSchema.safeParse({ productVariantId: '' }).success).toBe(false);
    expect(createCartItemSchema.safeParse({ productVariantId: 'v', quantity: 0 }).success).toBe(false);
  });
  it('updateQuantitySchema требует quantity>=1', () => {
    expect(updateQuantitySchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(updateQuantitySchema.parse({ quantity: 2 }).quantity).toBe(2);
  });
});
```

- [ ] **Step 3: Запустить — RED**

Run: `npx vitest run tests/cart.test.ts`
Expected: FAIL — `@/lib/cart` не найден.

- [ ] **Step 4: Реализовать `lib/cart.ts` (серверные функции + чистый маппинг)** `(context7)`

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { normalizeSize } from '@/lib/format';
import type { CartDetails, CartStateItem } from '@/services/dto/cart.dto';

// Граф включения для всех чтений/мутаций корзины.
export const cartInclude = {
  items: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      productVariant: {
        include: {
          colorway: {
            include: {
              product: { select: { name: true, slug: true } },
              images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export function calcLineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

// Чистая функция: разворачивает серверный объект в плоские позиции для клиента.
export function getCartDetails(cart: CartWithItems): CartDetails {
  const items: CartStateItem[] = cart.items.map((item) => {
    const v = item.productVariant;
    const cw = v.colorway;
    const unitPrice = v.price;
    return {
      id: item.id,
      quantity: item.quantity,
      name: cw.product.name,
      productSlug: cw.product.slug,
      colorwayName: cw.name,
      sizeEu: normalizeSize(v.sizeEu as unknown as number),
      imageUrl: cw.images[0]?.url ?? null,
      unitPrice,
      lineTotal: calcLineTotal(unitPrice, item.quantity),
      stock: v.stock,
      available: v.active && v.stock > 0,
    };
  });
  const totalAmount = items.reduce((acc, i) => acc + i.lineTotal, 0);
  return { items, totalAmount };
}

// findOrCreateCart по cookie-токену.
export async function findOrCreateCart(token: string) {
  const existing = await prisma.cart.findFirst({ where: { token } });
  if (existing) return existing;
  return prisma.cart.create({ data: { token } });
}

// Пересчёт totalAmount БЕЗ $transaction: update без include, затем перезагрузка с include.
export async function recalcCartTotalByToken(token: string): Promise<CartWithItems | null> {
  const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
  if (!cart) return null;
  const totalAmount = cart.items.reduce((acc, i) => acc + calcLineTotal(i.productVariant.price, i.quantity), 0);
  await prisma.cart.update({ where: { id: cart.id }, data: { totalAmount } });
  return prisma.cart.findFirst({ where: { id: cart.id }, include: cartInclude });
}
```

- [ ] **Step 5: Запустить — GREEN**

Run: `npx vitest run tests/cart.test.ts`
Expected: PASS.

- [ ] **Step 6: Прогнать все тесты**

Run: `npm test`
Expected: PASS (format, product-badges, catalog-filters, cart).

- [ ] **Step 7: Commit**

```bash
git add stride-app/services/dto/cart.dto.ts stride-app/lib/cart.ts stride-app/tests/cart.test.ts
git commit -m "feat(stride-app): доменная логика корзины (recalc/маппинг/Zod-DTO) + unit-тесты (TDD)"
```

---

## Task 10: REST-роуты корзины (GET/POST/PATCH/DELETE) — без `$transaction`

**Files:**
- Create: `stride-app/lib/cart-cookie.ts`
- Create: `stride-app/app/api/cart/route.ts`
- Create: `stride-app/app/api/cart/[id]/route.ts`

- [ ] **Step 1: `lib/cart-cookie.ts` — имя/опции cookie**

```ts
import { CART_COOKIE_NAME, CART_COOKIE_MAX_AGE } from '@/constants/config';

export const cartCookieName = CART_COOKIE_NAME;

export const cartCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: CART_COOKIE_MAX_AGE,
  path: '/',
};
```

- [ ] **Step 2: `app/api/cart/route.ts` — GET (чтение) + POST (добавление)** `(context7)`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, findOrCreateCart, recalcCartTotalByToken } from '@/lib/cart';
import { cartCookieName, cartCookieOptions } from '@/lib/cart-cookie';
import { createCartItemSchema } from '@/services/dto/cart.dto';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const token = req.cookies.get(cartCookieName)?.value;
      if (!token) return NextResponse.json({ id: null, token: null, totalAmount: 0, items: [] });
      const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
      return NextResponse.json(cart ?? { id: null, token, totalAmount: 0, items: [] });
    } catch (error) {
      logger.error('cart_get_failed', error);
      return NextResponse.json({ message: 'Не удалось получить корзину' }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      let token = req.cookies.get(cartCookieName)?.value;
      if (!token) token = randomUUID();

      const parsed = createCartItemSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ message: 'Некорректные данные', issues: parsed.error.flatten() }, { status: 400 });
      }
      const { productVariantId, quantity = 1 } = parsed.data;

      const cart = await findOrCreateCart(token);

      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        include: { colorway: { include: { product: { select: { active: true } } } } },
      });
      if (!variant) return NextResponse.json({ message: 'Товар не найден' }, { status: 404 });
      if (!variant.active || !variant.colorway.product.active) {
        return NextResponse.json({ message: 'Товар недоступен' }, { status: 409 });
      }

      const existing = await prisma.cartItem.findUnique({
        where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
      });
      const nextQty = (existing?.quantity ?? 0) + quantity;
      if (variant.stock < nextQty) {
        return NextResponse.json({ message: 'Недостаточно на складе' }, { status: 409 });
      }

      if (existing) {
        await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
      } else {
        await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId, quantity } });
      }

      const updated = await recalcCartTotalByToken(token);
      const resp = NextResponse.json(updated);
      resp.cookies.set(cartCookieName, token, cartCookieOptions);
      return resp;
    } catch (error) {
      logger.error('cart_post_failed', error);
      return NextResponse.json({ message: 'Не удалось добавить в корзину' }, { status: 500 });
    }
  });
}
```

- [ ] **Step 3: `app/api/cart/[id]/route.ts` — PATCH (количество) + DELETE (удаление)** `(context7)`

> Next 15: второй аргумент роута — `{ params }: { params: Promise<{ id: string }> }`, `params` нужно `await`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma-client';
import { recalcCartTotalByToken } from '@/lib/cart';
import { cartCookieName } from '@/lib/cart-cookie';
import { updateQuantitySchema } from '@/services/dto/cart.dto';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return runWithRequestContext(req, async () => {
    try {
      const { id } = await params;
      const token = req.cookies.get(cartCookieName)?.value;
      if (!token) return NextResponse.json({ message: 'Корзина не найдена' }, { status: 401 });

      const parsed = updateQuantitySchema.safeParse(await req.json());
      if (!parsed.success) return NextResponse.json({ message: 'Некорректное количество' }, { status: 400 });

      // Позиция должна принадлежать корзине этого токена.
      const item = await prisma.cartItem.findFirst({
        where: { id, cart: { token } },
        include: { productVariant: { select: { stock: true } } },
      });
      if (!item) return NextResponse.json({ message: 'Позиция не найдена' }, { status: 404 });
      if (item.productVariant.stock < parsed.data.quantity) {
        return NextResponse.json({ message: 'Недостаточно на складе' }, { status: 409 });
      }

      await prisma.cartItem.update({ where: { id }, data: { quantity: parsed.data.quantity } });
      const updated = await recalcCartTotalByToken(token);
      return NextResponse.json(updated);
    } catch (error) {
      logger.error('cart_patch_failed', error);
      return NextResponse.json({ message: 'Не удалось обновить корзину' }, { status: 500 });
    }
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return runWithRequestContext(req, async () => {
    try {
      const { id } = await params;
      const token = req.cookies.get(cartCookieName)?.value;
      if (!token) return NextResponse.json({ message: 'Корзина не найдена' }, { status: 401 });

      const item = await prisma.cartItem.findFirst({ where: { id, cart: { token } } });
      if (!item) return NextResponse.json({ message: 'Позиция не найдена' }, { status: 404 });

      await prisma.cartItem.delete({ where: { id } });
      const updated = await recalcCartTotalByToken(token);
      return NextResponse.json(updated);
    } catch (error) {
      logger.error('cart_delete_failed', error);
      return NextResponse.json({ message: 'Не удалось удалить позицию' }, { status: 500 });
    }
  });
}
```

- [ ] **Step 4: Ручная проверка роутов (dev + curl)**

Run: `npm run dev` (в одном терминале). В другом:
```bash
# variantId узнать из Studio или: один из SVT-LIME-42
VID=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.productVariant.findFirst({where:{sku:'SVT-LIME-42'}}).then(v=>{console.log(v.id);process.exit(0)})")
curl -s -c /tmp/cj.txt -X POST localhost:3000/api/cart -H 'content-type: application/json' -d "{\"productVariantId\":\"$VID\"}" | head -c 400
echo; curl -s -b /tmp/cj.txt localhost:3000/api/cart | head -c 400
```
Expected: POST возвращает объект корзины с `items[0].quantity=1` и `totalAmount=12990`; GET возвращает ту же корзину. Остановить dev.
> Если `@prisma/client` в инлайн-node не находит сгенерённый клиент — взять variantId из `npm run prisma:studio`.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/cart-cookie.ts stride-app/app/api/cart
git commit -m "feat(stride-app): REST-корзина (GET/POST/PATCH/DELETE), cookie cartToken, без \$transaction"
```

---

## Task 11: Клиент корзины (axios + Api.cart + Zustand-стор + use-cart)

**Files:**
- Create: `stride-app/services/instance.ts`
- Create: `stride-app/services/cart.ts`
- Create: `stride-app/services/api-client.ts`
- Create: `stride-app/store/cart.ts`
- Create: `stride-app/store/index.ts`
- Create: `stride-app/hooks/use-cart.ts`

- [ ] **Step 1: `services/instance.ts`**

```ts
import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // cookie cartToken должен ходить с запросами
});
```

- [ ] **Step 2: `services/cart.ts` (string id, эндпоинты `/cart`)**

```ts
import { axiosInstance } from './instance';
import type { CreateCartItemValues } from './dto/cart.dto';
import type { CartWithItems } from '@/lib/cart';

export const getCart = async (): Promise<CartWithItems> =>
  (await axiosInstance.get<CartWithItems>('/cart')).data;

export const addCartItem = async (values: CreateCartItemValues): Promise<CartWithItems> =>
  (await axiosInstance.post<CartWithItems>('/cart', values)).data;

export const updateItemQuantity = async (id: string, quantity: number): Promise<CartWithItems> =>
  (await axiosInstance.patch<CartWithItems>(`/cart/${id}`, { quantity })).data;

export const removeCartItem = async (id: string): Promise<CartWithItems> =>
  (await axiosInstance.delete<CartWithItems>(`/cart/${id}`)).data;
```

- [ ] **Step 3: `services/api-client.ts`**

```ts
import * as cart from './cart';

export const Api = { cart };
```

- [ ] **Step 4: `store/cart.ts` (Zustand, паттерн set(getCartDetails(data)))** `(context7)`

```ts
import { create } from 'zustand';
import { Api } from '@/services/api-client';
import { getCartDetails } from '@/lib/cart';
import type { CartStateItem, CreateCartItemValues } from '@/services/dto/cart.dto';

export interface CartState {
  loading: boolean;
  error: boolean;
  totalAmount: number;
  items: CartStateItem[];
  fetchCartItems: () => Promise<void>;
  addCartItem: (values: CreateCartItemValues) => Promise<void>;
  updateItemQuantity: (id: string, quantity: number) => Promise<void>;
  removeCartItem: (id: string) => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  error: false,
  loading: true,
  totalAmount: 0,

  fetchCartItems: async () => {
    try {
      set({ loading: true, error: false });
      const data = await Api.cart.getCart();
      set(getCartDetails(data));
    } catch (e) {
      console.error(e);
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  addCartItem: async (values) => {
    try {
      set({ loading: true, error: false });
      const data = await Api.cart.addCartItem(values);
      set(getCartDetails(data));
    } catch (e) {
      console.error(e);
      set({ error: true });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  updateItemQuantity: async (id, quantity) => {
    try {
      set({ loading: true, error: false });
      const data = await Api.cart.updateItemQuantity(id, quantity);
      set(getCartDetails(data));
    } catch (e) {
      console.error(e);
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  removeCartItem: async (id) => {
    try {
      set((state) => ({ loading: true, error: false, items: state.items.map((i) => i.id === id ? { ...i, disabled: true } : i) }));
      const data = await Api.cart.removeCartItem(id);
      set(getCartDetails(data));
    } catch (e) {
      console.error(e);
      set({ error: true });
    } finally {
      set((state) => ({ loading: false, items: state.items.map((i) => ({ ...i, disabled: false })) }));
    }
  },
}));
```

- [ ] **Step 5: `store/index.ts` + `hooks/use-cart.ts`**

`store/index.ts`:
```ts
export * from './cart';
```
`hooks/use-cart.ts`:
```ts
import React from 'react';
import { useCartStore } from '@/store';

export const useCart = () => {
  const state = useCartStore((s) => s);
  React.useEffect(() => {
    state.fetchCartItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
};
```

- [ ] **Step 6: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 7: Commit**

```bash
git add stride-app/services stride-app/store stride-app/hooks
git commit -m "feat(stride-app): клиент корзины — axios instance, Api.cart, Zustand-стор, use-cart"
```

---

## Task 12: Общий layout + chrome (top-bar, glass-header, footer, шрифты)

**Files:**
- Modify: `stride-app/app/layout.tsx` (заменить заглушку Задачи 1)
- Create: `stride-app/components/shared/promo-top-bar.tsx`
- Create: `stride-app/components/shared/site-header.tsx`
- Create: `stride-app/components/shared/main-nav.tsx`
- Create: `stride-app/components/shared/mobile-nav.tsx`
- Create: `stride-app/components/shared/header-search.tsx`
- Create: `stride-app/components/shared/cart-badge.tsx`
- Create: `stride-app/components/shared/site-footer.tsx`
- Create: `stride-app/components/shared/newsletter-form.tsx`
- Create: `stride-app/components/shared/index.ts`

> Эталон вёрстки: `home.html` (top-bar строки 107–110; header 112–139; footer 469–496) и `cart.html` (header/footer). Эмодзи → `lucide-react`. Контейнер `mx-auto max-w-[1240px] px-4 sm:px-6`.

- [ ] **Step 1: `app/layout.tsx` — шрифты `next/font` + chrome** `(context7)`

```tsx
import type { Metadata } from 'next';
import { Unbounded, Manrope } from 'next/font/google';
import './globals.css';
import { PromoTopBar } from '@/components/shared/promo-top-bar';
import { SiteHeader } from '@/components/shared/site-header';
import { SiteFooter } from '@/components/shared/site-footer';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', weight: ['400', '500', '600', '700'], display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', weight: ['600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'STRIDE — кроссовки', template: '%s · STRIDE' },
  description: 'Кроссовки STRIDE: беговые, лайфстайл, платформы. Доставка по России.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="font-sans">
        <PromoTopBar />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
```
> `(context7)` Сверить, что `Unbounded` поддерживает нужные subsets в текущей версии `next/font` (если `cyrillic` для Unbounded недоступен — оставить `['latin']`, кириллица в заголовках рендерится фолбэком sans; Manrope даёт кириллицу для body).

- [ ] **Step 2: `promo-top-bar.tsx` (RSC, текст из home.html:107–110)**

```tsx
export function PromoTopBar() {
  return (
    <div className="bg-footer text-white text-center text-[13px] py-2.5 px-4">
      Бесплатная доставка по России от 10 000 ₽ · Возврат 14 дней ·{' '}
      <a href="#" className="underline underline-offset-2 hover:text-primary">Где мой заказ?</a>
    </div>
  );
}
```

- [ ] **Step 3: `main-nav.tsx` (RSC, ссылки на каталог/категории)**

```tsx
import Link from 'next/link';

const links = [
  { label: 'Новинки', href: '/catalog?sort=new' },
  { label: 'Беговые', href: '/catalog?category=running' },
  { label: 'Лайфстайл', href: '/catalog?category=lifestyle' },
  { label: 'Платформы', href: '/catalog?category=platform' },
  { label: 'Каталог', href: '/catalog' },
];

export function MainNav() {
  return (
    <nav className="hidden md:flex items-center gap-5 ml-4" aria-label="Основная навигация">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm font-medium text-ink-muted hover:text-ink transition-colors">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: `header-search.tsx`, `cart-badge.tsx`, `mobile-nav.tsx` (client islands)**

`header-search.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useState } from 'react';

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); router.push(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : '/catalog'); }}
      className="hidden sm:flex items-center gap-2 bg-surface-soft rounded-full px-3 h-10 w-44 lg:w-56"
    >
      <Search className="w-4 h-4 text-ink-muted" aria-hidden />
      <label className="sr-only" htmlFor="hsearch">Поиск кроссовок</label>
      <input id="hsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск кроссовок" className="bg-transparent text-sm outline-none w-full" />
    </form>
  );
}
```
`cart-badge.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/store';

export function CartBadge() {
  const items = useCartStore((s) => s.items);
  const fetchCartItems = useCartStore((s) => s.fetchCartItems);
  useEffect(() => { fetchCartItems(); }, [fetchCartItems]);
  const count = items.length;
  return (
    <Link href="/cart" className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft" aria-label={count ? `Корзина, ${count} товара` : 'Корзина пуста'}>
      <ShoppingCart className="w-5 h-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 grid place-items-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground tnum">{count}</span>
      )}
    </Link>
  );
}
```
`mobile-nav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const links = [
  { label: 'Новинки', href: '/catalog?sort=new' },
  { label: 'Беговые', href: '/catalog?category=running' },
  { label: 'Лайфстайл', href: '/catalog?category=lifestyle' },
  { label: 'Платформы', href: '/catalog?category=platform' },
  { label: 'Каталог', href: '/catalog' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="md:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft -ml-2" aria-label="Открыть меню" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-surface border-b border-line p-4 flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface-soft">{l.label}</Link>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: `site-header.tsx` (RSC-обёртка glass + islands)**

```tsx
import Link from 'next/link';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { HeaderSearch } from './header-search';
import { CartBadge } from './cart-badge';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 glass-header">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="relative flex items-center gap-4 h-16">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2" aria-label="STRIDE — на главную">
            <span className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm">S</span>
            <span className="font-display font-bold text-lg tracking-tight">STRIDE</span>
          </Link>
          <MainNav />
          <div className="flex-1" />
          <HeaderSearch />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: `newsletter-form.tsx` (client, без бэкенда) + `site-footer.tsx` (RSC)**

`newsletter-form.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui';

export function NewsletterForm() {
  const [done, setDone] = useState(false);
  return (
    <form className="flex gap-2 mt-4 max-w-sm" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
      <label className="flex-1">
        <span className="sr-only">E-mail для рассылки</span>
        <input type="email" required placeholder="Твой e-mail" className="w-full h-11 px-4 rounded-full bg-white/10 border border-white/15 text-sm text-white placeholder-white/40 outline-none focus:border-primary" />
      </label>
      <Button type="submit" variant="primary" size="md" className="shrink-0">{done ? 'Готово' : 'Подписаться'}</Button>
    </form>
  );
}
```
`site-footer.tsx` (структура home.html:469–496; legal-ссылки — заглушки `#`):
```tsx
import { NewsletterForm } from './newsletter-form';

const columns = [
  { title: 'Магазин', links: ['Новинки', 'Беговые', 'Лайфстайл', 'Платформы'] },
  { title: 'Помощь', links: ['Доставка', 'Возврат', 'Размерная сетка', 'Контакты'] },
  { title: 'Мы рядом', links: ['Telegram', 'VK', 'YouTube'] },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20 pb-8">
      <div className="rounded-[28px] overflow-hidden text-white bg-footer">
        <div className="p-8 sm:p-12">
          <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm">S</span>
                <span className="font-display font-bold text-lg">STRIDE</span>
              </div>
              <p className="text-white/60 text-sm max-w-xs leading-relaxed mt-3">Подпишись на дропы и забирай новые модели первым. Без спама.</p>
              <NewsletterForm />
            </div>
            {columns.map((col) => (
              <div key={col.title}>
                <p className="font-semibold text-sm mb-3">{col.title}</p>
                <ul className="space-y-2 text-sm text-white/60">
                  {col.links.map((l) => (
                    <li key={l}><a href="#" className="hover:text-white">{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 mt-8 pt-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-white/40">
            <p>© 2026 STRIDE. Все цены в рублях.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white">Политика конфиденциальности</a>
              <a href="#" className="hover:text-white">Условия</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: `components/shared/index.ts` (barrel)**

```ts
export { PromoTopBar } from './promo-top-bar';
export { SiteHeader } from './site-header';
export { SiteFooter } from './site-footer';
export { MainNav } from './main-nav';
export { MobileNav } from './mobile-nav';
export { HeaderSearch } from './header-search';
export { CartBadge } from './cart-badge';
export { NewsletterForm } from './newsletter-form';
```

- [ ] **Step 8: Визуальная проверка**

Run: `npm run dev` → открыть `http://localhost:3000`.
Expected: тёмная промо-полоса сверху, glass-header с лого STRIDE/навигацией/поиском/иконкой корзины, тёмный футер с колонками и формой подписки. Бейдж корзины пуст (товаров нет). Остановить.

- [ ] **Step 9: Commit**

```bash
git add stride-app/app/layout.tsx stride-app/components/shared
git commit -m "feat(stride-app): общий layout — шрифты, top-bar, glass-header (поиск/навигация/бейдж), футер"
```

---

## Task 13: Карточка товара (`ProductCard`) + маппер данных — TDD

**Files:**
- Create: `stride-app/lib/product-summary.ts`
- Create: `stride-app/components/shared/product-card.tsx`
- Create: `stride-app/components/shared/price-tag.tsx`
- Create: `stride-app/tests/product-summary.test.ts`

> `ProductCard` — общий для лендинга/каталога/related. Quick-add в Фазе 1 — это `Link` на PDP (без «слепого» добавления, спека §7.2/§14). Вёрстка — `catalog.html` карточка (строки 39–60 отчёта).

- [ ] **Step 1: Падающий тест `tests/product-summary.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildProductCardData, type ProductForCard } from '@/lib/product-summary';

function fake(overrides: Partial<ProductForCard> = {}): ProductForCard {
  return {
    id: 'p1', name: 'STRIDE Court Classic', slug: 'stride-court-classic', brand: 'Adidas',
    gender: 'UNISEX', categoryId: 'c', description: null, fitNote: null, specs: null,
    isBestseller: false, active: true, sortOrder: 1, createdAt: new Date('2026-05-25T00:00:00Z'),
    category: { name: 'Лайфстайл', slug: 'lifestyle' },
    colorways: [
      {
        id: 'cw1', productId: 'p1', name: 'Court White', slug: 'court-white', swatchHex: '#fff',
        isDefault: true, sortOrder: 1,
        images: [{ id: 'im', colorwayId: 'cw1', url: '/products/a.jpeg', alt: 'A', sortOrder: 0 }],
        variants: [
          { price: 11240, compareAtPrice: 14990, stock: 3, active: true },
          { price: 11240, compareAtPrice: 14990, stock: 0, active: true },
        ],
      },
    ],
    ...overrides,
  } as unknown as ProductForCard;
}

const now = new Date('2026-06-01T00:00:00Z');
const cfg = { newWindowDays: 30, lowStock: 3 };

describe('buildProductCardData', () => {
  it('берёт дефолтную расцветку: фото, минимальную цену активных вариантов, старую цену', () => {
    const d = buildProductCardData(fake(), now, cfg);
    expect(d.slug).toBe('stride-court-classic');
    expect(d.categoryName).toBe('Лайфстайл');
    expect(d.imageUrl).toBe('/products/a.jpeg');
    expect(d.minPrice).toBe(11240);
    expect(d.minCompareAtPrice).toBe(14990);
    expect(d.soldOut).toBe(false);
  });
  it('бейджи: скидка + новинка (товар свежий)', () => {
    const d = buildProductCardData(fake(), now, cfg);
    expect(d.badges.map((b) => b.tone)).toEqual(expect.arrayContaining(['discount', 'new']));
  });
  it('soldOut когда сток дефолтной расцветки = 0', () => {
    const f = fake();
    f.colorways[0].variants = [{ price: 100, compareAtPrice: null, stock: 0, active: true } as never];
    const d = buildProductCardData(f, now, cfg);
    expect(d.soldOut).toBe(true);
    expect(d.badges).toEqual([{ tone: 'soldout', label: 'Распродано' }]);
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/product-summary.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/product-summary.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { computeBadges, stockSummary, type ProductBadge } from '@/lib/product-badges';

export const productCardInclude = {
  category: { select: { name: true, slug: true } },
  colorways: {
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }],
    include: {
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
      variants: { select: { price: true, compareAtPrice: true, stock: true, active: true } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductForCard = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

export interface ProductCardData {
  slug: string;
  name: string;
  brand: string;
  categoryName: string;
  imageUrl: string | null;
  imageAlt: string;
  minPrice: number;
  minCompareAtPrice: number | null;
  badges: ProductBadge[];
  soldOut: boolean;
}

export function buildProductCardData(
  product: ProductForCard,
  now: Date,
  cfg: { newWindowDays: number; lowStock: number },
): ProductCardData {
  const cw = product.colorways[0]; // отсортировано: isDefault desc, sortOrder asc
  const activeVariants = (cw?.variants ?? []).filter((v) => v.active);
  const cheapest = activeVariants.reduce<typeof activeVariants[number] | null>(
    (min, v) => (min === null || v.price < min.price ? v : min),
    null,
  );
  const minPrice = cheapest?.price ?? 0;
  const minCompareAtPrice = cheapest?.compareAtPrice ?? null;
  const stock = stockSummary(cw?.variants ?? [], cfg.lowStock);

  const badges = computeBadges(
    { createdAt: product.createdAt, isBestseller: product.isBestseller, minPrice, minCompareAtPrice, stockTotal: stock.total },
    now,
    cfg,
  );

  return {
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    categoryName: product.category.name,
    imageUrl: cw?.images[0]?.url ?? null,
    imageAlt: cw?.images[0]?.alt ?? product.name,
    minPrice,
    minCompareAtPrice,
    badges,
    soldOut: stock.soldOut,
  };
}
```

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/product-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: `components/shared/price-tag.tsx` (RSC)**

```tsx
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PriceTag({ price, compareAtPrice, className }: { price: number; compareAtPrice?: number | null; className?: string }) {
  const showOld = compareAtPrice != null && compareAtPrice > price;
  return (
    <p className={cn('tnum font-bold flex items-baseline gap-2', className)}>
      <span>{formatPrice(price)}</span>
      {showOld && <span className="text-ink-muted text-xs font-medium line-through">{formatPrice(compareAtPrice!)}</span>}
    </p>
  );
}
```

- [ ] **Step 6: `components/shared/product-card.tsx` (RSC; quick-add → Link на PDP)**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui';
import { PriceTag } from './price-tag';
import type { ProductCardData } from '@/lib/product-summary';

export function ProductCard({ data }: { data: ProductCardData }) {
  const href = `/product/${data.slug}`;
  return (
    <article className="group rounded-2xl bg-surface border border-line overflow-hidden">
      <div className="relative aspect-square bg-surface-soft overflow-hidden">
        {data.badges[0] && (
          <span className="absolute top-3 left-3 z-10">
            <Badge tone={data.badges[0].tone}>{data.badges[0].label}</Badge>
          </span>
        )}
        <Link href={href} aria-label={data.name}>
          {data.imageUrl ? (
            <Image
              src={data.imageUrl}
              alt={data.imageAlt}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className={`object-cover transition-transform duration-300 group-hover:scale-105 ${data.soldOut ? 'opacity-50 grayscale' : ''}`}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-ink-muted text-xs">нет фото</div>
          )}
        </Link>
        {!data.soldOut && (
          <Link
            href={href}
            aria-label={`Выбрать размер: ${data.name}`}
            className="absolute bottom-3 right-3 btn btn-primary w-10 h-10 !p-0 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
          >
            <Plus className="w-5 h-5" />
          </Link>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-[11px] text-ink-muted uppercase tracking-wide">{data.categoryName}</p>
        <h3 className="font-semibold text-sm mt-0.5 leading-snug">
          <Link href={href} className="hover:underline underline-offset-2">{data.name}</Link>
        </h3>
        <PriceTag price={data.minPrice} compareAtPrice={data.minCompareAtPrice} className="mt-2" />
      </div>
    </article>
  );
}
```
> Добавить `ProductCard`, `PriceTag` в `components/shared/index.ts` (экспорты).

- [ ] **Step 7: Прогнать тесты + типы**

Run: `npm test && npm run typecheck`
Expected: PASS, 0 ошибок типов.

- [ ] **Step 8: Commit**

```bash
git add stride-app/lib/product-summary.ts stride-app/components/shared/product-card.tsx stride-app/components/shared/price-tag.tsx stride-app/components/shared/index.ts stride-app/tests/product-summary.test.ts
git commit -m "feat(stride-app): ProductCard + маппер карточки (default colorway, min price, бейджи) + unit-тест"
```

---

## Task 14: Лендинг `/` (RSC, по `home.html`)

**Files:**
- Modify: `stride-app/app/page.tsx` (заменить заглушку Задачи 1)
- Create: `stride-app/components/shared/home/hero.tsx`
- Create: `stride-app/components/shared/home/category-bento.tsx`
- Create: `stride-app/components/shared/home/bestsellers-section.tsx`
- Create: `stride-app/components/shared/home/drop-promo.tsx`
- Create: `stride-app/components/shared/home/engineered-feature.tsx`
- Create: `stride-app/components/shared/home/trust-strip.tsx`

> Эталон: `home.html`. Hero (142–171), bento (173–341), бестселлеры (343–410), drop-promo (412–434), feature (436–456), trust (458–466). Контейнер секций `mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20`. Статические секции переносить «класс-в-класс», эмодзи → lucide.

- [ ] **Step 1: `hero.tsx` (RSC; CTA → /catalog; product-shot — локальный png)**

Перенести Hero из `home.html:142–171`. Ключевая структура (классы — из прототипа):
```tsx
import Link from 'next/link';
import Image from 'next/image';

export function Hero() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-6">
      <div className="rounded-[28px] overflow-hidden relative" style={{ background: 'linear-gradient(120deg, hsl(var(--color-accent) / 0.55), hsl(var(--color-surface-soft)))' }}>
        <div className="grid md:grid-cols-2 items-center">
          <div className="order-2 md:order-1 p-8 sm:p-12">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-primary text-primary-foreground">
              Новая коллекция
            </span>
            <h1 className="font-display font-bold text-[44px] sm:text-[64px] lg:text-[80px] leading-[0.92] mt-4">Беги за<br />пределы</h1>
            <p className="text-ink/70 max-w-sm mt-4">Новая коллекция STRIDE для города и трассы. Дышащий верх, мягкая амортизация, цепкий протектор.</p>
            <div className="flex gap-2.5 mt-6">
              <Link href="/catalog" className="btn btn-lg btn-dark">Смотреть каталог</Link>
              <Link href="/catalog?sort=new" className="btn btn-lg btn-secondary">Новинки</Link>
            </div>
          </div>
          <div className="order-1 md:order-2 relative h-64 sm:h-80 md:h-[480px]">
            <Image src="/products/Professional_product_photography_of_white_202605311739.png" alt="STRIDE — кроссовок новой коллекции" fill className="object-contain p-6 md:p-8 drop-shadow-2xl" priority />
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `category-bento.tsx` (RSC, data: категории + counts)**

```tsx
import Link from 'next/link';

export interface BentoCategory { slug: string; name: string; tagline: string | null; count: number; }

export function CategoryBento({ categories }: { categories: BentoCategory[] }) {
  return (
    <section id="cats" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="label">Категории</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight">Под твой темп</h2>
        </div>
        <Link href="/catalog" className="btn btn-md btn-ghost hidden sm:inline-flex">Весь каталог →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[180px]">
        {categories.map((c, i) => (
          <Link
            key={c.slug}
            href={`/catalog?category=${c.slug}`}
            className={`group relative rounded-2xl overflow-hidden bg-surface-soft border border-line p-5 flex flex-col justify-end ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
            aria-label={`${c.name} — ${c.count} моделей`}
          >
            <span className="label">{c.name}</span>
            <span className="font-display font-semibold text-xl">{c.tagline ?? c.name}</span>
            <span className="text-sm text-ink-muted mt-1 tnum">{c.count} моделей</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `bestsellers-section.tsx` (RSC, использует ProductCard)**

```tsx
import Link from 'next/link';
import { ProductCard } from '@/components/shared/product-card';
import type { ProductCardData } from '@/lib/product-summary';

export function BestsellersSection({ products }: { products: ProductCardData[] }) {
  return (
    <section id="best" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="label">Выбор недели</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight">Бестселлеры</h2>
        </div>
        <Link href="/catalog" className="btn btn-md btn-ghost">Смотреть все →</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {products.map((p) => <ProductCard key={p.slug} data={p} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `drop-promo.tsx` (client, lavender, email-форма без бэкенда), `engineered-feature.tsx`, `trust-strip.tsx` (RSC, static)**

`drop-promo.tsx` — перенести `home.html:412–434` (лавандовая карточка + email-форма). Минимум:
```tsx
'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui';

export function DropPromo() {
  const [done, setDone] = useState(false);
  return (
    <section id="drop" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="rounded-[28px] bg-accent text-accent-foreground overflow-hidden grid md:grid-cols-2 items-center">
        <div className="p-8 sm:p-12">
          <span className="label">Дроп 04 · 02.06</span>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight mt-2">Лимитка<br />уже близко</h2>
          <p className="opacity-80 mt-3 max-w-sm">200 пар STRIDE Velocity. Подпишись — напомним о старте.</p>
          <form className="flex gap-2 mt-5 max-w-sm" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
            <input type="email" required placeholder="Твой e-mail" className="inp flex-1" />
            <Button type="submit" variant="dark" size="md" className="shrink-0">{done ? 'Готово' : 'Напомнить о дропе'}</Button>
          </form>
          <p className="text-xs opacity-70 mt-2">Без спама. Только дропы и рестоки.</p>
        </div>
        <div className="relative h-64 md:h-[420px]">
          <Image src="/products/Professional_product_photography_of_purple_202605311921.png" alt="Лимитированный дроп STRIDE" fill className="object-contain p-8 drop-shadow-2xl" />
        </div>
      </div>
    </section>
  );
}
```
`engineered-feature.tsx` (RSC, тёмная карточка; эталон `home.html:436–456`):
```tsx
import Link from 'next/link';
import Image from 'next/image';

const metrics = [
  { value: '−18%', label: 'вес против прошлой модели' },
  { value: '600км', label: 'ресурс подошвы' },
  { value: '42%', label: 'переработанных материалов' },
];

export function EngineeredFeature() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="rounded-[28px] bg-footer text-white overflow-hidden grid md:grid-cols-2 items-center">
        <div className="p-8 sm:p-12">
          <p className="label !text-primary">STRIDE Engineered</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight mt-2">Сделаны, чтобы<br />пройти дистанцию</h2>
          <p className="text-white/60 mt-3 leading-relaxed">Литая промежуточная подошва с возвратом энергии, дышащий верх из переработанной сетки и протектор, который держит и на асфальте, и на грунте.</p>
          <div className="grid grid-cols-3 gap-4 mt-6">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="font-display font-bold text-2xl text-primary tnum">{m.value}</p>
                <p className="text-xs text-white/60 mt-1">{m.label}</p>
              </div>
            ))}
          </div>
          <Link href="/catalog" className="btn btn-lg btn-primary mt-6">Выбрать пару</Link>
        </div>
        <div className="relative h-64 md:h-[420px]">
          <Image src="/products/Professional_product_photography_of_white_202605311739.png" alt="Технологичная подошва STRIDE крупным планом" fill className="object-contain p-8 drop-shadow-2xl" />
        </div>
      </div>
    </section>
  );
}
```
`trust-strip.tsx` (RSC, 4 карточки, иконки lucide; эталон `home.html:458–466`):
```tsx
import { Truck, RotateCcw, BadgeCheck, CreditCard } from 'lucide-react';

const items = [
  { Icon: Truck, title: 'Доставка 1–3 дня', text: 'По всей России, бесплатно от 10 000 ₽' },
  { Icon: RotateCcw, title: 'Возврат 14 дней', text: 'Примерь дома, не подошло — вернём' },
  { Icon: BadgeCheck, title: 'Только оригинал', text: 'Прямые поставки, гарантия бренда' },
  { Icon: CreditCard, title: 'Удобная оплата', text: 'Картой онлайн или при получении' },
];

export function TrustStrip() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map(({ Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <Icon className="w-6 h-6 text-ink" aria-hidden />
            <p className="font-semibold text-sm mt-3">{title}</p>
            <p className="text-xs text-ink-muted mt-1">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `app/page.tsx` — сборка лендинга + данные**

```tsx
import { prisma } from '@/lib/prisma-client';
import { productCardInclude, buildProductCardData } from '@/lib/product-summary';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD } from '@/constants/config';
import { Hero } from '@/components/shared/home/hero';
import { CategoryBento, type BentoCategory } from '@/components/shared/home/category-bento';
import { BestsellersSection } from '@/components/shared/home/bestsellers-section';
import { DropPromo } from '@/components/shared/home/drop-promo';
import { EngineeredFeature } from '@/components/shared/home/engineered-feature';
import { TrustStrip } from '@/components/shared/home/trust-strip';

export default async function HomePage() {
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };

  const [categories, catCounts, bestRaw] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where: { active: true }, _count: { _all: true } }),
    prisma.product.findMany({ where: { active: true }, take: 4, orderBy: [{ isBestseller: 'desc' }, { createdAt: 'desc' }], include: productCardInclude }),
  ]);

  const countMap = new Map(catCounts.map((c) => [c.categoryId, c._count._all]));
  const bento: BentoCategory[] = categories.map((c) => ({ slug: c.slug, name: c.name, tagline: c.tagline, count: countMap.get(c.id) ?? 0 }));
  const bestsellers = bestRaw.map((p) => buildProductCardData(p, now, cfg));

  return (
    <>
      <Hero />
      <CategoryBento categories={bento} />
      <BestsellersSection products={bestsellers} />
      <DropPromo />
      <EngineeredFeature />
      <TrustStrip />
    </>
  );
}
```

- [ ] **Step 6: Визуальная проверка**

Run: `npm run dev` → `http://localhost:3000`.
Expected: лендинг с hero, бенто-категориями (счётчики моделей из БД), 4 карточками бестселлеров (фото/бейджи/цена), drop-promo, feature, trust. Клик по карточке → `/product/<slug>` (страница появится в Задаче 16; пока 404 — ок). Остановить.

- [ ] **Step 7: Commit**

```bash
git add stride-app/app/page.tsx stride-app/components/shared/home
git commit -m "feat(stride-app): лендинг — hero, бенто-категории (counts), бестселлеры, drop-promo, feature, trust"
```

---

## Task 15: Каталог `/catalog` (RSC, URL-driven фильтры, counts, пагинация, состояния)

**Files:**
- Create: `stride-app/lib/find-products.ts`
- Create: `stride-app/hooks/use-catalog-url.ts`
- Create: `stride-app/components/shared/catalog/filter-sidebar.tsx`
- Create: `stride-app/components/shared/catalog/checkbox-facet.tsx`
- Create: `stride-app/components/shared/catalog/size-filter.tsx`
- Create: `stride-app/components/shared/catalog/color-filter.tsx`
- Create: `stride-app/components/shared/catalog/price-filter.tsx`
- Create: `stride-app/components/shared/catalog/in-stock-toggle.tsx`
- Create: `stride-app/components/shared/catalog/sort-select.tsx`
- Create: `stride-app/components/shared/catalog/active-filter-chips.tsx`
- Create: `stride-app/components/shared/catalog/pagination.tsx`
- Create: `stride-app/components/shared/catalog/catalog-states.tsx`
- Create: `stride-app/app/catalog/page.tsx`

> Эталон: `catalog.html`. Сайдбар (строки 7–19 отчёта), тулбар (21–37), карточка — общий `ProductCard`, пагинация (62–66), состояния (68–75). Спека добавляет к прототипу **бренд** и **gender** (та же группа-чекбоксы), реальные сортировки и facet-counts.

- [ ] **Step 1: `lib/find-products.ts` — чтение каталога + counts + сортировка/пагинация** `(context7)`

```ts
import { prisma } from '@/lib/prisma-client';
import { buildProductWhere, parseCatalogParams, PAGE_SIZE, type RawSearchParams } from '@/lib/catalog-filters';
import { productCardInclude, buildProductCardData, type ProductCardData, type ProductForCard } from '@/lib/product-summary';
import { discountPercent } from '@/lib/product-badges';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD, GENDER_OPTIONS } from '@/constants/config';

export interface Facet { value: string; label: string; count: number; }
export interface CatalogResult {
  products: ProductCardData[];
  total: number;
  page: number;
  totalPages: number;
  facets: {
    categories: Facet[];
    brands: Facet[];
    genders: Facet[];
    colors: { slug: string; name: string; swatchHex: string | null }[];
  };
}

function sortCards(items: { data: ProductCardData; raw: ProductForCard }[], sort: string) {
  const by = [...items];
  switch (sort) {
    case 'popular':
      by.sort((a, b) => Number(b.raw.isBestseller) - Number(a.raw.isBestseller) || a.raw.sortOrder - b.raw.sortOrder);
      break;
    case 'price-asc':
      by.sort((a, b) => a.data.minPrice - b.data.minPrice);
      break;
    case 'price-desc':
      by.sort((a, b) => b.data.minPrice - a.data.minPrice);
      break;
    case 'discount':
      by.sort((a, b) => (discountPercent(b.data.minPrice, b.data.minCompareAtPrice) ?? 0) - (discountPercent(a.data.minPrice, a.data.minCompareAtPrice) ?? 0));
      break;
    case 'new':
    default:
      by.sort((a, b) => b.raw.createdAt.getTime() - a.raw.createdAt.getTime());
  }
  return by;
}

// Фаза 1: каталог небольшой — грузим все совпадения, сортируем/пагинируем в памяти (корректно
// для сортировки по цене/скидке между страницами). Для крупного каталога вынести в DB-уровень.
export async function findProducts(sp: RawSearchParams): Promise<CatalogResult> {
  const params = parseCatalogParams(sp);
  const where = buildProductWhere(params);
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };

  const [raw, categories, catCounts, brandCounts, genderCounts, colorRows] = await Promise.all([
    prisma.product.findMany({ where, include: productCardInclude }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['brand'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['gender'], where, _count: { _all: true } }),
    prisma.productColorway.findMany({ where: { product: { active: true } }, distinct: ['slug'], select: { slug: true, name: true, swatchHex: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const cards = sortCards(raw.map((p) => ({ data: buildProductCardData(p, now, cfg), raw: p })), params.sort);
  const total = cards.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const products = cards.slice(start, start + PAGE_SIZE).map((c) => c.data);

  const catCountMap = new Map(catCounts.map((c) => [c.categoryId, c._count._all]));
  const genderCountMap = new Map(genderCounts.map((g) => [g.gender, g._count._all]));

  return {
    products,
    total,
    page,
    totalPages,
    facets: {
      categories: categories.map((c) => ({ value: c.slug, label: c.name, count: catCountMap.get(c.id) ?? 0 })),
      brands: brandCounts.map((b) => ({ value: b.brand, label: b.brand, count: b._count._all })).sort((a, b) => a.label.localeCompare(b.label)),
      genders: GENDER_OPTIONS.map((g) => ({ value: g.value, label: g.label, count: genderCountMap.get(g.value) ?? 0 })).filter((g) => g.count > 0),
      colors: colorRows,
    },
  };
}
```

- [ ] **Step 2: `hooks/use-catalog-url.ts` (client; чтение/запись фильтров в URL)**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useCatalogUrl() {
  const router = useRouter();
  const sp = useSearchParams();

  const getList = useCallback((key: string) => (sp.get(key)?.split(',').filter(Boolean) ?? []), [sp]);
  const get = useCallback((key: string) => sp.get(key) ?? '', [sp]);

  const push = useCallback((mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mutate(p);
    p.delete('page'); // любое изменение фильтра/сортировки сбрасывает страницу
    const qs = p.toString();
    router.push(qs ? `/catalog?${qs}` : '/catalog', { scroll: false });
  }, [router, sp]);

  const toggleInList = useCallback((key: string, value: string) => push((p) => {
    const cur = (p.get(key)?.split(',').filter(Boolean)) ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    if (next.length) p.set(key, next.join(',')); else p.delete(key);
  }), [push]);

  const setParam = useCallback((key: string, value: string | null) => push((p) => {
    if (value) p.set(key, value); else p.delete(key);
  }), [push]);

  const setPage = useCallback((page: number) => {
    const p = new URLSearchParams(sp.toString());
    if (page > 1) p.set('page', String(page)); else p.delete('page');
    router.push(`/catalog?${p.toString()}`, { scroll: false });
  }, [router, sp]);

  const setParams = useCallback((entries: Record<string, string | null>) => push((p) => {
    for (const [k, v] of Object.entries(entries)) { if (v) p.set(k, v); else p.delete(k); }
  }), [push]);

  const reset = useCallback(() => router.push('/catalog', { scroll: false }), [router]);

  return { sp, get, getList, toggleInList, setParam, setParams, setPage, reset };
}
```

- [ ] **Step 3: `checkbox-facet.tsx` (общий для категории/бренда/gender) + `size-filter.tsx` + `color-filter.tsx` + `in-stock-toggle.tsx`**

`checkbox-facet.tsx`:
```tsx
'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';
import type { Facet } from '@/lib/find-products';

export function CheckboxFacet({ title, paramKey, options }: { title: string; paramKey: string; options: Facet[] }) {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList(paramKey);
  if (!options.length) return null;
  return (
    <div className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <p className="font-semibold text-sm mb-2">{title}</p>
      <div className="space-y-1.5 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-[hsl(var(--color-primary))]" checked={selected.includes(o.value)} onChange={() => toggleInList(paramKey, o.value)} />
            <span>{o.label}</span>
            <span className="text-ink-muted ml-auto tnum">{o.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```
`size-filter.tsx` (кнопки-сетка, EU-сетка из конфига; multi-select):
```tsx
'use client';
import { EU_SIZE_GRID } from '@/constants/config';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function SizeFilter() {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList('size');
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Размер EU</p>
      <div className="flex flex-wrap gap-1.5">
        {EU_SIZE_GRID.map((s) => {
          const on = selected.includes(s);
          return (
            <button key={s} type="button" onClick={() => toggleInList('size', s)} aria-pressed={on}
              className={`px-2.5 py-1.5 rounded-lg border text-xs tnum ${on ? 'border-2 font-semibold border-ink' : 'border-line hover:border-ink'}`}>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```
`color-filter.tsx` (свотчи по colorway slug):
```tsx
'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function ColorFilter({ colors }: { colors: { slug: string; name: string; swatchHex: string | null }[] }) {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList('color');
  if (!colors.length) return null;
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Цвет</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const on = selected.includes(c.slug);
          return (
            <button key={c.slug} type="button" onClick={() => toggleInList('color', c.slug)} aria-pressed={on}
              aria-label={on ? `${c.name}, выбран` : c.name}
              className={`w-7 h-7 rounded-full border border-line ${on ? 'ring-2 ring-offset-2 ring-[hsl(var(--color-primary))]' : ''}`}
              style={{ background: c.swatchHex ?? '#ccc' }} />
          );
        })}
      </div>
    </div>
  );
}
```
`in-stock-toggle.tsx`:
```tsx
'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function InStockToggle() {
  const { get, setParam } = useCatalogUrl();
  const on = get('inStock') === '1';
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Наличие</p>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" className="w-4 h-4 rounded accent-[hsl(var(--color-primary))]" checked={on} onChange={() => setParam('inStock', on ? null : '1')} />
        <span>Скрыть распроданные</span>
      </label>
    </div>
  );
}
```
`price-filter.tsx` (два числовых инпута `priceFrom`/`priceTo` + «Применить», один push через `setParams`):
```tsx
'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function PriceFilter() {
  const { get, setParams } = useCatalogUrl();
  const [from, setFrom] = useState(get('priceFrom'));
  const [to, setTo] = useState(get('priceTo'));
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Цена, ₽</p>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" placeholder="от" value={from} onChange={(e) => setFrom(e.target.value)} className="!h-10 text-sm" aria-label="Цена от" />
        <span className="text-ink-muted">—</span>
        <Input type="number" inputMode="numeric" placeholder="до" value={to} onChange={(e) => setTo(e.target.value)} className="!h-10 text-sm" aria-label="Цена до" />
      </div>
      <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => setParams({ priceFrom: from || null, priceTo: to || null })}>Применить</Button>
    </div>
  );
}
```

- [ ] **Step 4: `filter-sidebar.tsx` (RSC-раскладка, оборачивает client-контролы)**

```tsx
import { CheckboxFacet } from './checkbox-facet';
import { SizeFilter } from './size-filter';
import { ColorFilter } from './color-filter';
import { PriceFilter } from './price-filter';
import { InStockToggle } from './in-stock-toggle';
import { ResetButton } from './active-filter-chips';
import type { CatalogResult } from '@/lib/find-products';

export function FilterSidebar({ facets }: { facets: CatalogResult['facets'] }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 rounded-2xl border border-line bg-surface p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Фильтры</h2>
          <ResetButton className="text-xs font-semibold text-ink-muted underline underline-offset-2 hover:text-ink" />
        </div>
        <CheckboxFacet title="Категория" paramKey="category" options={facets.categories} />
        <CheckboxFacet title="Бренд" paramKey="brand" options={facets.brands} />
        <CheckboxFacet title="Пол" paramKey="gender" options={facets.genders} />
        <SizeFilter />
        <PriceFilter />
        <ColorFilter colors={facets.colors} />
        <InStockToggle />
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: `sort-select.tsx`, `active-filter-chips.tsx` (+ `ResetButton`), `pagination.tsx`, `catalog-states.tsx`**

`sort-select.tsx`:
```tsx
'use client';
import { SORT_OPTIONS } from '@/constants/config';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function SortSelect() {
  const { get, setParam } = useCatalogUrl();
  const value = get('sort') || 'new';
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Сортировка</span>
      <select className="inp !h-10 max-w-[200px] text-sm" value={value} onChange={(e) => setParam('sort', e.target.value === 'new' ? null : e.target.value)}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
```
`active-filter-chips.tsx` (чипы по активным параметрам + крестик + «Сбросить всё»; `ResetButton`):
```tsx
'use client';
import { X } from 'lucide-react';
import { useCatalogUrl } from '@/hooks/use-catalog-url';
import type { CatalogResult } from '@/lib/find-products';

export function ResetButton({ className }: { className?: string }) {
  const { reset } = useCatalogUrl();
  return <button type="button" onClick={reset} className={className}>Сбросить</button>;
}

export function ActiveFilterChips({ facets }: { facets: CatalogResult['facets'] }) {
  const { sp, getList, toggleInList, get, setParam, reset } = useCatalogUrl();
  const chips: { key: string; value: string; label: string }[] = [];
  const labelFor = (key: string, value: string) => {
    if (key === 'category') return facets.categories.find((c) => c.value === value)?.label ?? value;
    if (key === 'brand') return value;
    if (key === 'gender') return facets.genders.find((g) => g.value === value)?.label ?? value;
    if (key === 'color') return facets.colors.find((c) => c.slug === value)?.name ?? value;
    if (key === 'size') return `Размер ${value}`;
    return value;
  };
  ['category', 'brand', 'gender', 'color', 'size'].forEach((key) => getList(key).forEach((v) => chips.push({ key, value: v, label: labelFor(key, v) })));
  if (get('inStock') === '1') chips.push({ key: 'inStock', value: '1', label: 'Только в наличии' });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {chips.map((c) => (
        <span key={`${c.key}:${c.value}`} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full bg-surface-soft border border-line">
          {c.label}
          <button type="button" aria-label={`Убрать фильтр ${c.label}`} className="text-ink-muted hover:text-danger"
            onClick={() => (c.key === 'inStock' ? setParam('inStock', null) : toggleInList(c.key, c.value))}>
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
      <button type="button" onClick={reset} className="text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink ml-1">Сбросить всё</button>
    </div>
  );
}
```
`pagination.tsx` (numbered, client, через setPage):
```tsx
'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { setPage } = useCatalogUrl();
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const cell = 'w-9 h-9 grid place-items-center rounded-lg border border-line hover:border-ink tnum';
  return (
    <nav className="flex justify-center mt-10" aria-label="Пагинация">
      <div className="flex items-center gap-1.5 text-sm">
        <button className={cell} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Назад"><ChevronLeft className="w-4 h-4" /></button>
        {pages.map((p) => (
          <button key={p} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}
            className={p === page ? 'w-9 h-9 grid place-items-center rounded-lg bg-ink text-white font-semibold tnum' : cell}>{p}</button>
        ))}
        <button className={cell} disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Вперёд"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </nav>
  );
}
```
`catalog-states.tsx` (skeleton + empty; эталон `catalog.html` строки 72–73 отчёта):
```tsx
import { Skeleton } from '@/components/ui';

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-surface border border-line overflow-hidden">
          <Skeleton className="aspect-square rounded-none" />
          <div className="p-3.5 space-y-2">
            <Skeleton className="h-2.5 w-16" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyCatalog() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-soft grid place-items-center text-xl mx-auto">👟</div>
      <p className="font-semibold mt-3">Таких кроссовок нет</p>
      <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">Под выбранные фильтры ничего не подошло. Сбрось часть условий или выбери другой размер.</p>
    </div>
  );
}
```

- [ ] **Step 6: `app/catalog/page.tsx` (RSC; Next 15 async searchParams)** `(context7)`

```tsx
import { Suspense } from 'react';
import { findProducts } from '@/lib/find-products';
import { ProductCard } from '@/components/shared/product-card';
import { FilterSidebar } from '@/components/shared/catalog/filter-sidebar';
import { SortSelect } from '@/components/shared/catalog/sort-select';
import { ActiveFilterChips } from '@/components/shared/catalog/active-filter-chips';
import { Pagination } from '@/components/shared/catalog/pagination';
import { EmptyCatalog, ProductGridSkeleton } from '@/components/shared/catalog/catalog-states';

export const metadata = { title: 'Каталог' };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { products, total, page, totalPages, facets } = await findProducts(sp);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">Каталог</h1>
      <div className="grid lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">
        <FilterSidebar facets={facets} />
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-sm text-ink-muted hidden sm:block">Найдено <span className="font-semibold text-ink tnum">{total}</span></p>
            <div className="flex-1" />
            <Suspense><SortSelect /></Suspense>
          </div>
          <Suspense><ActiveFilterChips facets={facets} /></Suspense>
          {products.length === 0 ? (
            <EmptyCatalog />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {products.map((p) => <ProductCard key={p.slug} data={p} />)}
            </div>
          )}
          <Suspense><Pagination page={page} totalPages={totalPages} /></Suspense>
        </div>
      </div>
    </div>
  );
}
```
> Клиентские компоненты, читающие `useSearchParams`, оборачиваются в `<Suspense>` (требование Next 15 для CSR-bailout). `ProductGridSkeleton` использовать как `loading.tsx` каталога (опц.): создать `app/catalog/loading.tsx`, рендерящий каркас сетки.

- [ ] **Step 7: Визуальная + функциональная проверка**

Run: `npm run dev` → `/catalog`.
Expected: сайдбар с фильтрами (категория/бренд/пол/размер/цена/цвет/в наличии) и счётчиками; клик по фильтру меняет URL и выдачу; чипы активных фильтров с крестиком; сортировка меняет порядок; «Сбросить всё» очищает; пустая выдача при несовпадении. Остановить.

- [ ] **Step 8: Прогнать тесты/типы и Commit**

Run: `npm test && npm run typecheck`
```bash
git add stride-app/lib/find-products.ts stride-app/hooks/use-catalog-url.ts stride-app/components/shared/catalog stride-app/app/catalog
git commit -m "feat(stride-app): каталог — URL-фильтры (бренд/пол/размер/цвет/цена/наличие), counts, сортировки, пагинация, состояния"
```

---

## Task 16: Страница товара `/product/[slug]` (RSC + `?color=`, расцветки/размеры/add-to-cart)

**Files:**
- Create: `stride-app/lib/get-product.ts`
- Create: `stride-app/components/shared/product/breadcrumbs.tsx`
- Create: `stride-app/components/shared/product/product-gallery.tsx`
- Create: `stride-app/components/shared/product/purchase-panel.tsx`
- Create: `stride-app/components/shared/product/specs-table.tsx`
- Create: `stride-app/app/product/[slug]/page.tsx`
- Create: `stride-app/app/product/[slug]/not-found.tsx`

> Эталон: `product.html`. Галерея (17–25 отчёта), селектор расцветки (27–36), размера (38–50), цена/бейджи (52–62), add-to-cart (65–74), specs (76–91), related (93–102). Скрываем: отзывы, избранное, «Купить в один клик». Размер — EU (не «RU»).

- [ ] **Step 1: `lib/get-product.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';

export const productDetailInclude = {
  category: { select: { name: true, slug: true } },
  colorways: {
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }],
    include: {
      images: { orderBy: { sortOrder: 'asc' as const } },
      variants: { orderBy: { sizeEu: 'asc' as const } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export function getProductBySlug(slug: string) {
  return prisma.product.findFirst({ where: { slug, active: true }, include: productDetailInclude });
}
```

- [ ] **Step 2: `breadcrumbs.tsx` (RSC) + `specs-table.tsx` (RSC)**

`breadcrumbs.tsx`:
```tsx
import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm text-ink-muted flex-wrap pt-5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {it.href ? <Link href={it.href} className="hover:text-ink">{it.label}</Link> : <span className="text-ink font-semibold">{it.label}</span>}
          {i < items.length - 1 && <span aria-hidden>/</span>}
        </span>
      ))}
    </nav>
  );
}
```
`specs-table.tsx` (specs — Json: Record<string,string>):
```tsx
export function SpecsTable({ specs }: { specs: Record<string, string> | null }) {
  if (!specs || Object.keys(specs).length === 0) return null;
  return (
    <aside className="rounded-2xl border border-line bg-surface p-6 h-fit">
      <h3 className="font-semibold text-sm mb-3">Характеристики</h3>
      <dl className="text-sm divide-y divide-line">
        {Object.entries(specs).map(([k, v]) => (
          <div key={k} className="flex justify-between py-2">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium tnum">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
```

- [ ] **Step 3: `product-gallery.tsx` (client; thumbnails + главное фото; key по расцветке)**

```tsx
'use client';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface GalleryImage { url: string; alt: string }

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) return <div className="rounded-[24px] border border-line bg-surface-soft aspect-[4/3] grid place-items-center text-ink-muted">нет фото</div>;
  const main = images[Math.min(active, images.length - 1)];
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 min-w-0">
      {images.length > 1 && (
        <div className="flex sm:flex-col gap-2.5 sm:w-[84px] sm:shrink-0 overflow-x-auto" role="list" aria-label="Фотографии модели">
          {images.map((img, i) => (
            <button key={i} className="thumb aspect-square w-[72px] sm:w-full shrink-0" aria-current={i === active} aria-label={`Фото ${i + 1}`} onClick={() => setActive(i)}>
              <Image src={img.url} alt={img.alt} width={84} height={84} className="object-contain p-1.5 w-full h-full" />
            </button>
          ))}
        </div>
      )}
      <figure className={cn('relative flex-1 min-w-0 rounded-[24px] border border-line bg-surface-soft overflow-hidden aspect-[4/3]')}>
        <Image src={main.url} alt={main.alt || productName} fill className="object-contain p-6" priority />
      </figure>
    </div>
  );
}
```

- [ ] **Step 4: `purchase-panel.tsx` (client; расцветки→`?color=`, размеры, цена, add-to-cart)** `(context7)`

```tsx
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useCartStore } from '@/store';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface PanelColorway { slug: string; name: string; thumbUrl: string | null; }
export interface PanelVariant { id: string; sizeEu: string; stock: number; active: boolean; price: number; compareAtPrice: number | null; }

interface Props {
  productName: string;
  colorways: PanelColorway[];
  activeColorwaySlug: string;
  activeColorwayName: string;
  variants: PanelVariant[];
  fitNote: string | null;
  productSlug: string;
}

export function PurchasePanel({ productName, colorways, activeColorwaySlug, activeColorwayName, variants, fitNote, productSlug }: Props) {
  const [sizeId, setSizeId] = useState<string | null>(null);
  const addCartItem = useCartStore((s) => s.addCartItem);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === sizeId) ?? null;
  const available = variants.filter((v) => v.active && v.stock > 0);
  const minPrice = available.length ? Math.min(...available.map((v) => v.price)) : (variants[0]?.price ?? 0);
  const shownPrice = selected?.price ?? minPrice;
  const shownCompare = selected?.compareAtPrice ?? null;
  const soldOut = available.length === 0;

  const onAdd = async () => {
    if (!selected) return;
    setAdding(true);
    try { await addCartItem({ productVariantId: selected.id }); setAdded(true); setTimeout(() => setAdded(false), 1500); }
    catch { /* стор выставит error */ }
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-6">
      {/* Цена / скидка / наличие */}
      <div className="flex items-end flex-wrap gap-x-3 gap-y-1">
        <p className="font-display font-bold text-[28px] tnum leading-none">{formatPrice(shownPrice)}</p>
        {shownCompare && shownCompare > shownPrice && (
          <>
            <p className="text-ink-muted text-base font-medium line-through tnum mb-0.5">{formatPrice(shownCompare)}</p>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warm text-ink mb-1">−{Math.round((1 - shownPrice / shownCompare) * 100)}%</span>
          </>
        )}
      </div>
      <p className={cn('text-xs font-semibold', soldOut ? 'text-danger' : 'text-success')}>
        {soldOut ? 'Распродано' : 'В наличии'}
      </p>

      {/* Расцветки (свотчи-фото → ?color=) */}
      <div>
        <p className="font-semibold text-sm">Цвет: <span className="text-ink-muted font-normal">{activeColorwayName}</span></p>
        <div className="flex gap-2.5 mt-2">
          {colorways.map((cw) => (
            <Link key={cw.slug} href={`/product/${productSlug}?color=${cw.slug}`} scroll={false} aria-pressed={cw.slug === activeColorwaySlug} aria-label={`Цвет ${cw.name}`}
              className={cn('w-11 h-11 rounded-xl overflow-hidden bg-surface-soft', cw.slug === activeColorwaySlug ? 'ring-2 ring-offset-2 ring-[hsl(var(--color-text))]' : 'border border-line hover:border-ink')}>
              {cw.thumbUrl && <Image src={cw.thumbUrl} alt={cw.name} width={44} height={44} className="object-contain p-1 w-full h-full" />}
            </Link>
          ))}
        </div>
      </div>

      {/* Размеры EU */}
      <div>
        <p className="font-semibold text-sm">Размер <span className="text-ink-muted font-normal">EU</span></p>
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 mt-2" role="group" aria-label="Выбор размера">
          {variants.map((v) => {
            const disabled = !v.active || v.stock <= 0;
            return (
              <button key={v.id} type="button" className="size tnum" aria-pressed={v.id === sizeId} disabled={disabled}
                onClick={() => setSizeId(v.id)}>{v.sizeEu}</button>
            );
          })}
        </div>
        {fitNote && <p className="text-xs text-ink-muted mt-2">{fitNote}</p>}
      </div>

      {/* Add to cart */}
      <Button variant="primary" size="lg" className="w-full" disabled={!selected || soldOut} loading={adding} onClick={onAdd}>
        {added ? 'Добавлено ✓' : !selected ? 'Выберите размер' : `В корзину · ${formatPrice(shownPrice)}`}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: `app/product/[slug]/not-found.tsx`**

```tsx
import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-20 text-center">
      <h1 className="font-display font-bold text-3xl">Товар не найден</h1>
      <p className="text-ink-muted mt-2">Возможно, модель снята с продажи.</p>
      <Link href="/catalog" className="btn btn-md btn-primary mt-6">В каталог</Link>
    </div>
  );
}
```

- [ ] **Step 6: `app/product/[slug]/page.tsx` (RSC; async params/searchParams; ?color=; related; generateMetadata; JSON-LD)** `(context7)`

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma-client';
import { getProductBySlug } from '@/lib/get-product';
import { productCardInclude, buildProductCardData } from '@/lib/product-summary';
import { normalizeSize } from '@/lib/format';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD } from '@/constants/config';
import { ProductCard } from '@/components/shared/product-card';
import { Breadcrumbs } from '@/components/shared/product/breadcrumbs';
import { ProductGallery } from '@/components/shared/product/product-gallery';
import { PurchasePanel } from '@/components/shared/product/purchase-panel';
import { SpecsTable } from '@/components/shared/product/specs-table';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findFirst({ where: { slug, active: true }, select: { name: true, description: true } });
  if (!product) return { title: 'Товар не найден', robots: { index: false, follow: false } };
  return { title: product.name, description: product.description ?? undefined, alternates: { canonical: `/product/${slug}` } };
}

export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { color } = await searchParams;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const active = product.colorways.find((c) => c.slug === color) ?? product.colorways.find((c) => c.isDefault) ?? product.colorways[0];
  if (!active) notFound();

  const now = new Date();
  const relatedRaw = await prisma.product.findMany({
    where: { active: true, categoryId: product.categoryId, NOT: { id: product.id } },
    take: 4, orderBy: { sortOrder: 'asc' }, include: productCardInclude,
  });
  const related = relatedRaw.map((p) => buildProductCardData(p, now, { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD }));

  const galleryImages = active.images.map((im) => ({ url: im.url, alt: im.alt ?? product.name }));
  const panelColorways = product.colorways.map((cw) => ({ slug: cw.slug, name: cw.name, thumbUrl: cw.images[0]?.url ?? null }));
  const panelVariants = active.variants.map((v) => ({
    id: v.id, sizeEu: normalizeSize(v.sizeEu as unknown as number), stock: v.stock, active: v.active,
    price: v.price, compareAtPrice: v.compareAtPrice,
  }));
  const specs = (product.specs ?? null) as Record<string, string> | null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pb-16">
      <Breadcrumbs items={[
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog' },
        { label: product.category.name, href: `/catalog?category=${product.category.slug}` },
        { label: product.name },
      ]} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 mt-6">
        {/* key по расцветке: при смене ?color= галерея/панель пересоздаются (сброс выбранного размера) */}
        <ProductGallery key={active.slug} images={galleryImages} productName={product.name} />
        <div>
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">{product.category.name} · {product.brand}</p>
          <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight mt-1">{product.name}</h1>
          <div className="mt-5">
            <PurchasePanel
              key={active.slug}
              productName={product.name}
              productSlug={product.slug}
              colorways={panelColorways}
              activeColorwaySlug={active.slug}
              activeColorwayName={active.name}
              variants={panelVariants}
              fitNote={product.fitNote}
            />
          </div>
        </div>
      </div>

      {/* Описание + specs */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 mt-12">
        <div>
          <h2 className="font-display font-bold text-2xl">Об этой модели</h2>
          {product.description && <p className="text-ink-muted mt-3 leading-relaxed">{product.description}</p>}
        </div>
        <SpecsTable specs={specs} />
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display font-bold text-2xl mb-5">С этим смотрят</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {related.map((p) => <ProductCard key={p.slug} data={p} />)}
          </div>
        </section>
      )}

      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: product.name,
        image: galleryImages.map((g) => g.url), description: product.description ?? undefined, brand: product.brand,
        offers: { '@type': 'AggregateOffer', priceCurrency: 'RUB', availability: active.variants.some((v) => v.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', lowPrice: Math.min(...active.variants.map((v) => v.price)) },
      }) }} />
    </div>
  );
}
```
> Отзывы и избранное (`♡`, «Купить в один клик») — НЕ рендерим (спека: скрыто/вне Фазы 1). «Таблица размеров» — необязательна; можно добавить ссылку-кнопку, открывающую справочную таблицу из `SIZE_CONVERSION` (опц., не блокер).

- [ ] **Step 7: Проверка**

Run: `npm run dev` → перейти с каталога на товар.
Expected: галерея с миниатюрами; свотчи расцветок (клик меняет `?color=`, галерею и размеры; сбрасывает выбор размера); недоступные размеры перечёркнуты/disabled; цена/скидка/наличие; «Выберите размер» → после выбора «В корзину · цена» → клик добавляет, бейдж корзины +1; specs; related; несуществующий slug → not-found. Остановить.

- [ ] **Step 8: Commit**

```bash
git add stride-app/lib/get-product.ts stride-app/components/shared/product stride-app/app/product
git commit -m "feat(stride-app): PDP — галерея, расцветки (?color=), размеры EU, add-to-cart, specs, related, 404, JSON-LD"
```

---

## Task 17: Корзина `/cart` (client + Zustand, по `cart.html`)

**Files:**
- Create: `stride-app/components/shared/cart/cart-line-item.tsx`
- Create: `stride-app/components/shared/cart/order-summary.tsx`
- Create: `stride-app/components/shared/cart/empty-cart.tsx`
- Create: `stride-app/app/cart/page.tsx`

> Эталон: `cart.html`. Позиция (9–33 отчёта), summary (36–64), пустая корзина (68–76). Индикатор «Бесплатно от 10 000 ₽» — по `FREE_SHIPPING_THRESHOLD` (спека добавляет к прототипу). Кнопка «Оформить заказ» — шов к Фазе 2 (disabled).

- [ ] **Step 1: `cart-line-item.tsx` (client)**

```tsx
'use client';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { Counter } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/store';
import type { CartStateItem } from '@/services/dto/cart.dto';

export function CartLineItem({ item }: { item: CartStateItem }) {
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);
  const removeCartItem = useCartStore((s) => s.removeCartItem);
  return (
    <article className={cn('rounded-2xl bg-surface border border-line p-4 flex gap-4', (item.disabled || !item.available) && 'opacity-60')}>
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-surface-soft shrink-0">
        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-base leading-tight">{item.name}</h3>
        <p className="text-sm text-ink-muted mb-3">Размер: {item.sizeEu} · Цвет: {item.colorwayName}</p>
        {!item.available && <p className="text-sm text-danger font-medium mb-2">Нет в наличии</p>}
        <div className="flex items-center justify-between gap-3">
          <Counter value={item.quantity} min={1} max={Math.max(1, item.stock)} disabled={item.disabled || !item.available}
            onChange={(q) => updateItemQuantity(item.id, q)} />
          <p className={cn('font-bold text-lg tnum', !item.available && 'line-through text-ink-muted')}>{formatPrice(item.lineTotal)}</p>
        </div>
      </div>
      <button className="text-ink-muted hover:text-danger transition shrink-0" aria-label={`Удалить ${item.name} из корзины`} onClick={() => removeCartItem(item.id)}>
        <Trash2 className="w-5 h-5" />
      </button>
    </article>
  );
}
```

- [ ] **Step 2: `order-summary.tsx` (client; промокод-заглушка, индикатор доставки, total, checkout-шов)**

```tsx
'use client';
import { Button, Input } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { FREE_SHIPPING_THRESHOLD } from '@/constants/config';

export function OrderSummary({ totalAmount, count }: { totalAmount: number; count: number }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - totalAmount);
  const freeShipping = remaining === 0;
  return (
    <aside>
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <h2 className="font-display font-bold text-xl">Итого</h2>

        {/* Промокод — заглушка (шов к Фазе 2) */}
        <div>
          <label className="block text-sm font-medium mb-2" htmlFor="promo">Промокод</label>
          <div className="flex gap-2">
            <Input id="promo" placeholder="Введите промокод" disabled title="Промокоды появятся в Фазе 2" />
            <Button variant="secondary" size="md" className="shrink-0" disabled>Применить</Button>
          </div>
        </div>

        <div className="space-y-2 text-sm border-t border-line pt-4">
          <div className="flex justify-between"><span className="text-ink-muted">Товары ({count} шт.)</span><span className="font-semibold tnum">{formatPrice(totalAmount)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="font-semibold text-success">{freeShipping ? 'Бесплатно' : 'по тарифу'}</span></div>
        </div>

        {/* Индикатор бесплатной доставки */}
        {!freeShipping ? (
          <div className="text-xs text-ink-muted">Добавьте ещё <span className="font-semibold text-ink tnum">{formatPrice(remaining)}</span> до бесплатной доставки</div>
        ) : (
          <div className="text-xs text-success font-semibold">Бесплатная доставка применена</div>
        )}

        <div className="flex justify-between items-baseline border-t border-line pt-4">
          <span className="text-lg font-semibold">Итого</span>
          <span className="font-display font-bold text-2xl tnum">{formatPrice(totalAmount)}</span>
        </div>

        <Button variant="primary" size="lg" className="w-full" disabled title="Оформление заказа появится в Фазе 2">Оформить заказ →</Button>
        <p className="text-xs text-ink-muted leading-relaxed">Оформление, оплата и доставка появятся в следующей фазе.</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: `empty-cart.tsx` (RSC)**

```tsx
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';

export function EmptyCart() {
  return (
    <div className="bg-surface border border-line rounded-2xl text-center py-16 px-5">
      <PackageOpen className="w-16 h-16 mx-auto text-ink-muted" aria-hidden />
      <h2 className="font-display font-bold text-2xl mt-4">Корзина пустая</h2>
      <p className="text-ink-muted mt-2 max-w-md mx-auto">Добавьте хотя бы один товар, чтобы совершить заказ</p>
      <Link href="/catalog" className="btn btn-lg btn-primary mt-6">← Перейти в каталог</Link>
    </div>
  );
}
```

- [ ] **Step 4: `app/cart/page.tsx` (client; useCart)**

```tsx
'use client';
import { useCart } from '@/hooks/use-cart';
import { CartLineItem } from '@/components/shared/cart/cart-line-item';
import { OrderSummary } from '@/components/shared/cart/order-summary';
import { EmptyCart } from '@/components/shared/cart/empty-cart';
import { Skeleton } from '@/components/ui';

export default function CartPage() {
  const { items, totalAmount, loading } = useCart();

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8 pb-16">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px]">Корзина</h1>
      {items.length > 0 && <p className="text-ink-muted mt-1">{items.length} товара</p>}

      {loading && items.length === 0 ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyCart /></div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 mt-6">
          <div className="space-y-4">
            {items.map((it) => <CartLineItem key={it.id} item={it} />)}
          </div>
          <OrderSummary totalAmount={totalAmount} count={items.reduce((a, i) => a + i.quantity, 0)} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Проверка полного флоу**

Run: `npm run dev` → добавить товар на PDP → открыть `/cart`.
Expected: позиция с фото/названием/размером/цветом/ценой; степпер меняет количество и подытог; удаление убирает позицию; индикатор «добавьте ещё … / бесплатная доставка»; «Оформить заказ» — disabled; пустая корзина после удаления всех. Перезагрузка страницы сохраняет корзину (cookie). Остановить.

- [ ] **Step 6: Commit**

```bash
git add stride-app/components/shared/cart stride-app/app/cart
git commit -m "feat(stride-app): страница корзины — позиции, степпер, удаление, summary, индикатор доставки, шов checkout, пустое состояние"
```

---

## Task 18: SEO (`sitemap.ts`, `robots.ts`, canonical/metadata)

**Files:**
- Create: `stride-app/app/sitemap.ts`
- Create: `stride-app/app/robots.ts`
- Modify: `stride-app/.env.example` (добавить `NEXT_PUBLIC_SITE_URL`)

> `metadata` (title/description) — уже в `layout.tsx` (Задача 12); canonical/title PDP — в `generateMetadata` (Задача 16); JSON-LD Product — на PDP (Задача 16). Здесь — sitemap/robots.

- [ ] **Step 1: Добавить `NEXT_PUBLIC_SITE_URL` в `.env.example`**

Дописать строку:
```bash
# Базовый публичный URL (для sitemap/robots/canonical)
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 2: `app/sitemap.ts` (динамический — статические роуты + товары)**

```ts
import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma-client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const products = await prisma.product.findMany({ where: { active: true }, select: { slug: true } });
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/catalog`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/cart`, changeFrequency: 'monthly', priority: 0.1 },
  ];
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.slug}`, changeFrequency: 'weekly', priority: 0.8,
  }));
  return [...staticRoutes, ...productRoutes];
}
```

- [ ] **Step 3: `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/cart', '/api/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Проверка**

Run: `npm run dev` → открыть `http://localhost:3000/sitemap.xml` и `/robots.txt`.
Expected: sitemap содержит `/`, `/catalog` и URL всех 5 товаров; robots отдаёт корректные правила + ссылку на sitemap. Остановить.

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/sitemap.ts stride-app/app/robots.ts stride-app/.env.example
git commit -m "feat(stride-app): SEO — sitemap.ts (товары), robots.ts"
```

---

## Task 19: Playwright — e2e smoke + a11y

**Files:**
- Modify: `stride-app/package.json` (добавить `@axe-core/playwright`)
- Create: `stride-app/playwright.config.ts`
- Create: `stride-app/e2e/landing.spec.ts`
- Create: `stride-app/e2e/catalog.spec.ts`
- Create: `stride-app/e2e/product.spec.ts`
- Create: `stride-app/e2e/cart.spec.ts`
- Create: `stride-app/e2e/a11y.spec.ts`

> Предусловие: БД засижена (Задача 8), `.env` заполнен. e2e гоняются против поднятого dev-сервера и реальной Neon-БД с сидом.

- [ ] **Step 1: Добавить dev-зависимость и установить**

В `package.json` → `devDependencies` добавить `"@axe-core/playwright": "^4.10.1"`.
Run: `npm install`

- [ ] **Step 2: `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: `e2e/landing.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('лендинг рендерит hero, категории, бестселлеры', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Смотреть каталог' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Бестселлеры' })).toBeVisible();
  // хотя бы одна карточка товара ведёт на /product/
  await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
});
```

- [ ] **Step 4: `e2e/catalog.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('каталог: фильтр по категории меняет URL и выдачу', async ({ page }) => {
  await page.goto('/catalog');
  const allCount = await page.locator('article').count();
  expect(allCount).toBeGreaterThan(0);

  // выбрать категорию «Беговые»
  await page.getByRole('checkbox', { name: 'Беговые' }).check();
  await expect(page).toHaveURL(/category=running/);
  // должна остаться хотя бы одна карточка и количество не больше исходного
  const filtered = await page.locator('article').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(allCount);
});

test('каталог: пустая выдача при несовместимых фильтрах', async ({ page }) => {
  await page.goto('/catalog?q=zzzнеттакого');
  await expect(page.getByText('Таких кроссовок нет')).toBeVisible();
});
```

- [ ] **Step 5: `e2e/product.spec.ts` (расцветка + размер + add-to-cart; дедуп при повторном добавлении)**

```ts
import { test, expect } from '@playwright/test';

test('PDP: переключение расцветки, выбор размера, добавление в корзину', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByRole('heading', { name: /Velocity Trail/ })).toBeVisible();

  // переключить расцветку → меняется ?color=
  await page.getByRole('button', { name: /Цвет Trail Black/ }).click();
  await expect(page).toHaveURL(/color=trail-black/);

  // вернуться на дефолтную и выбрать доступный размер 42
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();

  // бейдж корзины показывает 1
  await expect(page.getByRole('link', { name: /Корзина, 1 товара/ })).toBeVisible();
});

test('PDP: недоступный размер (stock 0) — disabled', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByRole('button', { name: '43', exact: true })).toBeDisabled();
});

test('Корзина: повторное добавление того же варианта увеличивает количество (дедуп)', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  // одна позиция, количество 2
  await expect(page.locator('article').filter({ hasText: 'Velocity Trail' })).toHaveCount(1);
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
});
```

- [ ] **Step 6: `e2e/cart.spec.ts` (степпер, удаление, подытог, пустое состояние)**

```ts
import { test, expect } from '@playwright/test';

test('корзина: степпер меняет подытог, удаление очищает', async ({ page }) => {
  // добавить товар
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');

  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  // увеличить количество
  await page.getByRole('button', { name: 'Увеличить количество' }).click();
  await expect(page.getByText('25 980 ₽').first()).toBeVisible();
  // удалить
  await page.getByRole('button', { name: /Удалить/ }).click();
  await expect(page.getByText('Корзина пустая')).toBeVisible();
});
```

- [ ] **Step 7: `e2e/a11y.spec.ts` (axe на ключевых страницах + focus-ring)**

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const path of ['/', '/catalog', '/product/stride-velocity-trail', '/cart']) {
  test(`a11y: нет серьёзных нарушений на ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
}
```

- [ ] **Step 8: Запустить e2e (нужен сид + .env)**

Run: `npx playwright test`
Expected: все спеки зелёные.
> Если a11y находит нарушения — устранить (типовое: контраст текста на lime, отсутствующие `aria-label` на иконочных кнопках, `alt` на изображениях). Это часть критериев §11.

- [ ] **Step 9: Commit**

```bash
git add stride-app/playwright.config.ts stride-app/e2e stride-app/package.json
git commit -m "test(stride-app): Playwright e2e (лендинг/каталог/PDP/корзина/дедуп) + a11y (axe)"
```

---

## Task 20: Финальная сверка с критериями готовности (§15)

**Files:** (нет новых; проверки + возможные точечные правки)

- [ ] **Step 1: Полная проверка качества**

Run по очереди из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
npx playwright test
```
Expected: typecheck — 0 ошибок; vitest — все unit зелёные; `next build` — успешная сборка без ошибок; e2e — зелёные.

- [ ] **Step 2: Чек-лист критериев готовности Фазы 1 (§15 спеки)**

Пройти вручную (dev-сервер), отметить каждый пункт:
- [ ] `prisma:push` + `prisma:seed` создают рабочую БД с 5 моделями (проверено в Задачах 4, 8).
- [ ] Лендинг: hero, бенто-категории со счётчиками, бестселлеры.
- [ ] Каталог: фильтры (категория/бренд/пол/размер/цвет/цена/в наличии), сортировки (5), пагинация, состояния loading/empty; счётчики фасетов.
- [ ] PDP: переключение расцветки (`?color=`), выбор размера (недоступные disabled), add-to-cart обновляет бейдж; specs; related; 404 для неизвестного slug.
- [ ] Корзина: степпер, удаление, корректный подытог, индикатор бесплатной доставки, шов checkout (disabled), пустое состояние.
- [ ] Корзина переживает перезагрузку (cookie `cartToken`); сток/`active` учитываются при добавлении (нельзя добавить sold-out/сверх стока).
- [ ] Все unit- и e2e-тесты зелёные; a11y-проверки проходят.
- [ ] Визуальное соответствие прототипам (токены/радиусы/типографика/glass-header/footer).

- [ ] **Step 3: Финальный commit (если были правки)**

```bash
git add -A
git commit -m "chore(stride-app): финальная сверка Фазы 1 (typecheck/test/build/e2e зелёные)"
```

- [ ] **Step 4: Завершение ветки**

Использовать `superpowers:finishing-a-development-branch` для выбора варианта интеграции (merge в `main` / PR в `ui-ux-promax/sneakers-store-v1` / оставить ветку).

---

## Self-Review (проведён против спеки `2026-06-01-stride-phase1-catalog-cart-design.md`)

**1. Покрытие требований спеки:**

| Раздел спеки | Где в плане |
|---|---|
| §3 Объём (лендинг/каталог/PDP/корзина/layout/seed/newsletter UI) | Задачи 8, 12, 14, 15, 16, 17 |
| §4 Стек и структура | Задачи 1–3 |
| §5 Дизайн-система (токены/типографика/радиусы/паттерны/кнопки/бейджи) | Задача 3 |
| §6 Доменная модель (schema.prisma) | Задача 4 |
| §7.1–7.4 Роуты/страницы | Задачи 12 (layout/SEO-metadata), 14, 15, 16, 17 |
| §8 Данные и состояние (RSC-чтения + cart API+Zustand) | Задачи 10, 11, 15, 16 |
| §9 Инфраструктура (prisma-client/logger/pii/request-context/rate-limit/next.config/fonts) | Задача 2, 12 |
| §10 Ошибки/ограничение Neon (без `$transaction`, 404, проверка стока) | Задачи 9, 10, 16 |
| §11 Тесты (unit: фильтры/бейджи/корзина/формат; e2e+a11y) | Задачи 6, 7, 9, 13, 19 |
| §12 Сид (5 моделей) | Задача 8 |
| §13 Конфиг и окружение | Задачи 1, 5 |
| §14 Открытые допущения (quick-add→PDP, поиск ?q=, legal-заглушки, ₽ Int) | Задачи 12, 13, 15 |
| §15 Критерии готовности | Задача 20 |

**2. Скан плейсхолдеров:** Все шаги, меняющие код, содержат полный код — включая ранее описанные контрактом `price-filter.tsx` (Задача 15), `engineered-feature.tsx` и `trust-strip.tsx` (Задача 14), теперь приведённые целиком. Ссылки на строки прототипов (`home.html:NNN`) — указатели на закоммиченный эталон вёрстки, а не «доделать позже»; сам JSX в шагах присутствует. Запрещённых паттернов («TODO», «implement later», «similar to Task N» вместо кода) в плане нет.

**3. Консистентность типов между задачами (проверено):**
- `CartStateItem`/`CartDetails` объявлены в `services/dto/cart.dto.ts`, импортируются в `lib/cart.ts`, `store/cart.ts`, `cart-line-item.tsx` — единый источник.
- `CartWithItems` + `cartInclude` (lib/cart.ts) — общий тип ответа API/сервиса/стора; `services/cart.ts` типизирует методы им.
- Идентификаторы позиций — `string` (cuid) сквозь схему → API `[id]` → `Api.cart.*` → стор. Согласовано (не `number`, как в Next14-референсе).
- `ProductCardData` + `productCardInclude` (lib/product-summary.ts) — общий для лендинга/каталога/related.
- `Facet` (lib/find-products.ts) — общий для `checkbox-facet`/`active-filter-chips`/`filter-sidebar`.
- `parseCatalogParams` → `buildProductWhere`/`buildOrderBy` (lib/catalog-filters.ts) — единый контракт `CatalogParams`, переиспользован в `find-products.ts`.
- Хелперы `normalizeSize`/`formatPrice`/`discountPercent`/`computeBadges`/`stockSummary` — единые сигнатуры во всех потребителях.

**4. Зафиксированные отклонения спека↔прототип↔референс** (осознанные, не баги):
- Каталог: добавлены фильтры **бренд**/**пол** и **facet-counts** (нет в прототипе) — по спеке §7.2.
- Сортировка/пагинация цены — **в памяти** (корректно для малого каталога Фазы 1); для масштаба вынести в DB-уровень (отмечено в `find-products.ts`).
- Размеры — **EU** (прототип подписан «RU» — следуем спеке §2/§8).
- Индикатор «Бесплатно от 10 000 ₽» — добавлен по спеке (в прототипе корзины его нет).
- id — **cuid** (референс — Int autoincrement); seed — **nested create** (устойчивее референса).
- Sentry/pino — **не вводим** в Фазе 1 (опц. по спеке); логгер на `console`-JSON.

---

## Исполнение

План сохранён в `docs/superpowers/plans/2026-06-01-stride-phase1-catalog-cart.md`. Реализацию вести **на отдельной ветке/worktree** (не на `main`): спека и план — на `main`, код Фазы 1 — на ветке (см. `superpowers:using-git-worktrees`), затем PR в `ui-ux-promax/sneakers-store-v1`.

Предусловие для задач с БД (4, 8, 10, 15, 16, 17, 19): пользователь создаёт Neon-БД STRIDE и заполняет `.env` (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`). Без этого выполнить Задачи 1–3, 5–7, 9 (скаффолд/инфра/дизайн/конфиг/хелперы/фильтры/cart-логика и их unit-тесты), затем остановиться на Задаче 4 до получения строк подключения.

