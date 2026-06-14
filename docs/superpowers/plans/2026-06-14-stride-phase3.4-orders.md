# Phase 3.4 — Orders MVP Implementation Plan

> Spec: `docs/superpowers/specs/2026-06-14-stride-phase3.4-orders-design.md`.
> Ветка: `feat/phase3.4-orders` (от `origin/main`). Коммиты на английском, без `Co-Authored-By`,
> автор `ui-ux-promax`, один коммит на таск. **Схема НЕ меняется** → никаких `prisma db push`.
> Локально только: `npx prisma generate` (offline), `npx tsc --noEmit`, `npx vitest run`. Без e2e/seed.
> Все команды — из `stride-app/`.

Маппинг на spec: §4.2→T1, §4.3→T2, §4.4→T3, §4.5→T4, §4.6/4.7→T5, §6→T2/T3, чек-лист→T6.

---

## Task 0: Spec + plan в git (этот коммит)

**Files** — Create: оба md (spec + plan).

1. `git add docs/superpowers/specs/2026-06-14-stride-phase3.4-orders-design.md docs/superpowers/plans/2026-06-14-stride-phase3.4-orders.md`
2. `git commit -m "docs(orders): phase 3.4 Orders MVP spec + plan"`

---

## Task 1: Переходы статусов — `lib/order-admin.ts` + тесты (TDD)

**Files** — Create: `lib/order-admin.ts`, `tests/order-admin.test.ts`.

1. **Тест** `tests/order-admin.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     nextOrderStatus, canCancelOrder, FORWARD_ACTION_LABEL,
     PAYMENT_STATUS_META, ORDER_STATUS_VALUES, PAYMENT_STATUS_VALUES,
   } from '@/lib/order-admin';

   describe('order-admin transitions', () => {
     it('nextOrderStatus follows the pipeline', () => {
       expect(nextOrderStatus('PENDING')).toBe('PROCESSING');
       expect(nextOrderStatus('PROCESSING')).toBe('SHIPPED');
       expect(nextOrderStatus('SHIPPED')).toBe('DELIVERED');
       expect(nextOrderStatus('DELIVERED')).toBeNull();
       expect(nextOrderStatus('CANCELLED')).toBeNull();
     });
     it('canCancelOrder only for pre-shipment', () => {
       expect(canCancelOrder('PENDING')).toBe(true);
       expect(canCancelOrder('PROCESSING')).toBe(true);
       expect(canCancelOrder('SHIPPED')).toBe(false);
       expect(canCancelOrder('DELIVERED')).toBe(false);
       expect(canCancelOrder('CANCELLED')).toBe(false);
     });
     it('forward labels keyed by current status', () => {
       expect(FORWARD_ACTION_LABEL.PENDING).toMatch(/обработ/i);
       expect(FORWARD_ACTION_LABEL.PROCESSING).toMatch(/отгру/i);
       expect(FORWARD_ACTION_LABEL.SHIPPED).toMatch(/достав/i);
     });
     it('payment meta maps known statuses + fallback', () => {
       expect(PAYMENT_STATUS_META.succeeded.label).toMatch(/оплач/i);
       expect(PAYMENT_STATUS_META.pending.label).toMatch(/ожида/i);
       expect(PAYMENT_STATUS_META.canceled.label).toMatch(/отмен/i);
     });
     it('value tuples expose all enum members', () => {
       expect(ORDER_STATUS_VALUES).toContain('DELIVERED');
       expect(PAYMENT_STATUS_VALUES).toEqual(['pending', 'succeeded', 'canceled']);
     });
   });
   ```
2. `npx vitest run tests/order-admin.test.ts` → **FAIL** (модуля нет).
3. **Реализация** `lib/order-admin.ts`:
   ```ts
   import type { OrderStatus } from '@prisma/client';

   // Управляемый пайплайн: следующий статус «вперёд». Терминальные → null.
   const ORDER_FLOW: Record<OrderStatus, OrderStatus | null> = {
     PENDING: 'PROCESSING',
     PROCESSING: 'SHIPPED',
     SHIPPED: 'DELIVERED',
     DELIVERED: null,
     CANCELLED: null,
   };
   export function nextOrderStatus(s: OrderStatus): OrderStatus | null {
     return ORDER_FLOW[s];
   }

   // Отмена с возвратом стока разрешена только до отгрузки.
   const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(['PENDING', 'PROCESSING']);
   export function canCancelOrder(s: OrderStatus): boolean {
     return CANCELLABLE.has(s);
   }

   // Текст кнопки «вперёд», ключ — ТЕКУЩИЙ статус заказа.
   export const FORWARD_ACTION_LABEL: Record<OrderStatus, string> = {
     PENDING: 'Взять в обработку',
     PROCESSING: 'Отметить отгруженным',
     SHIPPED: 'Отметить доставленным',
     DELIVERED: '',
     CANCELLED: '',
   };

   // Бейдж/лейбл статуса платежа (Payment.status — сырая строка).
   export const PAYMENT_STATUS_META: Record<string, { label: string; badge: string }> = {
     pending: { label: 'Ожидает оплаты', badge: 'badge badge-warning' },
     succeeded: { label: 'Оплачен', badge: 'badge badge-success' },
     canceled: { label: 'Отменён', badge: 'badge badge-danger' },
   };
   export function paymentStatusView(status?: string | null): { label: string; badge: string } {
     if (!status) return { label: 'Без оплаты', badge: 'badge badge-info' };
     return PAYMENT_STATUS_META[status] ?? { label: status, badge: 'badge badge-info' };
   }

   export const ORDER_STATUS_VALUES = [
     'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED',
   ] as const satisfies readonly OrderStatus[];
   export const PAYMENT_STATUS_VALUES = ['pending', 'succeeded', 'canceled'] as const;
   ```
4. `npx vitest run tests/order-admin.test.ts` → **PASS**. `npx tsc --noEmit` → чисто.
5. `git add lib/order-admin.ts tests/order-admin.test.ts && git commit -m "feat(orders): admin status-transition helpers + payment status meta"`

---

## Task 2: DTO `order-admin.dto.ts` (forward-таргеты)

**Files** — Create: `services/dto/order-admin.dto.ts`. (Тест DTO покрывается через action-тест T3 —
схема тривиальна; отдельный микротест не пишем, как и для простых DTO в 3.2.)

1. **Реализация**:
   ```ts
   import { z } from 'zod';

   // Forward-переходы: цель — только следующий шаг пайплайна (CANCELLED идёт отдельным action,
   // PENDING никогда не таргет). orderId — cuid строкой.
   export const orderStatusUpdateSchema = z.object({
     orderId: z.string().min(1),
     toStatus: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
   });
   export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
   ```
2. `npx tsc --noEmit` → чисто.
3. `git add services/dto/order-admin.dto.ts && git commit -m "feat(orders): admin order status-update DTO"`

---

## Task 3: Server actions `app/actions/admin/orders.ts` + тесты (TDD)

**Files** — Create: `app/actions/admin/orders.ts`, `tests/admin-orders-action.test.ts`.

1. **Тест** `tests/admin-orders-action.test.ts` (калька моков из `admin-products-action.test.ts`):
   замокать `@/auth` (`auth` → `{ user: { id:'admin1', role:'ADMIN' } }`), `@/lib/prisma-client`
   (`prisma.order.findUnique/updateMany`, `prisma.payment.update`, `prisma.productVariant.update`),
   `next/cache` (`revalidatePath` no-op), `@/lib/yookassa` (`cancelPayment`), `@/lib/review`
   (`pruneReviewsAfterCancel`), `@/lib/sales-count` (`adjustSalesCount`), `@/lib/logger`.
   Кейсы (из spec §6):
   - **advance**: `findUnique`→`{status:'PENDING'}`, `updateMany`→`{count:1}`;
     `advanceOrderStatus({orderId:'o1', toStatus:'PROCESSING'})` → `{ok:true}`, `updateMany` вызван с
     `where:{ id:'o1', status:'PENDING' }, data:{ status:'PROCESSING' }`.
   - **advance invalid**: `findUnique`→`{status:'PENDING'}`; `toStatus:'SHIPPED'` → `{ok:false}`,
     `updateMany` НЕ вызван.
   - **advance race**: `updateMany`→`{count:0}` → `{ok:false}` с «обновите».
   - **advance non-admin**: `auth`→`null` → `{ok:false}`, prisma не трогаем.
   - **cancel COD**: `findUnique`→ заказ PENDING, `payment:null`, 2 позиции; `updateMany`→`{count:1}`
     → `productVariant.update` дважды с `increment`, `adjustSalesCount(..., -1)`, `pruneReviewsAfterCancel`
     вызваны; `cancelPayment` НЕ вызван; `{ok:true}`.
   - **cancel online pending**: `payment:{id:'pay1',status:'pending'}` → `cancelPayment('pay1')` +
     `payment.update status:'canceled'`.
   - **cancel processing succeeded**: заказ PROCESSING, `payment.status:'succeeded'`, `updateMany`→`{count:1}`
     → отмена ок, `cancelPayment` НЕ вызван (не рефандим).
   - **cancel terminal**: `updateMany`→`{count:0}` → `{ok:false}`, `productVariant.update`/`adjustSalesCount`
     НЕ вызваны (без двойного возврата).
2. `npx vitest run tests/admin-orders-action.test.ts` → **FAIL**.
3. **Реализация** `app/actions/admin/orders.ts`:
   ```ts
   'use server';

   import { revalidatePath } from 'next/cache';
   import { requireAdminAction } from '@/lib/admin/require-admin';
   import { prisma } from '@/lib/prisma-client';
   import { orderStatusUpdateSchema } from '@/services/dto/order-admin.dto';
   import { nextOrderStatus } from '@/lib/order-admin';
   import { adjustSalesCount } from '@/lib/sales-count';
   import { cancelPayment } from '@/lib/yookassa';
   import { pruneReviewsAfterCancel } from '@/lib/review';
   import { logger } from '@/lib/logger';

   export type OrderActionResult = { ok: true } | { ok: false; error: string };
   const LIST_PATH = '/admin/orders';

   // Forward-переход по пайплайну. Чистая прогрессия — сток/платёж/salesCount не трогаем.
   export async function advanceOrderStatus(input: unknown): Promise<OrderActionResult> {
     const gate = await requireAdminAction();
     if (!gate.ok) return { ok: false, error: gate.error };

     const parsed = orderStatusUpdateSchema.safeParse(input);
     if (!parsed.success) return { ok: false, error: 'Некорректный статус' };
     const { orderId, toStatus } = parsed.data;

     const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
     if (!order) return { ok: false, error: 'Заказ не найден' };
     if (nextOrderStatus(order.status) !== toStatus) {
       return { ok: false, error: 'Недопустимый переход статуса' };
     }

     // Guarded one-shot: матчим текущий статус, чтобы не перепрыгнуть параллельное изменение.
     const res = await prisma.order.updateMany({
       where: { id: orderId, status: order.status },
       data: { status: toStatus },
     });
     if (res.count === 0) return { ok: false, error: 'Статус заказа изменился, обновите страницу' };

     revalidatePath(LIST_PATH);
     revalidatePath(`${LIST_PATH}/${orderId}`);
     return { ok: true };
   }

   // Отмена до отгрузки: PENDING/PROCESSING → CANCELLED. Возврат стока + salesCount −1
   // (+ отмена pending-платежа). Guarded updateMany = ровно один реальный переход (гонка с вебхуком).
   export async function cancelOrderByAdmin(orderId: string): Promise<OrderActionResult> {
     const gate = await requireAdminAction();
     if (!gate.ok) return { ok: false, error: gate.error };

     const order = await prisma.order.findUnique({
       where: { id: orderId },
       include: {
         items: { include: { productVariant: { select: { colorway: { select: { productId: true } } } } } },
         payment: true,
       },
     });
     if (!order) return { ok: false, error: 'Заказ не найден' };

     const res = await prisma.order.updateMany({
       where: { id: orderId, status: { in: ['PENDING', 'PROCESSING'] } },
       data: { status: 'CANCELLED' },
     });
     if (res.count === 0) return { ok: false, error: 'Этот заказ нельзя отменить' };

     // Pending-платёж: отменить в ЮKassa + отразить в записи. Succeeded НЕ рефандим (вне MVP).
     if (order.payment && order.payment.status === 'pending') {
       try {
         await cancelPayment(order.payment.id);
       } catch (e) {
         logger.error('admin_cancel_payment_failed', e, { orderId, paymentId: order.payment.id });
       }
       try {
         await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'canceled' } });
       } catch (e) {
         logger.error('admin_cancel_payment_status_failed', e, { orderId });
       }
     }

     // Возврат стока (списан при оформлении) — релятивно, применяется один раз (guard выше).
     for (const item of order.items) {
       try {
         await prisma.productVariant.update({
           where: { id: item.productVariantId },
           data: { stock: { increment: item.quantity } },
         });
       } catch (e) {
         logger.error('admin_cancel_stock_restore_failed', e, { orderId, variantId: item.productVariantId });
       }
     }

     await adjustSalesCount(
       order.items.map((i) => ({ productId: i.productVariant.colorway.productId, quantity: i.quantity })),
       -1,
     );

     // Отмена аннулирует «покупку» → снять осиротевшие отзывы (как клиентский cancelOrder).
     const productIds = [...new Set(order.items.map((i) => i.productVariant.colorway.productId))];
     await pruneReviewsAfterCancel(order.userId, productIds);

     revalidatePath(LIST_PATH);
     revalidatePath(`${LIST_PATH}/${orderId}`);
     revalidatePath('/profile');
     revalidatePath(`/orders/${order.orderNumber}`);
     return { ok: true };
   }
   ```
4. `npx vitest run tests/admin-orders-action.test.ts` → **PASS**. `npx tsc --noEmit` → чисто.
5. `git add app/actions/admin/orders.ts tests/admin-orders-action.test.ts && git commit -m "feat(orders): admin advance/cancel order actions with guarded stock restore"`

---

## Task 4: Список заказов — страница + фильтры + таблица

**Files** — Modify: `app/(admin)/admin/orders/page.tsx` (переписать заглушку).
Create: `_components/order-filters.tsx`, `_components/order-table.tsx`.

1. **`order-filters.tsx`** (клиент, калька `product-filters.tsx`): три контрола в URL — поиск `q`
   (Input + Enter), `status` (Select из `ORDER_STATUS_VALUES` + «Все статусы» + RU-лейблы из
   `ORDER_STATUS_META`), `payment` (Select: Все / Без оплаты(`none`) / Ожидает(`pending`) /
   Оплачен(`succeeded`) / Отменён(`canceled`)). `setParam` сбрасывает `page`, `router.push('/admin/orders?…')`.
2. **`order-table.tsx`** (клиент, калька `product-table.tsx`, БЕЗ delete/dropdown — строка-ссылка):
   ```ts
   export interface OrderRow {
     id: string; orderNumber: number; status: OrderStatus; paymentStatus: string | null;
     paymentMethod: string; contactName: string; contactEmail: string;
     itemCount: number; totalAmount: number; coverImage: string | null; addedAgo: string;
   }
   ```
   Колонки: № (orderNumber + addedAgo, ссылка на деталь), Покупатель (contactName + email), Позиции
   (миниатюра первой + itemCount шт.), Сумма (`formatPrice(totalAmount)`), Оплата
   (`paymentStatusView(paymentStatus).badge`/label + метка COD/online по paymentMethod), Статус
   (`orderStatusView(status, paymentStatus).badge`/label). Футер-пагинация `goPage` через
   URLSearchParams на `/admin/orders`. Вся строка кликабельна (или № как ссылка) → `/admin/orders/[id]`.
3. **`page.tsx`** (RSC, `export const dynamic = 'force-dynamic'`): парс фильтров/пагинации; `where`
   (status / payment relation `{ payment: { is: {status} } }` или `{ payment: { is: null } }` для `none` /
   OR-поиск контактов + числовой `orderNumber`); `Promise.all([count, findMany(select как §4.5),
   groupBy(['status'])])`; маппинг в `OrderRow[]` (`coverImage = items[0]?.imageUrl`, `itemCount =
   items.reduce(qty)`); шапка «Заказы (total)» + чипы-счётчики по статусам (groupBy); `<OrderFilters>`;
   `<OrderTable>` или пустое состояние «Заказы не найдены».
   - Поиск orderNumber: `const qNum = Number.isInteger(Number(q)) && q !== '' ? Number(q) : undefined;`
     добавить `{ orderNumber: qNum }` в OR только если `qNum !== undefined`.
4. `npx tsc --noEmit` → чисто. `npx vitest run` → весь набор зелёный (UI не тестим).
5. `git add app/\(admin\)/admin/orders/page.tsx "app/(admin)/admin/orders/_components/order-filters.tsx" "app/(admin)/admin/orders/_components/order-table.tsx" && git commit -m "feat(orders): admin orders list page with status/payment filters + pagination"`

---

## Task 5: Деталь заказа + действия статуса

**Files** — Create: `app/(admin)/admin/orders/[id]/page.tsx`,
`_components/order-status-actions.tsx`.

1. **`order-status-actions.tsx`** (клиент-остров, §4.7): пропсы `{ orderId, status }`. Кнопка «вперёд»
   по `nextOrderStatus(status)` с `FORWARD_ACTION_LABEL[status]` → `advanceOrderStatus`; кнопка «Отменить»
   при `canCancelOrder(status)` → `AlertModal` → `cancelOrderByAdmin`. Ошибки в `Dialog`. `loading`-стейт,
   `router.refresh()` на успехе. Терминальные — текст «Заказ завершён»/«Заказ отменён», без кнопок.
   (Radix-порталы Dialog/AlertModal уже портятся в `.admin-root` — паттерн готов.)
2. **`[id]/page.tsx`** (RSC): `findUnique({ where:{ id }, include:{ items:true, payment:true,
   user:{ select:{ name:true, email:true } } } })`; `if (!order) notFound()`. Рендер блоков из §4.6:
   шапка (#orderNumber, `formatAddedAgo(createdAt)`, бейдж статуса `orderStatusView`, бейдж оплаты
   `paymentStatusView`) + `<OrderStatusActions orderId={order.id} status={order.status} />`; покупатель;
   доставка; таблица позиций (снапшоты + `formatPrice`); итоги (`itemsTotal`, скидка+`couponCode`,
   `shippingAmount`, **`totalAmount`**); платёж (метод, бейдж, `formatPrice(amount)`, `paidAt`).
   `export const metadata`/`dynamic = 'force-dynamic'`. Ссылка «← К заказам» на `/admin/orders`.
3. `npx tsc --noEmit` → чисто. `npx vitest run` → зелёный.
4. `git add "app/(admin)/admin/orders/[id]/page.tsx" "app/(admin)/admin/orders/_components/order-status-actions.tsx" && git commit -m "feat(orders): admin order detail page with pipeline status actions"`

---

## Task 6: Финальная верификация + ручной чек-лист

**Files** — без изменений кода (правки по факту находок).

1. `npx prisma generate` (offline) → ок. `npx tsc --noEmit` → 0 ошибок.
2. `npx vitest run` → весь набор зелёный (≈ 355+ прежних + order-admin + admin-orders).
3. `grep -rn "/admin/orders" app/` — проверить, что ссылки/revalidate-пути консистентны
   (`/admin/orders`, `/admin/orders/[id]`).
4. **Ручной чек-лист на Vercel preview** (после пуша и деплоя):
   - [ ] `/admin/orders` открывается, список рендерит реальные заказы, чипы-счётчики по статусам.
   - [ ] Фильтр по статусу / по оплате / поиск по № и по имени/телефону/email — сужают список, пагинация.
   - [ ] Клик по строке → деталь заказа: контакты, доставка, позиции (снапшоты, фото), итоги, платёж.
   - [ ] Бейджи статуса и оплаты цветные внутри `.admin-root` (проверить `.badge-*` резолв токенов).
   - [ ] PENDING-заказ: «Взять в обработку» → PROCESSING; затем «Отметить отгруженным» → SHIPPED →
         «Отметить доставленным» → DELIVERED; на DELIVERED кнопок нет.
   - [ ] «Отменить заказ» из PENDING (AlertModal) → CANCELLED; в каталоге сток вернулся (товар +qty).
   - [ ] Отмена COD-заказа без платежа — без ошибок; отмена online-pending — платёж помечен canceled.
   - [ ] SHIPPED/DELIVERED — кнопки «Отменить» нет; невалидный forward не доступен в UI.
   - [ ] Светлая/тёмная тема — таблица, бейджи, модалки читаемы.
5. `git push -u origin feat/phase3.4-orders` → PR в web UI (gh не установлен).

## Self-Review (выполнено автором плана)

- **§3.1 пайплайн + отмена** → T1 (`nextOrderStatus`/`canCancelOrder`), T3 (guarded actions), T5 (UI). ✓
- **§3.2 отмена из PENDING/PROCESSING + возврат стока/salesCount** → T3 `cancelOrderByAdmin`
  (`updateMany IN`, `increment`, `adjustSalesCount(-1)`), тест-кейсы COD/online/processing/terminal. ✓
- **§3.3 без удаления** → в actions нет delete; таблица без delete-дропдауна. ✓
- **§3.4 фильтры статус+платёж+поиск, серверная пагинация** → T4 (`where`, `readEnumParam`, goPage). ✓
- **§3.5 смена статуса на детали** → T5 `OrderStatusActions` на `[id]`. ✓
- **§3.6 платёж: forward не трогает, succeeded не рефандим** → T3 (advance без payment; cancel
  `cancelPayment` только для `status==='pending'`). ✓
- **§4 schema без изменений** → ни одной правки `schema.prisma`, `prisma db push` не нужен. ✓
- **§6 тесты** → T1 (хелперы), T3 (экшены с моками). UI вручную (T6). ✓
- **Риск гонки с вебхуком** → guarded `updateMany`/`count`, тест terminal `count:0`. ✓
- **Конвенции**: RU-копирайт, EN-коммиты без Co-Authored-By, ветка `feat/phase3.4-orders`,
  один коммит на таск, без локального push/seed/e2e (Neon). ✓
