# STRIDE — Миграция транспорта БД: Neon HTTP → WebSocket

> **For agentic workers:** инфра-слайс. Чистой логики нет → TDD неприменим; верификация — гейты (typecheck/vitest/build) + **обязательный e2e в CI** (транзакции на WS проверяются только реальной БД). Steps — чекбоксами.

**Goal:** Сменить транспорт Prisma-клиента с Neon HTTP (`PrismaNeonHTTP`, без транзакций) на Neon WebSocket (`PrismaNeon`, `$transaction` доступен), оставшись на Neon. Снять первопричину `P5/P7/P9` ([[prisma-neon-no-transaction]]) для всех будущих слайсов.

**Обоснование:** оценка в `docs/superpowers/research/2026-06-06-neon-http-vs-websocket-assessment.md`. Греп доказал: приложение нигде не на edge при работе с БД → edge-преимущество HTTP не используется, а налог (нет транзакций) платится.

**Архитектура:** замена адаптера в `lib/prisma-client.ts` (1 файл) + `ws` + правка `next.config.mjs` (ws в external/edge-alias). Код запросов НЕ переписывается (одиночные `await` работают на WS как есть). Рефакторинг компенсаций в транзакции — **вне этого слайса** (follow-up).

**Tech Stack:** Prisma 6.19.3 + `@prisma/adapter-neon` (`PrismaNeon`), `@neondatabase/serverless` (уже стоит), `ws`, Next 15.1 (Node runtime). **Ветка:** `feat/neon-websocket` (от `main`).

---

## Соглашения

1. Пути от `stride-app/`, команды оттуда. Коммиты — английский, conventional, без `Co-Authored-By`, автор `ui-ux-promax` ([[commit-pr-conventions]]).
2. **Connection string для WS — pooled** (`POSTGRES_URL`, эндпоинт `-pooler`). Сейчас приоритет у `POSTGRES_URL_NON_POOLING` (HTTP-специфика) — инвертировать. `POSTGRES_URL_NON_POOLING`/`directUrl` остаются для migrate/db push.
3. **e2e только в CI** (Ubuntu) — локально Windows флакает ([[local-e2e-neon-latency]]). Локально: typecheck + vitest + build. Транзакции на реальной БД проверяет CI.
4. **db push локально блокирован (P1017)** — схему не трогаем в этом слайсе (миграция транспорта, не схемы).
5. **Edge-чистота:** `ws`/prisma/argon2 не должны попасть в edge-бандл middleware (целевой размер ~86 kB). `middleware.ts` не импортирует `prisma-client`, но `auth.config` lazy-импортит его внутри `authorize` → edge-alias в `next.config.mjs` обязан стабить и `ws`.

---

## Regression watch (ответ на «сломаются ли обходы P5/P7/P9?»)

**Нет.** Этот слайс НЕ удаляет ни одного обхода — компенсационная логика остаётся байт-в-байт (трогаем только транспорт). Все обходы используют HTTP-safe подмножество (одиночные create/update/delete/deleteMany/upsert/один raw-statement), которое WebSocket поддерживает полностью (WS ⊇ HTTP). Инвентарь обходов в коде на момент миграции: `cart-merge.ts` (seq+компенсация), `order.ts` placeOrder (findUnique+update decrement, per-item orderItem.create, restoreStock, deleteMany cleanup) и cancelOrder (update+increment), `cart.ts` recalc (read-once+update), `seed.ts` (per-row upsert + `$executeRawUnsafe` TRUNCATE). Все работают на WS без изменений.

**Что отличается на WS — проверить в e2e (Task 6), НЕ переписывать заранее:**
1. **Соединение/Pool:** появляются idle-disconnect/`Connection terminated`/`socket hang up`. Уже покрыто `retryOnTransient` (prisma-client.ts перечисляет эти сигнатуры). Watch: e2e не должен флакать на коннектах; если флакает — pooled URL + проверить, что retry срабатывает.
2. **Pooled endpoint** (PgBouncer): driver-adapter режим штатен, но pooled `POSTGRES_URL` должен существовать/работать (Task 4).
3. **Парсинг Decimal/Date:** `sizeEu Decimal(3,1)` и `DateTime`-поля заказов — глянуть в e2e, что значения/итоги/даты не поехали (HTTP `neon()` и Pool — разные пути парсинга у `@neondatabase/serverless`).
4. **`prisma-neon-name-cast` (`::text`)** — в активном коде ОТСУТСТВУЕТ (греп чист), не регрессия.

**Откат:** revert 4 коммитов слайса (код запросов не тронут) — возврат на HTTP за минуты.

---

## Task 1: Установить `ws`

**Files:** `stride-app/package.json`

- [ ] **Step 1:** Run (из `stride-app/`):
```bash
npm install ws
npm install -D @types/ws
```
> `@neondatabase/serverless` (Pool/WebSocket) требует `webSocketConstructor` в Node — это `ws`. На Vercel Node runtime `ws` нужен явно.

- [ ] **Step 2:** Проверка: `npm ls ws @types/ws` — разрешены без UNMET.

- [ ] **Step 3: Commit**
```bash
git add stride-app/package.json stride-app/package-lock.json
git commit -m "chore(stride-app): add ws for Neon WebSocket transport"
```

---

## Task 2: Переписать `lib/prisma-client.ts` на WebSocket-адаптер

**Files:** `stride-app/lib/prisma-client.ts`

- [ ] **Step 1: Заменить импорт и сборку адаптера**

Заменить шапку (строки 1–43) — `PrismaNeonHTTP` → `PrismaNeon`, добавить `ws`, убрать HTTP-специфичный `fetchWithTimeout`/`neonConfig.fetchFunction`, инвертировать приоритет connection string на pooled:
```ts
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Neon WebSocket-транспорт: постоянный сокет поверх @neondatabase/serverless.
// В ОТЛИЧИЕ от HTTP — поддерживает $transaction / createMany / nested-create.
// Connection string — POOLED (эндпоинт -pooler); миграции используют directUrl/NON_POOLING.
neonConfig.webSocketConstructor = ws;

const getConnectionString = () =>
  process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;

const buildAdapter = () => {
  const connectionString = getConnectionString();
  if (!connectionString) return undefined;
  return new PrismaNeon({ connectionString });
};
```
> Удаляются: `getNeonFetchTimeoutMs`, `NEON_FETCH_TIMEOUT_MS`, `fetchWithTimeout`, `neonConfig.fetchFunction = ...` (всё HTTP-only). `NEON_FETCH_TIMEOUT_MS` env больше не используется.

- [ ] **Step 2: Сохранить retry/singleton как есть**

`TRANSIENT_*`, `isTransientError`, `retryOnTransient`, `prismaClientSingleton`, `$extends`, `globalThis.prismaGlobal` — НЕ трогать (retry полезен и на WS). Проверить, что `buildAdapter()` по-прежнему вызывается в `prismaClientSingleton`.

- [ ] **Step 3: Проверка типов**
Run: `npm run typecheck` → 0 ошибок (`PrismaNeon` — валидный тип адаптера; сигнатура `.$extends` не менялась).

- [ ] **Step 4: Commit**
```bash
git add stride-app/lib/prisma-client.ts
git commit -m "feat(stride-app): switch Prisma to Neon WebSocket transport (enables $transaction)"
```

---

## Task 3: `next.config.mjs` — `ws` в external + edge-alias

**Files:** `stride-app/next.config.mjs`

- [ ] **Step 1: Добавить `ws` в `serverExternalPackages`**
```js
serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless', 'ws'],
```

- [ ] **Step 2: Добавить `ws` в edge-alias-стаб**

В блоке `if (nextRuntime === 'edge')` дописать:
```js
        ws: false,
```
> `auth.config` lazy-импортит `prisma-client` (теперь тянет `ws`) внутри `authorize`; на edge `authorize` не вызывается, но статический резолвер должен видеть стаб. Без этого edge-бандл middleware может разрастись/упасть.

- [ ] **Step 3: Build + проверка размера middleware**
Run: `npm run build`
Expected: сборка успешна; в выводе middleware ~86 kB (НЕ разросся — `ws`/prisma не утекли в edge). Если middleware распух — проверить alias-стаб `ws`.

- [ ] **Step 4: Commit**
```bash
git add stride-app/next.config.mjs
git commit -m "chore(stride-app): keep ws out of edge bundle (external + edge alias stub)"
```

---

## Task 4: Env-сверка + `.env.example`

**Files:** `stride-app/.env.example`

- [ ] **Step 1: Подтвердить pooled `POSTGRES_URL`**

Убедиться (по `.env.example` и в Vercel — пользователь подтверждает), что `POSTGRES_URL` указывает на **pooled** Neon-эндпоинт (`...-pooler.<region>.aws.neon.tech`). Это важно для лимита коннектов в serverless (Task 3 оценки, риск 2). `POSTGRES_URL_NON_POOLING` — direct (для migrate/db push), остаётся.

- [ ] **Step 2: Обновить комментарии в `.env.example`**

Пометить: `POSTGRES_URL` — pooled (используется приложением через WS-адаптер); `POSTGRES_URL_NON_POOLING` — direct (Prisma migrate/db push). Убрать упоминание `NEON_FETCH_TIMEOUT_MS`, если оно там было (HTTP-only, удалено).

- [ ] **Step 3: Commit**
```bash
git add stride-app/.env.example
git commit -m "docs(stride-app): clarify pooled vs direct Neon URLs for WS transport"
```

---

## Task 5: Локальные гейты

- [ ] **Step 1: Полный прогон**
Run из `stride-app/`:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck 0; vitest — все зелёные (тесты мокают prisma → транспорт им безразличен, регрессии быть не должно); build OK, middleware ~86 kB.

- [ ] **Step 2:** Если что-то красное — чинить до зелёного перед пушем (e2e в CI запускать только на зелёных локальных гейтах).

---

## Task 6: Верификация на CI (главная проверка транзакций)

**Files:** возможно `stride-app/tests/` (опц. smoke-тест транзакции)

- [ ] **Step 1: (опц.) Smoke-доказательство, что `$transaction` теперь работает**

Можно добавить временный/постоянный smoke в e2e или мелкий скрипт: операция, которая раньше падала на HTTP (например `prisma.$transaction([prisma.coupon... ])` — но Coupon появляется в P2.1c; до него можно проверить любой `$transaction([findMany, count])`). Минимально: НЕ обязательно — основная проверка в том, что существующие order-флоу проходят e2e на WS.

- [ ] **Step 2: Push ветки + прогон CI**
```bash
git push -u origin feat/neon-websocket
```
- [ ] **Step 3: Дождаться зелёного CI**

`e2e.yml` поднимает CI-БД (`prisma:push`) и гоняет Playwright. Зелёный прогон = WS-транспорт работает с реальным Neon (checkout/order/cancel/payment/cart-merge). Это и есть доказательство, что транзакции/сессии на WS живые в проде-подобной среде.
> Если e2e упадёт на коннектах/таймаутах WS — проверить, что CI-env использует pooled `POSTGRES_URL` и `ws` установлен (Task 1 в package-lock).

---

## Task 7: Финал — обновить документацию ограничений

**Files:** `docs/TROUBLESHOOTING.md`, research-док, memory

- [ ] **Step 1: Пометить P5/P7/P9 как снятые сменой транспорта**

В `docs/TROUBLESHOOTING.md` к записям про «Neon HTTP без транзакций» добавить апдейт: с `feat/neon-websocket` транспорт = WebSocket, `$transaction`/`createMany`/nested-create доступны; ограничение историческое. НЕ удалять записи (объясняют, почему текущий код написан на компенсациях).

- [ ] **Step 2: Отметить research реализованным**

В `docs/superpowers/research/2026-06-06-neon-http-vs-websocket-assessment.md` секцию «Решение» дополнить: миграция выполнена, CI зелёный.

- [ ] **Step 3: Commit**
```bash
git add docs/TROUBLESHOOTING.md docs/superpowers/research/2026-06-06-neon-http-vs-websocket-assessment.md
git commit -m "docs: Neon transport migrated to WebSocket; transaction limits lifted"
```

- [ ] **Step 4: Завершение ветки**

`superpowers:finishing-a-development-branch`: PR `feat/neon-websocket` → `main`, дождаться зелёного CI, **мержит пользователь**. После мержа прод-build задеплоит WS-клиент.
> Прод-предусловие: `POSTGRES_URL` в Vercel — pooled (обычно так из Neon-интеграции). Доп. env не требуется.

---

## Follow-up (ВНЕ этого слайса — отдельные задачи потом)

После миграции можно постепенно упростить ручные компенсации в транзакции (по одному месту, с e2e-проверкой):
- `placeOrder` (`app/actions/order.ts`): декремент стока + создание Order + OrderItem + Payment → `$transaction` (атомарность вместо restoreStock-компенсаций).
- `cancelOrder`: смена статуса + возврат стока → `$transaction`.
- `mergeGuestCart` (`lib/cart-merge.ts`): increments + creates + delete prior cart → `$transaction`.
- Позиции заказа — `createMany` вместо цикла одиночных insert.
> Каждый рефактор — отдельный коммит + прогон e2e. НЕ делать в слайсе миграции (чтобы миграция транспорта была изолированной и легко откатываемой).

---

## Self-Review

| Пункт оценки | Задача |
|---|---|
| `ws` зависимость | Task 1 |
| `PrismaNeonHTTP`→`PrismaNeon` + webSocketConstructor + pooled URL | Task 2 |
| убрать HTTP-таймаут-хак, сохранить retry | Task 2 |
| `ws` вне edge-бандла | Task 3 |
| pooled vs direct env | Task 4 |
| гейты | Task 5 |
| **e2e на WS = проверка транзакций** | Task 6 |
| снять P5/P7/P9 в доках | Task 7 |
| рефакторинг компенсаций | Follow-up (вне слайса) |

**Изоляция:** меняются только `prisma-client.ts` + `next.config.mjs` + 1 зависимость + `.env.example`. Код запросов не трогается → миграция легко откатывается (revert 4 коммитов). Риск локализован транспортом.

**Зафиксированные допущения:** приложение к БД обращается только из Node (греп подтвердил); pooled `POSTGRES_URL` существует; CI-БД доступна по WS; рефакторинг компенсаций в транзакции — отдельные слайсы потом.
