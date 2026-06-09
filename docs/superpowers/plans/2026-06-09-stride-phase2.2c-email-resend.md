# P2.2c Email-верификация + Newsletter (Resend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Жёсткая email-верификация при регистрации (6-значный код в неубираемой модалке, переживающей reload) + newsletter-бэкенд на Resend (своя таблица `Subscriber` + синк в Resend Audience, single opt-in, отписка).

**Architecture:** Регистрация не логинит — ставит подписанную httpOnly cookie `pending_verification`; `RootLayout` рендерит неубираемую модалку, пока cookie есть и сессии нет. Верный код → `User.emailVerified=now()` → автологин через второй Credentials-провайдер `verified-ticket` (одноразовый HMAC-тикет, без пароля). Email-транспорт — обёртка над Resend SDK с двумя отправителями. Newsletter — server action `subscribeToNewsletter` (upsert в `Subscriber` + best-effort синк в Resend Audience + welcome).

**Tech Stack:** Next.js 15.1 (App Router, Server Actions), next-auth v5 (beta), Prisma 6 + Neon (WebSocket-адаптер), `resend`, `react-email` + `@react-email/components`, `@node-rs/argon2` (хэш кода), Zod, react-hook-form, Radix Dialog, vitest, Playwright.

**Спека:** `docs/superpowers/specs/2026-06-09-email-verification-newsletter-design.md`

---

## Важные ограничения окружения

- ⚠️ **`prisma db push` / `prisma generate` к Neon НЕ гонять локально на Windows** — зависает (P1017). Миграция схемы — в CI / на Vercel. Локально после правки `schema.prisma` исполнитель НЕ запускает push; вместо этого `prisma generate` для типов разрешён только если не лезет в БД (генерация клиента сети не требует). Если `generate` всё же виснет — пропустить, типы подтянутся в CI.
- **Тесты — `tests/**/*.test.ts`** (НЕ рядом с исходником). Алиас `@` → корень `stride-app/`. Запуск: `npm test` или `npx vitest run tests/<file>.test.ts`.
- **БД в тестах мокается** (`vi.mock('@/lib/prisma-client', …)`) — реальный Neon не дёргаем. Без БД-интеграционных тестов локально.
- **`lib/auth-credentials.ts` под запретом чтения** в этой сессии — задача 14 описывает правку через контракт; исполнитель прочитает файл сам.
- **Коммиты на английском, без Co-Authored-By, автор ui-ux-promax** ([[commit-pr-conventions]]).
- **Ветка:** перед Task 1 создать `feat/phase2.2c-email-resend` от текущей актуальной (см. Task 0).

---

## File Structure

**Создаются:**
- `lib/email/resend-client.ts` — ленивый Resend-клиент, `isEmailConfigured()`.
- `lib/email/send-email.ts` — обёртка `sendEmail()`, два отправителя, разбор `{data,error}`, логирование.
- `emails/_layout.tsx` — брендовый layout письма (React Email).
- `emails/verification-code.tsx` — письмо с 6-значным кодом.
- `emails/welcome.tsx` — письмо после верификации.
- `emails/newsletter-welcome.tsx` — письмо после подписки.
- `lib/verification/code.ts` — генерация/хэш/сверка кода.
- `lib/verification/pending-cookie.ts` — signed cookie `pending_verification`.
- `lib/verification/ticket.ts` — одноразовый HMAC-тикет для автологина.
- `lib/verification/service.ts` — `issueCode` / `confirmCode` (БД + отправка).
- `app/actions/verification.ts` — server actions `verifyEmailCode` / `resendVerificationCode` / `startVerification`.
- `lib/newsletter/service.ts` — `subscribe` / `unsubscribe` (БД + Resend Audience + welcome).
- `app/actions/newsletter.ts` — server action `subscribeToNewsletter`.
- `app/unsubscribe/page.tsx` — страница отписки по токену.
- `components/shared/auth/verification-gate.tsx` — неубираемая модалка.
- `components/shared/auth/otp-input.tsx` — 6-сегментный ввод кода.
- `components/shared/auth/verification-gate-host.tsx` — server-обёртка (читает cookie+сессию, решает показ).
- `services/dto/newsletter.dto.ts` — Zod-схемы newsletter.
- Тесты: `tests/verification-code.test.ts`, `tests/verification-cookie.test.ts`, `tests/verification-ticket.test.ts`, `tests/verification-service.test.ts`, `tests/send-email.test.ts`, `tests/newsletter-service.test.ts`, `tests/newsletter-dto.test.ts`.

**Модифицируются:**
- `prisma/schema.prisma` — модели `EmailVerificationCode`, `Subscriber`.
- `constants/config.ts` — константы (имена cookie, TTL, лимиты).
- `services/dto/auth.dto.ts` — `verifyCodeSchema`.
- `app/actions/auth.ts` — `registerUser`: не логинить, issueCode + setPending.
- `auth.config.ts` — провайдер `verified-ticket`.
- `lib/auth-credentials.ts` — блок входа при `emailVerified == null` (Task 14).
- `auth.ts` — google `events`: проставить `emailVerified`.
- `app/layout.tsx` — вмонтировать `<VerificationGateHost/>`.
- `components/shared/newsletter-form.tsx` — реальный вызов action.
- `lib/rate-limit.ts` — реальные лимитеры verify/resend/newsletter (поверх существующего паттерна).
- `package.json` — зависимости + скрипт `email:dev`.
- `.env.example` (если есть) / docs — перечень env.

---

## Task 0: Ветка и зависимости

**Files:**
- Modify: `stride-app/package.json`

- [ ] **Step 1: Создать ветку**

```bash
cd "D:\Projects\sneakers-store-v1"
git checkout -b feat/phase2.2c-email-resend
```

- [ ] **Step 2: Установить зависимости**

```bash
cd stride-app
npm install resend react-email @react-email/components
```

Ожидаемо: `resend`, `react-email`, `@react-email/components` в `dependencies`.

- [ ] **Step 3: Добавить скрипт превью писем в package.json**

В `"scripts"` добавить строку (react-email поднимает превью-сервер шаблонов):

```json
"email:dev": "email dev --dir emails --port 3001",
```

- [ ] **Step 4: Коммит**

```bash
git add package.json package-lock.json
git commit -m "chore(stride): add resend + react-email deps and email:dev script"
```

---

## Task 1: Константы конфигурации

**Files:**
- Modify: `stride-app/constants/config.ts`

- [ ] **Step 1: Добавить константы в конец `constants/config.ts`**

```ts
// --- P2.2c Email-верификация + Newsletter ---

// Cookie, помечающая «есть незавершённая верификация» (подписана HMAC по AUTH_SECRET).
export const PENDING_VERIFICATION_COOKIE = 'pending_verification';
export const PENDING_VERIFICATION_MAX_AGE = 60 * 30; // 30 мин — окно «дойти до ввода кода»

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000; // 10 мин жизни самого кода
export const VERIFICATION_MAX_ATTEMPTS = 5;             // неверных попыток на код до инвалидации
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60 сек между ресендами
export const VERIFICATION_TICKET_TTL_MS = 60 * 1000;   // 60 сек жизни тикета автологина

export const NEWSLETTER_SOURCES = ['footer', 'register', 'checkout'] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];
```

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS (нет ошибок).

- [ ] **Step 3: Коммит**

```bash
git add constants/config.ts
git commit -m "feat(stride): config constants for email verification + newsletter"
```

---

## Task 2: Prisma-модели

**Files:**
- Modify: `stride-app/prisma/schema.prisma`

- [ ] **Step 1: Добавить две модели в конец `schema.prisma`**

```prisma
model EmailVerificationCode {
  id         String    @id @default(cuid())
  email      String
  codeHash   String
  expiresAt  DateTime
  attempts   Int       @default(0)
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([email])
  @@index([expiresAt])
}

model Subscriber {
  id              String    @id @default(cuid())
  email           String    @unique
  source          String    @default("footer")
  resendContactId String?
  unsubscribedAt  DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

- [ ] **Step 2: Сгенерировать клиент (best-effort, без БД)**

Run: `cd stride-app && npx prisma generate`
Expected: «Generated Prisma Client». ⚠️ Если виснет/ошибка коннекта — **прервать (Ctrl+C) и пропустить**: генерация подтянется в CI. НЕ запускать `prisma db push` локально.

- [ ] **Step 3: Коммит**

```bash
git add prisma/schema.prisma
git commit -m "feat(stride): EmailVerificationCode + Subscriber models"
```

> **Примечание для деплоя:** `prisma db push` к Neon (preview/prod) выполняется в CI/на Vercel до того, как код этой фазы попадёт в прод — иначе рантайм упадёт на отсутствующих таблицах ([[neon-schema-not-auto-applied]]).

---

## Task 3: Генерация и сверка кода (`lib/verification/code.ts`)

**Files:**
- Create: `stride-app/lib/verification/code.ts`
- Test: `stride-app/tests/verification-code.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/verification-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, verifyCodeHash } from '@/lib/verification/code';

describe('verification code', () => {
  it('generateCode — ровно 6 цифр', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashCode → verifyCodeHash: верный код проходит', async () => {
    const code = '123456';
    const h = await hashCode(code);
    expect(h).not.toBe(code); // не плейн
    expect(await verifyCodeHash(code, h)).toBe(true);
  });

  it('verifyCodeHash: неверный код не проходит', async () => {
    const h = await hashCode('123456');
    expect(await verifyCodeHash('000000', h)).toBe(false);
  });

  it('verifyCodeHash: битый хэш → false, не бросает', async () => {
    expect(await verifyCodeHash('123456', 'not-a-hash')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/verification-code.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация `lib/verification/code.ts`**

```ts
import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/password';

// 6-значный код, криптостойко. randomInt верхняя граница исключается → 0..999999.
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Переиспользуем argon2 из lib/password (тот же профиль OPTS).
export function hashCode(code: string): Promise<string> {
  return hashPassword(code);
}

export function verifyCodeHash(code: string, hashed: string): Promise<boolean> {
  return verifyPassword(code, hashed);
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/verification-code.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Коммит**

```bash
git add lib/verification/code.ts tests/verification-code.test.ts
git commit -m "feat(stride): verification code generate/hash/verify"
```

---

## Task 4: Подписанная cookie `pending_verification` (`lib/verification/pending-cookie.ts`)

**Files:**
- Create: `stride-app/lib/verification/pending-cookie.ts`
- Test: `stride-app/tests/verification-cookie.test.ts`

Cookie несёт `{ email, exp }`, подписанные HMAC-SHA256 по `AUTH_SECRET`. Формат значения: `base64url(JSON).base64url(hmac)`. Чтение проверяет подпись и срок.

- [ ] **Step 1: Написать падающий тест**

`tests/verification-cookie.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { signPending, parsePending } from '@/lib/verification/pending-cookie';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-key';
});

describe('pending-verification cookie payload', () => {
  it('sign → parse возвращает email', () => {
    const token = signPending('user@example.com');
    expect(parsePending(token)).toEqual({ email: 'user@example.com' });
  });

  it('подделанная подпись → null', () => {
    const token = signPending('user@example.com');
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(parsePending(tampered)).toBeNull();
  });

  it('подменённый payload (другой email) → null', () => {
    const token = signPending('user@example.com');
    const [, sig] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ email: 'evil@x.com', exp: Date.now() + 100000 })).toString('base64url');
    expect(parsePending(`${fakePayload}.${sig}`)).toBeNull();
  });

  it('истёкший exp → null', () => {
    const token = signPending('user@example.com', Date.now() - 1000);
    expect(parsePending(token)).toBeNull();
  });

  it('мусор → null, не бросает', () => {
    expect(parsePending('garbage')).toBeNull();
    expect(parsePending('')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/verification-cookie.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация `lib/verification/pending-cookie.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  PENDING_VERIFICATION_COOKIE,
  PENDING_VERIFICATION_MAX_AGE,
} from '@/constants/config';

interface PendingPayload {
  email: string;
  exp: number; // epoch ms
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

// exp по умолчанию — now + MAX_AGE; параметр для тестов.
export function signPending(email: string, exp = Date.now() + PENDING_VERIFICATION_MAX_AGE * 1000): string {
  const payloadB64 = Buffer.from(JSON.stringify({ email, exp } satisfies PendingPayload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Возвращает { email } при валидной подписи и не истёкшем сроке, иначе null. Никогда не бросает на парсинге.
export function parsePending(token: string | undefined | null): { email: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as PendingPayload;
    if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

// --- Cookie I/O (Server Actions / Server Components) ---

export async function setPending(email: string): Promise<void> {
  const store = await cookies();
  store.set(PENDING_VERIFICATION_COOKIE, signPending(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PENDING_VERIFICATION_MAX_AGE,
    path: '/',
  });
}

export async function readPending(): Promise<{ email: string } | null> {
  const store = await cookies();
  return parsePending(store.get(PENDING_VERIFICATION_COOKIE)?.value);
}

export async function clearPending(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_VERIFICATION_COOKIE);
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/verification-cookie.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Коммит**

```bash
git add lib/verification/pending-cookie.ts tests/verification-cookie.test.ts
git commit -m "feat(stride): signed pending_verification cookie"
```

---

## Task 5: Одноразовый тикет автологина (`lib/verification/ticket.ts`)

**Files:**
- Create: `stride-app/lib/verification/ticket.ts`
- Test: `stride-app/tests/verification-ticket.test.ts`

Тикет выдаётся после верного кода и передаётся в `signIn('verified-ticket', { ticket })`. Несёт `{ userId, exp }`, подписан HMAC по `AUTH_SECRET`. TTL 60 сек.

- [ ] **Step 1: Написать падающий тест**

`tests/verification-ticket.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { issueTicket, verifyTicket } from '@/lib/verification/ticket';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-key';
});

describe('verified-login ticket', () => {
  it('issue → verify возвращает userId', () => {
    const t = issueTicket('user-123');
    expect(verifyTicket(t)).toEqual({ userId: 'user-123' });
  });

  it('подделанная подпись → null', () => {
    const t = issueTicket('user-123');
    const tampered = t.slice(0, -2) + (t.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyTicket(tampered)).toBeNull();
  });

  it('истёкший тикет → null', () => {
    const t = issueTicket('user-123', Date.now() - 1000);
    expect(verifyTicket(t)).toBeNull();
  });

  it('мусор → null, не бросает', () => {
    expect(verifyTicket('garbage')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/verification-ticket.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация `lib/verification/ticket.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VERIFICATION_TICKET_TTL_MS } from '@/constants/config';

interface TicketPayload {
  userId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payloadB64: string): string {
  // Префикс домена подписи отделяет тикет от pending-cookie (одинаковый секрет, разные назначения).
  return createHmac('sha256', secret()).update(`ticket:${payloadB64}`).digest('base64url');
}

export function issueTicket(userId: string, exp = Date.now() + VERIFICATION_TICKET_TTL_MS): string {
  const payloadB64 = Buffer.from(JSON.stringify({ userId, exp } satisfies TicketPayload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyTicket(token: string | undefined | null): { userId: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as TicketPayload;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/verification-ticket.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Коммит**

```bash
git add lib/verification/ticket.ts tests/verification-ticket.test.ts
git commit -m "feat(stride): one-time verified-login ticket"
```

---

## Task 6: Resend-клиент (`lib/email/resend-client.ts`)

**Files:**
- Create: `stride-app/lib/email/resend-client.ts`

Нет теста: тонкая обёртка над env (паттерн `lib/rate-limit.ts` `getLoginLimiter`). Покрывается косвенно в Task 7.

- [ ] **Step 1: Реализация `lib/email/resend-client.ts`**

```ts
import { Resend } from 'resend';

// Ленивый синглтон. false = не сконфигурирован (нет ключа) — fail-friendly как rate-limit.
let client: Resend | null | false = null;

export function getResend(): Resend | null {
  if (client !== null) return client || null;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    client = false;
    return null;
  }
  client = new Resend(key);
  return client;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
```

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add lib/email/resend-client.ts
git commit -m "feat(stride): lazy Resend client"
```

---

## Task 7: Обёртка отправки писем (`lib/email/send-email.ts`)

**Files:**
- Create: `stride-app/lib/email/send-email.ts`
- Test: `stride-app/tests/send-email.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/send-email.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  getResend: vi.fn(() => ({ emails: { send: sendMock } })),
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { sendEmail } from '@/lib/email/send-email';
import { getResend, isEmailConfigured } from '@/lib/email/resend-client';
import { createElement } from 'react';

const configured = isEmailConfigured as unknown as ReturnType<typeof vi.fn>;
const resendFactory = getResend as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  resendFactory.mockReturnValue({ emails: { send: sendMock } });
  process.env.EMAIL_FROM_TRANSACTIONAL = 'Stride <no-reply@cloudd3r.eu.cc>';
  process.env.EMAIL_FROM_NEWSLETTER = 'Stride <hello@cloudd3r.eu.cc>';
});

const node = createElement('div', null, 'hi');

describe('sendEmail', () => {
  it('успех → {ok:true,id}, использует транзакционный from по умолчанию', async () => {
    sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r).toEqual({ ok: true, id: 'em_1' });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Stride <no-reply@cloudd3r.eu.cc>', to: 'u@x.com', subject: 'S',
    }));
  });

  it('kind:newsletter → from hello@', async () => {
    sendMock.mockResolvedValue({ data: { id: 'em_2' }, error: null });
    await sendEmail({ to: 'u@x.com', subject: 'S', react: node, kind: 'newsletter' });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'Stride <hello@cloudd3r.eu.cc>' }));
  });

  it('Resend вернул error → {ok:false}, не бросает', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
  });

  it('не сконфигурирован → {ok:false}, send не вызывается', async () => {
    configured.mockReturnValue(false);
    resendFactory.mockReturnValue(null);
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('send бросил исключение → {ok:false}, не пробрасывает', async () => {
    sendMock.mockRejectedValue(new Error('network'));
    const r = await sendEmail({ to: 'u@x.com', subject: 'S', react: node });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/send-email.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация `lib/email/send-email.ts`**

```ts
import type { ReactElement } from 'react';
import { getResend, isEmailConfigured } from '@/lib/email/resend-client';
import { logger } from '@/lib/logger';

export type EmailKind = 'transactional' | 'newsletter';

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
  kind?: EmailKind; // дефолт transactional (no-reply@)
  replyTo?: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

function fromFor(kind: EmailKind): string {
  if (kind === 'newsletter') {
    return process.env.EMAIL_FROM_NEWSLETTER ?? 'Stride <hello@cloudd3r.eu.cc>';
  }
  return process.env.EMAIL_FROM_TRANSACTIONAL ?? 'Stride <no-reply@cloudd3r.eu.cc>';
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const kind = opts.kind ?? 'transactional';
  const resend = getResend();
  if (!isEmailConfigured() || !resend) {
    logger.warn('email_not_configured', { to: opts.to, subject: opts.subject });
    return { ok: false, error: 'email_not_configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: fromFor(kind),
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error || !data) {
      logger.error('email_send_failed', error, { to: opts.to, subject: opts.subject });
      return { ok: false, error: error?.message ?? 'unknown' };
    }
    logger.info('email_sent', { to: opts.to, subject: opts.subject, id: data.id });
    return { ok: true, id: data.id };
  } catch (e) {
    logger.error('email_send_threw', e, { to: opts.to, subject: opts.subject });
    return { ok: false, error: 'exception' };
  }
}
```

> `logger` скрабит `to`/`email` через `scrubPii` — PII в логах маскируется автоматически.

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/send-email.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Коммит**

```bash
git add lib/email/send-email.ts tests/send-email.test.ts
git commit -m "feat(stride): sendEmail wrapper with dual sender + error handling"
```

---

## Task 8: Шаблоны писем (React Email)

**Files:**
- Create: `stride-app/emails/_layout.tsx`
- Create: `stride-app/emails/verification-code.tsx`
- Create: `stride-app/emails/welcome.tsx`
- Create: `stride-app/emails/newsletter-welcome.tsx`

Без юнит-тестов (визуальные шаблоны; проверка через `npm run email:dev`). При реализации UI-вёрстки писем подключить навыки **frontend-design** и **ui-ux-pro-max** для брендового вида (тёмная шапка STRIDE, акцент-цвет, мобайл-safe таблицы). Стек писем — React Email/HTML.

- [ ] **Step 1: Базовый layout `emails/_layout.tsx`**

```tsx
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="ru">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#0a0a0a', margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ paddingBottom: 24 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>STRIDE</Text>
          </Section>
          <Section style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32 }}>
            {children}
          </Section>
          <Section style={{ paddingTop: 24 }}>
            <Text style={{ color: '#888', fontSize: 12, margin: 0 }}>
              © 2026 STRIDE · {SITE.replace(/^https?:\/\//, '')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: `emails/verification-code.tsx`**

```tsx
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

export function VerificationCodeEmail({ code }: { code: string }) {
  return (
    <EmailLayout preview={`Код подтверждения: ${code}`}>
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>Подтвердите почту</Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Введите этот код в открытом окне, чтобы завершить регистрацию:
      </Text>
      <Text style={{ fontSize: 36, fontWeight: 700, letterSpacing: 8, textAlign: 'center', margin: '0 0 24px' }}>
        {code}
      </Text>
      <Text style={{ fontSize: 13, color: '#888', margin: 0 }}>
        Код действует 10 минут. Если вы не регистрировались — просто проигнорируйте это письмо.
      </Text>
    </EmailLayout>
  );
}

export default function Preview() {
  return <VerificationCodeEmail code="123456" />;
}
```

- [ ] **Step 3: `emails/welcome.tsx`**

```tsx
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

export function WelcomeEmail({ name }: { name?: string }) {
  return (
    <EmailLayout preview="Добро пожаловать в STRIDE">
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>
        {name ? `Привет, ${name}!` : 'Привет!'}
      </Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Почта подтверждена — аккаунт готов. Залетай за новыми дропами.
      </Text>
      <Button href={`${SITE}/catalog`} style={{ backgroundColor: '#0a0a0a', color: '#fff', borderRadius: 999, padding: '12px 24px', fontSize: 14 }}>
        Смотреть каталог
      </Button>
    </EmailLayout>
  );
}

export default function Preview() {
  return <WelcomeEmail name="Neo" />;
}
```

- [ ] **Step 4: `emails/newsletter-welcome.tsx`**

```tsx
import { Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

export function NewsletterWelcomeEmail({ unsubscribeUrl }: { unsubscribeUrl: string }) {
  return (
    <EmailLayout preview="Ты подписан на дропы STRIDE">
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>Ты в списке 🎉</Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Будем присылать новые модели и дропы первыми. Без спама.
      </Text>
      <Text style={{ fontSize: 12, color: '#888', margin: 0 }}>
        Передумал? <Link href={unsubscribeUrl} style={{ color: '#888' }}>Отписаться</Link>.
      </Text>
    </EmailLayout>
  );
}

export default function Preview() {
  return <NewsletterWelcomeEmail unsubscribeUrl="https://cloudd3r.eu.cc/unsubscribe?token=demo" />;
}
```

- [ ] **Step 5: Превью (визуальная проверка, опционально)**

Run: `cd stride-app && npm run email:dev`
Expected: превью-сервер на http://localhost:3001 показывает 3 шаблона. Ctrl+C для остановки.

- [ ] **Step 6: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add emails/
git commit -m "feat(stride): React Email templates (verification, welcome, newsletter)"
```

---

## Task 9: Сервис верификации (`lib/verification/service.ts`)

**Files:**
- Create: `stride-app/lib/verification/service.ts`
- Test: `stride-app/tests/verification-service.test.ts`

`issueCode(email)` — чистит старые коды email, генерит код, пишет `EmailVerificationCode`, шлёт письмо. `confirmCode(email, code)` — берёт последний активный, проверяет срок/попытки/одноразовость, инкрементит attempts при ошибке, помечает consumed при успехе.

- [ ] **Step 1: Написать падающий тест**

`tests/verification-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    emailVerificationCode: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'em' })) }));
vi.mock('@/lib/verification/code', () => ({
  generateCode: vi.fn(() => '123456'),
  hashCode: vi.fn(async () => 'HASH'),
  verifyCodeHash: vi.fn(async (code: string) => code === '123456'),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { issueCode, confirmCode } from '@/lib/verification/service';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';
import { verifyCodeHash } from '@/lib/verification/code';

const deleteMany = prisma.emailVerificationCode.deleteMany as unknown as ReturnType<typeof vi.fn>;
const create = prisma.emailVerificationCode.create as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.emailVerificationCode.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.emailVerificationCode.update as unknown as ReturnType<typeof vi.fn>;
const send = sendEmail as unknown as ReturnType<typeof vi.fn>;
const verifyHash = verifyCodeHash as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  deleteMany.mockResolvedValue({ count: 0 });
  create.mockResolvedValue({ id: 'c1' });
  update.mockResolvedValue({ id: 'c1' });
  send.mockResolvedValue({ ok: true, id: 'em' });
  verifyHash.mockImplementation(async (code: string) => code === '123456');
});

describe('issueCode', () => {
  it('чистит старые коды, создаёт новый, шлёт письмо', async () => {
    await issueCode('u@x.com');
    expect(deleteMany).toHaveBeenCalledWith({ where: { email: 'u@x.com' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'u@x.com', codeHash: 'HASH' }),
    }));
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('confirmCode', () => {
  const active = { id: 'c1', email: 'u@x.com', codeHash: 'HASH', attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 60000) };

  it('нет активного кода → expired', async () => {
    findFirst.mockResolvedValue(null);
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'expired' });
  });

  it('истёкший код → expired', async () => {
    findFirst.mockResolvedValue({ ...active, expiresAt: new Date(Date.now() - 1000) });
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'expired' });
  });

  it('attempts >= лимит → locked, помечает consumed', async () => {
    findFirst.mockResolvedValue({ ...active, attempts: 5 });
    expect(await confirmCode('u@x.com', '123456')).toEqual({ status: 'locked' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }));
  });

  it('неверный код → wrong, инкремент attempts', async () => {
    findFirst.mockResolvedValue(active);
    const r = await confirmCode('u@x.com', '000000');
    expect(r).toEqual({ status: 'wrong' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
  });

  it('верный код → ok, помечает consumed', async () => {
    findFirst.mockResolvedValue(active);
    update.mockResolvedValue({ id: 'c1', consumedAt: new Date() });
    const r = await confirmCode('u@x.com', '123456');
    expect(r).toEqual({ status: 'ok' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1', consumedAt: null },
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/verification-service.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация `lib/verification/service.ts`**

```ts
import { createElement } from 'react';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import { generateCode, hashCode, verifyCodeHash } from '@/lib/verification/code';
import { VERIFICATION_CODE_TTL_MS, VERIFICATION_MAX_ATTEMPTS } from '@/constants/config';
import { logger } from '@/lib/logger';

export type ConfirmStatus = 'ok' | 'wrong' | 'expired' | 'locked';

// Генерит и шлёт новый код. Старые коды этого email удаляются (один активный на email).
export async function issueCode(email: string): Promise<void> {
  await prisma.emailVerificationCode.deleteMany({ where: { email } });
  const code = generateCode();
  const codeHash = await hashCode(code);
  await prisma.emailVerificationCode.create({
    data: { email, codeHash, expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS) },
  });

  // В dev без Resend печатаем код в лог, чтобы пройти флоу локально/в CI без реальной почты.
  if (process.env.NODE_ENV !== 'production' && !process.env.RESEND_API_KEY) {
    logger.info('verification_code_dev', { email, code });
  }

  await sendEmail({
    to: email,
    subject: 'Код подтверждения STRIDE',
    react: createElement(VerificationCodeEmail, { code }),
  });
}

export async function confirmCode(email: string, code: string): Promise<{ status: ConfirmStatus }> {
  const row = await prisma.emailVerificationCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) return { status: 'expired' };

  if (row.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return { status: 'locked' };
  }

  const valid = await verifyCodeHash(code, row.codeHash);
  if (!valid) {
    await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { status: 'wrong' };
  }

  // Одноразовость: условие consumedAt:null в where закрывает гонку двойного сабмита.
  await prisma.emailVerificationCode.update({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return { status: 'ok' };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/verification-service.test.ts`
Expected: PASS (7 тестов).

- [ ] **Step 5: Коммит**

```bash
git add lib/verification/service.ts tests/verification-service.test.ts
git commit -m "feat(stride): verification service issueCode/confirmCode"
```

---

## Task 10: DTO для verify-кода

**Files:**
- Modify: `stride-app/services/dto/auth.dto.ts`
- Test: `stride-app/tests/auth-dto.test.ts` (дополнить существующий)

- [ ] **Step 1: Добавить схему в `services/dto/auth.dto.ts`**

В конец файла:

```ts
// 6-значный код верификации почты (только цифры).
export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Код состоит из 6 цифр'),
});
export type VerifyCodeValues = z.infer<typeof verifyCodeSchema>;
```

- [ ] **Step 2: Дополнить тест `tests/auth-dto.test.ts`**

Добавить в файл блок (рядом с существующими describe):

```ts
import { verifyCodeSchema } from '@/services/dto/auth.dto';

describe('verifyCodeSchema', () => {
  it('6 цифр — ок', () => {
    expect(verifyCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });
  it('меньше 6 / буквы — ошибка', () => {
    expect(verifyCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});
```

> Если в `tests/auth-dto.test.ts` уже есть `import { describe, it, expect }` и импорт из `auth.dto` — не дублировать импорт `describe/it/expect`, только добавить `verifyCodeSchema` в существующий import или отдельной строкой.

- [ ] **Step 3: Запустить**

Run: `cd stride-app && npx vitest run tests/auth-dto.test.ts`
Expected: PASS (старые + 2 новых).

- [ ] **Step 4: Коммит**

```bash
git add services/dto/auth.dto.ts tests/auth-dto.test.ts
git commit -m "feat(stride): verifyCodeSchema DTO"
```

---

## Task 11: Реальные rate-лимитеры (verify / resend / newsletter)

**Files:**
- Modify: `stride-app/lib/rate-limit.ts`

Повторяем паттерн `getLoginLimiter` (ленивый, fail-open без Upstash). Три новых лимитера. Юнит-тест не пишем (fail-open NOOP без env, как существующие `checkAuthRateLimit`); поведение проверяется в actions.

- [ ] **Step 1: Добавить в конец `lib/rate-limit.ts`**

```ts
// ---------------------------------------------------------------------------
// P2.2c limiters: verify-code (per email+IP), resend-code (per email), newsletter (per IP).
// Same lazy + fail-open pattern as login limiter.
// ---------------------------------------------------------------------------
type Limiter = { limit(key: string): Promise<{ success: boolean; remaining: number; reset: number }> } | null | false;

async function makeLimiter(slot: { v: Limiter }, points: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string): Promise<Limiter> {
  if (slot.v !== null) return slot.v;
  if (!isRateLimitConfigured()) { slot.v = false; return slot.v; }
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL')!;
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')!;
  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');
  slot.v = new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(points, window), prefix });
  return slot.v;
}

const verifySlot = { v: null as Limiter };
const resendSlot = { v: null as Limiter };
const newsletterSlot = { v: null as Limiter };

export async function checkVerifyRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(verifySlot, 10, '10 m', 'stride-app:verify');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export async function checkResendRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(resendSlot, 5, '1 h', 'stride-app:resend');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export async function checkNewsletterRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(newsletterSlot, 5, '10 m', 'stride-app:newsletter');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
```

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add lib/rate-limit.ts
git commit -m "feat(stride): rate limiters for verify/resend/newsletter"
```

---

## Task 12: Server actions верификации (`app/actions/verification.ts`)

**Files:**
- Create: `stride-app/app/actions/verification.ts`
- Test: `stride-app/tests/verification-actions.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/verification-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/verification/service', () => ({ confirmCode: vi.fn(), issueCode: vi.fn() }));
vi.mock('@/lib/verification/pending-cookie', () => ({
  readPending: vi.fn(), setPending: vi.fn(), clearPending: vi.fn(),
}));
vi.mock('@/lib/verification/ticket', () => ({ issueTicket: vi.fn(() => 'TICKET') }));
vi.mock('@/lib/prisma-client', () => ({ prisma: { user: { update: vi.fn(), findUnique: vi.fn() } } }));
vi.mock('@/auth', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkVerifyRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  checkResendRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { verifyEmailCode, resendVerificationCode } from '@/app/actions/verification';
import { confirmCode, issueCode } from '@/lib/verification/service';
import { readPending, clearPending } from '@/lib/verification/pending-cookie';
import { prisma } from '@/lib/prisma-client';
import { signIn } from '@/auth';

const confirm = confirmCode as unknown as ReturnType<typeof vi.fn>;
const issue = issueCode as unknown as ReturnType<typeof vi.fn>;
const pending = readPending as unknown as ReturnType<typeof vi.fn>;
const clear = clearPending as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  pending.mockResolvedValue({ email: 'u@x.com' });
  userFind.mockResolvedValue({ id: 'u1', email: 'u@x.com' });
  userUpdate.mockResolvedValue({ id: 'u1' });
});

describe('verifyEmailCode', () => {
  it('нет pending cookie → ошибка expired/no-session', async () => {
    pending.mockResolvedValue(null);
    const r = await verifyEmailCode({ code: '123456' });
    expect(r.ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('невалидный код (DTO) → ошибка, confirmCode не зовётся', async () => {
    const r = await verifyEmailCode({ code: 'abc' });
    expect(r.ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirmCode wrong → {ok:false, reason:wrong}', async () => {
    confirm.mockResolvedValue({ status: 'wrong' });
    const r = await verifyEmailCode({ code: '000000' });
    expect(r).toMatchObject({ ok: false, reason: 'wrong' });
  });

  it('ok → emailVerified выставлен, cookie очищена, signIn verified-ticket', async () => {
    confirm.mockResolvedValue({ status: 'ok' });
    const r = await verifyEmailCode({ code: '123456' });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'u@x.com' }, data: expect.objectContaining({ emailVerified: expect.any(Date) }),
    }));
    expect(clear).toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledWith('verified-ticket', expect.objectContaining({ ticket: 'TICKET', redirect: false }));
    expect(r.ok).toBe(true);
  });
});

describe('resendVerificationCode', () => {
  it('нет pending → ошибка', async () => {
    pending.mockResolvedValue(null);
    const r = await resendVerificationCode();
    expect(r.ok).toBe(false);
    expect(issue).not.toHaveBeenCalled();
  });
  it('есть pending → issueCode по email из cookie', async () => {
    const r = await resendVerificationCode();
    expect(issue).toHaveBeenCalledWith('u@x.com');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/verification-actions.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация `app/actions/verification.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { signIn } from '@/auth';
import { confirmCode, issueCode } from '@/lib/verification/service';
import { readPending, clearPending } from '@/lib/verification/pending-cookie';
import { issueTicket } from '@/lib/verification/ticket';
import { verifyCodeSchema } from '@/services/dto/auth.dto';
import { checkVerifyRateLimit, checkResendRateLimit, extractClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'expired' | 'locked' | 'no-session' | 'invalid' | 'rate' };

export async function verifyEmailCode(raw: unknown): Promise<VerifyResult> {
  const parsed = verifyCodeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const pending = await readPending();
  if (!pending) return { ok: false, reason: 'no-session' };

  const ip = extractClientIp({ headers: await headers() });
  if (!(await checkVerifyRateLimit(`${ip}:${pending.email}`)).success) {
    return { ok: false, reason: 'rate' };
  }

  const { status } = await confirmCode(pending.email, parsed.data.code);
  if (status !== 'ok') return { ok: false, reason: status };

  const user = await prisma.user.findUnique({ where: { email: pending.email }, select: { id: true } });
  if (!user) return { ok: false, reason: 'no-session' };

  await prisma.user.update({ where: { email: pending.email }, data: { emailVerified: new Date() } });
  await clearPending();

  // Автологин без пароля: одноразовый тикет → провайдер verified-ticket (Task 13).
  try {
    await signIn('verified-ticket', { ticket: issueTicket(user.id), redirect: false });
  } catch (err) {
    logger.error('verified_ticket_signin_failed', err);
    // Верификация всё равно прошла; пользователь сможет войти по паролю.
  }
  return { ok: true };
}

export async function resendVerificationCode(): Promise<{ ok: boolean; error?: string }> {
  const pending = await readPending();
  if (!pending) return { ok: false, error: 'no-session' };

  if (!(await checkResendRateLimit(pending.email)).success) {
    return { ok: false, error: 'rate' };
  }
  await issueCode(pending.email);
  return { ok: true };
}

// Вызывается login-формой, когда вход отклонён из-за неверифицированной почты:
// заводит pending-cookie и шлёт новый код, чтобы поднять тот же гейт.
export async function startVerification(email: string): Promise<{ ok: boolean }> {
  const { setPending } = await import('@/lib/verification/pending-cookie');
  await setPending(email);
  await issueCode(email);
  return { ok: true };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/verification-actions.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 5: Коммит**

```bash
git add app/actions/verification.ts tests/verification-actions.test.ts
git commit -m "feat(stride): verification server actions (verify/resend/start)"
```

---

## Task 13: Провайдер автологина `verified-ticket` (`auth.config.ts`)

**Files:**
- Modify: `stride-app/auth.config.ts`

Добавляем второй Credentials-провайдер с явным `id: 'verified-ticket'`. Его `authorize` валидирует одноразовый тикет и возвращает пользователя (без пароля). Существующий `credentials`-провайдер не трогаем (кроме Task 14, который в `lib/auth-credentials.ts`).

- [ ] **Step 1: Добавить импорт и провайдер в `auth.config.ts`**

В массив `providers`, после существующего `Credentials({...})`, добавить новый блок:

```ts
    // Автологин ПОСЛЕ верификации кода — без пароля. confirmCode выдал одноразовый
    // подписанный тикет (lib/verification/ticket), здесь он валидируется. Пускаем
    // только пользователя с уже выставленным emailVerified (двойная страховка).
    Credentials({
      id: 'verified-ticket',
      credentials: { ticket: {} },
      authorize: async (creds) => {
        const { verifyTicket } = await import('@/lib/verification/ticket');
        const parsed = verifyTicket(String(creds?.ticket ?? ''));
        if (!parsed) return null;
        const { prisma } = await import('@/lib/prisma-client');
        const user = await prisma.user.findUnique({
          where: { id: parsed.userId },
          select: { id: true, email: true, role: true, emailVerified: true, name: true },
        });
        if (!user || !user.emailVerified) return null;
        return { id: user.id, email: user.email, role: user.role, name: user.name };
      },
    }),
```

> `Credentials` уже импортирован в `auth.config.ts`. Существующий первый провайдер сохраняет дефолтный id `credentials`.

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add auth.config.ts
git commit -m "feat(stride): verified-ticket credentials provider for post-verify auto-login"
```

---

## Task 14: Блок входа для неверифицированной почты (`lib/auth-credentials.ts`)

**Files:**
- Modify: `stride-app/lib/auth-credentials.ts` ⚠️ (файл под запретом чтения в сессии планирования — исполнитель читает сам)

**Контракт (из `auth.config.ts`):** `authorizeCredentials(creds)` принимает `{ email, password }`, возвращает объект пользователя или `null`. Сейчас он проверяет пароль через argon2 (constant-time dummy-hash для несуществующих email).

**Цель:** после успешной проверки пароля, если `user.emailVerified == null`, вернуть `null` (вход запрещён). Login-форма по этому отказу поднимает гейт (Task 16).

- [ ] **Step 1: Прочитать файл**

Run: `cat lib/auth-credentials.ts` (или открыть в редакторе) — понять, где формируется успешный возврат пользователя и доступно ли поле `emailVerified` в выборке.

- [ ] **Step 2: Внести правку**

Логика: в месте, где пароль уже проверен и пользователь валиден, ПЕРЕД `return user` добавить:
- убедиться, что в `prisma.user.findUnique(... select)` присутствует `emailVerified: true` (если нет — добавить в select);
- добавить guard:

```ts
// Жёсткий gate (P2.2c): неверифицированная почта не пускается. Логин-форма ловит null
// и поднимает модалку верификации (startVerification). Google-вход проставляет
// emailVerified автоматически (auth.ts events), поэтому OAuth этим guard не задет.
if (!user.emailVerified) return null;
```

> Размести guard ПОСЛЕ проверки пароля (чтобы не раскрывать «существует ли email» по разнице поведения — отказ выглядит как обычный неуспех входа). Не трогать dummy-hash и rate-limit ветки.

- [ ] **Step 3: Существующий тест auth-credentials**

Run: `cd stride-app && npx vitest run tests/auth-credentials.test.ts`
Expected: возможны падения, если фикстуры пользователя не содержат `emailVerified`. Если падает — обновить фикстуры в тесте: добавить `emailVerified: new Date()` к «успешным» пользователям и отдельный кейс «emailVerified: null → null». Привести тест в зелёное.

- [ ] **Step 4: Добавить тест-кейс неверифицированного входа**

В `tests/auth-credentials.test.ts` добавить:

```ts
it('неверифицированная почта → null даже при верном пароле', async () => {
  // настроить мок: пользователь с верным паролем, но emailVerified: null
  // (повторить паттерн существующих успешных кейсов, заменив emailVerified на null)
  // ожидание: authorizeCredentials(...) → null
});
```

> Реализовать тело по образцу соседних кейсов в этом же файле (точные имена моков видны при чтении файла на Step 1).

- [ ] **Step 5: Запустить — зелёное**

Run: `cd stride-app && npx vitest run tests/auth-credentials.test.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add lib/auth-credentials.ts tests/auth-credentials.test.ts
git commit -m "feat(stride): block login for unverified email (hard gate)"
```

---

## Task 15: registerUser — не логинить, выдать код, поставить cookie

**Files:**
- Modify: `stride-app/app/actions/auth.ts`
- Test: `stride-app/tests/register-user.test.ts` (обновить)

- [ ] **Step 1: Обновить тест `tests/register-user.test.ts`**

Заменить моки/ожидания: вместо `signIn('credentials', …)` теперь регистрация вызывает `issueCode` + `setPending` и НЕ логинит. Заменить верхние моки и кейсы:

```ts
// Добавить к существующим vi.mock:
vi.mock('@/lib/verification/service', () => ({ issueCode: vi.fn(async () => {}) }));
vi.mock('@/lib/verification/pending-cookie', () => ({ setPending: vi.fn(async () => {}) }));
```

И импорты:

```ts
import { issueCode } from '@/lib/verification/service';
import { setPending } from '@/lib/verification/pending-cookie';
const issue = issueCode as unknown as ReturnType<typeof vi.fn>;
const setPend = setPending as unknown as ReturnType<typeof vi.fn>;
```

Заменить кейс успешной регистрации:

```ts
it('успешная регистрация — создаёт юзера, шлёт код, ставит pending cookie, НЕ логинит', async () => {
  const r = await registerUser(valid);
  expect(r).toEqual({ ok: true, needsVerification: true });
  expect(create).toHaveBeenCalledWith({ data: { email: 'new@example.com', passwordHash: '$argon2id$hash', name: 'Neo' } });
  expect(issue).toHaveBeenCalledWith('new@example.com');
  expect(setPend).toHaveBeenCalledWith('new@example.com');
  expect(signInMock).not.toHaveBeenCalled();
});
```

Удалить/заменить старый кейс «сбой автологина не отменяет регистрацию» на:

```ts
it('сбой отправки кода не отменяет регистрацию — {ok:true, needsVerification} best-effort', async () => {
  issue.mockRejectedValue(new Error('resend down'));
  const r = await registerUser(valid);
  expect(r).toMatchObject({ ok: true, needsVerification: true });
});
```

> Кейсы «невалидные данные», «email существует», «rate-limit», «P2002» остаются как есть.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/register-user.test.ts`
Expected: FAIL (старая реализация ещё логинит).

- [ ] **Step 3: Обновить `app/actions/auth.ts`**

Заменить тип результата и финальный блок. Новый `RegisterResult`:

```ts
export type RegisterResult = { ok: true; needsVerification: true } | { ok: false; error: string };
```

Заменить хвост функции (после успешного `prisma.user.create`) — убрать `signIn`, добавить выдачу кода и cookie:

```ts
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Такой email уже зарегистрирован' };
    }
    const code = (e as { code?: unknown })?.code;
    logger.error('register_failed', e, { code: typeof code === 'string' ? code : undefined });
    return { ok: false, error: 'Не удалось завершить регистрацию. Попробуйте позже' };
  }

  // P2.2c: НЕ логиним. Ставим pending-cookie и шлём код — гейт (RootLayout) поднимет модалку.
  // Отправка best-effort: её сбой не отменяет регистрацию (юзер нажмёт «отправить снова»).
  const { issueCode } = await import('@/lib/verification/service');
  const { setPending } = await import('@/lib/verification/pending-cookie');
  await setPending(email);
  try {
    await issueCode(email);
  } catch (err) {
    logger.error('issue_code_after_register_failed', err);
  }
  return { ok: true, needsVerification: true };
```

Удалить старый импорт `signIn` из `@/auth`, если он больше не используется в файле, и старый блок автологина.

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/register-user.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add app/actions/auth.ts tests/register-user.test.ts
git commit -m "feat(stride): registerUser issues code + sets pending cookie, no auto-login"
```

---

## Task 16: register-form / login-form — реакция на верификацию

**Files:**
- Modify: `stride-app/components/shared/auth/register-form.tsx`
- Modify: `stride-app/components/shared/auth/login-form.tsx`

- [ ] **Step 1: register-form — после успеха не редиректить на `/`, а обновить (гейт сам покажется)**

В `onSubmit` заменить блок после успешного `registerUser`:

```ts
    const res = await registerUser({ name: v.name, email: v.email, password: v.password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // P2.2c: pending-cookie уже стоит; refresh → RootLayout отрендерит модалку верификации.
    router.refresh();
```

(Убрать `router.push('/')` — пользователь остаётся на странице, поверх появляется неубираемый гейт.)

- [ ] **Step 2: login-form — поднять гейт при отказе из-за неверификации**

В обработчике входа: текущий код вызывает `signIn('credentials', …)`. При неуспехе нужно различить «неверный пароль» и «не верифицирован». Поскольку `authorizeCredentials` возвращает `null` в обоих случаях (Task 14), используем явный путь: перед/после неуспеха вызвать `startVerification` ТОЛЬКО если почта реально существует и не верифицирована — но это требует серверной проверки.

Простейший безопасный путь без enumeration: добавить server action `checkVerificationNeeded(email)`:

```ts
// в app/actions/verification.ts добавить:
export async function ensureVerificationGate(email: string): Promise<{ gated: boolean }> {
  const { normalizeEmail } = await import('@/lib/auth-identity');
  const norm = normalizeEmail(email);
  if (!norm) return { gated: false };
  const { prisma } = await import('@/lib/prisma-client');
  const user = await prisma.user.findUnique({ where: { email: norm }, select: { emailVerified: true } });
  if (user && !user.emailVerified) {
    await setPending(norm);
    await issueCode(norm);
    return { gated: true };
  }
  return { gated: false };
}
```

(Импорт `setPending` уже есть в файле через `startVerification`; вынести его в верхний статический импорт `import { readPending, clearPending, setPending } from '@/lib/verification/pending-cookie';`.)

В login-form `onSubmit`, при неуспешном входе:

```ts
    const res = await signIn('credentials', { email: v.email, password: v.password, redirect: false });
    if (res?.error) {
      // Возможно, почта не верифицирована — поднимем гейт (без раскрытия существования email).
      const gate = await ensureVerificationGate(v.email);
      if (gate.gated) { router.refresh(); return; }
      setError('Неверный email или пароль');
      return;
    }
    router.push('/');
    router.refresh();
```

> Точные импорты/структуру взять из текущего `login-form.tsx` при чтении (компонент уже использует `useRouter`, `signIn` из `next-auth/react` или server action — адаптировать под существующий способ входа).

- [ ] **Step 3: Добавить `ensureVerificationGate` в action-тест**

В `tests/verification-actions.test.ts` добавить:

```ts
import { ensureVerificationGate } from '@/app/actions/verification';

describe('ensureVerificationGate', () => {
  it('неверифицированный существующий юзер → gated:true, ставит cookie + код', async () => {
    userFind.mockResolvedValue({ emailVerified: null });
    const r = await ensureVerificationGate('u@x.com');
    expect(r.gated).toBe(true);
    expect(issue).toHaveBeenCalled();
  });
  it('верифицированный → gated:false', async () => {
    userFind.mockResolvedValue({ emailVerified: new Date() });
    const r = await ensureVerificationGate('u@x.com');
    expect(r.gated).toBe(false);
  });
  it('нет такого юзера → gated:false', async () => {
    userFind.mockResolvedValue(null);
    expect((await ensureVerificationGate('u@x.com')).gated).toBe(false);
  });
});
```

> В моках `tests/verification-actions.test.ts` добавить `setPending` в мок `pending-cookie` (он уже замокан) и `findUnique` в мок prisma user (уже есть).

- [ ] **Step 4: Запустить**

Run: `cd stride-app && npx vitest run tests/verification-actions.test.ts`
Expected: PASS (старые + 3 новых).

- [ ] **Step 5: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add components/shared/auth/register-form.tsx components/shared/auth/login-form.tsx app/actions/verification.ts tests/verification-actions.test.ts
git commit -m "feat(stride): forms raise verification gate on register / unverified login"
```

---

## Task 17: OTP-инпут (`components/shared/auth/otp-input.tsx`)

**Files:**
- Create: `stride-app/components/shared/auth/otp-input.tsx`

UI-компонент. При вёрстке подключить **frontend-design** + **ui-ux-pro-max** (segmented OTP, тёмная тема, focus-states) и **react-best-practices** (минимум ре-рендеров, контролируемый стейт одной строкой). Без юнит-теста (поведение покрывается e2e в Task 21).

- [ ] **Step 1: Реализация `components/shared/auth/otp-input.tsx`**

```tsx
'use client';

import { useRef, useState, useEffect } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

// 6 раздельных ячеек. Хранит одну строку value (источник истины — родитель).
export function OtpInput({ length = 6, value, onChange, disabled, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState(0);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setChar = (i: number, char: string) => {
    const digit = char.replace(/\D/g, '').slice(-1);
    const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, length);
    onChange(next);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (digits) {
      onChange(digits);
      refs.current[Math.min(digits.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={onPaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ''}
          onChange={(e) => setChar(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={() => setFocused(i)}
          aria-label={`Цифра ${i + 1}`}
          className="w-12 h-14 text-center text-2xl font-semibold rounded-xl border border-black/15 focus:border-primary outline-none disabled:opacity-50"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add components/shared/auth/otp-input.tsx
git commit -m "feat(stride): segmented OTP input"
```

---

## Task 18: Модалка-гейт + host (`verification-gate.tsx`, `verification-gate-host.tsx`)

**Files:**
- Create: `stride-app/components/shared/auth/verification-gate.tsx`
- Create: `stride-app/components/shared/auth/verification-gate-host.tsx`
- Modify: `stride-app/app/layout.tsx`

При вёрстке модалки подключить **frontend-design** + **ui-ux-pro-max** (неубираемый диалог, тёмная тема STRIDE), **react-best-practices**.

- [ ] **Step 1: Клиентская модалка `verification-gate.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { OtpInput } from './otp-input';
import { verifyEmailCode, resendVerificationCode } from '@/app/actions/verification';
import { VERIFICATION_RESEND_COOLDOWN_MS } from '@/constants/config';

const MESSAGES: Record<string, string> = {
  wrong: 'Неверный код. Проверьте и попробуйте снова.',
  expired: 'Код истёк. Запросите новый.',
  locked: 'Слишком много попыток. Запросите новый код.',
  rate: 'Слишком часто. Подождите немного.',
  invalid: 'Код состоит из 6 цифр.',
  'no-session': 'Сессия истекла. Зарегистрируйтесь заново.',
};

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email[0]}***@${email.slice(at + 1)}`;
}

export function VerificationGate({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (value: string) => {
    setSubmitting(true);
    setError(null);
    const res = await verifyEmailCode({ code: value });
    setSubmitting(false);
    if (res.ok) { router.refresh(); return; }
    setError(MESSAGES[res.reason] ?? 'Не удалось подтвердить.');
    setCode('');
  };

  // Авто-сабмит при заполнении всех 6 цифр.
  useEffect(() => {
    if (code.length === 6 && !submitting) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError(null);
    const res = await resendVerificationCode();
    if (!res.ok) { setError(MESSAGES[res.error ?? ''] ?? 'Не удалось отправить код.'); return; }
    setCooldown(Math.round(VERIFICATION_RESEND_COOLDOWN_MS / 1000));
  };

  const block = (e: Event) => e.preventDefault();

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] rounded-2xl bg-white p-6 sm:p-8 shadow-xl"
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          aria-describedby="verify-desc"
        >
          <Dialog.Title className="text-lg font-display font-bold">Подтвердите почту</Dialog.Title>
          <p id="verify-desc" className="text-sm text-black/60 mt-1 mb-5">
            Код отправлен на {maskEmail(email)}. Введите 6 цифр из письма.
          </p>
          <OtpInput value={code} onChange={setCode} disabled={submitting} autoFocus />
          {error && <p className="text-danger text-sm mt-3 text-center" role="alert">{error}</p>}
          <Button
            type="button" variant="primary" size="lg" className="w-full mt-5"
            loading={submitting} disabled={code.length !== 6}
            onClick={() => submit(code)}
          >
            Подтвердить
          </Button>
          <button
            type="button" onClick={resend} disabled={cooldown > 0}
            className="w-full text-center text-sm text-black/60 mt-3 disabled:opacity-50 hover:text-black"
          >
            {cooldown > 0 ? `Отправить снова через ${cooldown}с` : 'Отправить код снова'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Server-host `verification-gate-host.tsx`**

```tsx
import { auth } from '@/auth';
import { readPending } from '@/lib/verification/pending-cookie';
import { VerificationGate } from './verification-gate';

// Показываем неубираемый гейт, только если есть pending-cookie И нет активной сессии.
// Серверный компонент — читает cookie и сессию на сервере, переживает reload.
export async function VerificationGateHost() {
  const [session, pending] = await Promise.all([auth(), readPending()]);
  if (session?.user || !pending) return null;
  return <VerificationGate email={pending.email} />;
}
```

- [ ] **Step 3: Вмонтировать в `app/layout.tsx`**

Добавить импорт и рендер внутри `<body>` (после `<SiteFooter/>`):

```tsx
import { VerificationGateHost } from '@/components/shared/auth/verification-gate-host';
```

```tsx
        <main>{children}</main>
        <SiteFooter />
        <VerificationGateHost />
```

- [ ] **Step 4: Проверка типов + сборка**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add components/shared/auth/verification-gate.tsx components/shared/auth/verification-gate-host.tsx app/layout.tsx
git commit -m "feat(stride): non-dismissible verification gate mounted in root layout"
```

---

## Task 19: Newsletter DTO + сервис

**Files:**
- Create: `stride-app/services/dto/newsletter.dto.ts`
- Create: `stride-app/lib/newsletter/service.ts`
- Test: `stride-app/tests/newsletter-dto.test.ts`
- Test: `stride-app/tests/newsletter-service.test.ts`

- [ ] **Step 1: Тест DTO `tests/newsletter-dto.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newsletterSchema } from '@/services/dto/newsletter.dto';

describe('newsletterSchema', () => {
  it('валидный email — ок', () => {
    expect(newsletterSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('невалидный email — ошибка', () => {
    expect(newsletterSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
  it('source опционален, по умолчанию footer применяется в сервисе', () => {
    const r = newsletterSchema.safeParse({ email: 'a@b.com', source: 'footer' });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Реализация `services/dto/newsletter.dto.ts`**

```ts
import { z } from 'zod';
import { NEWSLETTER_SOURCES } from '@/constants/config';

export const newsletterSchema = z.object({
  email: z.string().email('Некорректный email'),
  source: z.enum(NEWSLETTER_SOURCES).optional(),
});
export type NewsletterValues = z.infer<typeof newsletterSchema>;
```

- [ ] **Step 3: Тест сервиса `tests/newsletter-service.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: { subscriber: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'em' })) }));
const contactsCreate = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  getResend: vi.fn(() => ({ contacts: { create: contactsCreate } })),
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { subscribe } from '@/lib/newsletter/service';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';

const find = prisma.subscriber.findUnique as unknown as ReturnType<typeof vi.fn>;
const create = prisma.subscriber.create as unknown as ReturnType<typeof vi.fn>;
const update = prisma.subscriber.update as unknown as ReturnType<typeof vi.fn>;
const send = sendEmail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_AUDIENCE_ID = 'aud_1';
  find.mockResolvedValue(null);
  create.mockResolvedValue({ id: 's1', email: 'a@b.com' });
  update.mockResolvedValue({ id: 's1', email: 'a@b.com' });
  contactsCreate.mockResolvedValue({ data: { id: 'ct_1' }, error: null });
  send.mockResolvedValue({ ok: true, id: 'em' });
});

describe('subscribe', () => {
  it('новый email → создаёт Subscriber, синкает в Resend, шлёт welcome', async () => {
    const r = await subscribe('a@b.com', 'footer');
    expect(r).toMatchObject({ ok: true, alreadySubscribed: false });
    expect(create).toHaveBeenCalled();
    expect(contactsCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com', audienceId: 'aud_1' }));
    expect(send).toHaveBeenCalledOnce();
  });

  it('уже подписан и активен → alreadySubscribed:true, welcome не шлём повторно', async () => {
    find.mockResolvedValue({ id: 's1', email: 'a@b.com', unsubscribedAt: null });
    const r = await subscribe('a@b.com', 'footer');
    expect(r).toMatchObject({ ok: true, alreadySubscribed: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('был отписан → реактивация (update unsubscribedAt=null)', async () => {
    find.mockResolvedValue({ id: 's1', email: 'a@b.com', unsubscribedAt: new Date() });
    const r = await subscribe('a@b.com', 'footer');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unsubscribedAt: null }) }));
    expect(r.ok).toBe(true);
  });

  it('сбой синка в Resend не роняет подписку', async () => {
    contactsCreate.mockRejectedValue(new Error('resend down'));
    const r = await subscribe('a@b.com', 'footer');
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `cd stride-app && npx vitest run tests/newsletter-service.test.ts tests/newsletter-dto.test.ts`
Expected: FAIL (модули не найдены).

- [ ] **Step 5: Реализация `lib/newsletter/service.ts`**

```ts
import { createElement } from 'react';
import { prisma } from '@/lib/prisma-client';
import { getResend } from '@/lib/email/resend-client';
import { sendEmail } from '@/lib/email/send-email';
import { NewsletterWelcomeEmail } from '@/emails/newsletter-welcome';
import { buildUnsubscribeUrl } from '@/lib/newsletter/unsubscribe-token';
import type { NewsletterSource } from '@/constants/config';
import { logger } from '@/lib/logger';

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

// Best-effort синк в Resend Audience. Сбой логируется, подписку не роняет.
async function syncToAudience(email: string): Promise<string | null> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const resend = getResend();
  if (!audienceId || !resend) return null;
  try {
    const { data, error } = await resend.contacts.create({ email, audienceId, unsubscribed: false });
    if (error || !data) { logger.warn('audience_sync_failed', { error: error?.message }); return null; }
    return data.id;
  } catch (e) {
    logger.warn('audience_sync_threw', { err: String(e) });
    return null;
  }
}

export async function subscribe(emailRaw: string, source: NewsletterSource = 'footer'): Promise<SubscribeResult> {
  const email = emailRaw.trim().toLowerCase();
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  if (existing && !existing.unsubscribedAt) {
    return { ok: true, alreadySubscribed: true };
  }

  const resendContactId = await syncToAudience(email);

  if (existing) {
    // Реактивация после отписки.
    await prisma.subscriber.update({
      where: { email },
      data: { unsubscribedAt: null, ...(resendContactId ? { resendContactId } : {}) },
    });
  } else {
    await prisma.subscriber.create({ data: { email, source, resendContactId } });
  }

  // Welcome — best-effort.
  try {
    await sendEmail({
      to: email,
      subject: 'Добро пожаловать в STRIDE',
      kind: 'newsletter',
      react: createElement(NewsletterWelcomeEmail, { unsubscribeUrl: buildUnsubscribeUrl(email) }),
    });
  } catch (e) {
    logger.error('newsletter_welcome_failed', e);
  }

  return { ok: true, alreadySubscribed: false };
}
```

> Зависимость `buildUnsubscribeUrl` создаётся в Task 20 — реализовать Task 20 ДО запуска этого теста, либо временно заменить на простой `''` и вернуть в Task 20. **Рекомендация:** выполнить Step 6 (создать `unsubscribe-token.ts`) перед запуском теста.

- [ ] **Step 6: Создать заглушку токена (полноценно — Task 20)**

Создать `lib/newsletter/unsubscribe-token.ts` с минимумом, чтобы импорт резолвился (Task 20 дополнит `parseUnsubscribeToken`):

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}
function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(`unsub:${payloadB64}`).digest('base64url');
}

export function buildUnsubscribeUrl(email: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ email })).toString('base64url');
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return `${SITE}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function parseUnsubscribeToken(token: string | undefined | null): { email: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payloadB64));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { email: string };
    if (typeof payload.email !== 'string') return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `cd stride-app && npx vitest run tests/newsletter-service.test.ts tests/newsletter-dto.test.ts`
Expected: PASS (DTO 3 + service 4).

- [ ] **Step 8: Коммит**

```bash
git add services/dto/newsletter.dto.ts lib/newsletter/service.ts lib/newsletter/unsubscribe-token.ts tests/newsletter-service.test.ts tests/newsletter-dto.test.ts
git commit -m "feat(stride): newsletter subscribe service + DTO + unsubscribe token"
```

---

## Task 20: Newsletter action + форма + страница отписки

**Files:**
- Create: `stride-app/app/actions/newsletter.ts`
- Modify: `stride-app/components/shared/newsletter-form.tsx`
- Create: `stride-app/app/unsubscribe/page.tsx`
- Test: `stride-app/tests/newsletter-action.test.ts`

- [ ] **Step 1: Тест action `tests/newsletter-action.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/newsletter/service', () => ({ subscribe: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkNewsletterRateLimit: vi.fn(async () => ({ success: true, remaining: -1, reset: 0 })),
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { subscribeToNewsletter } from '@/app/actions/newsletter';
import { subscribe } from '@/lib/newsletter/service';
import { checkNewsletterRateLimit } from '@/lib/rate-limit';

const sub = subscribe as unknown as ReturnType<typeof vi.fn>;
const rate = checkNewsletterRateLimit as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rate.mockResolvedValue({ success: true, remaining: -1, reset: 0 });
  sub.mockResolvedValue({ ok: true, alreadySubscribed: false });
});

describe('subscribeToNewsletter', () => {
  it('невалидный email → ошибка, subscribe не зовётся', async () => {
    const r = await subscribeToNewsletter({ email: 'nope' });
    expect(r.ok).toBe(false);
    expect(sub).not.toHaveBeenCalled();
  });
  it('rate-limit → ошибка', async () => {
    rate.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const r = await subscribeToNewsletter({ email: 'a@b.com' });
    expect(r.ok).toBe(false);
  });
  it('валидный → subscribe вызван, ok', async () => {
    const r = await subscribeToNewsletter({ email: 'a@b.com', source: 'footer' });
    expect(sub).toHaveBeenCalledWith('a@b.com', 'footer');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd stride-app && npx vitest run tests/newsletter-action.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация `app/actions/newsletter.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { subscribe } from '@/lib/newsletter/service';
import { newsletterSchema } from '@/services/dto/newsletter.dto';
import { checkNewsletterRateLimit, extractClientIp } from '@/lib/rate-limit';

export type NewsletterResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

export async function subscribeToNewsletter(raw: unknown): Promise<NewsletterResult> {
  const parsed = newsletterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Некорректный email' };

  const ip = extractClientIp({ headers: await headers() });
  if (!(await checkNewsletterRateLimit(ip)).success) {
    return { ok: false, error: 'Слишком часто. Попробуйте позже' };
  }

  const res = await subscribe(parsed.data.email, parsed.data.source ?? 'footer');
  if (!res.ok) return { ok: false, error: 'Не удалось подписаться. Попробуйте позже' };
  return { ok: true, alreadySubscribed: res.alreadySubscribed };
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd stride-app && npx vitest run tests/newsletter-action.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Обновить `components/shared/newsletter-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { subscribeToNewsletter } from '@/app/actions/newsletter';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'already' | 'error'>('idle');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;
    setState('loading');
    const res = await subscribeToNewsletter({ email, source: 'footer' });
    if (!res.ok) { setState('error'); return; }
    setState(res.alreadySubscribed ? 'already' : 'done');
    if (!res.alreadySubscribed) setEmail('');
  };

  const label =
    state === 'done' ? 'Готово' :
    state === 'already' ? 'Вы с нами' :
    state === 'loading' ? '…' : 'Подписаться';

  return (
    <form className="flex gap-2 mt-4 max-w-sm" onSubmit={onSubmit}>
      <label className="flex-1">
        <span className="sr-only">E-mail для рассылки</span>
        <input
          type="email" required placeholder="Твой e-mail" value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle'); }}
          className="w-full h-11 px-4 rounded-full bg-white/10 border border-white/15 text-sm text-white placeholder-white/40 outline-none focus:border-primary"
        />
      </label>
      <Button type="submit" variant="primary" size="md" className="shrink-0" loading={state === 'loading'}>
        {label}
      </Button>
      {state === 'error' && <span className="sr-only" role="alert">Ошибка подписки</span>}
    </form>
  );
}
```

> Сохранена вёрстка футера. При желании улучшить UX-сообщения подключить **ui-ux-pro-max**.

- [ ] **Step 6: Создать `app/unsubscribe/page.tsx`**

```tsx
import { parseUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';
import { prisma } from '@/lib/prisma-client';
import { getResend } from '@/lib/email/resend-client';
import { logger } from '@/lib/logger';

export const metadata = { title: 'Отписка от рассылки' };

async function unsubscribe(token: string | undefined): Promise<boolean> {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return false;
  try {
    await prisma.subscriber.updateMany({
      where: { email: parsed.email },
      data: { unsubscribedAt: new Date() },
    });
    // Best-effort синк отписки в Resend.
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    const resend = getResend();
    if (audienceId && resend) {
      try { await resend.contacts.update({ email: parsed.email, audienceId, unsubscribed: true }); }
      catch (e) { logger.warn('audience_unsub_failed', { err: String(e) }); }
    }
    return true;
  } catch (e) {
    logger.error('unsubscribe_failed', e);
    return false;
  }
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await unsubscribe(token);
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold">
        {ok ? 'Вы отписались' : 'Ссылка недействительна'}
      </h1>
      <p className="text-black/60 mt-3">
        {ok ? 'Больше не будем присылать рассылку. Передумаете — подпишитесь снова в футере сайта.'
            : 'Не удалось обработать ссылку отписки. Возможно, она устарела.'}
      </p>
    </div>
  );
}
```

> `searchParams` как Promise — паттерн Next.js 15. Если в проекте используется синхронная сигнатура — привести к используемой (свериться с другими страницами, напр. `app/catalog/page.tsx`).

- [ ] **Step 7: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Коммит**

```bash
git add app/actions/newsletter.ts components/shared/newsletter-form.tsx app/unsubscribe/page.tsx tests/newsletter-action.test.ts
git commit -m "feat(stride): newsletter action, live footer form, unsubscribe page"
```

---

## Task 21: Google-вход проставляет emailVerified + e2e + финальная проверка

**Files:**
- Modify: `stride-app/auth.ts`
- Create: `stride-app/e2e/email-verification.spec.ts` (если папка e2e существует — свериться с расположением Playwright-тестов)

- [ ] **Step 1: В `auth.ts` events — проставить emailVerified для Google**

В объект `events` добавить/дополнить. Текущий `events.signIn` сливает корзину; добавим проставление verified для OAuth. Вставить в начало `signIn` колбэка:

```ts
    async signIn({ user, account }) {
      // OAuth (Google) даёт уже проверенную почту — проставляем emailVerified, если пусто.
      if (account?.provider === 'google' && user?.id) {
        try {
          const { prisma } = await import('@/lib/prisma-client');
          await prisma.user.updateMany({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date() },
          });
        } catch (err) {
          const { logger } = await import('@/lib/logger');
          logger.error('google_mark_verified_failed', err);
        }
      }
      if (!user?.id) return;
      // ... существующая логика слияния корзины/вишлиста без изменений ...
```

> Сохранить весь существующий код слияния корзины/вишлиста ниже. Только добавить блок Google + параметр `account` в деструктуризацию.

- [ ] **Step 2: Проверка типов**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Полный прогон unit-тестов**

Run: `cd stride-app && npm test`
Expected: PASS — все существующие (~156) + новые (verification-code 4, cookie 5, ticket 4, send-email 5, verification-service 7, verification-actions 9, newsletter-dto 3, newsletter-service 4, newsletter-action 3, auth-dto +2). Если что-то красное — чинить до зелёного (НЕ помечать задачу выполненной с падающими тестами).

- [ ] **Step 4: Lint**

Run: `cd stride-app && npm run lint`
Expected: PASS (или только pre-existing warnings).

- [ ] **Step 5: e2e (опционально, если Playwright настроен и гоняется в CI)**

Создать `e2e/email-verification.spec.ts` (свериться с существующими e2e на предмет helper'ов и расположения). Сценарий:
1. Перейти на `/register`, заполнить форму уникальным email, submit.
2. Дождаться появления модалки «Подтвердите почту» (нельзя закрыть — проверить, что Esc/клик-вне не убирают её).
3. Достать код: в dev/CI без Resend он в логах (`verification_code_dev`) — прочитать из перехвата логов сервера ИЛИ из тестового хука. Если перехват невозможен — пометить тест `test.skip` с комментарием и оставить ручной чек-лист.
4. Ввести код в OTP-инпут → модалка исчезает, появляется залогиненное состояние.

> ⚠️ e2e против Neon локально не гонять ([[never-run-db-against-neon-locally]]) — только в CI/Ubuntu. Если локально — `test.skip`.

- [ ] **Step 6: Коммит**

```bash
git add auth.ts e2e/email-verification.spec.ts
git commit -m "feat(stride): google sign-in marks email verified + e2e scaffold"
```

- [ ] **Step 7: Push ветки**

```bash
git push -u origin feat/phase2.2c-email-resend
```

---

## Task 22: Документация env

**Files:**
- Modify/Create: `stride-app/.env.example` (если существует) и/или `docs/`

- [ ] **Step 1: Добавить переменные в `.env.example`**

Если файл `.env.example` существует — дополнить; иначе создать с комментариями:

```bash
# --- P2.2c Email (Resend) ---
RESEND_API_KEY=                 # Full access (Sending + Contacts/Audiences)
EMAIL_FROM_TRANSACTIONAL="Stride <no-reply@cloudd3r.eu.cc>"
EMAIL_FROM_NEWSLETTER="Stride <hello@cloudd3r.eu.cc>"
EMAIL_REPLY_TO=hello@cloudd3r.eu.cc   # опционально
RESEND_AUDIENCE_ID=             # UUID аудитории General (Resend → Audience → ⋯ → Copy ID)
NEXT_PUBLIC_SITE_URL=https://cloudd3r.eu.cc
# AUTH_SECRET уже используется auth.js — им же подписываются pending-cookie / ticket / unsubscribe
```

- [ ] **Step 2: Коммит**

```bash
git add .env.example
git commit -m "docs(stride): env vars for Resend email + newsletter"
```

> **Деплой-чек-лист (вручную, не в коде):** перед мержем в прод-ветку выставить все 6 переменных в Vercel (preview + production), выполнить `prisma db push` к Neon в CI/Vercel (новые таблицы `EmailVerificationCode`, `Subscriber`), проверить отправку реального письма на preview.

---

## Self-Review (выполнено при написании плана)

**1. Покрытие спеки:**
- §3/§7/§8 (cookie-гейт, ticket, авто-login) → Task 4, 5, 13, 18 ✓
- §4 (модели) → Task 2 ✓
- §5 (email-транспорт, шаблоны) → Task 6, 7, 8 ✓
- §6 (verification logic/actions) → Task 3, 9, 12 ✓
- §7 (auth-интеграция, google) → Task 13, 14, 21 ✓
- §8 (UI-гейт, OTP) → Task 17, 18 ✓
- §9 (newsletter, отписка) → Task 19, 20 ✓
- §10 (rate-limit, безопасность) → Task 11, 12, 16, 20 ✓
- §12 (тесты) → каждая логическая задача с TDD ✓
- §13 (env) → Task 22 ✓

**2. Placeholder-скан:** код приведён во всех шагах. Исключения с пояснением: Task 14 (`auth-credentials.ts` под запретом чтения — правка через контракт, исполнитель читает файл), Task 16/20/21 (свериться с фактической сигнатурой login-form / searchParams / events — указаны явные точки сверки). Это не «TODO», а намеренные точки адаптации к непрочитанному коду.

**3. Консистентность типов:** `confirmCode → {status}` (Task 9) совпадает с потреблением в Task 12. `verifyEmailCode` reason-union (Task 12) совпадает с `MESSAGES` в Task 18. `subscribe(email, source)` (Task 19) совпадает с вызовом в Task 20. `signPending/parsePending`, `issueTicket/verifyTicket`, `buildUnsubscribeUrl/parseUnsubscribeToken` — имена согласованы между задачами.

**Известные точки адаптации для исполнителя (не дефекты плана):**
- Task 14: прочитать `lib/auth-credentials.ts`, найти точку успешного возврата, добавить `emailVerified`-guard + поле в select.
- Task 16: свериться, как `login-form.tsx` выполняет вход (`next-auth/react signIn` vs server action), адаптировать обработку отказа.
- Task 20 Step 6: сигнатура `searchParams` (Promise в Next 15) — свериться с соседними страницами.
- Task 21: сохранить существующую логику слияния корзины в `events.signIn`.
