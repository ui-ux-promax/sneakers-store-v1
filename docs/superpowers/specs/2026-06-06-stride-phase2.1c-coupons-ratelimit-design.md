# STRIDE — Фаза 2.1c (Промокоды + rate-limit входа): дизайн

> **Статус:** на ревью.
> **Дата:** 2026-06-06. **Ветка:** `feat/phase2.1c-coupons` (от `main`).
> **Предшественник:** P2.1b (ЮKassa + DaData) — в проде, `main` (HEAD `5079d1c`). Research-карта: `docs/superpowers/research/2026-06-02-phase2-candidates.md`.
> **Прототип UI:** `ui-designe and prototypes/prototypes-app/checkout.html` / `cart.html` (промо-инпут в блоке «Итого»).

## §1. Цель и граница слайса

Закрыть **ядро конверсии P2.1** двумя оставшимися задачами:

1. **Промокоды (Coupon)** — процентная скидка на сумму товаров, вводится на `/checkout`. Снимаем disabled-шов промо-инпута.
2. **Реальный rate-limit входа** — заменить NOOP `checkAuthRateLimit` на Upstash sliding-window (исполнение отложенного Task 10 из плана P2.0). Единственный launch-блокер из auth-research.

**В объёме (промокоды):**
- Модель `Coupon` (процентная скидка, флаг `active`, опциональный `expiresAt`).
- Поля в `Order`: `couponCode String?` (снапшот) + `discountAmount Int @default(0)`.
- Server Action `validateCoupon` (preview скидки для текущей корзины) + расчёт скидки в `placeOrder` (источник истины).
- Расширение `checkoutSchema`: `couponCode?: string`.
- UI: активная секция «Промокод» в `checkout-form.tsx` + строка «Скидка» в сводке заказа.
- Купоны заводятся через **seed/вручную** (CRUD — Phase 3 admin).

**В объёме (rate-limit):**
- Upstash `@upstash/ratelimit` + `@upstash/redis`, `slidingWindow(5, '5 m')`.
- `checkLoginRateLimit(key)` в `lib/rate-limit.ts` (fail-open без env).
- Применение в `Credentials.authorize` (`auth.config.ts`) по ключу `ip:email`.

**Вне объёма:**
- Фиксированная скидка (₽) и «бесплатная доставка» как тип купона — **отложено** (этот слайс = только процент).
- `maxUses` / лимит на пользователя / `CouponRedemption` — **отложено** (нет счётчика → нет гонок).
- `minOrderAmount` — отложено.
- Применение купона на `/cart` — отложено (только `/checkout`).
- Mini-CRUD купонов в UI — Phase 3 (admin).
- Стэкинг купонов — нет, один код на заказ.

## §2. Предрешённые ограничения

- **Деньги:** `Int ₽` (как везде в проекте). Скидка — целые рубли, `Math.floor`.
- **Neon HTTP — без транзакций** ([[prisma-neon-no-transaction]]). В этом слайсе мультизаписей со счётчиками НЕТ (купон без `maxUses`): валидация купона — одиночный `findUnique`. `placeOrder` уже Neon-safe (P2.1a/b) — добавляем только поля в `Order.create`, новых записей не вводим.
- **Только для вошедших** — `/checkout` уже под middleware (P2.1a).
- **Схема применяется на деплое/CI** — `db push` в `vercel.json` + `e2e.yml` (P7). Локальный `db push` блокирован (P1017) → схему к прод-Neon применит прод-build при мерже.
- **rate-limit fail-open** — без `KV_REST_API_URL/TOKEN` лимитер пропускает всё (dev). В проде env обязателен.
- **Время:** `expiresAt` сравнивается с `new Date()` на сервере (server action / placeOrder — nodejs runtime).

## §3. Доменная модель

```prisma
model Coupon {
  id        String    @id @default(cuid())
  code      String    @unique          // нормализованный: trim + UPPERCASE
  percent   Int                        // 1..100 (процент скидки на сумму товаров)
  active    Boolean   @default(true)
  expiresAt DateTime?                   // null = бессрочный
  createdAt DateTime  @default(now())
}
```

Изменения в `Order` (новые поля, без relation на Coupon — снапшот кода, как с адресом):

```prisma
model Order {
  // ...существующие поля...
  itemsTotal     Int
  discountAmount Int     @default(0)   // НОВОЕ: скидка по промокоду, ₽
  shippingAmount Int
  totalAmount    Int                   // = itemsTotal - discountAmount + shippingAmount
  couponCode     String?               // НОВОЕ: снапшот применённого кода (или null)
  // ...
}
```

> Почему снапшот кода, а не FK на `Coupon`: купон могут удалить/деактивировать после заказа, а в истории заказа код должен сохраниться (как `sku`/`productName` в `OrderItem`). FK не нужен — связь односторонняя и историческая.

## §4. Расчёт скидки (единые правила)

```
itemsTotal      = Σ lineTotal (как сейчас, buildOrderSnapshot)
discountAmount  = coupon ? Math.floor(itemsTotal * coupon.percent / 100) : 0
shippingAmount  = calcShipping(itemsTotal, method)   // ВАЖНО: от itemsTotal, НЕ от (itemsTotal - discount)
totalAmount     = itemsTotal - discountAmount + shippingAmount
```

**Зафиксированные решения по расчёту:**
- Скидка применяется к **сумме товаров** (`itemsTotal`), не к доставке.
- Порог бесплатной доставки (`FREE_SHIPPING_THRESHOLD`) считается от `itemsTotal` **до** скидки — промокод не должен лишать бесплатной доставки (безопаснее для клиента, проще для расчёта).
- `discountAmount` не может превысить `itemsTotal` (percent ≤ 100 → гарантировано, но `Math.min` для страховки).
- В ЮKassa уходит уже `totalAmount` со скидкой (никаких изменений в `createPayment` — он получает итог).

## §5. Валидация купона

Чистая функция + server action.

```ts
// lib/coupon.ts
export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase();
}

export function calcCouponDiscount(itemsTotal: number, percent: number): number {
  return Math.min(itemsTotal, Math.floor((itemsTotal * percent) / 100));
}

// Результат проверки купона против БД (без привязки к корзине).
export type CouponCheck =
  | { ok: true; code: string; percent: number }
  | { ok: false; error: string };

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

### Server Action `validateCoupon` (preview)

```ts
// app/actions/coupon.ts
'use server';
export type ValidateCouponResult =
  | { ok: true; code: string; percent: number; discount: number }
  | { ok: false; error: string };

export async function validateCoupon(rawCode: string): Promise<ValidateCouponResult> {
  // 1. Проверить купон (checkCoupon).
  // 2. Прочитать корзину по cookie cartToken → itemsTotal (getCartDetails).
  // 3. discount = calcCouponDiscount(itemsTotal, percent).
  // 4. Вернуть { ok, code, percent, discount } для preview в UI.
}
```

> `validateCoupon` НЕ сохраняет ничего — только считает скидку для текущей корзины, чтобы UI показал её до оформления. Источник истины — `placeOrder` (повторная проверка).

## §6. Флоу применения (placeOrder)

`checkoutSchema` расширяется:
```ts
couponCode: z.string().trim().max(40).optional(),
```

В `placeOrder` (после `buildOrderSnapshot`, до декремента стока):

```
1. snapshot = buildOrderSnapshot(cart); itemsTotal = snapshot.itemsTotal
2. discountAmount = 0; couponCode = null
3. Если form.couponCode задан и непустой:
     check = await checkCoupon(form.couponCode)
     - check.ok === false → return { ok:false, error: check.error }   // купон протух пока висел чекаут — честно сообщаем
     - check.ok === true  → discountAmount = calcCouponDiscount(itemsTotal, check.percent); couponCode = check.code
4. shippingAmount = calcShipping(itemsTotal, form.shippingMethod)
5. totalAmount = itemsTotal - discountAmount + shippingAmount
6. ...декремент стока (без изменений)...
7. prisma.order.create({ data: { ..., itemsTotal, discountAmount, shippingAmount, totalAmount, couponCode } })
8. ...OrderItem, Payment (totalAmount уже со скидкой), очистка корзины — без изменений...
```

**Поведение при невалидном купоне на submit:** возвращаем ошибку (не молча обнуляем) — пользователь видел скидку, итог изменится, честнее показать «Промокод больше недействителен». Это до декремента стока → откатывать нечего.

## §7. UI

### `checkout-form.tsx` — секция «Промокод» (активная)

Новая секция в левой колонке (после «Способ оплаты») ИЛИ компактно в сводке заказа (правая `<aside>`). Решение: **в сводке заказа** (там же, где итог — ближе к прототипу `cart.html`).

Локальное состояние формы:
```ts
const [coupon, setCoupon] = useState<{ code: string; percent: number; discount: number } | null>(null);
const [couponInput, setCouponInput] = useState('');
const [couponError, setCouponError] = useState<string | null>(null);
```

- Поле ввода + кнопка «Применить» → `validateCoupon(couponInput)`:
  - успех → `setCoupon({code, percent, discount})`, `setValue('couponCode', code)` (RHF hidden), очистить ошибку.
  - неуспех → `setCouponError(error)`, `setCoupon(null)`, `setValue('couponCode', '')`.
- Если купон применён — показать строку «Скидка ({percent}%)» с `−{formatPrice(discount)}` (зелёным) + кнопку «убрать» (× → сброс `coupon`/`couponCode`).
- `couponCode` регистрируется в форме как скрытое поле (`register('couponCode')` или `setValue`) — уходит в `placeOrder`.

Пересчёт итога на клиенте:
```ts
const discount = coupon?.discount ?? 0;
const shipping = calcShipping(details.totalAmount, shippingMethod);
const total = details.totalAmount - discount + shipping;
```

Сводка (в `<aside>`):
```
Товары            {itemsTotal}
Скидка (10%)     −{discount}        ← только если coupon
Доставка          {shipping|Бесплатно}
─────────────────────────
Итого             {total}
```

### `order-summary.tsx` (страница `/cart`)

Disabled-заглушка промо-инпута остаётся (купон вводится на `/checkout`). Опционально: сменить `title` на «Промокод можно ввести при оформлении заказа» (косметика, не обязательно).

### `/orders/[number]` — отображение скидки

Если `order.discountAmount > 0` — показать строку «Скидка ({couponCode})» с `−{formatPrice(discountAmount)}` в разбивке заказа (рядом с itemsTotal/shipping).

## §8. Seed купонов

В `prisma/seed.ts` добавить блок upsert демонстрационных купонов (идемпотентно, по `code`):

```ts
const coupons = [
  { code: 'STRIDE10', percent: 10, active: true, expiresAt: null },
  { code: 'WELCOME15', percent: 15, active: true, expiresAt: null },
  { code: 'EXPIRED',   percent: 50, active: true, expiresAt: new Date('2020-01-01') }, // для e2e негатива
];
for (const c of coupons) {
  await prisma.coupon.upsert({ where: { code: c.code }, update: c, create: c });
}
```

> `upsert` по `@unique code` — Neon-safe (одиночная операция). `EXPIRED` нужен e2e-тесту на отказ.

## §9. Rate-limit входа (Task 10 из P2.0)

Исполнение плана `docs/superpowers/plans/2026-06-02-stride-phase2-auth.md` Task 10 (дизайн там же).

- `npm install @upstash/ratelimit @upstash/redis`.
- `lib/rate-limit.ts`: добавить `checkLoginRateLimit(key)` — ленивая инициализация `Ratelimit` (`slidingWindow(5, '5 m')`, `prefix: 'stride-app:login'`), fail-open если env нет. Существующие `extractClientIp`/`isRateLimitConfigured`/`RateLimitResult`/`checkAuthRateLimit`/`checkCartRateLimit` — не ломать (можно оставить `checkAuthRateLimit` как тонкий враппер над `checkLoginRateLimit` или удалить NOOP, заменив вызовы).
- `auth.config.ts`: в `Credentials.authorize(creds, request)` — динамический импорт `checkLoginRateLimit`/`extractClientIp`, проверка `ip:email` ДО запроса к БД и argon2 (защита от DoS). Лимит превышен → `return null` (как неверные данные).
- `.env.example`: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

> argon2-DoS: проверка лимита должна идти **до** `verifyPassword` (дорогой argon2). Сейчас от DoS защищает только pre-hash dedupe — лимитер закрывает этот вектор.

## §10. Тестирование

**Юнит (Vitest):**
- `normalizeCouponCode`: trim + uppercase; пустое → ''.
- `calcCouponDiscount`: 10% от 10000 = 1000; floor (33% от 100 = 33); clamp (не больше itemsTotal).
- `checkCoupon` (мок prisma): валидный → ok; неактивный → отказ; истёкший → отказ; несуществующий → отказ; бессрочный (expiresAt=null) → ok.
- `placeOrder` (мок prisma): с валидным купоном → Order.create получает discountAmount/couponCode, totalAmount со скидкой; с истёкшим → `{ ok:false }`, заказ не создан; без купона → discountAmount=0, регрессия P2.1a/b.
- `checkLoginRateLimit`: fail-open без env (success=true).

**Интеграция (e2e, CI/Ubuntu):** `e2e/coupon.spec.ts`:
- Применить `STRIDE10` на /checkout → строка «Скидка» видна, итог уменьшился на 10%.
- Применить `EXPIRED` → ошибка «истёк», итог не меняется.
- Применить мусор → ошибка «недействителен».
- Оформить заказ с купоном → `/orders/[number]` показывает скидку и корректный итог.
- a11y: /checkout (с купон-секцией) проходит axe.

> e2e зависят от seed-купонов в CI-БД (seed гоняется перед e2e — проверить `e2e.yml`).

## §11. Конфигурация

Новые env (rate-limit; промокоды env не требуют):
```bash
KV_REST_API_URL=""      # Upstash Redis REST URL (Vercel KV)
KV_REST_API_TOKEN=""    # Upstash Redis REST token
```
Без них rate-limit fail-open (dev/preview работают). В проде — задать в Vercel до мержа.

## §12. Критерии готовности

- [ ] typecheck 0, vitest зелёные (+ новые coupon/rate-limit сьюты), build OK, middleware ~86 kB (Upstash не утёк в edge).
- [ ] Промокод процентный применяется на /checkout: preview-скидка, корректный итог.
- [ ] Истёкший/неактивный/несуществующий код → понятная ошибка, итог без скидки.
- [ ] Заказ с купоном: `Order.discountAmount`/`couponCode` сохранены, `totalAmount` со скидкой; в ЮKassa уходит итог со скидкой.
- [ ] `/orders/[number]` показывает скидку.
- [ ] COD/online флоу без купона не сломаны (регрессия P2.1a/b).
- [ ] rate-limit входа активен при заданном Upstash (5 попыток / 5 мин), fail-open без env; проверка до argon2.
- [ ] seed заводит демо-купоны идемпотентно.
- [ ] e2e зелёные в CI.

## §13. Зафиксированные допущения

- Только процентная скидка; фикс-сумма и free-shipping-купоны — позже.
- Без `maxUses`/лимита на юзера → купон многоразовый в пределах срока; нет счётчиков → нет гонок, таблица redemption не нужна.
- Скидка к `itemsTotal`; порог бесплатной доставки — от `itemsTotal` до скидки.
- Купон — снапшот кода в `Order.couponCode` (без FK на `Coupon`).
- Купоны заводятся seed/вручную; admin-CRUD — Phase 3.
- rate-limit — исполнение Task 10 P2.0 (дизайн в auth-плане); fail-open в dev.
- Применение купона только на `/checkout` (не на `/cart`).
