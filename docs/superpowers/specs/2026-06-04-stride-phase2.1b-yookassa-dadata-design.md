# STRIDE — Фаза 2.1b (ЮKassa + DaData): дизайн

> **Статус:** реализовано (P2.1b).
> **Дата:** 2026-06-04. **Ветка:** `feat/phase2.1b-yookassa`.
> **Предшественник:** P2.1a COD-чекаут (в проде, `main`). Research-карта: `docs/superpowers/research/2026-06-02-phase2-candidates.md`.
> **Прототип UI:** `ui-designe and prototypes/prototypes-app/checkout.html` (секция оплаты: «Картой онлайн» выбрана первой).

## §1. Цель и граница слайса

Добавить **онлайн-оплату через ЮKassa** (redirect-флоу, авто-захват) и **автоподсказки адреса DaData** в существующий чекаут. COD-флоу остаётся без изменений. Снимаем disabled-шов «Картой онлайн».

**В объёме:**
- Модель `Payment` (1:1 с Order). Деньги: `Int ₽` → копейки `String` (×100) на границе ЮKassa.
- SDK `@webzaytsev/yookassa-ts-sdk`: создание платежа (`capture:true`, redirect), вебхук-роут, парсинг уведомлений.
- Расширение `checkoutSchema`: `paymentMethod: z.enum(['cod', 'online'])`.
- `placeOrder`: ветка `online` — сток/заказ как COD + создание Payment + возврат `paymentUrl` для внешнего редиректа.
- API-роуты: `POST /api/yookassa/webhook` (вебхук ЮKassa), `POST /api/dadata/suggest` (прокси DaData).
- UI: активный radio «Картой онлайн» (первым, по прототипу), DaData-компонент автоподсказок (город/улица).
- `/orders/[number]`: отображение статуса платежа.

**Вне объёма:**
- Чеки 54-ФЗ (`receipt`) — отложено (требует справочника НДС).
- Возвраты через API (refund) — отложено до админ-фазы.
- Embedded-виджет, QR/SBP, сохранённые карты — только redirect.
- IP-валидация вебхука — пропущена (MVP; на Vercel за прокси IP искажён).
- Промокоды — следующий слайс.

## §2. Предрешённые ограничения

- **Деньги:** `Int ₽` в БД; ЮKassa — `String` в копейках (×100). В Payment храним в копейках (native для ЮKassa).
- **Neon HTTP — без транзакций** ([[prisma-neon-no-transaction]]). Только одиночные `create`/`update`(by id)/`delete`. **Не использовать** `updateMany`, `createMany`, nested-create, `$executeRaw` (для UPDATE не работает на прод-Neon — TROUBLESHOOTING P9). Сток — `findUnique` + `update({ decrement })` (проверенный паттерн).
- **Только для вошедших** — `/checkout`, `/orders` уже под middleware (P2.1a).
- **Схема применяется на деплое/CI** — `db push` в `vercel.json` + `e2e.yml` (P7).
- **`NEXT_PUBLIC_SITE_URL`** или `VERCEL_URL` — для `return_url` (нужен полный URL сайта).

## §3. Доменная модель

```prisma
model Payment {
  id              String    @id                   // ЮKassa payment.id
  orderId         String    @unique
  order           Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status          String    @default("pending")   // pending | succeeded | canceled
  confirmationUrl String?                          // URL для редиректа на оплату
  amount          Int                             // сумма в КОПЕЙКАХ (₽ × 100)
  paidAt          DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

Relation-поле: `Order.payment Payment?` (опционально — COD-заказы без Payment).

Изменения в DTO:

```ts
// services/dto/order.dto.ts
paymentMethod: z.enum(['cod', 'online'])  // было z.literal('cod')
```

## §4. Флоу онлайн-оплаты (1-шаг, авто-захват)

```
1. Пользователь выбирает «Картой онлайн» в /checkout, заполняет форму.
2. placeOrder (Server Action):
   a. checkoutSchema с paymentMethod='online'.
   b. Декремент стока (findUnique pre-guard + update({ decrement }) — проверенный паттерн).
   c. Создание Order (статус PENDING) + OrderItem (по одному в цикле).
   d. Создание Payment через ЮKassa SDK:
      - amount.value = (totalAmount * 100).toString() — копейки
      - confirmation.type = 'redirect', return_url = SITE_URL/orders/<orderNumber>
      - capture = true, description = «Заказ #<orderNumber>»
      - metadata: { orderNumber }
      - Сохранить payment.id, confirmationUrl в Payment.
   e. Сбой на шаге (d) → удалить Order (каскад — уберёт OrderItem) + вернуть сток (как сейчас в placeOrder).
   f. return { ok: true, paymentUrl: payment.confirmation.confirmation_url }.
3. Клиент: window.location.href = paymentUrl (внешний редирект на ЮKassa).
4. Пользователь платит на стороне ЮKassa.
5. ЮKassa редиректит обратно на /orders/<orderNumber> (return_url).
6. Параллельно приходит вебхук.

Вебхук payment.succeeded:
   - Payment.status = 'succeeded', Payment.paidAt = now
   - Order.status = PROCESSING (заказ подтверждён, в обработку).
Вебхук payment.canceled:
   - Payment.status = 'canceled'
   - Order.status = CANCELLED
   - Возврат стока: per-item update({ stock: { increment: qty } }), как в cancelOrder.
   - Если вебхук не пришёл (редко) — заказ остаётся PENDING с pending-платежом; разбирается вручную.
```

**Очистка корзины** — best-effort после создания Order (как в COD-пути): если упадёт — заказ валиден, корзина чистится косметически.

**Расширение `PlaceOrderResult`:**
```ts
export type PlaceOrderResult =
  | { ok: true; orderNumber: number; paymentUrl?: string }
  | { ok: false; error: string };
```
COD: `{ ok: true, orderNumber }`. Online: `{ ok: true, orderNumber, paymentUrl }`. Клиент проверяет `paymentUrl` → внешний редирект.

## §5. API-роуты

### `POST /api/yookassa/webhook`

```ts
// app/api/yookassa/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parseNotification } from '@webzaytsev/yookassa-ts-sdk';
import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const notification = parseNotification(body);

    switch (notification.event) {
      case 'payment.succeeded': {
        const p = notification.object;
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'succeeded', paidAt: new Date() } });
        // Найти заказ по payment.id и обновить статус
        const payment = await prisma.payment.findUnique({ where: { id: p.id } });
        if (payment) {
          await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PROCESSING' } });
        }
        break;
      }
      case 'payment.canceled': {
        const p = notification.object;
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'canceled' } });
        const payment = await prisma.payment.findUnique({ where: { id: p.id }, include: { order: { include: { items: true } } } });
        if (payment) {
          await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
          // Возврат стока
          for (const item of payment.order.items) {
            try {
              await prisma.productVariant.update({ where: { id: item.productVariantId }, data: { stock: { increment: item.quantity } } });
            } catch (e) { logger.error('yookassa_webhook_stock_restore_failed', e, { variantId: item.productVariantId }); }
          }
        }
        break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('yookassa_webhook_failed', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

Причина дублирующего `findUnique` после `payment.update`: `parseNotification` возвращает `payment.id`, но не `orderId`/заказ (metadata может отсутствовать). Без транзакций — сначала обновляем платёж, потом ищем связанный заказ. При редком сбое между ними — вебхук можно ретраить (ЮKassa шлёт повторно).

### `POST /api/dadata/suggest`

Прокси на DaData API (токен на сервере):

```ts
// app/api/dadata/suggest/route.ts
export async function POST(req: NextRequest) {
  const token = process.env.DADATA_TOKEN;
  if (!token) return NextResponse.json({ suggestions: [] });

  const { query } = await req.json();
  const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count: 5, language: 'ru' }),
  });
  return NextResponse.json(await res.json());
}
```

Fail-open: нет токена → пустой массив (компонент не показывает подсказки).

## §6. UI

### checkout-form.tsx — «Картой онлайн» активна

- `defaultValues.paymentMethod = 'online'` (по прототипу — онлайн первым)
- Radio: «Картой онлайн» (value='online') активный, «При получении» (value='cod') активный
- `onSubmit`: если `res.paymentUrl` → `window.location.href = res.paymentUrl` (внешний редирект); иначе `router.push`
- DaData-компонент в секции адреса

### DaData: `components/shared/checkout/address-suggest.tsx`

`'use client'` — внутри `<FormProvider>`:
- `watch('city')` → debounce 300ms → POST `/api/dadata/suggest` → выпадающий список `<ul>`
- Выбор подсказки → `setValue('city', …)` + `setValue('addressLine', …)` (RHF `useFormContext`)
- Стили: `absolute`, `bg-surface`, `border-line`, `rounded-xl`, `z-10` — в цвет дизайн-системы
- Без токена — не рендерится (fail-open)

### `/orders/[number]` — статус платежа

RSC-страница: если `order.payment` существует и `payment.status === 'pending'` — текст «Ожидание оплаты...» (вебхук обычно уже пришёл, статус обновлён). Если `succeeded` — «Оплачено». Если `canceled` — «Оплата отменена» (статус заказа CANCELLED).

### Отмена онлайн-заказа

- `payment.status === 'pending'` — отмена **доступна** (заказ PENDING, платёж может ещё не завершиться). `cancelOrder` дополнительно отменяет платёж: `await sdk.payments.cancel(paymentId)` (best-effort; если платёж уже succeeded — API вернёт ошибку, логируем).
- `payment.status === 'succeeded'` — отмена **недоступна** (Order уже PROCESSING).
- `payment.status === 'canceled'` — уже CANCELLED.

## §7. Конфигурация

Новые env (Vercel + локально):

```bash
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=test_...   # test_ для sandbox, live_ для прода
DADATA_TOKEN=...
NEXT_PUBLIC_SITE_URL=https://sneakers-store-v1.vercel.app
```

SDK инициализируется лениво (при первом вызове `placeOrder`):
```ts
let _sdk: ReturnType<typeof YooKassa> | null = null;
function getYooKassa() {
  if (_sdk) return _sdk;
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) throw new Error('YooKassa not configured');
  _sdk = YooKassa({ shop_id: shopId, secret_key: secretKey });
  return _sdk;
}
```

## §8. Тестирование

**Юнит (Vitest, мок Prisma + SDK):**
- `placeOrder` online: успех (возвращает paymentUrl), сбой SDK → откат заказа + возврат стока
- `cancelOrder` с pending-платежом: вызывает `sdk.payments.cancel` (best-effort), возврат стока
- `checkoutSchema`: 'cod' ✓, 'online' ✓, 'card' ✗ (отказ)

**Интеграция (e2e, CI/Ubuntu):**
Sandbox-ключ ЮKassa в CI env. Новый spec `e2e/yookassa.spec.ts`:
- Онлайн-заказ → редирект на `yookassa.ru`, мок ответа или проверка URL
- (Полный путь через sandbox-оплату тестовой картой — опционально, требует реального взаимодействия с формой ЮKassa)
- Вебхук: прямой POST на `/api/yookassa/webhook` с тестовым payload → заказ PROCESSING
- a11y: `/api/yookassa/webhook` 200 OK на валидный payload

**DaData (unit + e2e):**
- Компонент: ввод текста → API-вызов → подсказки (мок fetch)
- API-прокси: возвращает мок-ответ / реальный ответ при наличии токена

## §9. Критерии готовности

- [ ] typecheck 0, vitest зелёные, build OK, middleware ~86 kB
- [ ] COD-флоу не сломан (регрессия P2.1a)
- [ ] Онлайн-заказ: создаётся Order + Payment, возвращается paymentUrl, сток списан
- [ ] Вебхук payment.succeeded → Order PROCESSING; payment.canceled → возврат стока + CANCELLED
- [ ] DaData: подсказки работают (при наличии токена), без токена — не мешает
- [ ] «Картой онлайн» активен и выбран первым; «При получении» работает как раньше
- [ ] Отмена онлайн-заказа с pending-платежом — отменяет платёж (best-effort) + возвращает сток
- [ ] e2e зелёные в CI

## §10. Зафиксированные допущения

- Только redirect-флоу (без embedded-виджета, QR/SBP, сохранённых карт).
- Чеки 54-ФЗ — позже.
- `$executeRaw` UPDATE не работает на prod-Neon (TROUBLESHOOTING P9) — все условные обновления через `findUnique` + `update`.
- Возврат стока при `payment.canceled` — тот же паттерн что в `cancelOrder` (per-item update increment).
- DaData fail-open — без токена просто не показывается.
- `NEXT_PUBLIC_SITE_URL` нужен для `return_url` (полный URL сайта). Если не задан — fallback на VERCEL_URL.
