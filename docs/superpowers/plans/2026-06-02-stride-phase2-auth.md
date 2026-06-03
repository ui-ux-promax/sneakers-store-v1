# STRIDE — Фаза 2.0 (Auth-фундамент): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в `stride-app` авторизацию (email/пароль + Google) на Auth.js v5 с JWT-сессиями, профиль «Личные данные», слияние гостевой корзины при входе и legal-страницы — без phone-OTP, без писем, без checkout.

**Architecture:** Auth.js v5 (`next-auth@5`) + `@auth/prisma-adapter`, `session.strategy='jwt'` (ноль БД-I/O на запрос — лечит латентность Neon HTTP, где `$transaction` недоступен). Edge-split: лёгкий `auth.config.ts` (для middleware) + полный `auth.ts` (адаптер, nodejs). email/пароль — `Credentials`-провайдер (argon2id, тяжёлые модули через динамический `import` чтобы не утекать в edge). Google — `GoogleProvider`. Слияние корзины — последовательными `await` + `retryOnTransient` (без транзакций), переиспользуя примитивы Фазы 1.

**Tech Stack:** Next 15.1 (App Router, React 18, TS 5.7), `next-auth@5` (beta) + `@auth/prisma-adapter`, Prisma 6.19 + `@prisma/adapter-neon` (Neon HTTP), `@node-rs/argon2`, Zod, React Hook Form, Vitest, Playwright (+ axe), CI на Ubuntu.

**Спека:** `docs/superpowers/specs/2026-06-02-stride-phase2-auth-design.md`. **Ветка:** `feat/phase2.0-auth`.

---

## Соглашения этого плана (прочитать перед стартом)

1. **Все пути — от `stride-app/`**, команды запускать из `stride-app/`. Коммиты — на английском, conventional-commits, **без `Co-Authored-By`**, единственный автор `ui-ux-promax` (требование пользователя).
2. **Ограничение Neon HTTP:** `$transaction` НЕ поддерживается. Любые мультизаписи — последовательные `await` + ручная компенсация + обёртка `retryOnTransient` (уже встроена в `prisma` из `lib/prisma-client.ts`). Гонки create — через `@unique` + перехват Prisma `P2002`, НЕ через find-then-create.
3. **Auth.js non-negotiables:**
   - `session: { strategy: 'jwt' }` ВСЕГДА явно (с адаптером дефолт — `database`, что писало бы `Session` на каждый запрос по Neon HTTP).
   - Адаптер/Prisma/argon2 НЕ должны бандлиться в `middleware` (edge). Тяжёлые импорты внутри `Credentials.authorize` — через `await import(...)` (динамически).
   - Route handler `[...nextauth]` и всё с паролями/БД — `runtime = 'nodejs'`.
4. **Деньги — `Int`** (не трогаем money-логику Фазы 1 при слиянии корзины).
5. **TDD** для чистой логики (хеш пароля, слияние корзины, нормализация email): сначала падающий тест (RED) → минимальная реализация (GREEN) → коммит. Интеграция (auth-флоу, страницы) — Playwright e2e.
6. **e2e только в CI (Ubuntu)** — локальный Windows флакает из-за дистанции до Neon (см. Фазу 1). Локально гоняем `typecheck` + `vitest` + `next build`.
7. **Операционные предусловия пользователя** (без них Google-вход и сессии не заработают): задать env `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (см. Task 3); создать OAuth-клиент в Google Cloud Console с redirect `…/api/auth/callback/google`.

---

## Структура файлов (создаётся/меняется по ходу)

```
stride-app/
├─ prisma/schema.prisma                 # +User, +Account, +VerificationToken, +UserRole, Cart.userId (Task 2)
├─ auth.config.ts                        # edge-safe конфиг: providers (Google + Credentials с динамич. импортами), callbacks, pages, authorized (Task 5)
├─ auth.ts                               # NextAuth + PrismaAdapter + session jwt + events.signIn(cart-merge) (Task 6, 8)
├─ middleware.ts                         # защита /profile через auth.config (Task 6)
├─ types/next-auth.d.ts                  # расширение Session/JWT (id, role) (Task 6)
├─ app/
│  ├─ api/auth/[...nextauth]/route.ts    # handlers Auth.js, runtime nodejs (Task 6)
│  ├─ (auth)/login/page.tsx              # экран входа (Task 11)
│  ├─ (auth)/register/page.tsx           # экран регистрации (Task 11)
│  ├─ profile/page.tsx                   # профиль (RSC, защищён) (Task 12)
│  └─ legal/{privacy,terms,delivery,refund}/page.tsx  # legal (Task 14)
├─ lib/
│  ├─ password.ts                        # hashPassword/verifyPassword (argon2id) (Task 3)
│  ├─ auth-identity.ts                   # normalizeEmail (Task 4)
│  ├─ cart-merge.ts                      # mergeGuestCart (Task 8)
│  └─ rate-limit.ts                      # реальный лимитер (замена NOOP) (Task 9)
├─ services/dto/auth.dto.ts              # Zod-схемы register/login/profile (Task 10)
├─ app/actions/auth.ts                   # registerUser server action (Task 10)
├─ app/actions/profile.ts               # updateProfile server action (Task 12)
├─ components/shared/auth/               # LoginForm, RegisterForm, GoogleButton (Task 11)
├─ components/shared/profile/            # ProfileTabs, PersonalDataForm (Task 12)
├─ components/shared/site-header.tsx     # учёт сессии (войти/профиль/выход) (Task 13)
├─ components/shared/site-footer.tsx     # legal-ссылки → реальные пути (Task 14)
├─ tests/                                # password, cart-merge, auth-identity (Vitest)
└─ e2e/                                  # auth.spec.ts, profile.spec.ts, legal.spec.ts (Playwright)
```

---

## Task 1: Установка зависимостей auth

**Files:**
- Modify: `stride-app/package.json`

- [ ] **Step 1: Установить рантайм- и dev-зависимости**

Run (из `stride-app/`):
```bash
npm install next-auth@^5.0.0-beta.25 @auth/prisma-adapter@^2.7.4 @node-rs/argon2@^2.0.2
```
> Версии — beta v5 Auth.js (App Router) + Prisma-адаптер (без `$transaction`) + argon2id (нативный, быстрый). Если `@node-rs/argon2` даст проблемы со сборкой на Vercel — фолбэк `bcryptjs@^2.4.3` (без нативного бинарника), реализация `lib/password.ts` это учитывает (Task 3).

- [ ] **Step 2: Зафиксировать `serverExternalPackages` для нативного argon2 (Next 15)**

Modify `stride-app/next.config.mjs` — добавить в объект `nextConfig`:
```js
  serverExternalPackages: ['@node-rs/argon2'],
```
> Гарантирует, что нативный модуль не попадёт в бандл и резолвится на сервере (nodejs). Если выбран `bcryptjs` — этот шаг не нужен.

- [ ] **Step 3: Проверка установки**

Run: `npm ls next-auth @auth/prisma-adapter @node-rs/argon2`
Expected: версии разрешены без `UNMET DEPENDENCY`.

- [ ] **Step 4: Commit**

```bash
git add stride-app/package.json stride-app/package-lock.json stride-app/next.config.mjs
git commit -m "chore(stride-app): add auth deps (next-auth v5, prisma-adapter, argon2)"
```

---

## Task 2: Схема Prisma — User / Account / VerificationToken / Cart.userId

**Files:**
- Modify: `stride-app/prisma/schema.prisma`

- [ ] **Step 1: Добавить enum и модели в `schema.prisma`**

В конец `schema.prisma` добавить:
```prisma
enum UserRole {
  CUSTOMER
  ADMIN
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  passwordHash  String?
  name          String?
  phone         String?
  birthdate     DateTime?
  role          UserRole  @default(CUSTOMER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  carts         Cart[]

  @@index([role])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 2: Связать существующую модель `Cart` с `User`**

В модели `Cart` (уже есть `userId String?`) добавить relation-поле и индекс. Найти блок `model Cart {` и добавить внутри:
```prisma
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
```
> `onDelete: SetNull` — удаление пользователя не рушит корзину (история остаётся анонимной). Поле `userId String?` уже существует с Фазы 1 — НЕ дублировать его.

- [ ] **Step 3: Сгенерировать клиент**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client` без ошибок; в типах появляются `User`, `Account`, `VerificationToken`, `UserRole`.

- [ ] **Step 4: Применить схему к Neon**

Run: `npm run prisma:push`
Expected: `Your database is now in sync with your Prisma schema`; создаются таблицы `User`, `Account`, `VerificationToken`; `Cart` получает FK на `User`.

- [ ] **Step 5: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): auth schema (User/Account/VerificationToken + Cart.userId relation)"
```

---

## Task 3: Хеширование пароля (`lib/password.ts`) — TDD

**Files:**
- Create: `stride-app/lib/password.ts`
- Create: `stride-app/tests/password.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/password.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('password', () => {
  it('хеш не равен исходному паролю и верифицируется', async () => {
    const hash = await hashPassword('S3cret!pass');
    expect(hash).not.toBe('S3cret!pass');
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword('S3cret!pass', hash)).toBe(true);
  });
  it('неверный пароль не проходит', async () => {
    const hash = await hashPassword('S3cret!pass');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/password.test.ts`
Expected: FAIL — `Cannot find module '@/lib/password'`.

- [ ] **Step 3: Реализовать `lib/password.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';

// Argon2id с OWASP-параметрами. Только серверный код (runtime nodejs).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
```
> Фолбэк на `bcryptjs`: заменить импорт на `import bcrypt from 'bcryptjs'`, тело — `bcrypt.hash(plain, 12)` / `bcrypt.compare(plain, hashed)`.

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/password.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/password.ts stride-app/tests/password.test.ts
git commit -m "feat(stride-app): argon2id password hash/verify + unit tests"
```

---

## Task 4: Нормализация email (`lib/auth-identity.ts`) — TDD

**Files:**
- Create: `stride-app/lib/auth-identity.ts`
- Create: `stride-app/tests/auth-identity.test.ts`

- [ ] **Step 1: Падающий тест**

`tests/auth-identity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '@/lib/auth-identity';

describe('normalizeEmail', () => {
  it('тримит и приводит к нижнему регистру', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
  it('пустой/невалидный → null', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('notanemail')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/auth-identity.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/auth-identity.ts`**

```ts
// Канонизация email — единый ключ идентичности (email-first).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return null;
  return e;
}
```

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/auth-identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/auth-identity.ts stride-app/tests/auth-identity.test.ts
git commit -m "feat(stride-app): email normalization helper + unit tests"
```

---

## Task 5: Edge-safe конфиг Auth.js (`auth.config.ts`)

**Files:**
- Create: `stride-app/auth.config.ts`

> Этот файл импортируется и в `auth.ts` (nodejs), и в `middleware.ts` (edge). Поэтому он НЕ должен статически импортировать `prisma`/`argon2`. Все тяжёлые модули — внутри `Credentials.authorize` через `await import(...)`, который в edge-бандл middleware не попадает (middleware не вызывает `authorize`, только проверяет сессию через `authorized`).

- [ ] **Step 1: Создать `auth.config.ts`**

```ts
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

type Role = 'CUSTOMER' | 'ADMIN';

export default {
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [
    // clientId/secret берутся из env AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET (инференс Auth.js v5)
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        // Динамические импорты — чтобы prisma/argon2 не утекли в edge-бандл middleware.
        const { normalizeEmail } = await import('@/lib/auth-identity');
        const { verifyPassword } = await import('@/lib/password');
        const { prisma } = await import('@/lib/prisma-client');

        const email = normalizeEmail(String(creds?.email ?? ''));
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
      },
    }),
  ],
  callbacks: {
    // Используется edge-middleware (Task 6): пускать на /profile только залогиненных.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected = nextUrl.pathname.startsWith('/profile');
      if (isProtected) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.role = (token.role as Role) ?? 'CUSTOMER';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: Проверка типов**

Run: `npm run typecheck`
Expected: ошибки про `session.user.id`/`role` (типы ещё не расширены) — это ожидаемо, чиним в Task 6 (типы). Остальное — без ошибок. Если есть другие ошибки — исправить.

- [ ] **Step 3: Commit**

```bash
git add stride-app/auth.config.ts
git commit -m "feat(stride-app): edge-safe Auth.js config (Google + Credentials, callbacks)"
```

---

## Task 6: Сборка Auth.js (`auth.ts`, route, middleware, типы)

**Files:**
- Create: `stride-app/auth.ts`
- Create: `stride-app/app/api/auth/[...nextauth]/route.ts`
- Create: `stride-app/middleware.ts`
- Create: `stride-app/types/next-auth.d.ts`
- Modify: `stride-app/.env.example`

- [ ] **Step 1: Расширить типы сессии — `types/next-auth.d.ts`**

```ts
import type { DefaultSession } from 'next-auth';

type Role = 'CUSTOMER' | 'ADMIN';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role } & DefaultSession['user'];
  }
  interface User {
    role?: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
```

- [ ] **Step 2: Создать `auth.ts` (полный конфиг с адаптером)**

```ts
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma-client';
import authConfig from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // prisma — extended-клиент (retryOnTransient); адаптер использует стандартные методы.
  // Если TS ругается на тип extended-клиента — PrismaAdapter(prisma as unknown as PrismaClient).
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
});
```

- [ ] **Step 3: Route handler — `app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/auth';

export const runtime = 'nodejs';
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Middleware — `middleware.ts` (edge, защита /profile)**

```ts
import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Отдельный инстанс БЕЗ адаптера → edge-совместим. Решение о доступе — в callbacks.authorized.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/profile/:path*'],
};
```

- [ ] **Step 5: Дополнить `.env.example`**

Дописать в `stride-app/.env.example`:
```bash
# Auth.js (Фаза 2.0)
AUTH_SECRET="сгенерировать: npx auth secret"
AUTH_GOOGLE_ID="из Google Cloud Console (OAuth client)"
AUTH_GOOGLE_SECRET="из Google Cloud Console"
```

- [ ] **Step 6: Проверка типов и сборки**

Run: `npm run typecheck`
Expected: 0 ошибок (типы сессии расширены, `auth.config.ts` чист).

Run: `npm run build`
Expected: успешная сборка; в выводе появляется маршрут `ƒ /api/auth/[...nextauth]`; middleware собирается без ошибок про prisma/argon в edge.
> Если build падает с «prisma/argon in edge» — значит тяжёлый импорт попал в `auth.config.ts` статически: проверить, что в `Credentials.authorize` всё через `await import`.

- [ ] **Step 7: Commit**

```bash
git add stride-app/auth.ts stride-app/middleware.ts stride-app/types/next-auth.d.ts "stride-app/app/api/auth/[...nextauth]/route.ts" stride-app/.env.example
git commit -m "feat(stride-app): wire Auth.js v5 (auth.ts, route, middleware, session types)"
```

---

## Task 7: Zod-DTO авторизации (`services/dto/auth.dto.ts`)

**Files:**
- Create: `stride-app/services/dto/auth.dto.ts`

- [ ] **Step 1: Создать схемы**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(72, 'Слишком длинный'),
  name: z.string().trim().min(1).max(80).optional(),
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});
export type LoginValues = z.infer<typeof loginSchema>;

// Профиль: строки из формы; пустые поля допустимы (трактуются как «не менять/очистить»).
export const profileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  birthdate: z.string().trim().optional(), // 'YYYY-MM-DD' из <input type="date"> или ''
});
export type ProfileValues = z.infer<typeof profileSchema>;
```
> `password.max(72)` — единый предел (совместимо с возможным фолбэком bcrypt на 72 байта).

- [ ] **Step 2: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add stride-app/services/dto/auth.dto.ts
git commit -m "feat(stride-app): zod DTO for register/login/profile"
```

---

## Task 8: Слияние гостевой корзины (`lib/cart-merge.ts`) — TDD

**Files:**
- Create: `stride-app/lib/cart-merge.ts`
- Create: `stride-app/tests/cart-merge.test.ts`

> Инвариант cookie: целевая корзина — **гостевая** (её `cartToken` уже в cookie клиента). При входе привязываем гостевую к `userId`; если у пользователя была прошлая корзина — вливаем её позиции в гостевую и удаляем прошлую. Так cookie остаётся валидным после входа. Чистая логика слияния (`planCartMerge`) тестируется юнитом; оркестрация с Prisma — последовательными `await` (без `$transaction`), покрывается e2e.

- [ ] **Step 1: Падающий тест на чистую логику**

`tests/cart-merge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planCartMerge } from '@/lib/cart-merge';

// planCartMerge(source, target): влить source-позиции в target.
// Одинаковый productVariantId → увеличить количество target-позиции; иначе — создать в target.
describe('planCartMerge', () => {
  it('совпадающий вариант — суммирует количество', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v1', quantity: 2 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([{ id: 't1', quantity: 5 }]);
    expect(plan.creates).toEqual([]);
  });
  it('новый вариант — создаётся в target', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v2', quantity: 1 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([]);
    expect(plan.creates).toEqual([{ productVariantId: 'v2', quantity: 1 }]);
  });
  it('смесь: часть суммируется, часть создаётся', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v1', quantity: 1 }, { productVariantId: 'v3', quantity: 4 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([{ id: 't1', quantity: 4 }]);
    expect(plan.creates).toEqual([{ productVariantId: 'v3', quantity: 4 }]);
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/cart-merge.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/cart-merge.ts`**

```ts
import { prisma } from '@/lib/prisma-client';
import { recalcCartTotalByToken } from '@/lib/cart';

export interface MergeSourceItem { productVariantId: string; quantity: number; }
export interface MergeTargetItem { id: string; productVariantId: string; quantity: number; }
export interface CartMergePlan {
  increments: { id: string; quantity: number }[];     // обновить количество существующей target-позиции
  creates: { productVariantId: string; quantity: number }[]; // создать новую позицию в target
}

// Чистая логика: влить source в target.
export function planCartMerge(source: MergeSourceItem[], target: MergeTargetItem[]): CartMergePlan {
  const byVariant = new Map(target.map((t) => [t.productVariantId, t]));
  const increments: CartMergePlan['increments'] = [];
  const creates: CartMergePlan['creates'] = [];
  for (const s of source) {
    const t = byVariant.get(s.productVariantId);
    if (t) increments.push({ id: t.id, quantity: t.quantity + s.quantity });
    else creates.push({ productVariantId: s.productVariantId, quantity: s.quantity });
  }
  return { increments, creates };
}

// Оркестрация (вызывается из events.signIn). Без $transaction: последовательные await,
// retryOnTransient встроен в `prisma`. Целевая корзина — гостевая (её token в cookie).
export async function mergeGuestCart(guestToken: string | undefined, userId: string): Promise<void> {
  if (!guestToken) return;

  const guestCart = await prisma.cart.findFirst({ where: { token: guestToken }, include: { items: true } });
  if (!guestCart) return;

  const priorUserCart = await prisma.cart.findFirst({
    where: { userId, NOT: { id: guestCart.id } },
    include: { items: true },
  });

  // Привязать гостевую корзину к пользователю (cookie token сохраняется).
  if (guestCart.userId !== userId) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId } });
  }

  if (priorUserCart) {
    if (priorUserCart.items.length) {
      const plan = planCartMerge(
        priorUserCart.items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })),
        guestCart.items.map((i) => ({ id: i.id, productVariantId: i.productVariantId, quantity: i.quantity })),
      );
      for (const inc of plan.increments) {
        await prisma.cartItem.update({ where: { id: inc.id }, data: { quantity: inc.quantity } });
      }
      for (const cr of plan.creates) {
        await prisma.cartItem.create({ data: { cartId: guestCart.id, productVariantId: cr.productVariantId, quantity: cr.quantity } });
      }
    }
    // Удалить прошлую корзину пользователя (её items уйдут каскадом по onDelete).
    await prisma.cart.delete({ where: { id: priorUserCart.id } });
  }

  await recalcCartTotalByToken(guestCart.token);
}
```
> Допущение: сток при слиянии не клампится (резерв/жёсткая проверка стока — в P2.1 при checkout; в Фазе 1 корзина так же допускает количество до стока на момент добавления).

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/cart-merge.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Прогнать все unit-тесты**

Run: `npm test`
Expected: PASS (password, auth-identity, cart-merge + тесты Фазы 1).

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/cart-merge.ts stride-app/tests/cart-merge.test.ts
git commit -m "feat(stride-app): guest cart merge on login (planCartMerge + orchestration) + unit tests"
```

---

## Task 9: Регистрация + подключение слияния корзины к входу

**Files:**
- Create: `stride-app/app/actions/auth.ts`
- Modify: `stride-app/auth.ts` (добавить `events.signIn`)

- [ ] **Step 1: Server action регистрации — `app/actions/auth.ts`**

```ts
'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { hashPassword } from '@/lib/password';
import { normalizeEmail } from '@/lib/auth-identity';
import { registerSchema } from '@/services/dto/auth.dto';
import { signIn } from '@/auth';

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(raw: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };

  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Некорректный email' };

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Такой email уже зарегистрирован' };
    }
    throw e;
  }

  // Автологин: signIn выбросит NEXT_REDIRECT (нормально для server action).
  await signIn('credentials', { email, password: parsed.data.password, redirectTo: '/' });
  return { ok: true };
}
```
> Гонка дубликата email ловится по `P2002` (без find-then-create). `signIn` редиректит — код после него на успехе недостижим, `{ ok: true }` оставлен для типобезопасности.

- [ ] **Step 2: Подключить слияние корзины в `auth.ts` — добавить `events`**

В `auth.ts` дополнить объект конфигурации полем `events` (после `...authConfig`):
```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      // Динамические импорты — nodejs-only, в edge middleware не попадают (events тут не вызывается).
      const { cookies } = await import('next/headers');
      const { cartCookieName } = await import('@/lib/cart-cookie');
      const { mergeGuestCart } = await import('@/lib/cart-merge');
      const store = await cookies();
      const guestToken = store.get(cartCookieName)?.value;
      await mergeGuestCart(guestToken, user.id);
    },
  },
});
```
> `events.signIn` срабатывает после успешного входа любым методом (пароль/Google). Читает гостевой `cartToken` из cookie и сливает корзину. Cookie не переписываем — целевая корзина остаётся под тем же token (см. инвариант Task 8).

- [ ] **Step 3: Проверка типов и сборки**

Run: `npm run typecheck`
Expected: 0 ошибок.

Run: `npm run build`
Expected: успешная сборка.

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/actions/auth.ts stride-app/auth.ts
git commit -m "feat(stride-app): registerUser action + cart-merge on signIn event"
```

---

## Task 10: Реальный rate-limit на вход (замена NOOP)

**Files:**
- Modify: `stride-app/lib/rate-limit.ts`
- Modify: `stride-app/auth.config.ts` (применить лимит в `authorize`)
- Modify: `stride-app/package.json` (Upstash)
- Modify: `stride-app/.env.example`

- [ ] **Step 1: Установить Upstash**

Run: `npm install @upstash/ratelimit@^2.0.5 @upstash/redis@^1.34.3`

- [ ] **Step 2: Реализовать `checkLoginRateLimit` в `lib/rate-limit.ts`**

Заменить тело `checkCartRateLimit`-секции, добавив новый лимитер входа (оставить `extractClientIp`/`isRateLimitConfigured`/`RateLimitResult` как есть). Добавить:
```ts
// Sliding-window лимит попыток входа. Fail-open, если Upstash не сконфигурирован (dev).
let loginLimiter: { limit(key: string): Promise<{ success: boolean; remaining: number; reset: number }> } | null | false = null;

async function getLoginLimiter() {
  if (loginLimiter !== null) return loginLimiter;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { loginLimiter = false; return loginLimiter; }
  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');
  loginLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '5 m'), // 5 попыток / 5 минут на ключ
    prefix: 'stride-app:login',
  });
  return loginLimiter;
}

export async function checkLoginRateLimit(key: string): Promise<RateLimitResult> {
  const l = await getLoginLimiter();
  if (!l) return { success: true, remaining: -1, reset: 0 }; // fail-open
  const r = await l.limit(key);
  if (!r.success) logger.warn('login_rate_limited', { key });
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
```

- [ ] **Step 3: Применить лимит в `Credentials.authorize` (`auth.config.ts`)**

В `authorize` (Task 5) — добавить проверку лимита в начало, используя `request` (второй аргумент) для IP. Заменить сигнатуру и начало:
```ts
      async authorize(creds, request) {
        const { normalizeEmail } = await import('@/lib/auth-identity');
        const { verifyPassword } = await import('@/lib/password');
        const { prisma } = await import('@/lib/prisma-client');
        const { checkLoginRateLimit, extractClientIp } = await import('@/lib/rate-limit');

        const email = normalizeEmail(String(creds?.email ?? ''));
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        const ip = extractClientIp({ headers: request.headers });
        const rl = await checkLoginRateLimit(`${ip}:${email}`);
        if (!rl.success) return null; // слишком много попыток → как неверные данные

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role as 'CUSTOMER' | 'ADMIN' };
      },
```

- [ ] **Step 4: Дополнить `.env.example`**

```bash
# Rate-limit (Upstash) — опционально в dev (fail-open), обязательно в проде
KV_REST_API_URL=""
KV_REST_API_TOKEN=""
```

- [ ] **Step 5: Проверка типов и сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; сборка успешна.

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/rate-limit.ts stride-app/auth.config.ts stride-app/package.json stride-app/package-lock.json stride-app/.env.example
git commit -m "feat(stride-app): real sliding-window rate-limit on login (Upstash, fail-open in dev)"
```

---

## Task 11: Экраны входа и регистрации

**Files:**
- Create: `stride-app/components/shared/auth/google-button.tsx`
- Create: `stride-app/components/shared/auth/login-form.tsx`
- Create: `stride-app/components/shared/auth/register-form.tsx`
- Create: `stride-app/app/(auth)/login/page.tsx`
- Create: `stride-app/app/(auth)/register/page.tsx`

> Вёрстку (карточка/центрирование/заголовки) переносить из прототипа `ui-designe and prototypes/prototypes-app/auth.html` класс-в-класс, заменяя UI-примитивами Фазы 1 (`Button`, `Input`). Ниже — функциональный каркас с провязкой.

- [ ] **Step 1: `google-button.tsx`**

```tsx
'use client';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui';

export function GoogleButton() {
  return (
    <Button type="button" variant="secondary" size="lg" className="w-full"
      onClick={() => signIn('google', { redirectTo: '/' })}>
      Войти через Google
    </Button>
  );
}
```

- [ ] **Step 2: `login-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button, Input } from '@/components/ui';
import { loginSchema, type LoginValues } from '@/services/dto/auth.dto';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (v: LoginValues) => {
    setError(null);
    const res = await signIn('credentials', { ...v, redirect: false });
    if (res?.error) { setError('Неверный email или пароль'); return; }
    router.push('/');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <Input type="email" placeholder="Email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <Input type="password" placeholder="Пароль" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
      </div>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Войти</Button>
    </form>
  );
}
```

- [ ] **Step 3: `register-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { registerSchema, type RegisterValues } from '@/services/dto/auth.dto';
import { registerUser } from '@/app/actions/auth';

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (v: RegisterValues) => {
    setError(null);
    const res = await registerUser(v); // на успехе action редиректит (NEXT_REDIRECT)
    if (res && !res.ok) setError(res.error);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <Input placeholder="Имя" autoComplete="name" {...register('name')} />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <Input type="email" placeholder="Email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <Input type="password" placeholder="Пароль (мин. 8)" autoComplete="new-password" {...register('password')} />
        {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
      </div>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Зарегистрироваться</Button>
    </form>
  );
}
```

- [ ] **Step 4: Страницы `app/(auth)/login/page.tsx` и `register/page.tsx`**

`login/page.tsx`:
```tsx
import Link from 'next/link';
import { LoginForm } from '@/components/shared/auth/login-form';
import { GoogleButton } from '@/components/shared/auth/google-button';

export const metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display font-bold text-2xl mb-6">Вход</h1>
      <LoginForm />
      <div className="my-4 text-center text-xs text-ink-muted">или</div>
      <GoogleButton />
      <p className="mt-6 text-sm text-ink-muted">
        Нет аккаунта? <Link href="/register" className="underline">Зарегистрироваться</Link>
      </p>
    </main>
  );
}
```
`register/page.tsx` — аналогично, заголовок «Регистрация», `<RegisterForm />` + `<GoogleButton />`, ссылка на `/login` («Уже есть аккаунт? Войти»).

- [ ] **Step 5: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; появляются маршруты `/login`, `/register`.

- [ ] **Step 6: Commit**

```bash
git add "stride-app/app/(auth)" stride-app/components/shared/auth
git commit -m "feat(stride-app): login/register screens (email-password + Google)"
```

---

## Task 12: Профиль «Личные данные»

**Files:**
- Create: `stride-app/app/actions/profile.ts`
- Create: `stride-app/components/shared/profile/personal-data-form.tsx`
- Create: `stride-app/components/shared/profile/profile-view.tsx`
- Create: `stride-app/app/profile/page.tsx`

- [ ] **Step 1: Server action `app/actions/profile.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { profileSchema } from '@/services/dto/auth.dto';

export type ProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfile(raw: unknown): Promise<ProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля' };

  const { name, phone, birthdate } = parsed.data;
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name?.trim() ? name.trim() : null,
      phone: phone?.trim() ? phone.trim() : null,
      birthdate: birthdate ? new Date(birthdate) : null,
    },
  });
  revalidatePath('/profile');
  return { ok: true };
}
```

- [ ] **Step 2: `personal-data-form.tsx` (client)**

```tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { profileSchema, type ProfileValues } from '@/services/dto/auth.dto';
import { updateProfile } from '@/app/actions/profile';

export function PersonalDataForm({ initial, email }: { initial: ProfileValues; email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } =
    useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: initial });

  const onSubmit = async (v: ProfileValues) => {
    setMsg(null);
    const res = await updateProfile(v);
    setMsg(res.ok ? 'Сохранено' : res.error);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div>
        <label className="text-xs text-ink-muted">Email</label>
        <Input value={email} disabled readOnly />
      </div>
      <div>
        <label className="text-xs text-ink-muted">Имя</label>
        <Input {...register('name')} />
      </div>
      <div>
        <label className="text-xs text-ink-muted">Телефон</label>
        <Input {...register('phone')} placeholder="+7…" />
      </div>
      <div>
        <label className="text-xs text-ink-muted">Дата рождения</label>
        <Input type="date" {...register('birthdate')} />
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}
      <Button type="submit" variant="primary" loading={isSubmitting}>Сохранить</Button>
    </form>
  );
}
```

- [ ] **Step 3: `profile-view.tsx` (вкладки; «Мои заказы» — заглушка)**

```tsx
'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PersonalDataForm } from './personal-data-form';
import type { ProfileValues } from '@/services/dto/auth.dto';

export function ProfileView({ email, initial }: { email: string; initial: ProfileValues }) {
  const [tab, setTab] = useState<'data' | 'orders'>('data');
  const tabCls = (active: boolean) => cn('px-4 py-2 rounded-full text-sm font-semibold', active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-soft');
  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'data'} className={tabCls(tab === 'data')} onClick={() => setTab('data')}>Личные данные</button>
        <button role="tab" aria-selected={tab === 'orders'} className={tabCls(tab === 'orders')} onClick={() => setTab('orders')}>Мои заказы</button>
      </div>
      {tab === 'data'
        ? <PersonalDataForm initial={initial} email={email} />
        : <p className="text-ink-muted">Заказов пока нет.</p>}
    </div>
  );
}
```

- [ ] **Step 4: `app/profile/page.tsx` (RSC, защищён)**

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { ProfileView } from '@/components/shared/profile/profile-view';

export const metadata = { title: 'Профиль' };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login'); // дублирует middleware (страховка)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display font-bold text-2xl mb-6">Профиль</h1>
      <ProfileView
        email={user.email}
        initial={{
          name: user.name ?? '',
          phone: user.phone ?? '',
          birthdate: user.birthdate ? user.birthdate.toISOString().slice(0, 10) : '',
        }}
      />
    </main>
  );
}
```

- [ ] **Step 5: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; маршрут `/profile` (ƒ Dynamic).

- [ ] **Step 6: Commit**

```bash
git add stride-app/app/profile stride-app/app/actions/profile.ts stride-app/components/shared/profile
git commit -m "feat(stride-app): profile page (personal data via Server Action) + tabs"
```

---

## Task 13: Сессия в хедере (войти / профиль / выход)

**Files:**
- Create: `stride-app/components/shared/auth/auth-nav.tsx`
- Modify: `stride-app/components/shared/site-header.tsx`

- [ ] **Step 1: `auth-nav.tsx` (server-компонент)**

```tsx
import Link from 'next/link';
import { auth, signOut } from '@/auth';

export async function AuthNav() {
  const session = await auth();
  if (!session?.user) {
    return <Link href="/login" className="text-sm font-semibold hover:underline">Войти</Link>;
  }
  return (
    <div className="flex items-center gap-3">
      <Link href="/profile" className="text-sm font-semibold hover:underline">Профиль</Link>
      <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
        <button type="submit" className="text-sm text-ink-muted hover:text-ink" aria-label="Выйти">Выйти</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Вставить `<AuthNav />` в хедер**

В `site-header.tsx`, в зоне действий рядом с `<CartBadge />`, добавить `<AuthNav />`.
> Условие: `auth-nav.tsx` — server-компонент (вызывает `await auth()`). Если `site-header.tsx` помечен `'use client'`, его нельзя вызвать напрямую — тогда рендерить `<AuthNav />` как server-компонент в `app/layout.tsx` (передав в хедер через `children`/слот) ИЛИ снять `'use client'` с обёртки хедера, оставив клиентскими только интерактивные части (поиск, бейдж корзины). Выбрать минимально инвазивный вариант под текущую структуру `site-header.tsx`.

- [ ] **Step 3: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add stride-app/components/shared/auth/auth-nav.tsx stride-app/components/shared/site-header.tsx
git commit -m "feat(stride-app): session-aware header (login/profile/logout)"
```

---

## Task 14: Legal-страницы + ссылки в футере

**Files:**
- Create: `stride-app/app/legal/privacy/page.tsx`
- Create: `stride-app/app/legal/terms/page.tsx`
- Create: `stride-app/app/legal/delivery/page.tsx`
- Create: `stride-app/app/legal/refund/page.tsx`
- Modify: `stride-app/components/shared/site-footer.tsx`

> Контент переносить из прототипов `prototypes-app/legal-{privacy,terms,delivery,refund}.html`. Все 4 страницы — статичные RSC по одному шаблону.

- [ ] **Step 1: Шаблон страницы (на примере privacy)**

`app/legal/privacy/page.tsx`:
```tsx
export const metadata = { title: 'Политика конфиденциальности' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 prose-stride">
      <h1 className="font-display font-bold text-3xl mb-6">Политика конфиденциальности</h1>
      {/* Контент из legal-privacy.html */}
      <p className="text-ink-muted">…</p>
    </main>
  );
}
```
Аналогично создать `terms/page.tsx` («Условия использования»), `delivery/page.tsx` («Доставка и оплата»), `refund/page.tsx` («Возврат и обмен») — заголовок + контент из соответствующего прототипа.

- [ ] **Step 2: Обновить ссылки в `site-footer.tsx`**

Заменить `href="#"` на реальные пути:
- «Политика конфиденциальности» → `/legal/privacy`
- «Условия» → `/legal/terms`
- (если есть в футере) «Доставка и оплата» → `/legal/delivery`, «Возврат» → `/legal/refund`

Использовать `next/link` `<Link>` вместо `<a href="#">`.

- [ ] **Step 3: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; маршруты `/legal/*` (○ Static).

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/legal stride-app/components/shared/site-footer.tsx
git commit -m "feat(stride-app): legal pages (privacy/terms/delivery/refund) + footer links"
```

---

## Task 15: E2E + a11y

**Files:**
- Create: `stride-app/e2e/auth.spec.ts`
- Create: `stride-app/e2e/legal.spec.ts`
- Modify: `stride-app/e2e/a11y.spec.ts` (добавить новые маршруты)

> e2e гоняются в CI (Ubuntu). Локально на Windows возможен флак из-за дистанции до Neon — это ожидаемо.

- [ ] **Step 1: `e2e/auth.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

async function registerVia(page, email: string) {
  await page.goto('/register');
  await page.getByPlaceholder('Имя').fill('E2E User');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/Пароль/).fill('Passw0rd!1');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
}

test('регистрация → автологин → /profile доступен, выход работает', async ({ page }) => {
  const email = uniqueEmail();
  await registerVia(page, email);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('защита /profile без входа → редирект на /login', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('вход существующего пользователя', async ({ page }) => {
  const email = uniqueEmail();
  await registerVia(page, email);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Пароль').fill('Passw0rd!1');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
});

test('слияние корзины: гость добавил товар → зарегистрировался → товар в корзине', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();

  await registerVia(page, uniqueEmail());

  await page.goto('/cart');
  await expect(page.locator('article').filter({ hasText: 'Velocity Trail' })).toHaveCount(1);
});
```

- [ ] **Step 2: `e2e/legal.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const pages: [string, RegExp][] = [
  ['/legal/privacy', /Политика конфиденциальности/],
  ['/legal/terms', /Условия/],
  ['/legal/delivery', /Доставка/],
  ['/legal/refund', /Возврат/],
];

for (const [path, heading] of pages) {
  test(`legal: ${path} рендерится`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
}
```

- [ ] **Step 3: Добавить новые маршруты в `a11y.spec.ts`**

В массив путей `a11y.spec.ts` добавить `'/login'`, `'/register'`, `'/legal/privacy'`. (`/profile` пропускаем — требует сессии.)

- [ ] **Step 4: Прогнать e2e локально (ожидаемо может флакать — финальная проверка в CI)**

Run: `npx playwright test e2e/auth.spec.ts e2e/legal.spec.ts`
Expected (в CI на Ubuntu): зелёные. Локально — допускается флак по сети.

- [ ] **Step 5: Commit**

```bash
git add stride-app/e2e/auth.spec.ts stride-app/e2e/legal.spec.ts stride-app/e2e/a11y.spec.ts
git commit -m "test(stride-app): e2e for auth/profile/cart-merge/legal + a11y routes"
```

---

## Task 16: Финальная сверка и завершение P2.0

**Files:** (нет новых; проверки + отметки)

- [ ] **Step 1: Полная проверка качества**

Run по очереди из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck — 0; vitest — все unit зелёные (password, auth-identity, cart-merge + Фаза 1); build — успешно.

- [ ] **Step 2: Чек-лист критериев готовности (§11 спеки)**

Пройти вручную (dev-сервер `npm run dev` + Google OAuth env):
- [ ] Регистрация email/пароль → автологин → виден профиль.
- [ ] Вход/выход; `/profile` под защитой (редирект на `/login` без сессии).
- [ ] Google-вход создаёт/линкует аккаунт (ручная проверка на превью).
- [ ] Правка профиля (имя/телефон/дата рождения) сохраняется.
- [ ] Гостевая корзина переживает вход (количества суммируются, дубликатов позиций нет).
- [ ] Legal-страницы доступны; футер-ссылки реальны.
- [ ] Rate-limit на вход активен (при настроенном Upstash).
- [ ] e2e + a11y зелёные в CI (Ubuntu).

- [ ] **Step 3: Отметить spec выполненным и закоммитить**

В `docs/superpowers/specs/2026-06-02-stride-phase2-auth-design.md` сменить «Статус: на ревью» → «Статус: реализовано (P2.0)».
```bash
git add docs/superpowers/specs/2026-06-02-stride-phase2-auth-design.md
git commit -m "docs: mark Phase 2.0 auth spec implemented"
```

- [ ] **Step 4: Завершение ветки**

Использовать `superpowers:finishing-a-development-branch` (тесты зелёные в CI). Ожидаемо: PR `feat/phase2.0-auth` → `main`; после merge Vercel задеплоит прод (env Auth.js должны быть заданы в Vercel ДО деплоя). НЕ удалять ветку до подтверждения прод-деплоя.

---

## Self-Review (проведён против спеки `2026-06-02-stride-phase2-auth-design.md`)

**1. Покрытие требований спеки:**

| Раздел спеки | Задача плана |
|---|---|
| §4 Доменная модель (User/Account/VerificationToken/Cart.userId) | Task 2 |
| §5 Auth.js (auth.config/auth.ts/route/middleware, JWT, edge-split) | Tasks 5, 6 |
| §5 Credentials (argon2) | Tasks 3, 5 |
| §5 Google | Tasks 5, 6 |
| §6 Регистрация email/пароль | Tasks 7, 10, 11 |
| §6 Слияние гостевой корзины | Task 8 (логика) + Task 9 (events.signIn) |
| §7 `/login`, `/register` | Task 11 |
| §7 `/profile` (Server Action) | Task 12 |
| §7 legal-страницы + футер | Task 14 |
| §7 хедер (сессия) | Task 13 |
| §8 rate-limit (замена NOOP) | Task 10 |
| §8 P2002-guard, без $transaction, jwt, nodejs | Tasks 2, 8, 9, 6 |
| §9 тесты (unit + e2e + a11y) | Tasks 3, 4, 8, 15 |
| §10 env (AUTH_SECRET/Google) | Task 6 (.env.example) |
| §11 критерии готовности | Task 16 |

**2. Скан плейсхолдеров:** legal-контент помечен «из прототипа legal-*.html» — это перенос существующего эталона, не «доделать позже» (как в Фазе 1). Весь код шагов приведён целиком; нет «TODO/implement later/similar to Task N».

**3. Консистентность типов:** `normalizeEmail`, `hashPassword`/`verifyPassword`, `planCartMerge`/`mergeGuestCart`, `registerUser`/`updateProfile`, `RegisterValues`/`LoginValues`/`ProfileValues`, `Role='CUSTOMER'|'ADMIN'`, `RateLimitResult`/`checkLoginRateLimit`/`extractClientIp` — имена и сигнатуры согласованы между задачами, где определены и где используются.

**Зафиксированные допущения:** сток не клампится при слиянии корзины (резерв — P2.1); серверный отзыв JWT до истечения — вне scope; email-верификация/восстановление пароля/почтовый сервис/phone-OTP — P2.1+.

