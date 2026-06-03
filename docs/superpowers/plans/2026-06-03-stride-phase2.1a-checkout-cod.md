# STRIDE — Фаза 2.1a (Checkout COD + Orders): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сквозное оформление заказа с оплатой при получении (COD): `/cart` → `/checkout` → создание `Order` со списанием стока → `/orders/[number]` → история в профиле, с возможностью отмены PENDING-заказа.

**Architecture:** Модели `Order`/`OrderItem` (+enum `OrderStatus`) со снапшотами цен/SKU/адреса. Оформление — Server Action `placeOrder` (декремент стока условным `updateMany` + ручная компенсация, без `$transaction` — Neon HTTP). Отмена — Server Action `cancelOrder` с замком `updateMany(status:PENDING)` и возвратом стока. UI — RSC `/checkout` (по прототипу `checkout.html`) + клиентская форма на RHF/zod; история — наполнение вкладки «Мои заказы».

**Tech Stack:** Next 15.1 (App Router, RSC, Server Actions), Prisma 6.19 + `@prisma/adapter-neon` (Neon HTTP), Auth.js v5 (сессия в RSC через `auth()`), Zod, React Hook Form, Vitest, Playwright (+axe). Спека: `docs/superpowers/specs/2026-06-03-stride-phase2.1a-checkout-cod-design.md`. Ветка: `feat/phase2.1-checkout`.

---

## Соглашения этого плана

1. **Все пути — от `stride-app/`**, команды — из `stride-app/`. Коммиты — английский conventional-commits, **без `Co-Authored-By`**, единственный автор `ui-ux-promax`.
2. **Neon HTTP: НЕТ `$transaction`.** Мультизаписи — последовательные `await` + условные `updateMany`/`update` + ручная компенсация. Гонки — через условие в `WHERE` (`status:'PENDING'`, `stock:{gte}`), не find-then-update. `retryOnTransient` уже встроен в `prisma`.
3. **Деньги — `Int` ₽.** Не трогаем money-логику Фазы 1.
4. **Только вошедшие:** `/checkout`, `/orders` — под middleware; `Order.userId` обязателен.
5. **TDD** для чистой логики (`calcShipping`, `buildOrderSnapshot`) и server-actions с мок-Prisma (как `tests/register-user.test.ts`): RED → GREEN → commit.
6. **e2e только в CI (Ubuntu)** — локально флак из-за Neon (TROUBLESHOOTING P4). Локально: `typecheck` + `vitest` + `build`.
7. **Схему применяет деплой/CI** автоматически (`prisma db push` в `vercel.json` и `e2e.yml`) — отдельно настраивать не нужно. Локально `prisma:push` — против своей dev-ветки Neon.

---

## Структура файлов

```
stride-app/
├─ prisma/schema.prisma                         # +Order +OrderItem +OrderStatus, User.orders, ProductVariant.orderItems (T1)
├─ constants/config.ts                           # +SHIPPING_FLAT (T2)
├─ lib/order.ts                                  # calcShipping, buildOrderSnapshot, ORDER_STATUS_META (T2,T3)
├─ lib/cart-details.ts                           # cartInclude: +product.active в select (T4)
├─ services/dto/order.dto.ts                     # checkoutSchema (T4)
├─ app/actions/order.ts                          # placeOrder (T5), cancelOrder (T6)
├─ middleware.ts                                 # matcher +/checkout +/orders (T7)
├─ auth.config.ts                                # authorized: +/checkout +/orders (T7)
├─ app/checkout/page.tsx                         # RSC checkout (T8)
├─ components/shared/checkout/checkout-form.tsx  # клиентская форма + сводка (T8)
├─ app/orders/[number]/page.tsx                  # RSC деталь/подтверждение (T9)
├─ components/shared/orders/cancel-order-button.tsx # клиентская кнопка отмены (T9)
├─ components/shared/orders/order-status-badge.tsx  # бейдж статуса (T9)
├─ components/shared/profile/orders-list.tsx     # список заказов (T10)
├─ components/shared/profile/profile-view.tsx    # вкладка «Мои заказы» → реальные (T10)
├─ app/profile/page.tsx                          # грузит заказы в RSC (T10)
├─ components/shared/cart/order-summary.tsx      # кнопка → Link /checkout (T11)
├─ tests/order-shipping.test.ts                  # calcShipping (T3)
├─ tests/order-snapshot.test.ts                  # buildOrderSnapshot (T3)
├─ tests/place-order.test.ts                     # placeOrder (T5)
├─ tests/cancel-order.test.ts                    # cancelOrder (T6)
└─ e2e/checkout.spec.ts                          # сквозной e2e (T12)
```

---

## Task 1: Схема — Order / OrderItem / OrderStatus

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Добавить enum и модели в конец `schema.prisma`**

```prisma
enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

model Order {
  id             String      @id @default(cuid())
  orderNumber    Int         @unique @default(autoincrement())
  userId         String
  user           User        @relation(fields: [userId], references: [id])
  status         OrderStatus @default(PENDING)

  contactName    String
  contactPhone   String
  contactEmail   String

  shippingMethod String
  city           String
  addressLine    String
  addressComment String?

  itemsTotal     Int
  shippingAmount Int
  totalAmount    Int

  paymentMethod  String

  items          OrderItem[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@index([userId, createdAt])
  @@index([status])
}

model OrderItem {
  id               String         @id @default(cuid())
  orderId          String
  order            Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productVariantId String
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id])

  sku          String
  productName  String
  colorwayName String
  sizeEu       String
  imageUrl     String?
  unitPrice    Int
  quantity     Int
  lineTotal    Int

  @@index([orderId])
}
```

- [ ] **Step 2: Добавить relation-поля в существующие модели**

В `model User { ... }` добавить (рядом с `accounts`/`carts`):
```prisma
  orders        Order[]
```
В `model ProductVariant { ... }` добавить (рядом с `cartItems`):
```prisma
  orderItems     OrderItem[]
```

- [ ] **Step 3: Генерация клиента**

Run: `npm run prisma:generate`
Expected: `Generated Prisma Client` без ошибок; в типах появляются `Order`, `OrderItem`, `OrderStatus`.

- [ ] **Step 4: Применить схему к dev-ветке Neon**

Run: `npm run prisma:push`
Expected: `Your database is now in sync with your Prisma schema`; создаются таблицы `Order`, `OrderItem`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add stride-app/prisma/schema.prisma
git commit -m "feat(stride-app): order schema (Order/OrderItem/OrderStatus + relations)"
```

---

## Task 2: Конфиг-константа доставки

**Files:** Modify `constants/config.ts`

- [ ] **Step 1: Добавить `SHIPPING_FLAT` (тот же стиль — individual export const)**

После строки `export const FREE_SHIPPING_THRESHOLD = 10_000;` добавить:
```typescript
export const SHIPPING_FLAT = 500; // ₽, курьер ниже порога бесплатной доставки
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add stride-app/constants/config.ts
git commit -m "feat(stride-app): SHIPPING_FLAT delivery constant"
```

---

## Task 3: Чистая логика заказа (`lib/order.ts`) — TDD

**Files:** Create `lib/order.ts`, `tests/order-shipping.test.ts`, `tests/order-snapshot.test.ts`

- [ ] **Step 1: Падающий тест доставки — `tests/order-shipping.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { calcShipping } from '@/lib/order';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT } from '@/constants/config';

describe('calcShipping', () => {
  it('самовывоз — всегда 0', () => {
    expect(calcShipping(0, 'pickup')).toBe(0);
    expect(calcShipping(FREE_SHIPPING_THRESHOLD + 1, 'pickup')).toBe(0);
  });
  it('курьер ниже порога — флэт-ставка', () => {
    expect(calcShipping(FREE_SHIPPING_THRESHOLD - 1, 'courier')).toBe(SHIPPING_FLAT);
    expect(calcShipping(0, 'courier')).toBe(SHIPPING_FLAT);
  });
  it('курьер на пороге и выше — бесплатно', () => {
    expect(calcShipping(FREE_SHIPPING_THRESHOLD, 'courier')).toBe(0);
    expect(calcShipping(FREE_SHIPPING_THRESHOLD + 1000, 'courier')).toBe(0);
  });
});
```

- [ ] **Step 2: Падающий тест снапшота — `tests/order-snapshot.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildOrderSnapshot } from '@/lib/order';
import type { CartWithItems } from '@/lib/cart-details';

// Минимальный CartWithItems-литерал (only-нужные поля), приведённый к типу.
function fakeCart(): CartWithItems {
  return {
    id: 'c1', token: 't', userId: 'u1', totalAmount: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
    items: [
      {
        id: 'ci1', cartId: 'c1', productVariantId: 'v1', quantity: 2, createdAt: new Date(0),
        productVariant: {
          id: 'v1', sku: 'SKU-1', price: 5000, sizeEu: 42.5, stock: 9, active: true,
          colorway: {
            name: 'Black', product: { name: 'Velocity Trail', slug: 'velocity-trail', active: true },
            images: [{ url: '/img/1.jpg' }],
          },
        },
      },
    ],
  } as unknown as CartWithItems;
}

describe('buildOrderSnapshot', () => {
  it('строит снапшот позиций и считает itemsTotal', () => {
    const snap = buildOrderSnapshot(fakeCart());
    expect(snap.itemsTotal).toBe(10000);
    expect(snap.items).toEqual([
      {
        productVariantId: 'v1', sku: 'SKU-1', productName: 'Velocity Trail', colorwayName: 'Black',
        sizeEu: '42.5', imageUrl: '/img/1.jpg', unitPrice: 5000, quantity: 2, lineTotal: 10000,
      },
    ]);
  });
});
```

- [ ] **Step 3: Запустить — RED**

Run: `npx vitest run tests/order-shipping.test.ts tests/order-snapshot.test.ts`
Expected: FAIL — `Cannot find module '@/lib/order'`.

- [ ] **Step 4: Реализовать `lib/order.ts`**

```typescript
import type { CartWithItems } from '@/lib/cart-details';
import { calcLineTotal } from '@/lib/cart-details';
import { normalizeSize } from '@/lib/format';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT } from '@/constants/config';

export type ShippingMethod = 'courier' | 'pickup';

export function calcShipping(itemsTotal: number, method: ShippingMethod): number {
  if (method === 'pickup') return 0;
  return itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
}

export interface OrderItemSnapshot {
  productVariantId: string;
  sku: string;
  productName: string;
  colorwayName: string;
  sizeEu: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderSnapshot {
  items: OrderItemSnapshot[];
  itemsTotal: number;
}

export function buildOrderSnapshot(cart: CartWithItems): OrderSnapshot {
  const items: OrderItemSnapshot[] = cart.items.map((i) => {
    const v = i.productVariant;
    const unitPrice = v.price;
    return {
      productVariantId: v.id,
      sku: v.sku,
      productName: v.colorway.product.name,
      colorwayName: v.colorway.name,
      sizeEu: normalizeSize(v.sizeEu),
      imageUrl: v.colorway.images[0]?.url ?? null,
      unitPrice,
      quantity: i.quantity,
      lineTotal: calcLineTotal(unitPrice, i.quantity),
    };
  });
  const itemsTotal = items.reduce((acc, it) => acc + it.lineTotal, 0);
  return { items, itemsTotal };
}

// Метаданные статусов для UI (label + классы бейджа из дизайн-системы).
export const ORDER_STATUS_META: Record<
  'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
  { label: string; badge: string }
> = {
  PENDING: { label: 'Оформлен', badge: 'badge-info' },
  PROCESSING: { label: 'Обрабатывается', badge: 'badge-warning' },
  SHIPPED: { label: 'В пути', badge: 'badge-info' },
  DELIVERED: { label: 'Доставлен', badge: 'badge-success' },
  CANCELLED: { label: 'Отменён', badge: 'badge-danger' },
};
```

- [ ] **Step 5: Запустить — GREEN**

Run: `npx vitest run tests/order-shipping.test.ts tests/order-snapshot.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/order.ts stride-app/tests/order-shipping.test.ts stride-app/tests/order-snapshot.test.ts
git commit -m "feat(stride-app): order pure logic (calcShipping, buildOrderSnapshot, status meta) + tests"
```

---

## Task 4: Checkout DTO + `product.active` в cartInclude

**Files:** Create `services/dto/order.dto.ts`; Modify `lib/cart-details.ts`

- [ ] **Step 1: Создать `services/dto/order.dto.ts`**

```typescript
import { z } from 'zod';

export const checkoutSchema = z.object({
  contactName: z.string().trim().min(1, 'Укажите имя').max(80),
  contactPhone: z.string().trim().min(5, 'Укажите телефон').max(20),
  contactEmail: z.string().trim().email('Некорректный email'),
  shippingMethod: z.enum(['courier', 'pickup']),
  city: z.string().trim().min(1, 'Укажите город').max(100),
  addressLine: z.string().trim().min(1, 'Укажите адрес').max(200),
  addressComment: z.string().trim().max(300).optional(),
  paymentMethod: z.literal('cod'),
});
export type CheckoutValues = z.infer<typeof checkoutSchema>;
```

- [ ] **Step 2: Добавить `active` в product-select внутри `cartInclude` (`lib/cart-details.ts`)**

Найти в `cartInclude` строку `product: { select: { name: true, slug: true } },` и заменить на:
```typescript
              product: { select: { name: true, slug: true, active: true } },
```
> Нужно `placeOrder`-у для проверки активности товара. Добавление поля в select не ломает существующих потребителей.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add stride-app/services/dto/order.dto.ts stride-app/lib/cart-details.ts
git commit -m "feat(stride-app): checkout DTO + expose product.active in cartInclude"
```

---

## Task 5: `placeOrder` Server Action — TDD

**Files:** Create `app/actions/order.ts`, `tests/place-order.test.ts`

- [ ] **Step 1: Падающий тест — `tests/place-order.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn(async () => null) }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    cart: { findFirst: vi.fn() },
    productVariant: { updateMany: vi.fn(), update: vi.fn() },
    order: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  },
}));

import { placeOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.cart.findFirst as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.productVariant.updateMany as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;
const orderCreate = prisma.order.create as unknown as ReturnType<typeof vi.fn>;
const cartItemDeleteMany = prisma.cartItem.deleteMany as unknown as ReturnType<typeof vi.fn>;

const validForm = {
  contactName: 'Neo', contactPhone: '+79990000000', contactEmail: 'neo@e.test',
  shippingMethod: 'pickup', city: 'Москва', addressLine: 'Тверская 1', paymentMethod: 'cod',
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
  variantUpdate.mockResolvedValue({});
  cartItemDeleteMany.mockResolvedValue({ count: 1 });
});

describe('placeOrder', () => {
  it('успех — декремент, создание заказа, очистка корзины', async () => {
    findFirst.mockResolvedValue(cartWith('v1'));
    updateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockResolvedValue({ orderNumber: 1025 });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: true, orderNumber: 1025 });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(orderCreate).toHaveBeenCalledOnce();
    expect(cartItemDeleteMany).toHaveBeenCalledOnce();
  });

  it('нехватка на 2-й позиции — компенсация 1-й, заказ НЕ создан', async () => {
    findFirst.mockResolvedValue(cartWith('v1', 'v2'));
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('сбой order.create — компенсация всех декрементов', async () => {
    findFirst.mockResolvedValue(cartWith('v1', 'v2'));
    updateMany.mockResolvedValue({ count: 1 });
    orderCreate.mockRejectedValue(new Error('db down'));
    const r = await placeOrder(validForm);
    expect(r.ok).toBe(false);
    expect(variantUpdate).toHaveBeenCalledTimes(2);
  });

  it('пустая корзина — ошибка, без записи', async () => {
    findFirst.mockResolvedValue({ id: 'c1', token: 't', items: [] });
    const r = await placeOrder(validForm);
    expect(r).toEqual({ ok: false, error: 'Корзина пуста' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('paymentMethod != cod — отказ', async () => {
    const r = await placeOrder({ ...validForm, paymentMethod: 'card' });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/place-order.test.ts`
Expected: FAIL — `Cannot find module '@/app/actions/order'`.

- [ ] **Step 3: Реализовать `app/actions/order.ts` (часть `placeOrder`)**

```typescript
'use server';

import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { cartInclude } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { recalcCartTotalByToken } from '@/lib/cart';
import { checkoutSchema } from '@/services/dto/order.dto';
import { buildOrderSnapshot, calcShipping } from '@/lib/order';
import { logger } from '@/lib/logger';

export type PlaceOrderResult = { ok: true; orderNumber: number } | { ok: false; error: string };

async function restoreStock(items: { id: string; qty: number }[]): Promise<void> {
  for (const it of items) {
    try {
      await prisma.productVariant.update({ where: { id: it.id }, data: { stock: { increment: it.qty } } });
    } catch (e) {
      logger.error('place_order_stock_restore_failed', e, { variantId: it.id });
    }
  }
}

export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };
  const userId = session.user.id;

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };
  const form = parsed.data;

  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  if (!token) return { ok: false, error: 'Корзина пуста' };

  const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
  if (!cart || cart.items.length === 0) return { ok: false, error: 'Корзина пуста' };

  // Все позиции активны на момент оформления (иначе отказ, без списания).
  const inactive = cart.items.find(
    (i) => !i.productVariant.active || !i.productVariant.colorway.product.active,
  );
  if (inactive) {
    return {
      ok: false,
      error: `Товар «${inactive.productVariant.colorway.product.name}» больше недоступен, удалите его из корзины`,
    };
  }

  const snapshot = buildOrderSnapshot(cart);
  const shippingAmount = calcShipping(snapshot.itemsTotal, form.shippingMethod);
  const totalAmount = snapshot.itemsTotal + shippingAmount;

  // Декремент стока (декремент-первым). Успешные запоминаем для компенсации.
  const decremented: { id: string; qty: number }[] = [];
  for (const it of snapshot.items) {
    const res = await prisma.productVariant.updateMany({
      where: { id: it.productVariantId, stock: { gte: it.quantity } },
      data: { stock: { decrement: it.quantity } },
    });
    if (res.count === 1) {
      decremented.push({ id: it.productVariantId, qty: it.quantity });
    } else {
      await restoreStock(decremented);
      return { ok: false, error: `Товар «${it.productName}» закончился, обновите корзину` };
    }
  }

  let orderNumber: number;
  try {
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        shippingMethod: form.shippingMethod,
        city: form.city,
        addressLine: form.addressLine,
        addressComment: form.addressComment || null,
        itemsTotal: snapshot.itemsTotal,
        shippingAmount,
        totalAmount,
        paymentMethod: 'cod',
        items: { create: snapshot.items },
      },
      select: { orderNumber: true },
    });
    orderNumber = order.orderNumber;
  } catch (e) {
    await restoreStock(decremented);
    logger.error('place_order_create_failed', e);
    return { ok: false, error: 'Не удалось оформить заказ. Попробуйте позже' };
  }

  // Очистка корзины — best-effort: заказ уже создан, косметику не откатываем.
  try {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await recalcCartTotalByToken(token);
  } catch (e) {
    logger.error('order_cart_cleanup_failed', e, { orderNumber });
  }

  return { ok: true, orderNumber };
}
```

- [ ] **Step 4: Запустить — GREEN**

Run: `npx vitest run tests/place-order.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/actions/order.ts stride-app/tests/place-order.test.ts
git commit -m "feat(stride-app): placeOrder action (stock decrement + compensation) + tests"
```

---

## Task 6: `cancelOrder` Server Action — TDD

**Files:** Modify `app/actions/order.ts`; Create `tests/cancel-order.test.ts`

- [ ] **Step 1: Падающий тест — `tests/cancel-order.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn() }));
vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    order: { findUnique: vi.fn(), updateMany: vi.fn() },
    productVariant: { update: vi.fn() },
  },
}));

import { cancelOrder } from '@/app/actions/order';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.order.findUnique as unknown as ReturnType<typeof vi.fn>;
const orderUpdateMany = prisma.order.updateMany as unknown as ReturnType<typeof vi.fn>;
const variantUpdate = prisma.productVariant.update as unknown as ReturnType<typeof vi.fn>;

function pendingOrder() {
  return {
    id: 'o1', orderNumber: 1025, userId: 'u1', status: 'PENDING',
    items: [{ productVariantId: 'v1', quantity: 2 }, { productVariantId: 'v2', quantity: 1 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  variantUpdate.mockResolvedValue({});
});

describe('cancelOrder', () => {
  it('успех — статус CANCELLED, возврат стока по всем позициям', async () => {
    findUnique.mockResolvedValue(pendingOrder());
    orderUpdateMany.mockResolvedValue({ count: 1 });
    const r = await cancelOrder('o1');
    expect(r).toEqual({ ok: true });
    expect(variantUpdate).toHaveBeenCalledTimes(2);
    expect(variantUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
  });

  it('чужой заказ — отказ, сток не тронут', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), userId: 'other' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(variantUpdate).not.toHaveBeenCalled();
  });

  it('не PENDING — отказ', async () => {
    findUnique.mockResolvedValue({ ...pendingOrder(), status: 'SHIPPED' });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('гонка: updateMany count=0 — сток НЕ возвращается', async () => {
    findUnique.mockResolvedValue(pendingOrder());
    orderUpdateMany.mockResolvedValue({ count: 0 });
    const r = await cancelOrder('o1');
    expect(r.ok).toBe(false);
    expect(variantUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — RED**

Run: `npx vitest run tests/cancel-order.test.ts`
Expected: FAIL — `cancelOrder is not a function` / не экспортируется.

- [ ] **Step 3: Дополнить `app/actions/order.ts` — добавить импорт `revalidatePath` и функцию `cancelOrder`**

В начало файла, к импортам, добавить:
```typescript
import { revalidatePath } from 'next/cache';
```
В конец файла добавить:
```typescript
export type CancelOrderResult = { ok: true } | { ok: false; error: string };

export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };
  const userId = session.user.id;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== userId || order.status !== 'PENDING') {
    return { ok: false, error: 'Этот заказ нельзя отменить' };
  }

  // Замок от гонки/двойной отмены: переводим в CANCELLED ТОЛЬКО если ещё PENDING.
  const locked = await prisma.order.updateMany({
    where: { id: orderId, userId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (locked.count === 0) return { ok: false, error: 'Заказ уже обработан' };

  // Возврат стока — после смены статуса (не откатываем CANCELLED при сбое increment).
  for (const item of order.items) {
    try {
      await prisma.productVariant.update({
        where: { id: item.productVariantId },
        data: { stock: { increment: item.quantity } },
      });
    } catch (e) {
      logger.error('cancel_stock_restore_failed', e, { orderId, variantId: item.productVariantId });
    }
  }

  revalidatePath('/profile');
  revalidatePath(`/orders/${order.orderNumber}`);
  return { ok: true };
}
```

- [ ] **Step 4: Запустить — GREEN (+ регрессия placeOrder)**

Run: `npx vitest run tests/cancel-order.test.ts tests/place-order.test.ts`
Expected: PASS (4 + 5 тестов).

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/actions/order.ts stride-app/tests/cancel-order.test.ts
git commit -m "feat(stride-app): cancelOrder action (status-lock + stock restore) + tests"
```

---

## Task 7: Защита роутов `/checkout` и `/orders`

**Files:** Modify `auth.config.ts`, `middleware.ts`

- [ ] **Step 1: Расширить `authorized` в `auth.config.ts`**

Найти строку:
```typescript
      const isProtected = nextUrl.pathname.startsWith('/profile');
```
Заменить на:
```typescript
      const isProtected =
        nextUrl.pathname.startsWith('/profile') ||
        nextUrl.pathname.startsWith('/checkout') ||
        nextUrl.pathname.startsWith('/orders');
```

- [ ] **Step 2: Расширить matcher в `middleware.ts`**

Заменить:
```typescript
  matcher: ['/profile/:path*'],
```
на:
```typescript
  matcher: ['/profile/:path*', '/checkout/:path*', '/orders/:path*'],
```

- [ ] **Step 3: Typecheck + build (проверить, что middleware не распух)**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; в выводе `ƒ Middleware` ~86 kB (argon2/prisma не утекли).

- [ ] **Step 4: Commit**

```bash
git add stride-app/auth.config.ts stride-app/middleware.ts
git commit -m "feat(stride-app): protect /checkout and /orders via middleware"
```

---

## Task 8: Страница `/checkout` + форма

**Files:** Create `app/checkout/page.tsx`, `components/shared/checkout/checkout-form.tsx`

- [ ] **Step 1: RSC-страница `app/checkout/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, getCartDetails } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { CheckoutForm } from '@/components/shared/checkout/checkout-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Оформление заказа' };

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  const cart = token ? await prisma.cart.findFirst({ where: { token }, include: cartInclude }) : null;
  if (!cart || cart.items.length === 0) redirect('/cart');

  const details = getCartDetails(cart);

  return (
    <main className="mx-auto max-w-[1240px] px-4 sm:px-6 py-10">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">Оформление заказа</h1>
      <CheckoutForm
        details={details}
        defaults={{ contactName: user.name ?? '', contactPhone: user.phone ?? '', contactEmail: user.email }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Клиентская форма `components/shared/checkout/checkout-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { calcShipping } from '@/lib/order';
import { FREE_SHIPPING_THRESHOLD } from '@/constants/config';
import { checkoutSchema, type CheckoutValues } from '@/services/dto/order.dto';
import { placeOrder } from '@/app/actions/order';
import type { CartDetails } from '@/services/dto/cart.dto';

type Defaults = { contactName: string; contactPhone: string; contactEmail: string };

export function CheckoutForm({ details, defaults }: { details: CartDetails; defaults: Defaults }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { ...defaults, shippingMethod: 'courier', paymentMethod: 'cod', city: '', addressLine: '', addressComment: '' },
  });

  const shippingMethod = watch('shippingMethod');
  const shipping = calcShipping(details.totalAmount, shippingMethod);
  const total = details.totalAmount + shipping;

  const onSubmit = async (v: CheckoutValues) => {
    setError(null);
    const res = await placeOrder(v);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/orders/${res.orderNumber}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8" noValidate>
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-display font-bold text-xl">Контактные данные</h2>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactName">Имя</label>
            <Input id="contactName" autoComplete="name" {...register('contactName')} />
            {errors.contactName && <p className="text-danger text-xs mt-1">{errors.contactName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactPhone">Телефон</label>
            <Input id="contactPhone" type="tel" autoComplete="tel" placeholder="+7…" {...register('contactPhone')} />
            {errors.contactPhone && <p className="text-danger text-xs mt-1">{errors.contactPhone.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactEmail">E-mail</label>
            <Input id="contactEmail" type="email" autoComplete="email" {...register('contactEmail')} />
            {errors.contactEmail && <p className="text-danger text-xs mt-1">{errors.contactEmail.message}</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-display font-bold text-xl">Адрес доставки</h2>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="city">Город</label>
            <Input id="city" autoComplete="address-level2" {...register('city')} />
            {errors.city && <p className="text-danger text-xs mt-1">{errors.city.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="addressLine">Улица, дом, квартира</label>
            <Input id="addressLine" autoComplete="street-address" {...register('addressLine')} />
            {errors.addressLine && <p className="text-danger text-xs mt-1">{errors.addressLine.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="addressComment">Комментарий к адресу</label>
            <textarea id="addressComment" className="inp min-h-20" {...register('addressComment')} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display font-bold text-xl">Способ доставки</h2>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="courier" {...register('shippingMethod')} />
            <span className="flex-1"><span className="font-semibold">Курьер</span><br /><span className="text-xs text-ink-muted">Бесплатно от {formatPrice(FREE_SHIPPING_THRESHOLD)} · 1–3 дня</span></span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="pickup" {...register('shippingMethod')} />
            <span className="flex-1"><span className="font-semibold">Самовывоз</span><br /><span className="text-xs text-ink-muted">Из пункта выдачи · бесплатно</span></span>
          </label>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display font-bold text-xl">Способ оплаты</h2>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="cod" {...register('paymentMethod')} defaultChecked />
            <span className="flex-1"><span className="font-semibold">При получении</span><br /><span className="text-xs text-ink-muted">Наличными или картой курьеру</span></span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 opacity-50 cursor-not-allowed" title="Появится в следующей фазе">
            <input type="radio" disabled />
            <span className="flex-1"><span className="font-semibold">Картой онлайн</span><br /><span className="text-xs text-ink-muted">Visa, MasterCard, МИР — скоро</span></span>
          </label>
        </section>
      </div>

      <aside>
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4 lg:sticky lg:top-24">
          <h2 className="font-display font-bold text-xl">Ваш заказ</h2>
          <ul className="space-y-3">
            {details.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 text-sm">
                <span className="text-ink-muted">{it.name} · {it.sizeEu} · {it.quantity} шт.</span>
                <span className="font-semibold tnum shrink-0">{formatPrice(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 text-sm border-t border-line pt-4">
            <div className="flex justify-between"><span className="text-ink-muted">Товары</span><span className="font-semibold tnum">{formatPrice(details.totalAmount)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="font-semibold tnum">{shipping === 0 ? 'Бесплатно' : formatPrice(shipping)}</span></div>
          </div>
          <div className="flex justify-between items-baseline border-t border-line pt-4">
            <span className="text-lg font-semibold">Итого</span>
            <span className="font-display font-bold text-2xl tnum">{formatPrice(total)}</span>
          </div>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Оформить заказ →</Button>
        </div>
      </aside>
    </form>
  );
}
```
> Импорт `@hookform/resolvers/zod` и `react-hook-form` уже в проекте (используются в auth-формах). `details.items` — `CartStateItem[]` (поля `id/name/sizeEu/quantity/lineTotal` есть). Класс `inp` — стиль инпута проекта (см. `components/ui/input.tsx`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; появляется маршрут `ƒ /checkout`.

- [ ] **Step 4: Commit**

```bash
git add stride-app/app/checkout stride-app/components/shared/checkout
git commit -m "feat(stride-app): checkout page + form (COD), wired to placeOrder"
```

---

## Task 9: Страница заказа `/orders/[number]` + отмена

**Files:** Create `app/orders/[number]/page.tsx`, `components/shared/orders/order-status-badge.tsx`, `components/shared/orders/cancel-order-button.tsx`

- [ ] **Step 1: Бейдж статуса `components/shared/orders/order-status-badge.tsx`**

```tsx
import { ORDER_STATUS_META } from '@/lib/order';

export function OrderStatusBadge({ status }: { status: keyof typeof ORDER_STATUS_META }) {
  const meta = ORDER_STATUS_META[status];
  return <span className={meta.badge}>{meta.label}</span>;
}
```
> Применяем готовый класс `badge-*` из дизайн-токенов (как в прототипе `profile.html`). Если в проекте бейдж оформлен компонентом `<Badge>` с пропом стиля — при реализации заменить `<span>` на него; классы `badge-*` уже существуют в globals.css.

- [ ] **Step 2: Клиентская кнопка отмены `components/shared/orders/cancel-order-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { cancelOrder } from '@/app/actions/order';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async () => {
    if (!window.confirm('Отменить заказ? Это действие необратимо.')) return;
    setBusy(true);
    setError(null);
    const res = await cancelOrder(orderId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <Button variant="danger" size="md" onClick={onCancel} loading={busy}>Отменить заказ</Button>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: RSC-страница `app/orders/[number]/page.tsx`**

```tsx
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import { CancelOrderButton } from '@/components/shared/orders/cancel-order-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Заказ' };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { number } = await params;
  const orderNumber = Number(number);
  if (!Number.isInteger(orderNumber)) notFound();

  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true } });
  if (!order || order.userId !== session.user.id) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Заказ #{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-ink-muted text-sm">
        {order.createdAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-3 p-4 text-sm">
            <span>{it.productName} · {it.colorwayName} · {it.sizeEu} · {it.quantity} шт.</span>
            <span className="font-semibold tnum shrink-0">{formatPrice(it.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-line bg-surface p-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-ink-muted">Товары</span><span className="tnum">{formatPrice(order.itemsTotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="tnum">{order.shippingAmount === 0 ? 'Бесплатно' : formatPrice(order.shippingAmount)}</span></div>
        <div className="flex justify-between border-t border-line pt-2 text-base"><span className="font-semibold">Итого</span><span className="font-display font-bold tnum">{formatPrice(order.totalAmount)}</span></div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 text-sm space-y-1">
        <p className="font-semibold">Доставка</p>
        <p className="text-ink-muted">{order.shippingMethod === 'pickup' ? 'Самовывоз' : 'Курьер'} · {order.city}, {order.addressLine}</p>
        <p className="text-ink-muted">{order.contactName} · {order.contactPhone}</p>
        <p className="text-ink-muted">Оплата при получении</p>
      </div>

      {order.status === 'PENDING' && <CancelOrderButton orderId={order.id} />}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок; маршрут `ƒ /orders/[number]`.

- [ ] **Step 5: Commit**

```bash
git add stride-app/app/orders stride-app/components/shared/orders
git commit -m "feat(stride-app): order detail/confirmation page + cancel button"
```

---

## Task 10: История заказов в профиле

**Files:** Create `components/shared/profile/orders-list.tsx`; Modify `components/shared/profile/profile-view.tsx`, `app/profile/page.tsx`

- [ ] **Step 1: Тип строки заказа + компонент `components/shared/profile/orders-list.tsx`**

```tsx
import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/shared/orders/order-status-badge';
import type { ORDER_STATUS_META } from '@/lib/order';

export interface OrderRow {
  orderNumber: number;
  status: keyof typeof ORDER_STATUS_META;
  createdAt: string; // ISO; форматируем на клиенте
  totalAmount: number;
  itemCount: number;
}

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="text-ink-muted">Заказов пока нет.</p>;
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.orderNumber} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/orders/${o.orderNumber}`} className="font-semibold hover:underline">Заказ #{o.orderNumber}</Link>
              <p className="text-xs text-ink-muted">{new Date(o.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {o.itemCount} шт.</p>
            </div>
            <OrderStatusBadge status={o.status} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className={o.status === 'CANCELLED' ? 'tnum line-through text-ink-muted' : 'font-semibold tnum'}>{formatPrice(o.totalAmount)}</span>
            <Link href={`/orders/${o.orderNumber}`} className="text-sm text-ink-muted hover:text-ink">{o.status === 'PENDING' ? 'Отменить' : 'Подробнее'}</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
```
> Кнопка карточки ведёт на деталь заказа (там и происходит подтверждённая отмена через `CancelOrderButton`). Единое действие отмены — на детали.

- [ ] **Step 2: Обновить `profile-view.tsx` — реальные заказы во вкладке**

Заменить файл целиком на:
```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PersonalDataForm } from './personal-data-form';
import { OrdersList, type OrderRow } from './orders-list';
import type { ProfileValues } from '@/services/dto/auth.dto';

export function ProfileView({ email, initial, orders }: { email: string; initial: ProfileValues; orders: OrderRow[] }) {
  const [tab, setTab] = useState<'data' | 'orders'>('data');
  const tabCls = (active: boolean) =>
    cn(
      'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
      active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-soft',
    );

  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist" aria-label="Разделы профиля">
        <button role="tab" aria-selected={tab === 'data'} className={tabCls(tab === 'data')} onClick={() => setTab('data')}>
          Личные данные
        </button>
        <button role="tab" aria-selected={tab === 'orders'} className={tabCls(tab === 'orders')} onClick={() => setTab('orders')}>
          Мои заказы
        </button>
      </div>
      {tab === 'data' ? <PersonalDataForm initial={initial} email={email} /> : <OrdersList orders={orders} />}
    </div>
  );
}
```

- [ ] **Step 3: Обновить `app/profile/page.tsx` — загрузить заказы и передать в `ProfileView`**

Заменить файл целиком на:
```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { ProfileView } from '@/components/shared/profile/profile-view';
import type { OrderRow } from '@/components/shared/profile/orders-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Профиль' };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { orderNumber: true, status: true, createdAt: true, totalAmount: true, _count: { select: { items: true } } },
  });
  const orderRows: OrderRow[] = orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    totalAmount: o.totalAmount,
    itemCount: o._count.items,
  }));

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
        orders={orderRows}
      />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add stride-app/components/shared/profile/orders-list.tsx stride-app/components/shared/profile/profile-view.tsx stride-app/app/profile/page.tsx
git commit -m "feat(stride-app): populate profile 'My orders' tab with real orders"
```

---

## Task 11: Открыть шов checkout-кнопки в корзине

**Files:** Modify `components/shared/cart/order-summary.tsx`

- [ ] **Step 1: Добавить импорт `Link`**

В начало файла, после `'use client';`, добавить:
```tsx
import Link from 'next/link';
```

- [ ] **Step 2: Заменить disabled-кнопку на ссылку `/checkout`**

Заменить строку 40:
```tsx
        <Button variant="primary" size="lg" className="w-full" disabled title="Оформление заказа появится в Фазе 2">Оформить заказ →</Button>
```
на:
```tsx
        <Button asChild variant="primary" size="lg" className="w-full"><Link href="/checkout">Оформить заказ →</Link></Button>
```
И заменить пояснение под кнопкой (строка 41):
```tsx
        <p className="text-xs text-ink-muted leading-relaxed">Оформление, оплата и доставка появятся в следующей фазе.</p>
```
на:
```tsx
        <p className="text-xs text-ink-muted leading-relaxed">Оплата при получении. Онлайн-оплата появится позже.</p>
```
> Промокод-блок (строки 15–21) НЕ трогаем — остаётся disabled-швом (следующий слайс). `Button asChild` рендерит дочерний `<Link>` как кнопку (Radix Slot, см. `ButtonProps.asChild`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add stride-app/components/shared/cart/order-summary.tsx
git commit -m "feat(stride-app): enable cart checkout button -> /checkout (promo stays stubbed)"
```

---

## Task 12: E2E + a11y

**Files:** Create `e2e/checkout.spec.ts`; Modify `e2e/a11y.spec.ts`

> e2e зелёные в CI (Ubuntu); локально на Windows допускается флак по сети (TROUBLESHOOTING P4).

- [ ] **Step 1: `e2e/checkout.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

async function registerAndLogin(page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill('Passw0rd!1');
  await page.getByLabel('Повторите пароль').fill('Passw0rd!1');
  await page.getByLabel(/Согласен/).check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL('/');
}

async function addFirstProductToCart(page) {
  await page.goto('/catalog');
  await page.locator('a[href^="/product/"]').first().click();
  await page.getByRole('button', { name: /^4\d/ }).first().click(); // выбрать размер
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

test('гость → /checkout редиректит на /login', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login/);
});

test('сквозной COD-заказ: cart → checkout → order → история', async ({ page }) => {
  await registerAndLogin(page);
  await addFirstProductToCart(page);

  await page.goto('/checkout');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();

  await expect(page).toHaveURL(/\/orders\/\d+/);
  await expect(page.getByRole('heading', { name: /Заказ #\d+/ })).toBeVisible();
  await expect(page.getByText('Оформлен')).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Мои заказы' }).click();
  await expect(page.getByText(/Заказ #\d+/)).toBeVisible();
});

test('отмена PENDING-заказа возвращает в статус Отменён', async ({ page }) => {
  await registerAndLogin(page);
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Отменить заказ' }).click();
  await expect(page.getByText('Отменён')).toBeVisible();
});
```
> Селекторы форм — `getByLabel` (как в auth-e2e Фазы 2.0). Если конкретные label-тексты в реализации иные — привести в соответствие при прогоне (форма из Task 8 использует именно эти `<label>`).

- [ ] **Step 2: Добавить `/checkout` в `a11y.spec.ts`**

В массив проверяемых маршрутов `a11y.spec.ts` добавить `'/checkout'` (требует сессии — если фикстура логина в a11y-спеке отсутствует, добавить шаг логина перед навигацией, по образцу `auth.spec.ts`; иначе пропустить `/checkout` и оставить публичные маршруты).

- [ ] **Step 3: Прогон e2e (ожидаемо зелёные в CI)**

Run: `npx playwright test e2e/checkout.spec.ts`
Expected (CI Ubuntu): зелёные. Локально — допускается флак по сети.

- [ ] **Step 4: Commit**

```bash
git add stride-app/e2e/checkout.spec.ts stride-app/e2e/a11y.spec.ts
git commit -m "test(stride-app): e2e for checkout/order/cancel + a11y route"
```

---

## Task 13: Финальная сверка и завершение слайса

**Files:** (проверки + отметки)

- [ ] **Step 1: Полная локальная проверка качества**

Run по очереди из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest все зелёные (order-shipping, order-snapshot, place-order, cancel-order + существующие); build OK; в Route-таблице `ƒ /checkout`, `ƒ /orders/[number]`; `ƒ Middleware` ~86 kB.

- [ ] **Step 2: Чек-лист критериев готовности (§8 спеки)**

- [ ] Сквозной COD-заказ: cart → checkout → order → история.
- [ ] Сток списывается при заказе; при нехватке — заказ не создаётся, сток не теряется.
- [ ] Отмена PENDING возвращает сток; двойная отмена не задваивает.
- [ ] `/checkout`, `/orders/*` под защитой; чужой заказ → 404.
- [ ] Доставка верна (флэт / бесплатно-от-порога / самовывоз 0).
- [ ] Швы на месте: «Картой онлайн» и промокод — disabled.
- [ ] e2e + a11y зелёные в CI.

- [ ] **Step 3: Отметить spec реализованным**

В `docs/superpowers/specs/2026-06-03-stride-phase2.1a-checkout-cod-design.md` сменить «**Статус:** на ревью» → «**Статус:** реализовано (P2.1a)».
```bash
git add docs/superpowers/specs/2026-06-03-stride-phase2.1a-checkout-cod-design.md
git commit -m "docs: mark Phase 2.1a checkout spec implemented"
```

- [ ] **Step 4: Завершение ветки**

Использовать `superpowers:finishing-a-development-branch` (после зелёного CI). Ожидаемо: PR `feat/phase2.1-checkout` → `main`; при мерже прод-build применит `Order`/`OrderItem` к прод-Neon (`db push` в `vercel.json`). Прод-env уже заданы (P2.0). НЕ удалять ветку до подтверждения прод-деплоя.

---

## Self-Review (против спеки `2026-06-03-stride-phase2.1a-checkout-cod-design.md`)

**1. Покрытие требований спеки:**

| Раздел спеки | Задача плана |
|---|---|
| §3 Модель (`Order`/`OrderItem`/`OrderStatus`, снапшоты, orderNumber) | Task 1 |
| §4 `placeOrder` (декремент-первым, компенсация, re-read, active-чек, best-effort cleanup) | Task 5 (+T3 чистая логика, T4 DTO/active) |
| §4 `calcShipping`/`buildOrderSnapshot` | Task 3 |
| §5 `cancelOrder` (замок updateMany(PENDING), возврат стока) | Task 6 |
| §6 защита `/checkout` `/orders` | Task 7 |
| §6 `/checkout` страница + форма (4 секции, COD актив, «Картой онлайн» disabled) | Task 8 |
| §6 `/orders/[number]` (подтверждение=деталь, owner-guard, отмена) | Task 9 |
| §6 «Мои заказы» наполнение + ORDER_STATUS_META | Task 10 (+T3 meta, T9 badge) |
| §6 кнопка корзины → `/checkout`, промо остаётся disabled | Task 11 |
| §7 тесты (unit + e2e + a11y) | Tasks 3, 5, 6, 12 |
| §8 критерии готовности | Task 13 |
| `SHIPPING_FLAT` конфиг | Task 2 |

**2. Скан плейсхолдеров:** код приведён целиком в каждом шаге; нет «TODO/implement later/similar to Task N». Замечания о возможной подгонке селекторов (T12) и переключении бейджа на компонент (T9) — это явные инструкции на случай расхождения с реализацией, не пропуски.

**3. Консистентность типов:** `calcShipping`/`buildOrderSnapshot`/`OrderItemSnapshot`/`OrderSnapshot`/`ORDER_STATUS_META` (T3) ↔ использование в `placeOrder` (T5), форме (T8), бейдже/списке (T9–T10). `checkoutSchema`/`CheckoutValues` (T4) ↔ форма (T8) и action (T5). `placeOrder`/`cancelOrder` сигнатуры (T5–T6) ↔ вызовы из формы/кнопки (T8–T9). `OrderRow` (T10) ↔ загрузка в profile page (T10). `cartInclude` с `product.active` (T4) ↔ active-чек в `placeOrder` (T5). Имена согласованы.

**Зафиксированные допущения:** `OrderItem.sizeEu` — String-снапшот (а не Decimal): display-only, чистая `buildOrderSnapshot` без Prisma.Decimal. Для `pickup` адрес/город всё равно требуются (адрес пункта выдачи вводит пользователь) — отдельной модели пунктов нет (MVP). Онлайн-оплата/промокоды/резерв-с-окном — следующие слайсы.
