# STRIDE — Фаза 2.1b (ЮKassa + DaData): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Онлайн-оплата картой через ЮKassa (redirect-флоу, авто-захват) + автоподсказки адреса DaData в существующем чекауте; COD остаётся рабочим.

**Architecture:** Модель `Payment` (1:1 с Order). `placeOrder` ветвится по `paymentMethod`: `cod` — как сейчас; `online` — создаёт Order + Payment через ЮKassa SDK (`capture:true`, redirect) и возвращает `paymentUrl` для внешнего редиректа. Вебхук `/api/yookassa/webhook` обновляет статус платежа/заказа (succeeded → PROCESSING; canceled → возврат стока + CANCELLED). DaData — клиентский компонент + серверный прокси `/api/dadata/suggest`. Все записи — одиночные Prisma-операции (Neon HTTP без транзакций, [[prisma-neon-no-transaction]]).

**Tech Stack:** Next 15.1 (App Router, RSC, Server Actions, Route Handlers), Prisma 6.19 + Neon HTTP, Auth.js v5, `@webzaytsev/yookassa-ts-sdk`, Zod, React Hook Form, Vitest, Playwright. Спека: `docs/superpowers/specs/2026-06-04-stride-phase2.1b-yookassa-dadata-design.md`. Ветка: `feat/phase2.1b-yookassa`.

---

## Соглашения этого плана

1. **Все пути — от `stride-app/`**, команды из `stride-app/`. Коммиты — английский conventional-commits, **без `Co-Authored-By`**, автор `ui-ux-promax`.
2. **Neon HTTP: только одиночные операции.** `create`/`update`(by id)/`delete`/`deleteMany`/`findUnique`. **НЕ** `updateMany`, `createMany`, nested-create, `$executeRaw` для UPDATE (P9). Условные обновления — `findUnique` + `update`.
3. **Деньги:** `Int ₽` в БД; ЮKassa и `Payment.amount` — в КОПЕЙКАХ (`₽ × 100`).
4. **TDD** для server-логики (мок Prisma + SDK), как `tests/place-order.test.ts`. e2e — в CI (Ubuntu), локально флак (P4). Локально: typecheck + vitest + build.
5. **Секреты лениво:** SDK/токены инициализируются при первом вызове, не на import — чтобы dev без ключей не падал.
6. **Схему применяет деплой/CI** (`db push` в `vercel.json`/`e2e.yml`) — отдельно не настраивать.

---

## Структура файлов

```
stride-app/
├─ prisma/schema.prisma                         # +Payment, Order.payment relation (T1)
├─ package.json                                  # +@webzaytsev/yookassa-ts-sdk (T2)
├─ constants/config.ts                           # (без изменений; env читаем в lib)
├─ lib/yookassa.ts                               # ленивый SDK-инстанс + createPayment, cancelPayment, siteUrl (T2, T3)
├─ services/dto/order.dto.ts                     # paymentMethod: enum['cod','online'] (T4)
├─ app/actions/order.ts                          # placeOrder online-ветка (T5), cancelOrder отмена платежа (T8)
├─ app/api/yookassa/webhook/route.ts            # вебхук (T6)
├─ app/api/dadata/suggest/route.ts              # прокси DaData (T9)
├─ components/shared/checkout/checkout-form.tsx  # активный radio online + редирект (T7), DaData (T10)
├─ components/shared/checkout/address-suggest.tsx# компонент автоподсказок (T10)
├─ app/orders/[number]/page.tsx                  # статус платежа (T7)
├─ tests/yookassa-lib.test.ts                    # createPayment маппинг (T3)
├─ tests/place-order-online.test.ts             # placeOrder online (T5)
├─ tests/yookassa-webhook.test.ts               # вебхук (T6)
└─ e2e/yookassa.spec.ts                          # e2e (T11)
```

---

## Task 1: Модель Payment

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Добавить модель Payment в конец `schema.prisma`**

```prisma
model Payment {
  id              String    @id
  orderId         String    @unique
  order           Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status          String    @default("pending")
  confirmationUrl String?
  amount          Int
  paidAt          DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

- [ ] **Step 2: Добавить relation-поле в модель `Order`**

В `model Order { ... }` рядом с `items OrderItem[]` добавить:
```prisma
  payment        Payment?
```

- [ ] **Step 3: Генерация клиента**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client` без ошибок; в типах появляется `Payment`.

- [ ] **Step 4: Применить схему к dev-ветке Neon**

Run: `npm run prisma:push`
Expected: `Your database is now in sync`; создаётся таблица `Payment`. (Если падает `P1017` локально — это известная блокировка прямого TCP к Neon с этой машины, см. TROUBLESHOOTING; пропустить — схема применится в CI/Vercel.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): Payment model (1:1 Order) for online payments"
```

---

## Task 2: Установка SDK + ленивый инстанс

**Files:** Modify `package.json`; Create `lib/yookassa.ts`

- [ ] **Step 1: Установить SDK**

Run (из `stride-app/`):
```bash
npm install @webzaytsev/yookassa-ts-sdk@^1
```
> Если конкретная мажорная версия недоступна — установить последнюю (`npm install @webzaytsev/yookassa-ts-sdk`) и зафиксировать то, что встало. Проверить, что пакет ставится без peer-конфликтов.

- [ ] **Step 2: Создать `lib/yookassa.ts` (ленивый SDK + siteUrl helper)**

```typescript
import { YooKassa } from '@webzaytsev/yookassa-ts-sdk';

let _sdk: ReturnType<typeof YooKassa> | null = null;

export function getYooKassa() {
  if (_sdk) return _sdk;
  const shop_id = process.env.YOOKASSA_SHOP_ID;
  const secret_key = process.env.YOOKASSA_SECRET_KEY;
  if (!shop_id || !secret_key) throw new Error('YooKassa not configured (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)');
  _sdk = YooKassa({ shop_id, secret_key });
  return _sdk;
}

// Полный URL сайта для return_url. NEXT_PUBLIC_SITE_URL (как в robots.ts/sitemap.ts),
// фолбэк на VERCEL_URL (Vercel задаёт без протокола), затем localhost.
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок (если SDK не экспортирует `YooKassa` как именованный — проверить фактический экспорт пакета и поправить импорт; пакет TS, типы идут с ним).

- [ ] **Step 4: Commit**

```bash
git add stride-app/package.json stride-app/package-lock.json stride-app/lib/yookassa.ts
git commit -m "chore(stride-app): add YooKassa SDK + lazy client/siteUrl helper"
```

---

## Task 3: createPayment / cancelPayment в lib/yookassa.ts — TDD

**Files:** Modify `lib/yookassa.ts`; Create `tests/yookassa-lib.test.ts`

- [ ] **Step 1: Падающий тест — `tests/yookassa-lib.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const createMock = vi.fn();
const cancelMock = vi.fn();
vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({
  YooKassa: () => ({ payments: { create: createMock, cancel: cancelMock } }),
  CurrencyEnum: { RUB: 'RUB' },
}));

import { createPayment, cancelPayment } from '@/lib/yookassa';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.YOOKASSA_SHOP_ID = 'shop';
  process.env.YOOKASSA_SECRET_KEY = 'secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test';
});

describe('createPayment', () => {
  it('конвертирует рубли в копейки строкой и прокидывает return_url/idempotency', async () => {
    createMock.mockResolvedValue({ id: 'pay_1', confirmation: { confirmation_url: 'https://yoo/redirect' } });
    const res = await createPayment({ orderNumber: 1025, amountRub: 15999 });
    expect(res).toEqual({ id: 'pay_1', confirmationUrl: 'https://yoo/redirect' });
    const [payload, idempotencyKey] = createMock.mock.calls[0];
    expect(payload.amount).toEqual({ value: '1599900', currency: 'RUB' });
    expect(payload.capture).toBe(true);
    expect(payload.confirmation).toEqual({ type: 'redirect', return_url: 'https://shop.test/orders/1025', locale: 'ru_RU' });
    expect(payload.metadata).toEqual({ orderNumber: '1025' });
    expect(idempotencyKey).toBe('order-1025');
  });
});

describe('cancelPayment', () => {
  it('зовёт sdk.payments.cancel с id', async () => {
    cancelMock.mockResolvedValue({ id: 'pay_1', status: 'canceled' });
    await cancelPayment('pay_1');
    expect(cancelMock).toHaveBeenCalledWith('pay_1');
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/yookassa-lib.test.ts`
Expected: FAIL — `createPayment`/`cancelPayment` не экспортируются.

- [ ] **Step 3: Дополнить `lib/yookassa.ts`**

Добавить импорт `CurrencyEnum` и функции:
```typescript
import { YooKassa, CurrencyEnum } from '@webzaytsev/yookassa-ts-sdk';
```
(заменить существующую строку импорта `YooKassa`), и в конец файла:
```typescript
export interface CreatePaymentInput {
  orderNumber: number;
  amountRub: number; // сумма в рублях (Int)
}
export interface CreatePaymentResult {
  id: string;
  confirmationUrl: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const sdk = getYooKassa();
  const payment = await sdk.payments.create(
    {
      amount: { value: (input.amountRub * 100).toString(), currency: CurrencyEnum.RUB },
      confirmation: { type: 'redirect', return_url: `${siteUrl()}/orders/${input.orderNumber}`, locale: 'ru_RU' },
      capture: true,
      description: `Заказ #${input.orderNumber}`,
      metadata: { orderNumber: String(input.orderNumber) },
    },
    `order-${input.orderNumber}`,
  );
  return { id: payment.id, confirmationUrl: payment.confirmation.confirmation_url };
}

export async function cancelPayment(paymentId: string): Promise<void> {
  const sdk = getYooKassa();
  await sdk.payments.cancel(paymentId);
}
```
> `amount.value` — копейки строкой (`amountRub * 100`). `CurrencyEnum.RUB` — из SDK. Если у SDK сигнатура `payments.cancel` иная (требует idempotencyKey 2-м арг) — добавить `` `cancel-${paymentId}` `` вторым аргументом; проверить по типам пакета и поправить, тест на `cancel` подстроить под фактическую сигнатуру.

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/yookassa-lib.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/yookassa.ts stride-app/tests/yookassa-lib.test.ts
git commit -m "feat(stride-app): YooKassa createPayment/cancelPayment (rub->kopecks) + tests"
```

---

## Task 4: Расширить checkoutSchema на online

**Files:** Modify `services/dto/order.dto.ts`

- [ ] **Step 1: Заменить `paymentMethod`**

Найти строку:
```typescript
  paymentMethod: z.literal('cod'),
```
Заменить на:
```typescript
  paymentMethod: z.enum(['cod', 'online']),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок. (Существующий тест `place-order.test.ts` использует `paymentMethod: 'cod'` — остаётся валиден; кейс `'card'` всё ещё отвергается, т.к. не в enum.)

- [ ] **Step 3: Прогнать существующие order-тесты (регрессия)**

Run: `npx vitest run tests/place-order.test.ts tests/cancel-order.test.ts`
Expected: PASS (11 тестов; кейс `paymentMethod != cod` теперь означает `'card'` ∉ enum → по-прежнему отказ).

- [ ] **Step 4: Commit**

```bash
git add stride-app/services/dto/order.dto.ts
git commit -m "feat(stride-app): allow paymentMethod online in checkout schema"
```

---

## Task 5: placeOrder — ветка online — TDD

**Files:** Modify `app/actions/order.ts`; Create `tests/place-order-online.test.ts`

> Текущий `placeOrder` создаёт Order с `paymentMethod: 'cod'` хардкодом и возвращает `{ ok, orderNumber }`. Меняем: писать `form.paymentMethod`; после создания Order+OrderItem, если `online` — создать Payment через `createPayment`, вернуть `paymentUrl`. Сбой создания платежа → откат (удалить заказ + вернуть сток).

- [ ] **Step 1: Падающий тест — `tests/place-order-online.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn(async () => null) }));
vi.mock('@/lib/yookassa', () => ({ createPayment: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), delete: vi.fn() },
    orderItem: { create: vi.fn() },
    payment: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  },
}));

import { placeOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { createPayment } from '@/lib/yookassa';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;
const cartFindFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const variantFindUnique = prisma.productVariant.findUnique as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const orderCreate = prisma.order.create as unknown as ReturnType<typeof vi.fn>;
const orderDelete = prisma.order.delete as unknown as ReturnType<typeof vi.fn>;
const orderItemCreate = prisma.orderItem.create as unknown as ReturnType<typeof vi.fn>;
const paymentCreate = prisma.payment.create as unknown as ReturnType<typeof vi.fn>;
const cartItemDeleteMany = prisma.cartItem.deleteMany as unknown as ReturnType<typeof vi.fn>;
const createPaymentMock = createPayment as unknown as ReturnType<typeof vi.fn>;

const onlineForm = {
  contactName: 'Neo', contactPhone: '+79990000000', contactEmail: 'neo@e.test',
  shippingMethod: 'pickup', city: 'Москва', addressLine: 'Тверская 1', paymentMethod: 'online',
};

function variant(id: string, stock = 9) {
  return {
    id, sku: `SKU-${id}`, price: 5000, sizeEu: 42, stock, active: true,
    colorway: { name: 'Black', product: { name: `P-${id}`, slug: id, active: true }, images: [{ url: `/i/${id}.jpg` }] },
  };
}
function cartWith(...ids: string[]) {
  return {
    id: 'c1', token: 't', items: ids.map((id, n) => ({
      id: `ci${n}`, cartId: 'c1', productVariantId: id, quantity: 1, createdAt: new Date(0), productVariant: variant(id),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  cookiesMock.mockResolvedValue({ get: () => ({ value: 't' }) });
  variantFindUnique.mockResolvedValue({ stock: 9 });
  variantUpdate.mockResolvedValue({});
  cartItemDeleteMany.mockResolvedValue({ count: 1 });
  orderItemCreate.mockResolvedValue({});
  orderDelete.mockResolvedValue({});
  paymentCreate.mockResolvedValue({});
});

describe('placeOrder online', () => {
  it('успех — создаёт Payment и возвращает paymentUrl', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1025 });
    createPaymentMock.mockResolvedValue({ id: 'pay_1', confirmationUrl: 'https://yoo/redirect' });
    const r = await placeOrder(onlineForm);
    expect(r).toEqual({ ok: true, orderNumber: 1025, paymentUrl: 'https://yoo/redirect' });
    expect(createPaymentMock).toHaveBeenCalledWith({ orderNumber: 1025, amountRub: 5000 });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: { id: 'pay_1', orderId: 'o1', amount: 500000, confirmationUrl: 'https://yoo/redirect', status: 'pending' },
    });
    expect(cartItemDeleteMany).toHaveBeenCalledOnce();
  });

  it('сбой создания платежа — откат заказа и возврат стока', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1026 });
    createPaymentMock.mockRejectedValue(new Error('yoo down'));
    const r = await placeOrder(onlineForm);
    expect(r.ok).toBe(false);
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
    expect(cartItemDeleteMany).not.toHaveBeenCalled();
  });

  it('COD не трогает платёж', async () => {
    cartFindFirst.mockResolvedValue(cartWith('v1'));
    orderCreate.mockResolvedValue({ id: 'o1', orderNumber: 1027 });
    const r = await placeOrder({ ...onlineForm, paymentMethod: 'cod' });
    expect(r).toEqual({ ok: true, orderNumber: 1027 });
    expect(createPaymentMock).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/place-order-online.test.ts`
Expected: FAIL — `paymentUrl` не возвращается / `createPayment` не вызывается.

- [ ] **Step 3: Изменить `app/actions/order.ts`**

(a) Расширить тип результата:
```typescript
export type PlaceOrderResult = { ok: true; orderNumber: number; paymentUrl?: string } | { ok: false; error: string };
```
(b) Добавить импорт после строки `import { logger } from '@/lib/logger';`:
```typescript
import { createPayment } from '@/lib/yookassa';
```
(c) В `order.create({ data: { … paymentMethod: 'cod' … } })` заменить хардкод на форму:
```typescript
        paymentMethod: form.paymentMethod,
```
(d) Заменить финальный блок (очистка корзины + `return { ok: true, orderNumber }`) на: создание платежа для online ПЕРЕД очисткой корзины, затем очистка, затем возврат. То есть текущий хвост:
```typescript
  try {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await recalcCartTotalByToken(token);
  } catch (e) {
    logger.error('order_cart_cleanup_failed', e, { orderNumber });
  }

  return { ok: true, orderNumber };
}
```
заменить на:
```typescript
  let paymentUrl: string | undefined;
  if (form.paymentMethod === 'online') {
    try {
      const pay = await createPayment({ orderNumber, amountRub: totalAmount });
      await prisma.payment.create({
        data: { id: pay.id, orderId, amount: totalAmount * 100, confirmationUrl: pay.confirmationUrl, status: 'pending' },
      });
      paymentUrl = pay.confirmationUrl;
    } catch (e) {
      // Откат: удалить заказ (каскад уберёт OrderItem) + вернуть сток. Корзину НЕ чистим.
      try {
        await prisma.order.delete({ where: { id: orderId } });
      } catch (delErr) {
        logger.error('place_order_payment_rollback_failed', delErr, { orderId });
      }
      await restoreStock(decremented);
      logger.error('place_order_payment_failed', e, { orderId });
      return { ok: false, error: 'Не удалось создать платёж. Попробуйте позже' };
    }
  }

  try {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await recalcCartTotalByToken(token);
  } catch (e) {
    logger.error('order_cart_cleanup_failed', e, { orderNumber });
  }

  return { ok: true, orderNumber, paymentUrl };
}
```
> `amount: totalAmount * 100` — копейки (как в Payment.amount). `paymentUrl` остаётся `undefined` для COD → клиент делает обычный `router.push`.

- [ ] **Step 4: Запустить — GREEN (+ регрессия COD)**

Run: `npx vitest run tests/place-order-online.test.ts tests/place-order.test.ts`
Expected: PASS (3 + 7 тестов).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/app/actions/order.ts stride-app/tests/place-order-online.test.ts
git commit -m "feat(stride-app): placeOrder online branch (create Payment, return paymentUrl)"
```

---

## Task 6: Вебхук ЮKassa — TDD

**Files:** Create `app/api/yookassa/webhook/route.ts`, `tests/yookassa-webhook.test.ts`

- [ ] **Step 1: Падающий тест — `tests/yookassa-webhook.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const parseMock = vi.fn();
vi.mock('@webzaytsev/yookassa-ts-sdk', () => ({ parseNotification: parseMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    payment: { update: vi.fn(), findUnique: vi.fn() },
    order: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  },
}));

import { POST } from '@/app/api/yookassa/webhook/route';
import { prisma } from '@/lib/prisma-client';

const paymentUpdate = prisma.payment.update as unknown as ReturnType<typeof vi.fn>;
const paymentFindUnique = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdate = prisma.order.update as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;

function req() {
  return { json: async () => ({}) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  paymentUpdate.mockResolvedValue({});
  orderUpdate.mockResolvedValue({});
  variantUpdate.mockResolvedValue({});
});

describe('yookassa webhook', () => {
  it('payment.succeeded → Payment succeeded + Order PROCESSING', async () => {
    parseMock.mockReturnValue({ event: 'payment.succeeded', object: { id: 'pay_1' } });
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1' });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay_1' }, data: expect.objectContaining({ status: 'succeeded' }) }));
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'PROCESSING' } });
  });

  it('payment.canceled → Payment canceled + Order CANCELLED + возврат стока', async () => {
    parseMock.mockReturnValue({ event: 'payment.canceled', object: { id: 'pay_1' } });
    paymentFindUnique.mockResolvedValue({ id: 'pay_1', orderId: 'o1', order: { items: [{ productVariantId: 'v1', quantity: 2 }] } });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CANCELLED' } });
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
  });

  it('невалидный payload → 400', async () => {
    parseMock.mockImplementation(() => { throw new Error('bad'); });
    const res = await POST(req() as never);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/yookassa-webhook.test.ts`
Expected: FAIL — модуль роута не найден.

- [ ] **Step 3: Создать `app/api/yookassa/webhook/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { parseNotification } from '@webzaytsev/yookassa-ts-sdk';
import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let notification;
  try {
    const body = await req.json();
    notification = parseNotification(body);
  } catch (e) {
    logger.error('yookassa_webhook_parse_failed', e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (notification.event === 'payment.succeeded') {
      const id = notification.object.id;
      await prisma.payment.update({ where: { id }, data: { status: 'succeeded', paidAt: new Date() } });
      const payment = await prisma.payment.findUnique({ where: { id } });
      if (payment) {
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PROCESSING' } });
      }
    } else if (notification.event === 'payment.canceled') {
      const id = notification.object.id;
      await prisma.payment.update({ where: { id }, data: { status: 'canceled' } });
      const payment = await prisma.payment.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
      if (payment) {
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
        for (const item of payment.order.items) {
          try {
            await prisma.productVariant.update({ where: { id: item.productVariantId }, data: { stock: { increment: item.quantity } } });
          } catch (e) {
            logger.error('yookassa_webhook_stock_restore_failed', e, { variantId: item.productVariantId });
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('yookassa_webhook_failed', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/yookassa-webhook.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок. (Если `notification.object` типизирован строго и `.id` недоступен без сужения по `event` — привести через локальную переменную после проверки `event`; не использовать `any`, использовать сужение `if (notification.event === ...)`.)

- [ ] **Step 6: Commit**

```bash
git add "stride-app/app/api/yookassa/webhook/route.ts" stride-app/tests/yookassa-webhook.test.ts
git commit -m "feat(stride-app): YooKassa webhook (succeeded->PROCESSING, canceled->restock+CANCELLED)"
```

---

## Task 7: UI checkout-form online + return-страница

**Files:** Modify `components/shared/checkout/checkout-form.tsx`, `app/orders/[number]/page.tsx`

- [ ] **Step 1: checkout-form — активировать online radio + редирект**

В `components/shared/checkout/checkout-form.tsx`:

(a) `defaultValues`: заменить `paymentMethod: 'cod'` на `paymentMethod: 'online'`.

(b) В `onSubmit` заменить:
```tsx
    const res = await placeOrder(v);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/orders/${res.orderNumber}`);
    router.refresh();
```
на:
```tsx
    const res = await placeOrder(v);
    if (!res.ok) { setError(res.error); return; }
    if (res.paymentUrl) { window.location.href = res.paymentUrl; return; }
    router.push(`/orders/${res.orderNumber}`);
    router.refresh();
```

(c) Заменить секцию «Способ оплаты» — сделать online активным и первым:
```tsx
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display font-bold text-xl">Способ оплаты</h2>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="online" {...register('paymentMethod')} />
            <span className="flex-1"><span className="font-semibold">Картой онлайн</span><br /><span className="text-xs text-ink-muted">Visa, MasterCard, МИР</span></span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="cod" {...register('paymentMethod')} />
            <span className="flex-1"><span className="font-semibold">При получении</span><br /><span className="text-xs text-ink-muted">Наличными или картой курьеру</span></span>
          </label>
        </section>
```

- [ ] **Step 2: Order detail — статус платежа**

В `app/orders/[number]/page.tsx`:

(a) В запрос заказа добавить `payment` в include. Найти:
```tsx
  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true } });
```
заменить на:
```tsx
  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true, payment: true } });
```

(b) В блоке доставки/оплаты заменить строку `<p className="text-ink-muted">Оплата при получении</p>` на условный вывод (если в файле текст иной — найти аналогичную строку про оплату и заменить; если её нет, добавить перед закрытием блока с адресом):
```tsx
          <p className="text-ink-muted">
            {order.payment
              ? order.payment.status === 'succeeded'
                ? 'Оплачено онлайн'
                : order.payment.status === 'canceled'
                  ? 'Оплата отменена'
                  : 'Ожидание оплаты…'
              : 'Оплата при получении'}
          </p>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; маршруты `/checkout`, `/orders/[number]` собираются.

- [ ] **Step 4: Commit**

```bash
git add stride-app/components/shared/checkout/checkout-form.tsx "stride-app/app/orders/[number]/page.tsx"
git commit -m "feat(stride-app): enable online payment radio + external redirect + payment status on order page"
```

---

## Task 8: Отмена онлайн-заказа отменяет платёж

**Files:** Modify `app/actions/order.ts`; Modify `tests/cancel-order.test.ts`

> Сейчас `cancelOrder` проверяет PENDING, ставит CANCELLED, возвращает сток. Для online-заказа с `Payment.status==='pending'` нужно дополнительно отменить платёж в ЮKassa (best-effort).

- [ ] **Step 1: Обновить тест `tests/cancel-order.test.ts`**

(a) Добавить мок yookassa после остальных `vi.mock`:
```typescript
vi.mock('@/lib/yookassa', () => ({ cancelPayment: vi.fn() }));
```
(b) Добавить в include-мок `payment` в `pendingOrder` и хэндл. Заменить функцию `pendingOrder` на:
```typescript
function pendingOrder() {
  return {
    id: 'o1', orderNumber: 1025, userId: 'u1', status: 'PENDING',
    payment: null,
    items: [{ productVariantId: 'v1', quantity: 2 }, { productVariantId: 'v2', quantity: 1 }],
  };
}
```
(c) Добавить импорт и хэндл вверху (после `import { prisma }`):
```typescript
import { cancelPayment } from '@/lib/yookassa';
const cancelPaymentMock = cancelPayment as unknown as ReturnType<typeof vi.fn>;
```
(d) В `beforeEach` добавить: `cancelPaymentMock.mockResolvedValue(undefined);`
(e) Добавить новый кейс в `describe`:
```typescript
  it('online-заказ с pending-платежом — отменяет платёж в ЮKassa', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), payment: { id: 'pay_1', status: 'pending' } });
    const r = await cancelOrder('o1');
    expect(r).toEqual({ ok: true });
    expect(cancelPaymentMock).toHaveBeenCalledWith('pay_1');
    expect(variantUpdate).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/cancel-order.test.ts`
Expected: FAIL — `cancelPayment` не вызывается (+ возможно include payment).

- [ ] **Step 3: Изменить `cancelOrder` в `app/actions/order.ts`**

(a) Добавить импорт после `import { createPayment } from '@/lib/yookassa';`:
```typescript
import { cancelPayment } from '@/lib/yookassa';
```
(или объединить: `import { createPayment, cancelPayment } from '@/lib/yookassa';`)

(b) В `cancelOrder` добавить `payment` в include:
```typescript
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payment: true } });
```
(c) После перевода статуса в CANCELLED (`await prisma.order.update(... CANCELLED ...)`), ПЕРЕД циклом возврата стока, добавить:
```typescript
  // Online-заказ: отменить платёж в ЮKassa (best-effort; если уже succeeded — API ответит ошибкой, логируем).
  if (order.payment && order.payment.status === 'pending') {
    try {
      await cancelPayment(order.payment.id);
    } catch (e) {
      logger.error('cancel_payment_failed', e, { orderId, paymentId: order.payment.id });
    }
  }
```

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/cancel-order.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/app/actions/order.ts stride-app/tests/cancel-order.test.ts
git commit -m "feat(stride-app): cancel YooKassa payment when cancelling pending online order"
```

---

## Task 9: DaData прокси-роут

**Files:** Create `app/api/dadata/suggest/route.ts`

- [ ] **Step 1: Создать `app/api/dadata/suggest/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = process.env.DADATA_TOKEN;
  if (!token) return NextResponse.json({ suggestions: [] });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') return NextResponse.json({ suggestions: [] });

    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count: 5, language: 'ru' }),
    });
    if (!res.ok) {
      logger.error('dadata_suggest_upstream_failed', new Error(`status ${res.status}`));
      return NextResponse.json({ suggestions: [] });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    logger.error('dadata_suggest_failed', e);
    return NextResponse.json({ suggestions: [] });
  }
}
```
> Fail-open: любая ошибка / нет токена → пустой массив (форма работает без подсказок).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; маршрут `/api/dadata/suggest` собирается.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/api/dadata/suggest/route.ts"
git commit -m "feat(stride-app): DaData address suggest proxy (fail-open)"
```

---

## Task 10: DaData компонент автоподсказок

**Files:** Create `components/shared/checkout/address-suggest.tsx`; Modify `components/shared/checkout/checkout-form.tsx`

> Компонент использует `useFormContext` (RHF) для `setValue`. Текущая `checkout-form.tsx` использует `useForm` напрямую — нужно обернуть форму в `<FormProvider>`, чтобы дочерний компонент достал контекст.

- [ ] **Step 1: Создать `components/shared/checkout/address-suggest.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CheckoutValues } from '@/services/dto/order.dto';

interface Suggestion {
  value: string;
  data: { city: string | null; street_with_type: string | null; house: string | null };
}

export function AddressSuggest() {
  const { setValue, watch } = useFormContext<CheckoutValues>();
  const city = watch('city');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const skip = useRef(false); // не дёргать API сразу после выбора подсказки

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!city || city.trim().length < 2) { setItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/dadata/suggest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: city }),
        });
        const data = await res.json();
        setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
        setOpen(true);
      } catch { setItems([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [city]);

  if (!open || items.length === 0) return null;

  const pick = (s: Suggestion) => {
    skip.current = true;
    setValue('city', s.data.city ?? s.value);
    const line = [s.data.street_with_type, s.data.house].filter(Boolean).join(', ');
    if (line) setValue('addressLine', line);
    setItems([]);
    setOpen(false);
  };

  return (
    <ul className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-surface shadow-lg max-h-60 overflow-auto">
      {items.map((s, i) => (
        <li key={i}>
          <button type="button" onClick={() => pick(s)} className="block w-full text-left px-3 py-2 text-sm hover:bg-surface-soft">
            {s.value}
          </button>
        </li>
      ))}
    </ul>
  );
}
```
> Поля DaData: `data.city`, `data.street_with_type`, `data.house` — стандартный ответ DaData address API. `skip` гасит повторный запрос после программного `setValue('city')`.

- [ ] **Step 2: Обернуть форму в FormProvider + вставить компонент**

В `components/shared/checkout/checkout-form.tsx`:

(a) Импорт — добавить `FormProvider` и `AddressSuggest`:
```tsx
import { useForm, FormProvider } from 'react-hook-form';
import { AddressSuggest } from './address-suggest';
```
(b) Извлечь весь объект методов формы (сейчас деструктурируется). Заменить:
```tsx
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<CheckoutValues>({
```
на:
```tsx
  const methods = useForm<CheckoutValues>({
```
и сразу после — деструктуризацию для локального использования:
```tsx
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = methods;
```
(c) Обернуть возвращаемый `<form>` в `<FormProvider {...methods}>...</FormProvider>`. Найти `return (` с `<form onSubmit={...}` и обернуть весь `<form>...</form>`:
```tsx
  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8" noValidate>
        {/* ...существующее содержимое без изменений... */}
      </form>
    </FormProvider>
  );
```
(d) В секции «Адрес доставки», обернуть поле «Город» в относительный контейнер и добавить `<AddressSuggest />`. Найти div с label «Город» и `<Input id="city" ... />`, заменить на:
```tsx
          <div className="relative">
            <label className="block text-sm font-medium mb-1" htmlFor="city">Город</label>
            <Input id="city" autoComplete="off" {...register('city')} />
            <AddressSuggest />
            {errors.city && <p className="text-danger text-xs mt-1">{errors.city.message}</p>}
          </div>
```
> `autoComplete="off"` — чтобы браузерный автокомплит не перекрывал список DaData. `AddressSuggest` рендерит выпадающий список абсолютно внутри `relative`-контейнера.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; `/checkout` собирается.

- [ ] **Step 4: Commit**

```bash
git add stride-app/components/shared/checkout/address-suggest.tsx stride-app/components/shared/checkout/checkout-form.tsx
git commit -m "feat(stride-app): DaData address autocomplete in checkout (FormProvider + suggest dropdown)"
```

---

## Task 11: E2E + env-доки

**Files:** Create `e2e/yookassa.spec.ts`; Modify `.env.example` (если есть) и `e2e/a11y.spec.ts`

> Полный sandbox-платёж требует взаимодействия с формой ЮKassa — нестабильно в CI. Тестируем то, что детерминированно: COD-регрессия, выбор online ведёт на внешний редирект, вебхук обновляет заказ.

- [ ] **Step 1: `e2e/yookassa.spec.ts`**

```typescript
import { test, expect, type Page } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

async function registerAndLogin(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

async function addSeedProductToCart(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

async function fillCheckout(page: Page) {
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
}

test('COD-заказ по-прежнему работает (регрессия)', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('radio', { name: /При получении/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await expect(page.getByText('Оплата при получении')).toBeVisible();
});

test('онлайн-оплата ведёт на внешний редирект ЮKassa', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('radio', { name: /Картой онлайн/ }).check();
  // Клик уводит на внешний домен ЮKassa (yoomoney/yookassa). Проверяем уход с /checkout.
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await page.waitForURL(/yoo(money|kassa)\.ru|3ds|yookassa/i, { timeout: 30000 }).catch(() => {});
  await expect(page).not.toHaveURL(/\/checkout$/);
});
```
> Второй тест мягкий: при настроенном sandbox клик уводит на домен ЮKassa; ассертим только уход с `/checkout`. Если sandbox-ключи в CI не заданы — `placeOrder` вернёт ошибку «Не удалось создать платёж» и тест на редирект не пройдёт; в этом случае помечать тест `test.skip` при отсутствии env (см. Step 2).

- [ ] **Step 2: Гейтить online-тест на наличие env**

В начале `e2e/yookassa.spec.ts` добавить условный skip для online-теста (COD-тест всегда идёт):
```typescript
const hasYooKassa = !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY;
```
И заменить `test('онлайн-оплата ...'` на `(hasYooKassa ? test : test.skip)('онлайн-оплата ...'`.
> Так online-e2e гоняется только когда sandbox-ключи заданы в CI env; иначе пропускается (не ложно-красный).

- [ ] **Step 3: Дополнить `.env.example` (если файл существует)**

Если в `stride-app/` есть `.env.example` — дописать:
```bash
# YooKassa (Фаза 2.1b)
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
# DaData address autocomplete
DADATA_TOKEN=
# Полный URL сайта для return_url платежа
NEXT_PUBLIC_SITE_URL=
```
Если `.env.example` нет — пропустить (env задаются в Vercel).

- [ ] **Step 4: Прогон e2e (ожидаемо зелёные в CI)**

Run: `npx playwright test e2e/yookassa.spec.ts --list`
Expected: тесты парсятся без ошибок. (Полный прогон — в CI; локально допускается флак/skip.)

- [ ] **Step 5: Commit**

```bash
git add stride-app/e2e/yookassa.spec.ts
git commit -m "test(stride-app): e2e for COD regression + online redirect (env-gated)"
```

---

## Task 12: Финальная сверка и завершение слайса

**Files:** (проверки + отметки)

- [ ] **Step 1: Полная локальная проверка**

Run из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest все зелёные (yookassa-lib, place-order-online, yookassa-webhook, cancel-order, place-order + прежние); build OK; маршруты `/api/yookassa/webhook`, `/api/dadata/suggest` присутствуют; middleware ~86 kB.

- [ ] **Step 2: Чек-лист готовности (§9 спеки)**

- [ ] COD-флоу не сломан (регрессия).
- [ ] Онлайн-заказ: Order + Payment, возврат paymentUrl, сток списан.
- [ ] Вебхук succeeded → PROCESSING; canceled → возврат стока + CANCELLED.
- [ ] DaData: подсказки при наличии токена; без токена не мешает.
- [ ] «Картой онлайн» активен и первый; «При получении» работает.
- [ ] Отмена online-заказа с pending-платежом отменяет платёж + возвращает сток.
- [ ] e2e зелёные в CI.

- [ ] **Step 3: Операционные предусловия пользователя (env в Vercel)**

Задать в Vercel (Production + Preview) ДО мержа/деплоя: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `DADATA_TOKEN`, `NEXT_PUBLIC_SITE_URL`. Зарегистрировать webhook-URL `https://<site>/api/yookassa/webhook` в личном кабинете ЮKassa (события `payment.succeeded`, `payment.canceled`).

- [ ] **Step 4: Отметить spec реализованным**

В `docs/superpowers/specs/2026-06-04-stride-phase2.1b-yookassa-dadata-design.md` сменить «**Статус:** на ревью» → «**Статус:** реализовано (P2.1b)».
```bash
git add docs/superpowers/specs/2026-06-04-stride-phase2.1b-yookassa-dadata-design.md
git commit -m "docs: mark Phase 2.1b spec implemented"
```

- [ ] **Step 5: Завершение ветки**

`superpowers:finishing-a-development-branch` (после зелёного CI). PR `feat/phase2.1b-yookassa` → `main`. При мерже прод-build применит `Payment` к прод-Neon. **Env ЮKassa/DaData должны быть в Vercel ДО мержа.** НЕ удалять ветку до подтверждения прод-оплаты.

---

## Self-Review (против спеки `2026-06-04-stride-phase2.1b-yookassa-dadata-design.md`)

**1. Покрытие требований:**

| Раздел спеки | Задача |
|---|---|
| §3 Модель Payment + Order.payment | Task 1 |
| §3 DTO paymentMethod enum | Task 4 |
| §4 placeOrder online (Payment, paymentUrl, откат) | Task 5 |
| §4 деньги ₽→копейки (×100) | Task 3 (createPayment), Task 5 (Payment.amount) |
| §5 вебхук succeeded/canceled + возврат стока | Task 6 |
| §5 DaData прокси | Task 9 |
| §6 UI online radio + редирект | Task 7 |
| §6 статус платежа на /orders | Task 7 |
| §6 отмена online-заказа отменяет платёж | Task 8 |
| §6 DaData компонент | Task 10 |
| §7 конфиг/env + ленивый SDK | Task 2, Task 11 (env-доки), Task 12 (Vercel) |
| §8 тесты | Tasks 3, 5, 6, 8, 11 |
| §9 критерии | Task 12 |

**2. Плейсхолдеры:** код приведён в каждом шаге; нет TODO/«similar to». Места с «проверить фактическую сигнатуру SDK» (Task 2 импорт, Task 3 cancel, Task 6 сужение типа) — явные инструкции на случай расхождения с типами пакета, не пропуски.

**3. Консистентность типов:** `createPayment({orderNumber, amountRub})→{id, confirmationUrl}` (T3) ↔ вызов в T5. `cancelPayment(id)` (T3) ↔ T8. `Payment.amount` в копейках (`totalAmount*100`) — T5 и тест. `PlaceOrderResult.paymentUrl?` (T5) ↔ checkout-form `res.paymentUrl` (T7). `CheckoutValues.paymentMethod ∈ {cod,online}` (T4) ↔ форма (T7) и placeOrder (T5). Вебхук `payment.findUnique`/`order.update`/`productVariant.update` (T6) — одиночные операции (Neon HTTP safe). DaData `useFormContext<CheckoutValues>` (T10) ↔ FormProvider (T10).

**Зафиксированные допущения:** только redirect (без виджета/QR); чеки 54-ФЗ и refund-API — позже; `$executeRaw`/`updateMany` не используются (P9); возврат стока в вебхуке — per-item update increment; DaData fail-open.

---

## Ручная проверка на preview (после деплоя ветки)

> Гоняется на **preview-деплое** ветки (не локально — Neon-латентность + локальный db push заблокирован, P1/P4). Сначала убедись, что **preview build зелёный** в Vercel (build применяет `db push` → таблица `Payment` в preview-Neon-ветке). Нужны env в Vercel Preview: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` (**test_**-ключ sandbox), `DADATA_TOKEN`, `NEXT_PUBLIC_SITE_URL` (или сработает фолбэк на `VERCEL_URL`). Webhook-URL `https://<preview>/api/yookassa/webhook` зарегистрирован в кабинете ЮKassa (sandbox).

### Шаг 0 — предусловия
- [ ] Vercel → деплой ветки `feat/phase2.1b-yookassa` → build **зелёный** (в логе есть `prisma db push` / `in sync`).
- [ ] В Vercel Preview заданы 4 env (см. выше).
- [ ] В кабинете ЮKassa (sandbox) webhook на `payment.succeeded` и `payment.canceled` → `https://<preview-url>/api/yookassa/webhook`.
- [ ] Войти на preview под своим аккаунтом (auth уже в проде с P2.0).

### A. Онлайн-оплата (главный путь)
1. [ ] Товар → корзина → «Оформить заказ» → `/checkout`. **«Картой онлайн» выбрана по умолчанию** (первая).
2. [ ] Заполнить контакты/адрес, оставить «Картой онлайн» → «Оформить заказ →».
3. [ ] **Редирект на домен ЮKassa** (yoomoney.ru/yookassa). Сток уже списан (проверь каталог в другой вкладке — остаток −1).
4. [ ] Оплатить **тестовой картой sandbox**: `5555 5555 5555 4477`, любой будущий срок, CVC любой (3 цифры). (Карты sandbox — в доке ЮKassa; эта — успешная оплата.)
5. [ ] Редирект обратно на `/orders/<N>`. Через 1–3 сек (вебхук) — статус **«Оплачено онлайн»**, заказ **«Обрабатывается»** (PROCESSING).
6. [ ] Профиль → «Мои заказы» → заказ виден со статусом «Обрабатывается».

### B. Онлайн-оплата отменена/не завершена
1. [ ] Оформить онлайн-заказ → на странице ЮKassa **отменить/закрыть** оплату (или тестовая карта отказа `5555 5555 5555 4444`).
2. [ ] Сток был списан при оформлении. После вебхука `payment.canceled` (или ручной отмены заказа) — **сток возвращается**, заказ «Отменён».
3. [ ] Проверь каталог: остаток вернулся к исходному.

### C. Отмена pending-онлайн-заказа пользователем
1. [ ] Оформить онлайн-заказ, но **не оплачивать** — вернуться на сайт (заказ PENDING, платёж pending).
2. [ ] На `/orders/<N>` → «Отменить заказ» → подтвердить.
3. [ ] Статус «Отменён», сток вернулся. (Платёж в ЮKassa тоже отменён — в кабинете sandbox статус canceled.)

### D. COD не сломан (регрессия)
1. [ ] Оформить заказ, выбрав **«При получении»**.
2. [ ] Сразу редирект на `/orders/<N>` (без ЮKassa), статус «Оформлен», «Оплата при получении». Сток списан.

### E. DaData автоподсказки
1. [ ] На `/checkout` в поле **Город** начать вводить (напр. «Моск») → через ~0.3 сек выпадающий список подсказок.
2. [ ] Клик по подсказке → Город заполнен, Улица/дом — подставлены (если были в подсказке).
3. [ ] Если `DADATA_TOKEN` не задан — поле работает как обычный ввод (подсказок нет, оформление не блокируется).

### F. Защита (без изменений с P2.1a)
1. [ ] Инкогнито → `/checkout` → редирект `/login`.
2. [ ] Чужой `/orders/<N>` → 404.

### На что смотреть в логах при сбое
- Платёж не создаётся → лог `place_order_payment_failed` (проверь env ЮKassa в Vercel).
- Статус заказа не меняется после оплаты → вебхук не доходит: проверь webhook-URL в кабинете ЮKassa и лог `yookassa_webhook_*`.
- Подсказки не появляются → `dadata_suggest_*` в логах / нет `DADATA_TOKEN`.
