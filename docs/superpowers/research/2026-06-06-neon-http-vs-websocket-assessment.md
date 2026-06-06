# Neon HTTP vs WebSocket — оценка транспорта (STRIDE)

> Артефакт research-фазы. Дата: 2026-06-06. Запрос пользователя: «столько проблем с Neon-HTTP — что это, есть ли альтернативы, есть ли смысл продолжать».
> Источник: чтение `lib/prisma-client.ts`, греп edge-использования, документация Prisma 6.19.x adapter-neon (Context7).

## TL;DR

Проблема **не в Neon**, а в выбранном **HTTP-транспорте**. Neon — обычный PostgreSQL; к нему есть три транспорта, и текущий (`PrismaNeonHTTP`) — единственный без транзакций. Приложение **нигде не использует edge** при работе с БД (доказано грепом), то есть единственное преимущество HTTP не задействовано. **Рекомендация: мигрировать HTTP→WebSocket (`PrismaNeon`), остаться на Neon.** Низкий риск, снимает первопричину P5/P7/P9.

## Контекст: что болело

`docs/TROUBLESHOOTING.md` P5/P7/P9 + [[prisma-neon-no-transaction]]: на прод-Neon не работают `$transaction`, `createMany`, nested-create, `updateMany`/`$executeRaw`(UPDATE). Кусало в cart-merge (P2.0), placeOrder и cancelOrder (P2.1a/b). Везде пришлось делать последовательные одиночные write + ручная компенсация.

## Что такое Neon и три транспорта

Neon = serverless PostgreSQL (настоящий PG 16): спит при простое, ветки БД на окружение ([[vercel-deploy-setup]], P7-ветки). Подключение — один из трёх транспортов:

| Транспорт | Класс адаптера | `$transaction` | Когда нужен |
|---|---|---|---|
| **HTTP** ← сейчас | `PrismaNeonHTTP` | ❌ нет | edge/Workers, где TCP недоступен |
| **WebSocket** | `PrismaNeon` (+ `ws`) | ✅ да | serverless/Node с транзакциями |
| **Прямой TCP** | без адаптера, `pg` | ✅ да | классический long-lived Node |

Ограничение транзакций — свойство **HTTP-транспорта** (stateless, один запрос = один HTTPS round-trip; транзакция требует удержания сессии на сокете), а не Neon.

## Почему HTTP вам не подходит

HTTP оправдан только на edge. Греп по `stride-app`:
- `runtime = 'edge'` — **нигде**; все 3 route handler'а явно `nodejs` (auth, yookassa/webhook, dadata/suggest).
- `@/lib/prisma-client` импортируется в 23 файлах — **`middleware.ts` среди них НЕТ**. Middleware (единственное, что в Next живёт на edge) ходит только в JWT через `auth.config` без адаптера, к БД не обращается.

→ К БД обращаются только Node-контексты. Edge-преимущество HTTP не используется. Вы платите налог (нет транзакций), не получая выгоды.

## Рекомендация: HTTP → WebSocket (остаёмся на Neon)

Канонический сетап (Prisma 6.19.x, доки adapter-neon):
```ts
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'
neonConfig.webSocketConstructor = ws
const adapter = new PrismaNeon({ connectionString })   // pooled URL
```

### Меняется (минимум)
- `npm i ws` (+ `@types/ws`).
- `lib/prisma-client.ts`: `PrismaNeonHTTP`→`PrismaNeon`; `neonConfig.webSocketConstructor = ws`; connection string → **pooled** `POSTGRES_URL` (сейчас приоритет non-pooling — HTTP-специфика); убрать `fetchFunction`-таймаут (строки 12–37, HTTP-специфичен).

### НЕ меняется (источник низкого риска)
- Провайдер Neon, ветки-на-окружение, схема, seed.
- `vercel.json` db push, `e2e.yml`, `POSTGRES_URL_NON_POOLING`/`directUrl` для миграций.
- `retryOnTransient` (оставить).
- Весь код запросов (одиночные `await` работают без изменений).
- Unit-тесты (мокают prisma).

### Становится возможным (опционально, поверх)
`$transaction`, `createMany`, nested-create. Ручные компенсации в `placeOrder`/`cart-merge`/`cancelOrder` можно постепенно заменить атомарными транзакциями — отдельный рефакторинг, НЕ часть миграции.

## Риски

1. **WS cold-start** +50–100мс на холодную функцию — для Node приемлемо, pooler греет коннекты. Низкий.
2. **Лимит коннектов** — решается **pooled endpoint** (PgBouncer Neon). Единственный критичный пункт: взять правильный `-pooler` URL.
3. **CI/e2e на WS** — обязательный прогон (основная верификация). WebSocket в CI Ubuntu работает.
4. **Локальная latency** до Neon ([[local-e2e-neon-latency]]) — физику не отменит, но мультизаписи в транзакции пайплайнятся одним сеансом вместо N HTTP round-trip — нейтрально/чуть лучше.

## Объём
- Свитч: 1 файл + 1 зависимость + проверка env → ~полчаса.
- Верификация: typecheck + vitest + build + **e2e в CI** → полдня с прогоном.
- Рефакторинг компенсаций → транзакции: отдельно, постепенно, не блокирует.

## Альтернативы (отвергнуты)
- **Прямой TCP `pg` через pooler** — тоже даёт транзакции, но больше возни с PgBouncer-режимом и теряется выгода serverless-драйвера. WebSocket-адаптер проще при том же результате.
- **Смена провайдера (Supabase/Railway/RDS)** — переезд БД, теряются ветки-на-окружение Neon, не решает serverless-tension лучше. Избыточно: проблема не в Neon.

## Решение
Пользователь (2026-06-06): **мигрировать HTTP→WebSocket отдельным слайсом ПЕРЕД P2.1c.** План: `docs/superpowers/plans/2026-06-06-stride-neon-websocket-migration.md`.

**ВЫПОЛНЕНО (2026-06-06), ветка `feat/neon-websocket`:** `PrismaNeon`+`ws`, pooled `POSTGRES_URL`, `ws` вне edge-бандла (middleware 86 kB). Гейты: typecheck 0 / vitest 102/102 / build OK. **CI e2e зелёный** (run 27052814591) — checkout/order/cancel/payment/cart-merge на WS против живого Neon прошли → транзакции работают, обходы не сломались. [[prisma-neon-no-transaction]] и TROUBLESHOOTING P5/P9 помечены снятыми (новая запись P12). Транзакционный класс закрыт; перевод компенсаций на транзакции — follow-up. PR `feat/neon-websocket`→`main`, мержит пользователь.
