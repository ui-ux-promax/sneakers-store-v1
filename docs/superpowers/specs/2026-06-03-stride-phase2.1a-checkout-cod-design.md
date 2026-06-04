# STRIDE — Фаза 2.1a (Checkout COD + Orders): дизайн

> **Статус:** реализовано (P2.1a).
> **Дата:** 2026-06-03. **Ветка:** `feat/phase2.1-checkout`.
> **Предшественники:** P2.0 Auth (в проде, `main`). Research-карта: `docs/superpowers/research/2026-06-02-phase2-candidates.md`.
> **Прототип UI:** `ui-designe and prototypes/prototypes-app/checkout.html`, `profile.html` (вкладка «Мои заказы»).

## §1. Цель и граница слайса

Дать **сквозное оформление заказа с оплатой при получении (COD)**: корзина → `/checkout` → заказ → история в профиле. P2.1 целиком (XL, 7 подсистем) декомпозирована; это **первый слайс (P2.1a)**.

**В объёме:**
- Модели `Order` / `OrderItem` (+ enum `OrderStatus`), снапшот цен/SKU/имени/адреса.
- Server Action оформления `placeOrder` с прямым декрементом стока и компенсацией (без транзакций — Neon HTTP).
- Отмена заказа пользователем (`PENDING` → `CANCELLED` + возврат стока).
- Страница `/checkout` (контакты, адрес, доставка, оплата), `/orders/[number]` (подтверждение = деталь), наполнение вкладки «Мои заказы».
- Доставка: флэт-ставка / бесплатно от порога / самовывоз = 0.

**Вне объёма (швы оставляем видимыми/disabled, отдельные слайсы):**
- Онлайн-оплата ЮKassa («Картой онлайн» — disabled-шов).
- Промокоды (промо-инпут — disabled-шов).
- Отдельная модель `Address` (сохранённые адреса) — адрес хранится снапшотом в `Order`.
- Смена статусов админом, «Отследить»/«Повторить заказ», налоги.

## §2. Предрешённые ограничения (из Фазы 1 / стека)

- **Деньги — `Int` ₽** (как Фаза 1; ×100 на копейки — только на границе ЮKassa, не в этом слайсе).
- **Neon HTTP — без `$transaction`** (`lib/prisma-client.ts`). Все мультизаписи — последовательные `await` + условные `update` + ручная компенсация + встроенный `retryOnTransient`. Гонки — через условие в `WHERE`, не find-then-update (TROUBLESHOOTING P5).
- **`FREE_SHIPPING_THRESHOLD = 10 000 ₽`** уже в конфиге, показывается в корзине.
- **Только для вошедших** — `Order.userId` обязателен; `/checkout` и `/orders` под middleware (как `/profile`).
- **Схема применяется на деплое/CI** — `prisma db push` в `vercel.json` (прод/preview) и `e2e.yml` (CI). Отдельной настройки не требуется (дивиденд P7, см. [[neon-schema-not-auto-applied]]).

## §3. Доменная модель

```prisma
enum OrderStatus {
  PENDING      // создан, ожидает обработки (COD) — отображается «Оформлен»
  PROCESSING   // «Обрабатывается»
  SHIPPED      // «В пути»
  DELIVERED    // «Доставлен»
  CANCELLED    // «Отменён»
}

model Order {
  id             String      @id @default(cuid())
  orderNumber    Int         @unique @default(autoincrement())  // человекочитаемый «Заказ #1025»
  userId         String
  user           User        @relation(fields: [userId], references: [id])
  status         OrderStatus @default(PENDING)

  // Снапшот контактов
  contactName    String
  contactPhone   String
  contactEmail   String

  // Снапшот адреса (без отдельной модели Address)
  shippingMethod String      // 'courier' | 'pickup'
  city           String
  addressLine    String
  addressComment String?

  // Деньги — Int ₽
  itemsTotal     Int
  shippingAmount Int
  totalAmount    Int

  paymentMethod  String      // 'cod' (онлайн — следующий слайс)

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
  productVariantId String                                  // для возврата стока при отмене
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id])

  // Снапшоты (вариант/цена могут измениться)
  sku          String
  productName  String
  colorwayName String
  sizeEu       String    // нормализованный снапшот для отображения, напр. «42.5» (display-only)
  imageUrl     String?
  unitPrice    Int
  quantity     Int
  lineTotal    Int       // unitPrice * quantity

  @@index([orderId])
}
```

Relation-поля: `User.orders Order[]`, `ProductVariant.orderItems OrderItem[]`.

**Решения:** `orderNumber` — `autoincrement` (Neon поддерживает) для «Заказ #N», `id` остаётся cuid. `productVariantId` в `OrderItem` сохраняется (нужен для возврата стока), снапшоты защищают историю от изменений товара. `shippingMethod`/`paymentMethod` — строки (мало значений, расширяемо без миграций).

## §4. Оформление заказа — `placeOrder` (Server Action)

Подход **A (декремент-первым)**. Авто-CSRF Next 15. Клиент НЕ передаёт корзину/цены — сервер перечитывает из БД.

```
1. auth() → userId (страховка к middleware).
2. Zod checkoutSchema; paymentMethod === 'cod' иначе отказ (онлайн — disabled-шов И серверный отказ).
3. Re-read корзины по cartToken (cookie) + cartInclude. Пустая → ошибка «Корзина пуста».
4. Server-side пересчёт: unitPrice = variant.price (из БД). Если любой вариант/товар стал
   `active=false` к моменту checkout → ОТКЛОНИТЬ заказ с явной ошибкой («Товар "<name>" больше
   недоступен, удалите его из корзины»), НЕ ронять позицию молча и НЕ списывать сток.
   Снапшоты (sku/name/colorway/size/image); itemsTotal = Σ lineTotal;
   shippingAmount = calcShipping(itemsTotal, method); totalAmount = itemsTotal + shippingAmount.
5. ДЕКРЕМЕНТ: на каждую позицию updateMany({ where:{ id, stock:{ gte: qty } }, data:{ stock:{ decrement: qty } } });
   count===1 → в decremented[]; иначе СБОЙ → компенсировать decremented[] (increment) → ошибка
   «Товара не хватило на складе» (с позицией).
6. order.create({ data: { ...снапшоты, items:{ create:[...] } } }); сбой → компенсировать ВЕСЬ decremented[] → ошибка.
7. Очистка корзины (deleteMany + recalc → 0). Сбой — BEST-EFFORT: лог 'order_cart_cleanup_failed', заказ НЕ откатываем.
8. return { ok:true, orderNumber }. Форма редиректит на /orders/[orderNumber].
```

**Чистые функции (TDD):**
- `calcShipping(itemsTotal, method, { threshold, flat })`: `pickup`→0; `courier`→ `itemsTotal >= threshold ? 0 : flat`.
- `buildOrderSnapshot(cartDetails, form)`: массив снапшотов + `itemsTotal` (без БД).

**Остаточный риск (осознанный):** без транзакций краш строго между шагами 5–6 оставит декремент без заказа; компенсация покрывает все ловимые сбои, неоткомпенсируемый край — «подвисший» сток на один заказ (как и в Фазе 1). Очистка корзины best-effort: валидный заказ не откатывается из-за косметики.

## §5. Отмена заказа — `cancelOrder(orderId)` (Server Action)

```
1. auth() → userId.
2. Прочитать заказ с items; проверки → дженерик-ошибка «Этот заказ нельзя отменить»:
   order.userId === session.userId; order.status === 'PENDING'.
3. ЗАМОК ОТ ГОНКИ: updateMany({ where:{ id, userId, status:'PENDING' }, data:{ status:'CANCELLED' } }).
   count===0 → уже не PENDING → «Заказ уже обработан». Сток возвращаем ТОЛЬКО при count===1.
4. ВОЗВРАТ СТОКА: на каждую позицию variant.update({ data:{ stock:{ increment: qty } } });
   сбой отдельного increment → лог 'cancel_stock_restore_failed', продолжаем (статус уже CANCELLED).
5. revalidatePath('/orders/[number]') + '/profile'. return { ok:true }.
```

**Решения:** условие `status:'PENDING'` в `WHERE` — единственный замок от двойного возврата стока (тот же приём single-use). Авторизация (`userId`) — в `WHERE`, не только в коде. Возврат стока — после смены статуса (не откатываем CANCELLED при сбое increment, иначе риск двойного возврата); недовозврат на позицию при редком сбое логируется для ручной правки.

## §6. Роуты, UI, навигация

Защита: middleware + `auth.config.authorized` — `/checkout`, `/orders` добавляются к `/profile` (гость → `/login`). Вёрстка — из прототипа `checkout.html` класс-в-класс с UI-kit (как auth в P2.0).

| Файл | Назначение |
|---|---|
| `app/checkout/page.tsx` | RSC: `auth()`, re-read корзины (пустая → редирект `/cart`), префилл контактов из профиля → `<CheckoutForm>`. |
| `components/shared/checkout/checkout-form.tsx` | `'use client'`, RHF+zod. Секции: контакты / адрес / доставка (radio Курьер·Самовывоз) / оплата (radio: «При получении» актив, «Картой онлайн» disabled-шов). Сайдбар-итог с пересчётом доставки. CTA «Оформить заказ →». Вызывает `placeOrder`. |
| `app/actions/order.ts` | `placeOrder`, `cancelOrder` (§4–§5). |
| `services/dto/order.dto.ts` | `checkoutSchema` (контакты, адрес, `shippingMethod∈{courier,pickup}`, `paymentMethod==='cod'`). |
| `lib/order.ts` | `calcShipping`, `buildOrderSnapshot`, `ORDER_STATUS_META` (label + badge-класс). |
| `app/orders/[number]/page.tsx` | RSC, owner-guard (`order.userId===session.id`, иначе 404). Подтверждение = деталь. Кнопка «Отменить заказ» если `PENDING`. |
| `components/shared/profile/orders-list.tsx` | Карточки заказов (номер, дата, статус-бейдж, до 3 миниатюр, сумма, ссылка). Пустое «Заказов пока нет». |
| `app/profile/page.tsx`, `profile-view.tsx` | Вкладка «Мои заказы» → реальные заказы (грузим в RSC, пропсом в client-таб); заглушку заменяем. |
| `components/shared/cart/order-summary.tsx` | disabled-кнопка (стр. 40) → `<Link href="/checkout">`. Промо-инпут остаётся disabled. |
| `constants/*` | `SHIPPING_FLAT` — конфиг-константа курьерской ставки ниже порога (стартовое значение 500₽, меняется правкой конфига, не кода); `FREE_SHIPPING_THRESHOLD` уже есть. |

**Статусы → UI (`ORDER_STATUS_META`):** `PENDING`→«Оформлен» (info); `PROCESSING`→«Обрабатывается» (warning); `SHIPPED`→«В пути» (info); `DELIVERED`→«Доставлен» (success); `CANCELLED`→«Отменён» (danger, сумма зачёркнута). Ссылка карточки всегда «Подробнее» → ведёт на деталь заказа.

**Отмена — единая точка на детали заказа:** действие `cancelOrder` (с предварительным client-confirm) живёт только на странице `/orders/[number]` (кнопка «Отменить заказ» при `PENDING`). Карточка в «Мои заказы» отмену не вызывает — только навигирует на деталь, чтобы подпись не вводила в заблуждение.

**Поток:** `/cart` → «Оформить заказ» → `/checkout` → `placeOrder` → `/orders/[number]` → виден в `/profile`; пока PENDING — отменяем.

## §7. Тестирование

Стратегия P2.0 (TROUBLESHOOTING P4): чистая логика — юниты (TDD, мок Prisma); интеграция — e2e в CI (Ubuntu); локально — typecheck + vitest + build.

**Юнит (Vitest):**
- `calcShipping`: pickup→0; courier ниже порога→flat; на пороге/выше→0; границы.
- `buildOrderSnapshot`: корректные снапшоты, `itemsTotal=Σ`, целые деньги.
- `placeOrder` (мок prisma): успех; нехватка на 2-й позиции → компенсация 1-й + ошибка, Order не создан; сбой order.create → компенсация всех; пустая корзина → ошибка; `paymentMethod!=='cod'` → отказ.
- `cancelOrder` (мок): чужой → отказ, сток цел; не-PENDING → отказ; гонка (count===0) → сток не возвращён; успех → increment по всем.

**E2E (Playwright, CI):**
- Залогинен → add-to-cart → `/checkout` → оформить → редирект `/orders/[n]`, статус «Оформлен», суммы верны; заказ в «Мои заказы».
- Отмена PENDING → «Отменён»; повторная недоступна.
- Гость → `/checkout` → редирект `/login`.
- Курьер ниже порога даёт +`SHIPPING_FLAT`; самовывоз = 0.
- a11y (axe): `/checkout` (+ `/orders/[n]` при наличии сессии-фикстуры).

## §8. Критерии готовности

- [ ] typecheck 0; vitest зелёные; build OK; middleware не распух (argon2/prisma не в edge).
- [ ] Сквозной COD-заказ: cart → checkout → order → история.
- [ ] Сток списывается при заказе; при нехватке — заказ не создаётся, сток не теряется.
- [ ] Отмена PENDING возвращает сток; двойная отмена не задваивает.
- [ ] `/checkout`, `/orders/*` под защитой; чужой заказ → 404.
- [ ] Доставка верна (флэт / бесплатно-от-порога / самовывоз 0).
- [ ] Швы на месте: «Картой онлайн» и промокод — disabled.
- [ ] e2e + a11y зелёные в CI.

## §9. Зафиксированные допущения

- COD-only; онлайн-оплата и резерв-с-окном — следующий слайс (там появится `InventoryReservation`/окно оплаты).
- Адрес — снапшот в `Order`; модель `Address` и выбор сохранённых — позже.
- Смена статусов (кроме отмены пользователем) — будущая admin-фаза; заказы остаются `PENDING` до неё.
- Промокоды — следующий слайс (движок скидок отсутствует).
- Без транзакций возможен редкий неоткомпенсированный край стока (краш между декрементом и созданием/возвратом) — приемлемо для MVP, логируется.
