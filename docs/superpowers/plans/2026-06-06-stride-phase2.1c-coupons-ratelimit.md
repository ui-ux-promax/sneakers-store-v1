# STRIDE — Фаза 2.1c (Промокоды + rate-limit входа): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть ядро конверсии P2.1 — добавить процентные промокоды (применение на `/checkout`, снапшот в заказе) и реальный rate-limit входа (Upstash, исполнение отложенного Task 10 из P2.0).

**Architecture:** Модель `Coupon` (процент, `active`, `expiresAt?`) + поля `discountAmount`/`couponCode` в `Order` (снапшот, без FK). Валидация — чистые функции (`lib/coupon.ts`) + server action `validateCoupon` (preview); источник истины расчёта — `placeOrder`. Без `maxUses` → нет счётчиков → нет гонок → Neon-HTTP-safe без изменений транзакционной логики. Rate-limit — `@upstash/ratelimit` sliding-window в `Credentials.authorize` (до argon2), fail-open без env.

**Tech Stack:** Next 15.1 (App Router, RSC + Server Actions), Prisma 6.19 + `@prisma/adapter-neon` (Neon HTTP), Zod, React Hook Form, `@upstash/ratelimit` + `@upstash/redis`, Vitest, Playwright (+ axe), CI на Ubuntu.

**Спека:** `docs/superpowers/specs/2026-06-06-stride-phase2.1c-coupons-ratelimit-design.md`. **Ветка:** `feat/phase2.1c-coupons` (от `main`).

---

## Соглашения этого плана (прочитать перед стартом)

1. **Все пути — от `stride-app/`**, команды запускать из `stride-app/`. Коммиты — на английском, conventional-commits, **без `Co-Authored-By`**, единственный автор `ui-ux-promax` ([[commit-pr-conventions]]).
2. **Ограничение Neon HTTP:** `$transaction`/`updateMany`/`createMany`/nested-create/`$executeRaw`(UPDATE) НЕ работают на прод-Neon ([[prisma-neon-no-transaction]], TROUBLESHOOTING P5/P7/P9). В этом слайсе мультизаписей со счётчиками НЕТ — валидация купона = одиночный `findUnique`; `placeOrder` уже Neon-safe, добавляем только поля в `Order.create`.
3. **Деньги — `Int ₽`.** Скидка — `Math.floor`, clamp `Math.min(itemsTotal, …)`.
4. **TDD** для чистой логики (`normalizeCouponCode`, `calcCouponDiscount`, `checkCoupon`): RED → GREEN → commit. Интеграция (checkout с купоном, rate-limit) — Vitest c моком prisma + Playwright e2e.
5. **e2e только в CI (Ubuntu)** — локальный Windows флакает из-за дистанции до Neon ([[local-e2e-neon-latency]]). Локально гоняем `typecheck` + `vitest` + `next build`.
6. **`db push` локально блокирован (P1017)** — схему к прод-Neon применит прод-build (`db push` в `vercel.json`) при мерже; CI-БД получает схему через `prisma:push` в `e2e.yml` ([[neon-schema-not-auto-applied]]). Локально `prisma:generate` достаточно для типов.
7. **Операционное предусловие пользователя (rate-limit):** задать `KV_REST_API_URL` / `KV_REST_API_TOKEN` в Vercel (Upstash/Vercel KV) ДО мержа — иначе rate-limit останется fail-open на проде.

---

## Структура файлов (создаётся/меняется по ходу)

```
stride-app/
├─ prisma/schema.prisma                 # +Coupon; Order +discountAmount +couponCode (Task 1)
├─ prisma/seed.ts                        # demo-купоны upsert (Task 6)
├─ lib/
│  ├─ coupon.ts                          # normalizeCouponCode/calcCouponDiscount/checkCoupon (Task 2)
│  └─ rate-limit.ts                      # +checkLoginRateLimit (Task 7)
├─ services/dto/order.dto.ts             # checkoutSchema +couponCode (Task 3)
├─ app/actions/
│  ├─ coupon.ts                          # validateCoupon server action (Task 4)
│  └─ order.ts                           # placeOrder: расчёт скидки + поля в Order (Task 4)
├─ auth.config.ts                        # rate-limit в Credentials.authorize (Task 7)
├─ components/shared/checkout/checkout-form.tsx   # промо-секция + строка «Скидка» (Task 5)
├─ app/orders/[number]/page.tsx          # отображение скидки (Task 5)
├─ tests/                                # coupon.test.ts, order-coupon.test.ts, rate-limit (Vitest)
└─ e2e/coupon.spec.ts + e2e/a11y.spec.ts # e2e + a11y (Task 8)
```

---

## Task 1: Схема Prisma — Coupon + поля скидки в Order

**Files:**
- Modify: `stride-app/prisma/schema.prisma`

- [ ] **Step 1: Добавить модель `Coupon`**

В конец `schema.prisma`:
```prisma
model Coupon {
  id        String    @id @default(cuid())
  code      String    @unique          // нормализованный: trim + UPPERCASE
  percent   Int                        // 1..100, процент скидки на сумму товаров
  active    Boolean   @default(true)
  expiresAt DateTime?                   // null = бессрочный
  createdAt DateTime  @default(now())
}
```

- [ ] **Step 2: Добавить поля скидки в `Order`**

В модели `Order` рядом с money-полями (`itemsTotal`/`shippingAmount`/`totalAmount`):
```prisma
  itemsTotal     Int
  discountAmount Int     @default(0)   // НОВОЕ
  shippingAmount Int
  totalAmount    Int
  couponCode     String?               // НОВОЕ: снапшот кода
```
> `@default(0)` на `discountAmount` — существующие заказы не сломаются. `couponCode` nullable. FK на `Coupon` НЕ добавляем (снапшот, как `sku` в `OrderItem`).

- [ ] **Step 3: Сгенерировать клиент**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client`; в типах появляется `Coupon`, у `Order` — `discountAmount`/`couponCode`.

- [ ] **Step 4: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок (`Order.create` в `placeOrder` пока без новых полей — `@default(0)`/nullable не требуют их).
> `db push` локально НЕ запускаем (P1017). Схему применит прод-build / CI.

- [ ] **Step 5: Commit**
```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): Coupon model + Order discount fields"
```

---

## Task 2: Логика купона (`lib/coupon.ts`) — TDD

**Files:**
- Create: `stride-app/lib/coupon.ts`
- Create: `stride-app/tests/coupon.test.ts`

- [ ] **Step 1: Падающий тест**

`tests/coupon.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { normalizeCouponCode, calcCouponDiscount } from '@/lib/coupon';

describe('normalizeCouponCode', () => {
  it('тримит и приводит к UPPERCASE', () => {
    expect(normalizeCouponCode('  stride10 ')).toBe('STRIDE10');
  });
  it('пустое → пустая строка', () => {
    expect(normalizeCouponCode('   ')).toBe('');
  });
});

describe('calcCouponDiscount', () => {
  it('10% от 10000 = 1000', () => {
    expect(calcCouponDiscount(10000, 10)).toBe(1000);
  });
  it('округляет вниз (33% от 100 = 33)', () => {
    expect(calcCouponDiscount(100, 33)).toBe(33);
  });
  it('не превышает сумму товаров (clamp при 100%)', () => {
    expect(calcCouponDiscount(5000, 100)).toBe(5000);
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run tests/coupon.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/coupon.ts`**

```ts
import { prisma } from '@/lib/prisma-client';

export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase();
}

export function calcCouponDiscount(itemsTotal: number, percent: number): number {
  return Math.min(itemsTotal, Math.floor((itemsTotal * percent) / 100));
}

export type CouponCheck =
  | { ok: true; code: string; percent: number }
  | { ok: false; error: string };

// Проверка купона против БД (без привязки к корзине). Одиночный findUnique — Neon-safe.
export async function checkCoupon(rawCode: string): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: 'Введите промокод' };
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) return { ok: false, error: 'Промокод недействителен' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'Срок действия промокода истёк' };
  }
  return { ok: true, code, percent: coupon.percent };
}
```

- [ ] **Step 4: Тест `checkCoupon` (мок prisma)**

Добавить в `tests/coupon.test.ts`:
```ts
import { checkCoupon } from '@/lib/coupon';

vi.mock('@/lib/prisma-client', () => ({
  prisma: { coupon: { findUnique: vi.fn() } },
}));
const { prisma } = await import('@/lib/prisma-client');

describe('checkCoupon', () => {
  it('валидный бессрочный → ok', async () => {
    (prisma.coupon.findUnique as any).mockResolvedValue({ code: 'STRIDE10', percent: 10, active: true, expiresAt: null });
    expect(await checkCoupon('stride10')).toEqual({ ok: true, code: 'STRIDE10', percent: 10 });
  });
  it('неактивный → отказ', async () => {
    (prisma.coupon.findUnique as any).mockResolvedValue({ code: 'X', percent: 10, active: false, expiresAt: null });
    expect((await checkCoupon('x')).ok).toBe(false);
  });
  it('истёкший → отказ', async () => {
    (prisma.coupon.findUnique as any).mockResolvedValue({ code: 'X', percent: 10, active: true, expiresAt: new Date('2020-01-01') });
    expect((await checkCoupon('x')).ok).toBe(false);
  });
  it('несуществующий → отказ', async () => {
    (prisma.coupon.findUnique as any).mockResolvedValue(null);
    expect((await checkCoupon('nope')).ok).toBe(false);
  });
});
```

- [ ] **Step 5: GREEN**

Run: `npx vitest run tests/coupon.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 6: Commit**
```bash
git add stride-app/lib/coupon.ts stride-app/tests/coupon.test.ts
git commit -m "feat(stride-app): coupon validation logic (normalize/calc/check) + unit tests"
```

---

## Task 3: DTO — `checkoutSchema` + `couponCode`

**Files:**
- Modify: `stride-app/services/dto/order.dto.ts`

- [ ] **Step 1: Добавить поле**

В `checkoutSchema` добавить:
```ts
  couponCode: z.string().trim().max(40).optional(),
```
> `.optional()` — купон необязателен; пустая строка/undefined трактуется как «без купона».

- [ ] **Step 2: Проверка типов**

Run: `npm run typecheck`
Expected: 0 ошибок (`CheckoutValues` получает `couponCode?: string`).

- [ ] **Step 3: Commit**
```bash
git add stride-app/services/dto/order.dto.ts
git commit -m "feat(stride-app): checkoutSchema accepts optional couponCode"
```

---

## Task 4: `validateCoupon` action + расчёт скидки в `placeOrder` — TDD

**Files:**
- Create: `stride-app/app/actions/coupon.ts`
- Modify: `stride-app/app/actions/order.ts`
- Create: `stride-app/tests/order-coupon.test.ts`

- [ ] **Step 1: Server action `app/actions/coupon.ts` (preview)**

```ts
'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, getCartDetails } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { checkCoupon, calcCouponDiscount } from '@/lib/coupon';

export type ValidateCouponResult =
  | { ok: true; code: string; percent: number; discount: number }
  | { ok: false; error: string };

export async function validateCoupon(rawCode: string): Promise<ValidateCouponResult> {
  const check = await checkCoupon(rawCode);
  if (!check.ok) return check;

  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  const cart = token ? await prisma.cart.findFirst({ where: { token }, include: cartInclude }) : null;
  if (!cart || cart.items.length === 0) return { ok: false, error: 'Корзина пуста' };

  const details = getCartDetails(cart);
  const discount = calcCouponDiscount(details.totalAmount, check.percent);
  return { ok: true, code: check.code, percent: check.percent, discount };
}
```
> Только расчёт preview — ничего не сохраняет. Источник истины — `placeOrder`.

- [ ] **Step 2: Внести расчёт скидки в `placeOrder` (`app/actions/order.ts`)**

После `const snapshot = buildOrderSnapshot(cart);` и ДО декремента стока добавить:
```ts
  let discountAmount = 0;
  let couponCode: string | null = null;
  if (form.couponCode && form.couponCode.trim()) {
    const { checkCoupon, calcCouponDiscount } = await import('@/lib/coupon');
    const check = await checkCoupon(form.couponCode);
    if (!check.ok) return { ok: false, error: check.error };
    discountAmount = calcCouponDiscount(snapshot.itemsTotal, check.percent);
    couponCode = check.code;
  }
```
Заменить расчёт тоталов:
```ts
  const shippingAmount = calcShipping(snapshot.itemsTotal, form.shippingMethod);
  const totalAmount = snapshot.itemsTotal - discountAmount + shippingAmount;
```
В `prisma.order.create({ data: { … } })` добавить два поля:
```ts
      itemsTotal: snapshot.itemsTotal,
      discountAmount,
      shippingAmount,
      totalAmount,
      couponCode,
```
> `createPayment`/`Payment.create` уже получают `totalAmount` — он теперь со скидкой, изменений не требует. Проверка купона до декремента стока → при отказе откатывать нечего.

- [ ] **Step 3: Тест расчёта в `placeOrder` (мок prisma + coupon)**

`tests/order-coupon.test.ts` — по образцу существующих order-сьютов (мок `@/lib/prisma-client`, `@/auth`, `next/headers`, `@/lib/coupon`). Кейсы:
```
- с валидным купоном 10%: itemsTotal=10000 → discountAmount=1000, totalAmount=10000-1000+shipping,
  Order.create вызван с couponCode='STRIDE10' и discountAmount=1000.
- с истёкшим/невалидным купоном: placeOrder возвращает { ok:false }, prisma.order.create НЕ вызван,
  сток не декрементирован (restoreStock не нужен).
- без купона (couponCode undefined): discountAmount=0, couponCode=null — регрессия P2.1a/b.
```
> Сверить форму мока с существующим order-сьютом (как именно мокается prisma/auth/cookies) перед написанием, чтобы не дублировать расхождения.

- [ ] **Step 4: GREEN + полный прогон**

Run: `npx vitest run tests/order-coupon.test.ts && npm test`
Expected: новый сьют PASS; все прежние (102/102 на момент старта) — зелёные.

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**
```bash
git add stride-app/app/actions/coupon.ts stride-app/app/actions/order.ts stride-app/tests/order-coupon.test.ts
git commit -m "feat(stride-app): apply coupon discount in placeOrder + validateCoupon preview action"
```

---

## Task 5: UI — промо-секция в checkout + скидка в заказе

**Files:**
- Modify: `stride-app/components/shared/checkout/checkout-form.tsx`
- Modify: `stride-app/app/orders/[number]/page.tsx`

- [ ] **Step 1: Состояние купона в `checkout-form.tsx`**

Добавить локальный стейт + регистрацию скрытого поля:
```ts
const [coupon, setCoupon] = useState<{ code: string; percent: number; discount: number } | null>(null);
const [couponInput, setCouponInput] = useState('');
const [couponError, setCouponError] = useState<string | null>(null);
const [couponPending, setCouponPending] = useState(false);
```
Зарегистрировать скрытое поле `couponCode` (чтобы уходило в `placeOrder`):
```tsx
<input type="hidden" {...register('couponCode')} />
```

- [ ] **Step 2: Применение/сброс купона**

```ts
const applyCoupon = async () => {
  setCouponError(null); setCouponPending(true);
  const res = await validateCoupon(couponInput);
  setCouponPending(false);
  if (!res.ok) { setCoupon(null); setValue('couponCode', ''); setCouponError(res.error); return; }
  setCoupon({ code: res.code, percent: res.percent, discount: res.discount });
  setValue('couponCode', res.code);
};
const removeCoupon = () => { setCoupon(null); setCouponInput(''); setValue('couponCode', ''); setCouponError(null); };
```
Импорт: `import { validateCoupon } from '@/app/actions/coupon';`

- [ ] **Step 3: Пересчёт итога и разметка сводки**

Пересчёт:
```ts
const discount = coupon?.discount ?? 0;
const shipping = calcShipping(details.totalAmount, shippingMethod);
const total = details.totalAmount - discount + shipping;
```
В `<aside>` перед строкой «Товары»/после — блок промокода (поле + «Применить», либо применённый купон с «×»), и строка «Скидка»:
```tsx
{/* Промокод */}
<div className="space-y-2">
  {!coupon ? (
    <>
      <div className="flex gap-2">
        <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Промокод" />
        <Button type="button" variant="secondary" size="md" className="shrink-0" loading={couponPending} onClick={applyCoupon}>Применить</Button>
      </div>
      {couponError && <p className="text-danger text-xs" role="alert">{couponError}</p>}
    </>
  ) : (
    <div className="flex justify-between items-center text-sm">
      <span className="text-success font-semibold">Промокод {coupon.code} ({coupon.percent}%)</span>
      <button type="button" onClick={removeCoupon} className="text-ink-muted hover:text-ink" aria-label="Убрать промокод">×</button>
    </div>
  )}
</div>
```
В разбивке сумм добавить строку скидки (только если `discount > 0`):
```tsx
{discount > 0 && (
  <div className="flex justify-between"><span className="text-ink-muted">Скидка</span><span className="font-semibold text-success tnum">−{formatPrice(discount)}</span></div>
)}
```
> Кнопка «Применить» — `type="button"` (не submit формы!). Поле купона — обычный controlled input, НЕ через `register` (значение шлём скрытым `couponCode` после валидации).

- [ ] **Step 4: Скидка на `/orders/[number]`**

В разбивке сумм страницы заказа добавить (если `order.discountAmount > 0`):
```tsx
{order.discountAmount > 0 && (
  <div className="flex justify-between"><span>Скидка{order.couponCode ? ` (${order.couponCode})` : ''}</span><span className="text-success">−{formatPrice(order.discountAmount)}</span></div>
)}
```
> Сверить точные имена полей/стили с текущей разметкой разбивки в `page.tsx`.

- [ ] **Step 5: Проверка сборки**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/checkout`, `/orders/[number]` собираются.

- [ ] **Step 6: Commit**
```bash
git add stride-app/components/shared/checkout/checkout-form.tsx stride-app/app/orders/[number]/page.tsx
git commit -m "feat(stride-app): coupon UI on checkout + discount line on order page"
```

---

## Task 6: Seed демо-купонов

**Files:**
- Modify: `stride-app/prisma/seed.ts`

- [ ] **Step 1: Добавить блок upsert купонов**

В конец основной seed-функции (перед закрытием/disconnect):
```ts
const coupons = [
  { code: 'STRIDE10', percent: 10, active: true, expiresAt: null },
  { code: 'WELCOME15', percent: 15, active: true, expiresAt: null },
  { code: 'EXPIRED', percent: 50, active: true, expiresAt: new Date('2020-01-01') }, // e2e негатив
];
for (const c of coupons) {
  await prisma.coupon.upsert({ where: { code: c.code }, update: c, create: c });
}
console.log(`Seeded ${coupons.length} coupons`);
```
> `upsert` по `@unique code` — идемпотентно и Neon-safe (одиночная операция). Сверить стиль с существующим seed (как там логируется/структурирован код).

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.
> Запускать сам seed локально не обязательно (Neon-latency); он отработает в CI/проде. Если seed гоняется в `e2e.yml` — убедиться, что купоны попадут в CI-БД до e2e (см. Task 8).

- [ ] **Step 3: Commit**
```bash
git add stride-app/prisma/seed.ts
git commit -m "feat(stride-app): seed demo coupons (STRIDE10/WELCOME15/EXPIRED)"
```

---

## Task 7: Реальный rate-limit входа (Upstash) — Task 10 из P2.0

**Files:**
- Modify: `stride-app/lib/rate-limit.ts`
- Modify: `stride-app/auth.config.ts`
- Modify: `stride-app/package.json`
- Modify: `stride-app/.env.example`

> Дизайн — `docs/superpowers/plans/2026-06-02-stride-phase2-auth.md` Task 10. Ниже — адаптация под текущий `rate-limit.ts`.

- [ ] **Step 1: Установить Upstash**

Run (из `stride-app/`): `npm install @upstash/ratelimit@^2.0.5 @upstash/redis@^1.34.3`

- [ ] **Step 2: Добавить `checkLoginRateLimit` в `lib/rate-limit.ts`**

Сохранить существующие `RateLimitResult`/`getEnv`/`isRateLimitConfigured`/`extractClientIp`. Добавить ленивый лимитер:
```ts
let loginLimiter: { limit(key: string): Promise<{ success: boolean; remaining: number; reset: number }> } | null | false = null;

async function getLoginLimiter() {
  if (loginLimiter !== null) return loginLimiter;
  if (!isRateLimitConfigured()) { loginLimiter = false; return loginLimiter; }
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL')!;
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')!;
  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');
  loginLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '5 m'),
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
> Оставить `checkAuthRateLimit` для обратной совместимости ИЛИ переписать его телом `checkLoginRateLimit` (выбрать минимально инвазивно — проверить, есть ли вызовы `checkAuthRateLimit` в коде).

- [ ] **Step 3: Применить в `Credentials.authorize` (`auth.config.ts`)**

Изменить сигнатуру на `authorize(creds, request)` и добавить проверку лимита ДО запроса к БД и `verifyPassword` (защита от argon2-DoS):
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

        // ...существующая логика: dummy-hash constant-time, findUnique, verifyPassword...
      },
```
> ВАЖНО: не сломать существующий **constant-time** `authorizeCredentials` (dummy-hash из security-ревью P2.0). Rate-limit — в начало, остальное без изменений. Динамические импорты обязательны (edge middleware не должен тянуть Upstash/prisma/argon2).

- [ ] **Step 4: `.env.example`**

Дописать:
```bash
# Rate-limit (Upstash / Vercel KV) — опционально в dev (fail-open), обязательно в проде
KV_REST_API_URL=""
KV_REST_API_TOKEN=""
```

- [ ] **Step 5: typecheck + build (проверить edge-бандл middleware)**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; middleware ~86 kB — **Upstash/redis НЕ должны утечь в edge** (импорты динамические внутри `authorize`, который middleware не вызывает). Если middleware распух — значит импорт стал статическим: вернуть в `await import`.

- [ ] **Step 6: (опц.) тест fail-open**

В `tests/` мини-тест: без env `checkLoginRateLimit` возвращает `success:true`. Можно объединить с coupon-сьютом или отдельный `rate-limit.test.ts`.

- [ ] **Step 7: Commit**
```bash
git add stride-app/lib/rate-limit.ts stride-app/auth.config.ts stride-app/package.json stride-app/package-lock.json stride-app/.env.example
git commit -m "feat(stride-app): real sliding-window login rate-limit (Upstash, fail-open in dev)"
```

---

## Task 8: E2E + a11y

**Files:**
- Create: `stride-app/e2e/coupon.spec.ts`
- Modify: `stride-app/e2e/a11y.spec.ts` (при необходимости)
- Modify (при необходимости): `.github/workflows/e2e.yml` — seed купонов до e2e

- [ ] **Step 1: Убедиться, что seed купонов попадает в CI-БД**

Проверить `e2e.yml`: если seed гоняется (`prisma db seed` / `npm run seed`) перед e2e — купоны будут. Если нет — добавить шаг seed после `prisma:push` (купоны нужны e2e). Сверить с тем, как сейчас наполняется CI-БД товарами ([[neon-schema-not-auto-applied]]).

- [ ] **Step 2: `e2e/coupon.spec.ts`**

Сценарий: войти (или зарегистрироваться) → добавить товар → `/checkout` → применить купон. Опираться на реальные селекторы (как в `e2e/checkout.spec.ts`, getByLabel — см. [[P2.1b lessons]] про `getByLabel('Адрес', { exact: true })`).
```ts
import { test, expect } from '@playwright/test';
// helper-логин/добавление в корзину — переиспользовать из существующих e2e (checkout.spec.ts).

test('купон STRIDE10 даёт скидку 10% и применяется к заказу', async ({ page }) => {
  // ...login + add to cart + goto /checkout...
  await page.getByPlaceholder('Промокод').fill('STRIDE10');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText(/Скидка/)).toBeVisible();
  await expect(page.getByText(/STRIDE10/)).toBeVisible();
  // ...оформить заказ → на /orders/[number] видна строка скидки...
});

test('истёкший купон EXPIRED → ошибка, без скидки', async ({ page }) => {
  // ...goto /checkout...
  await page.getByPlaceholder('Промокод').fill('EXPIRED');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText(/истёк/)).toBeVisible();
});

test('мусорный купон → ошибка', async ({ page }) => {
  await page.getByPlaceholder('Промокод').fill('NOPE123');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText(/недействителен/)).toBeVisible();
});
```

- [ ] **Step 3: a11y — /checkout уже в наборе?**

Если `/checkout` уже покрыт `a11y.spec.ts` — купон-секция проверится автоматически. Если нет и страница требует сессии — пропустить (как `/profile` в P2.0).

- [ ] **Step 4: Локальный прогон (ожидаемо может флакать — финал в CI)**

Run: `npx playwright test e2e/coupon.spec.ts`
Expected (CI/Ubuntu): зелёные. Локально — допускается сетевой флак.

- [ ] **Step 5: Commit**
```bash
git add stride-app/e2e/coupon.spec.ts stride-app/e2e/a11y.spec.ts .github/workflows/e2e.yml
git commit -m "test(stride-app): e2e for coupon apply/expired/invalid + CI seed"
```

---

## Task 9: Финальная сверка и завершение P2.1c

**Files:** (нет новых; проверки + отметки)

- [ ] **Step 1: Полная проверка качества**

Run по очереди из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest — все зелёные (coupon + order-coupon + rate-limit + прежние); build OK; middleware ~86 kB (Upstash не в edge).

- [ ] **Step 2: Чек-лист критериев готовности (§12 спеки)**

- [ ] Процентный купон применяется на /checkout (preview-скидка, корректный итог).
- [ ] Истёкший/неактивный/несуществующий → понятная ошибка, итог без скидки.
- [ ] Заказ с купоном: `discountAmount`/`couponCode` сохранены, `totalAmount` со скидкой; в ЮKassa уходит итог со скидкой.
- [ ] `/orders/[number]` показывает скидку.
- [ ] COD/online без купона не сломаны (регрессия P2.1a/b).
- [ ] rate-limit активен при Upstash (5/5мин), fail-open без env, проверка до argon2.
- [ ] seed заводит купоны идемпотентно.
- [ ] e2e зелёные в CI.

- [ ] **Step 3: Адверсариальное ревью диффа**

Прогнать code-review слайса (как в P2.1a/b): особое внимание — расчёт скидки (clamp/floor, доставка от itemsTotal до скидки), повторная проверка купона в `placeOrder` (не доверять клиентскому `couponCode`), constant-time `authorize` не сломан rate-limit'ом, edge-бандл чист. Подтверждённые находки — пофиксить по TDD.

- [ ] **Step 4: Отметить spec реализованным**

В `docs/superpowers/specs/2026-06-06-stride-phase2.1c-coupons-ratelimit-design.md` сменить «Статус: на ревью» → «Статус: реализовано (P2.1c)».
```bash
git add docs/superpowers/specs/2026-06-06-stride-phase2.1c-coupons-ratelimit-design.md
git commit -m "docs: mark Phase 2.1c coupons+ratelimit spec implemented"
```

- [ ] **Step 5: Завершение ветки**

Использовать `superpowers:finishing-a-development-branch`. Push `feat/phase2.1c-coupons`, дождаться зелёного CI (e2e + seed купонов), открыть PR → `main`. **Мержит пользователь.** Предусловие прод: `KV_REST_API_URL`/`KV_REST_API_TOKEN` заданы в Vercel ДО мержа (иначе rate-limit fail-open на проде). Прод-build применит `Coupon` + поля `Order` к прод-Neon (`db push` в `vercel.json`).

---

## Self-Review (проведён против спеки `2026-06-06-stride-phase2.1c-coupons-ratelimit-design.md`)

**1. Покрытие требований спеки:**

| Раздел спеки | Задача плана |
|---|---|
| §3 Модель Coupon + поля Order | Task 1 |
| §4 Расчёт скидки (floor/clamp, доставка от itemsTotal) | Tasks 2, 4 |
| §5 normalizeCouponCode/calcCouponDiscount/checkCoupon | Task 2 |
| §5 validateCoupon (preview) | Task 4 |
| §6 checkoutSchema + couponCode, placeOrder | Tasks 3, 4 |
| §7 UI checkout + строка скидки + /orders | Task 5 |
| §8 seed купонов | Task 6 |
| §9 rate-limit входа (Upstash, до argon2) | Task 7 |
| §10 тесты (unit + e2e + a11y) | Tasks 2, 4, 7, 8 |
| §11 env (KV_REST_API_*) | Task 7 |
| §12 критерии готовности | Task 9 |

**2. Скан плейсхолдеров:** код шагов приведён целиком; «сверить с существующим» относится к интеграции в готовые файлы (order-сьют мок, seed-стиль, разбивка /orders) — это сверка эталона, не «доделать позже».

**3. Консистентность типов:** `normalizeCouponCode`/`calcCouponDiscount`/`checkCoupon`/`CouponCheck`, `validateCoupon`/`ValidateCouponResult`, `couponCode` в `CheckoutValues`/`Order`, `discountAmount`, `checkLoginRateLimit`/`RateLimitResult`/`extractClientIp` — имена и сигнатуры согласованы между задачами.

**4. Neon-HTTP-safe:** валидация купона — одиночный `findUnique`; seed — `upsert` по `@unique`; `placeOrder` не добавляет мультизаписей со счётчиками. Нет `$transaction`/`updateMany`/`createMany`/nested-create.

**Зафиксированные допущения:** только процентная скидка; без `maxUses`/лимита-на-юзера (нет гонок); скидка к `itemsTotal`, порог бесплатной доставки от `itemsTotal` до скидки; купон — снапшот кода (без FK); купоны через seed; rate-limit fail-open в dev.
