# Журнал проблем (TROUBLESHOOTING)

Лог заметных проблем проекта **stride-app** и их решений. Цель — не наступать на
одни и те же грабли дважды и со временем вынести типовые решения в скилл.

Формат записи:

- **Проблема** — что сломалось.
- **Когда** — дата / фаза / контекст.
- **Симптом** — как проявилось (ошибка, поведение).
- **Причина** — почему.
- **Решение** — что сделали; ссылки на файлы/коммиты.
- **На будущее** — как не повторить / как проверить.

---

## P1. `@node-rs/argon2` (и Prisma) утекали в edge-бандл middleware

- **Когда:** 2026-06-02, Фаза 2.0 (ядро Auth.js, T5–T6).
- **Симптом:** `next build` падал на сборке Edge Middleware — webpack трассировал
  нативный napi-модуль `@node-rs/argon2` (и `@prisma/client` / `@prisma/adapter-neon` /
  `@neondatabase/serverless`) в edge-рантайм, который не поддерживает Node-нативные модули.
- **Причина:** `middleware.ts` собирает `auth.config.ts`. Конфиг лениво (`await import`)
  тянет `password` (argon2) и `prisma` внутри `Credentials.authorize`. Даже под динамическим
  `import()` webpack Next 15 всё равно включал эти модули в edge-граф зависимостей.
- **Решение:**
  1. `next.config.mjs` → `serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless']` (держим их в Node-server, не бандлим).
  2. `next.config.mjs` → webpack-хук: для `nextRuntime === 'edge'` алиасим эти модули в `false`,
     чтобы edge-бандл компилировался чисто.
  3. Архитектурная гарантия: `authorize` (argon2/prisma) исполняется **только** в Node-рантайме
     (`auth.ts`), а edge-middleware использует лишь callback `authorized` — тяжёлые модули там не нужны.
- **Проверка / на будущее:** после `next build` смотреть строку `ƒ Middleware <N> kB` в Route-таблице.
  Норма — десятки kB (у нас ~86 kB). Если размер резко вырос или build падает на edge — снова что-то
  Node-нативное утекло в `auth.config.ts`; добавить модуль в edge-alias и/или в `serverExternalPackages`.
- **Коммиты:** `0307fff`, `b3f99d5`.

---

## P2. Рассинхрон имени секрета: `AUTH_SECRET` vs `BETTER_AUTH_SECRET`

- **Когда:** 2026-06-02, Фаза 2.0 (после wiring Auth.js).
- **Симптом (ожидаемый в проде):** Auth.js v5 не находит секрет → `MissingSecret` при подписи/проверке
  JWT → не работают логин и сессии. Локально в dev могло «работать», т.к. dev-режим Auth.js
  авто-генерирует временный секрет с предупреждением.
- **Причина:** Auth.js v5 (next-auth) по умолчанию читает `process.env.AUTH_SECRET` (или `NEXTAUTH_SECRET`).
  В нашем `.env` (локально и в Vercel) переменная названа `BETTER_AUTH_SECRET` — это конвенция **другой**
  библиотеки (better-auth), а не Auth.js. В коде `auth.config.ts`/`auth.ts` секрет явно НЕ задавался.
- **Решение (выбрано):** переименовать переменную окружения в `AUTH_SECRET` — локально (`.env`) и в Vercel
  (Project → Settings → Environment Variables), затем редеплой. Код не трогаем — Auth.js подхватит секрет сам.
  - Альтернатива (не выбрана): оставить имя и прокинуть в `auth.config.ts`
    `secret: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET`.
- **Проверка / на будущее:** секрет нужен в **обоих** рантаймах — Node (`auth.ts`) и Edge (`middleware.ts`
  через общий `auth.config.ts`). `next build` секрет НЕ требует (он рантаймовый), поэтому зелёный build
  это не подтверждает — проверять входом на проде после редеплоя. Для новых окружений всегда выставлять
  именно `AUTH_SECRET`.

---

## P3. git-bash окружение: повреждённый `$HOME` + неверная платформа в харнессе

- **Когда:** 2026-06-02, начало сессии.
- **Симптом:** `git`/`npm` падали с `fatal: cannot change to 'C:UsersAdmin310825': No such file or directory`.
  Харнесс рапортовал `Platform: darwin` и cwd `/Users/...`, хотя реально это Windows + git-bash, проект в
  `/d/Projects/sneakers-store-v1`.
- **Причина:** `$HOME` приходил как `C:UsersAdmin310825` (без слэшей, не POSIX-путь), git не мог прочитать
  глобальный конфиг.
- **Решение:** префиксить команды `export HOME=/c/Users/Admin310825` (POSIX-форма пути).
  Реальный рабочий каталог — `/d/Projects/sneakers-store-v1`, приложение в `stride-app/`.
- **На будущее:** все shell-команды в этой среде запускать с `export HOME=/c/Users/Admin310825 && cd /d/Projects/sneakers-store-v1/...`.
  Длинные Windows-пути (`ADMIN3~1`, бэкслеши) ломают `tail`/`cat` — для чтения файлов использовать Read-инструмент.

---

## P4. Локально тяжело обращаться к Neon — тесты/e2e гоняем в CI против Vercel

- **Когда:** Фаза 1 (стабилизация e2e), действует и в Фазе 2+.
- **Симптом:** локальные прогоны, особенно e2e и любые сценарии с обращением к БД, медленные и
  флапают по таймаутам; на проде (Vercel) — быстро.
- **Причина:** Neon serverless через HTTP-драйвер — каждый запрос это отдельный HTTP round-trip, и из
  локалки дистанция до региона Neon большая. Накопление round-trip'ов делает локальные прогоны медленными
  и нестабильными.
- **Решение:** не гонять тяжёлые/БД-зависимые прогоны локально против Neon. Вместо этого — **CI на Ubuntu
  (GitHub Actions) против Vercel-окружения**: там близко к БД, быстро и стабильно. Локально — только то,
  что БД не требует (typecheck, unit-тесты на чистых функциях, build).
- **На будущее:** e2e/интеграцию с БД — в CI/на Vercel, не локально. Unit-тесты держать чистыми
  (без сети/БД), чтобы они оставались быстрыми локально. Связано с коммитом `f168dc2`
  (stabilize e2e against Neon latency + add CI).

---

## P5. Neon HTTP-адаптер НЕ поддерживает `$transaction` — мультизаписи через компенсацию

> **СНЯТО 2026-06-06 (см. P12):** транспорт мигрирован HTTP→WebSocket (`PrismaNeon`), `$transaction` доступен. Ниже — историческое описание (объясняет, почему текущий код на компенсациях; их можно постепенно заменить транзакциями — follow-up).

- **Когда:** 2026-06-02, Фаза 2.0 (фикс слияния корзины после ревью).
- **Симптом:** ревью предложило обернуть `mergeGuestCart` в `prisma.$transaction([...])` для атомарности.
  Неприменимо: наш Prisma работает через `PrismaNeonHTTP` (`lib/prisma-client.ts`), а HTTP-режим Neon
  **не поддерживает транзакции** — ни interactive (callback), ни array-form.
- **Причина:** Neon serverless HTTP — single-shot запросы без сессии/пула, транзакции невозможны
  на уровне транспорта (явно отмечено комментарием в `lib/prisma-client.ts`).
- **Решение (паттерн на будущее):** мультизаписи делать **идемпотентными и сходящимися**, а не атомарными:
  - переносить данные мелкими шагами с немедленным удалением источника, чтобы повтор после частичного
    сбоя достраивал результат, а не задваивал (в `mergeGuestCart`: per-item `upsert {increment}` →
    сразу `delete` исходной позиции);
  - использовать атомарные операторы БД (`{ increment }`, `upsert` по unique-ключу) вместо
    read-modify-write absolute (иначе lost-update и `P2002`-гонки);
  - побочные эффекты, которые не должны ронять основную операцию, оборачивать в try/catch и логировать
    (слияние корзины не должно ронять логин — `safeMergeGuestCart`);
  - полагаться на уже встроенный `retryOnTransient` (prisma-client ретраит транзиентные Neon-сбои 4×).
- **Остаточное ограничение:** без транзакций остаётся узкое окно (сбой строго между `upsert` и `delete`
  одной позиции) — при следующем входе ОДНА позиция может задвоиться. Это осознанный максимум без транзакций.
- **Связанное:** rate-limit (`lib/rate-limit.ts`) сейчас **fail-open** — реальный троттлинг включается
  только при сконфигурированном Upstash (`KV_REST_API_URL`/`KV_REST_API_TOKEN`). Пока его нет, основная
  защита `registerUser` от argon2-DoS — дешёвая проверка дубликата email ДО хэширования.

---

## P6. Рекомендации код-ревью проверять против реального стека, не применять слепо

- **Когда:** 2026-06-02, Фаза 2.0 (применение результатов адверсариального ревью).
- **Симптом:** многоагентный ревью дал корректные находки, но часть рекомендаций по фиксам
  опиралась на неверные допущения о стеке (предложение `$transaction` при Neon HTTP — см. P5;
  упоминание `POSTGRES_URL` как имени секрета вместо `AUTH_SECRET`).
- **Причина:** верификаторы рассуждали об «обычном» Prisma+Postgres, не зная про HTTP-адаптер Neon.
- **Решение / правило:** находки (ЧТО сломано) принимать после верификации, но РЕКОМЕНДАЦИИ (КАК чинить)
  всегда сверять с фактическим кодом/конфигом (`lib/prisma-client.ts`, `next.config.mjs`, схема) перед
  реализацией. Здесь это поймало неприменимый `$transaction` и увело в компенсирующий дизайн.

---

## P7. Регистрация на preview падала `42P01` — Neon-ветка без auth-таблиц (схема не применялась на деплое)

- **Когда:** 2026-06-03, Фаза 2.0 (проверка auth на preview-деплое).
- **Симптом:** на preview регистрация падала, `registerUser` возвращал `Не удалось завершить
  регистрацию (42P01)`. При этом добавление в корзину «работало визуально», но строк в БД будто не
  появлялось. На проде Фазы 1 корзина писалась нормально.
- **Причина:** Neon в этом проекте держит **отдельную ветку БД под каждую git-ветку** (проект
  `sneakers-db`/`fancy-dew-33914413`: `main`, `preview/feat/phase2.0-auth`, `preview/feat/phase1-catalog-cart`).
  Ветку под preview отбранчевали от родителя с таблицами Фазы 1 **до** того, как auth-схему Фазы 2
  кто-либо `db push`-нул в эту ветку → в ней не было `User`/`Account`/`VerificationToken`, отсюда сырой
  PG-код `42P01` (undefined_table; через Neon-адаптер приходит как `42P01`, не Prisma `P2021`).
  Корзина при этом НЕ была сломана: `CartItem` в той ветке существовал, записи шли именно в неё —
  «не видно в БД» оказалось смотрением не в ту Neon-ветку, а не багом кода. Корневой пробел: на
  Vercel-деплое не было шага применения схемы (только `prisma generate` в postinstall + `next build`),
  поэтому каждая новая Neon-ветка отставала от моделей Prisma (см. [[neon-schema-not-auto-applied]]).
- **Диагностика:** временный публичный эндпоинт `/api/diag` показал `current_database`, `to_regclass`
  по auth-таблицам и список `information_schema.tables` рантайма приложения — он и развёл
  «консоль vs приложение» и доказал, что в preview-ветке 7 таблиц Фазы 1 без auth-троицы. (Сам diag
  сперва падал `P2010` на PG-типе `name` — лечится `::text`-кастом, отдельная заметка; эндпоинт удалён
  после отладки, коммиты `490b1ac`/`b5c0272`.)
- **Решение:** задать применение схемы на каждом деплое — `stride-app/vercel.json`:
  `"buildCommand": "prisma db push --skip-generate && next build"`. Идемпотентно (таблицы Фазы 1 не
  трогает, до-создаёт недостающие); **без** `--accept-data-loss` — деструктивное изменение должно
  ронять build, а не молча сносить данные. Чинит текущий preview, все будущие preview-ветки и
  автоматически покрывает прод при мерже (db push к прод-Neon в прод-build). Зеркалит шаг
  `npm run prisma:push`, уже добавленный в CI `e2e.yml`.
- **Проверка / на будущее:** после редеплоя — `/api/auth/providers` на домене отдаёт провайдеров
  (auth-слой жив), регистрация/вход проходят. `next build` факт применения схемы НЕ подтверждает
  (push идёт в build-шаге, но «зелёный build» ≠ «таблицы на месте» — смотреть лог деплоя на строку
  `db push` / `Your database is now in sync`). При добавлении preview-окружений помнить: **ветка БД —
  на каждую git-ветку**, схему туда применяет именно build-команда.
- **Коммиты:** `30e47f4` (vercel.json db push); диагностика `490b1ac`, `b5c0272`.

---

## P8. Google-вход падал `Unknown argument image` — в модели `User` не было колонки `image`

- **Когда:** 2026-06-03, Фаза 2.0 (постдеплойная проверка прод-домена — первый реальный Google-вход).
- **Симптом:** email/пароль работали везде, но вход через Google на проде падал. В логах —
  `AdapterError` → `PrismaClientValidationError: Invalid prisma.user.create() invocation … Unknown
  argument 'image'. Did you mean 'email'?`. OAuth-обмен и redirect-URI были исправны (юзер уже
  возвращался из Google) — падало строго на записи пользователя.
- **Причина:** `@auth/prisma-adapter` на ПЕРВОМ OAuth-входе вызывает
  `createUser({ data: { name, email, image, emailVerified } })` — это стандартная форма Auth.js
  `User`. В нашей модели (Task 2 плана) колонку `image` не перенесли, поэтому Prisma отвергала
  payload. email/пароль не задевало: тот путь `image` никогда не пишет, только Google.
- **Решение:** добавить `image String?` в модель `User` (`prisma/schema.prisma`). Прод-`db push`
  в Vercel-build добавляет колонку (nullable → без потери данных, см. [[neon-schema-not-auto-applied]]).
  Проверено вживую: вход двумя разными Google-аккаунтами создаёт пользователей, `/profile` показывает
  имя/почту.
- **Проверка / на будущее:** при подключении любого OAuth-провайдера через `@auth/prisma-adapter`
  модель `User` должна включать поля, которые пишет адаптер: как минимум `name`, `email`, `image`,
  `emailVerified` (+ модель `Account`, а для `session.strategy='database'` — ещё `Session`; у нас JWT,
  поэтому `Session` не нужен). Юнит-тесты/`build`/`typecheck` это НЕ ловят (Prisma мокается, в БД не
  ходят) — проявляется только живым OAuth-входом. Сверять схему с эталоном Auth.js при добавлении
  провайдеров.
- **Коммиты:** `af5919c`.

---

## P9. `placeOrder` падал `Transactions are not supported in HTTP mode` — nested-create И createMany триггерят транзакцию

> **СНЯТО 2026-06-06 (см. P12):** транспорт мигрирован HTTP→WebSocket — `$transaction`/`updateMany`/`createMany`/nested-create и `$executeRaw`-UPDATE на проде снова работают. Ниже — историческое описание (текущий код всё ещё на одиночных write + findUnique-пре-гард; перевод на транзакции — follow-up).

- **Когда:** 2026-06-03, Фаза 2.1a (e2e в CI, первый реальный прогон `placeOrder`).
- **Симптом:** e2e чекаута падали — после «Оформить заказ» страница оставалась на `/checkout`; сервер-лог
  `⨯ [Error: Transactions are not supported in HTTP mode]` ×6 (= 2 теста × 3 попытки). `placeOrder`
  ловил ошибку в catch → `{ok:false}` → форма показывала ошибку и не редиректила.
- **Причина:** хотя `$transaction` НЕ использовался, Prisma исполняет в **неявной транзакции** целый
  класс операций, и Neon HTTP их не поддерживает. **Полная карта снята probe-скриптом против живого
  адаптера:** FAIL → `updateMany`, `createMany`, nested-create (`{ create }` в relation); OK → одиночные
  `create` (scalar/по одному), `update` (по unique-where), `delete`/`deleteMany`, `$queryRaw`/`$executeRaw`,
  каскадный delete (`onDelete: Cascade`, `relationMode=foreignKeys` → БД делает одним DELETE).
  **Фактический первый блокер** в `placeOrder` был НЕ nested-create, а условный декремент стока
  `productVariant.updateMany({ where:{ stock:{ gte } }, … })` — он выполняется ДО `order.create`, поэтому
  ранние фиксы create-части не помогали. Unit-тесты мокают `prisma` → этот класс не ловят в принципе.
- **Решение:** условные/атомарные и мультистрочные записи — через **`$executeRaw`** (одиночный SQL,
  возвращает число затронутых строк):
  - декремент стока: `` await prisma.$executeRaw`UPDATE "ProductVariant" SET stock = stock - ${q} WHERE id = ${id} AND stock >= ${q}` `` → `affected===1` или откат;
  - замок отмены: `` `UPDATE "Order" SET status='CANCELLED'::"OrderStatus", "updatedAt"=now() WHERE id=${id} AND "userId"=${uid} AND status='PENDING'::"OrderStatus"` `` → `locked===0` = гонка;
  - позиции заказа — по одной `orderItem.create` в цикле; откат — `order.delete` (каскад). Файл `app/actions/order.ts`.
- **На будущее:** на Neon HTTP **запрещены** `$transaction`, nested-write, `createMany`, **`updateMany`**.
  Разрешены одиночные `create`/`update`(by unique)/`delete`/`deleteMany` + `$queryRaw`/`$executeRaw`.
  **UPD 2026-06-04:** `$executeRaw` для UPDATE тоже **НЕ работает на прод-Neon** — возвращает ненулевое
  значение, но сток не меняется (проверено вживую на prod-домене: заказ создавался, сток — нет).
  Причина не установлена (предположительно HTTP-адаптер не выполняет `$executeRaw` как обычный
  запрос на прод-конфигурации, хотя на dev-ветке repro проходил). **Единственное подтверждённо
  безопасное решение для условных/атомарных обновлений на проде** — одиночный Prisma-`update`
  (`{ stock: { decrement: q } }`) с предварительным `findUnique`-пре-гардом. Гонка между read и
  write приемлема для MVP (та же модель риска, что в Фазе 1). Этот класс багов юнит-мок Prisma
  НЕ ловит — проверять repro против **прод**-Neon (не dev).

---

## P10. E2E массово падали на disabled-размере — истощённый сток в CI-Neon-ветке

- **Когда:** 2026-06-04, Фаза 2.1b (после серии e2e-прогонов checkout/order).
- **Симптом:** 8 e2e падали по таймауту на `getByRole('button', { name: '42' }).click()` — кнопка
  размера 42 у `stride-velocity-trail` `<button disabled ...>` (`element is not enabled`). Затрагивало
  все тесты, добавляющие товар в корзину (cart, product, checkout, auth-merge, a11y, yookassa).
- **Причина:** e2e создают РЕАЛЬНЫЕ заказы (COD/online) → `placeOrder` списывает сток
  (`stock decrement`). CI бьёт по **одной** Neon-ветке (секрет `POSTGRES_URL` в GitHub —
  ФИКСИРОВАННЫЙ, один для всех git-веток; Neon же заводит ветку БД на каждую git-ветку — P7 — но CI
  игнорирует это, всегда используя ветку из секрета = dev/`.env`-ветка). Сток размера 42 (стартовый
  `5`) исчерпался за несколько десятков прогонов P2.1a+P2.1b → кнопка размера disabled → клик висит
  40s → таймаут. **E2E не были идемпотентны по стоку.**
- **Решение:** раскомментирован шаг `- run: npm run prisma:seed` в `.github/workflows/e2e.yml` ПЕРЕД
  `npm run e2e`. Сид (`prisma/seed.ts`) делает `TRUNCATE ... RESTART IDENTITY CASCADE` (один statement,
  Neon-HTTP-safe) + пере-создание из `seed-data.ts` через `upsert` → сток возвращается к исходному
  (42=5, 43=0 — как ждут тесты). Каждый прогон стартует с чистого стока. **Безопасно:** CI-ветка =
  dev-песочница, её данные и так из seed (TRUNCATE не теряет ничего ценного).
- **На будущее:** любой e2e, мутирующий БД (заказы, сток), требует сид-сброса ПЕРЕД прогоном, иначе
  накопленные мутации делают тесты флаки. Если CI начнёт бить общую с preview/prod ветку — сид
  включать НЕЛЬЗЯ (TRUNCATE снесёт реальные данные); тогда нужна выделенная тест-ветка Neon.
- **Коммит:** этот.

---

## P11. Онлайн-оплата ЮKassa отбивалась «Платёж не прошёл» — две причины: грязный `return_url` и сумма ×100

- **Когда:** 2026-06-05, Фаза 2.1b (проверка online-оплаты на preview/прод-домене ЮKassa).
- **Симптом:** после «Оформить заказ» (online) ЮKassa создавала платёж (`POST /v3/payments` → `200 pending`,
  `confirmation_url` присутствует), но на странице контракта `yoomoney.ru/checkout` сразу «Платёж не прошёл»,
  способ оплаты выбрать не давало. `200` на создании → ошибка не на создании, а на шаге контракта.
- **Причина (ДВЕ независимые; вторая была замаскирована первой):**
  1. **Грязный `return_url`.** Код брал базу из `NEXT_PUBLIC_SITE_URL` напрямую и клеил `${base}/orders/${n}`.
     В Vercel в `NEXT_PUBLIC_SITE_URL` по ошибке лежал **URL вебхука + хвостовой `\n`**
     (`https://…/api/yookassa/webhook\n`) → в ЮKassa уходил битый `return_url`
     (`…/api/yookassa/webhook\n/orders/16`). Воспроизведено посимвольно — точное совпадение с логом ЮKassa.
     Живучесть: `order.ts` читал `NEXT_PUBLIC_SITE_URL` **в приоритете** над рантайм-хостом (фикс `7bf62ae`
     не срабатывал, пока env задан), и нигде URL не нормализовался.
  2. **Сумма в 100 раз больше.** ЮKassa-поле `amount.value` — это **рубли** (`"15490.00"`), а код слал
     `amountRub * 100` (копейки). Заказ ~15 490 ₽ уходил как **1 549 000 ₽** → за лимитом → отбой.
     Цены в проекте хранятся `Int` в **целых рублях** (`formatPrice(rub)` НЕ делит на 100);
     `price → itemsTotal → totalAmount → amountRub` — всё рубли. `Payment.amount` в БД тоже хранил
     копейки (`totalAmount*100`) — латентно (нигде не читается), но та же ошибка единиц.
- **Решение (коммит `f33df37`):**
  1. `lib/yookassa.ts` → `toOrigin(raw)`: `new URL(raw.trim()).origin` — выкусывает и `\n`, и любой путь;
     применяется к `input.baseUrl || siteUrl()` перед сборкой `return_url`. Чинит инцидент даже без правки
     env (origin восстанавливается из того же хоста).
  2. `lib/yookassa.ts` → `amount.value = input.amountRub.toFixed(2)` (рубли). `order.ts` →
     `Payment.amount = totalAmount` (рубли, консистентно со всем приложением).
  3. Env-первопричина исправлена руками в Vercel: `NEXT_PUBLIC_SITE_URL = https://sneakers-store-v1.vercel.app`
     (без пути/`\n`); снята галочка **Preview** → на preview берётся рантайм-хост (`7bf62ae`).
  - TDD-регрессы: `tests/yookassa-lib.test.ts` (грязный baseUrl/SITE_URL → чистый origin; `value` в рублях),
    `tests/place-order-online.test.ts` (`Payment.amount` в рублях).
- **Проверка / на будущее:**
  - **ЮKassa `amount.value` — всегда рубли, строкой с 2 знаками** (`"15490.00"`), НЕ копейки (это не Stripe-стиль).
  - Любой внешний URL из env (`return_url` и т.п.) — **нормализовать** (`new URL().origin`): env часто приходит
    с хвостовым `\n`/лишним путём. Не путать `NEXT_PUBLIC_SITE_URL` (канонический корень сайта; читается ещё
    в `sitemap.ts`/`robots.ts`) с URL вебхука ЮKassa — именно это смешение и сломало оплату.
  - Симптом «`POST /payments` = 200, но контракт падает» → смотреть **тело запроса** в логе ЮKassa
    (`return_url`, `amount.value`), а не только HTTP-код.
  - Оба бага юзер-видимы только на живой оплате; `next build`/`typecheck`/unit их по сети не ловят — но
    содержимое payload (units/URL) юнит-моки SDK ловят, регрессы добавлены.
- **Коммиты:** `f33df37` (оба фикса); ранее `7bf62ae` (рантайм-хост для `return_url`).

---

## P12. Миграция транспорта Neon HTTP → WebSocket — снят транзакционный класс (P5/P9)

- **Когда:** 2026-06-06, перед Фазой 2.1c (отдельный слайс `feat/neon-websocket`).
- **Проблема:** транзакционный класс багов (P5 cart-merge, P9 placeOrder) — следствие **HTTP-транспорта**
  Neon (`PrismaNeonHTTP`), а не Neon как БД. HTTP — single-shot запросы без сессии → `$transaction`/
  `updateMany`/`createMany`/nested-create невозможны; на проде даже `$executeRaw`-UPDATE молча не применялся.
- **Причина выбора HTTP:** транспорт спроектирован под edge (Workers/Vercel Edge), где нет TCP. **Греп
  доказал: приложение нигде не обращается к БД с edge** — `runtime='edge'` отсутствует; `middleware.ts`
  не импортирует `prisma-client` (ходит только в JWT через `auth.config` без адаптера). То есть платили
  налог (нет транзакций), не используя выгоду (edge).
- **Решение:** перейти на **WebSocket-транспорт** (`PrismaNeon` + `ws`, `neonConfig.webSocketConstructor=ws`),
  connection string → pooled `POSTGRES_URL` (был приоритет non-pooling — HTTP-специфика). Убран HTTP-only
  `fetchWithTimeout`/`neonConfig.fetchFunction`; `retryOnTransient` сохранён (теперь поглощает обрывы сокета:
  `Connection terminated`/`socket hang up`). `ws` добавлен в `serverExternalPackages` + edge-alias-стаб
  (`next.config.mjs`), чтобы не утёк в edge-бандл middleware (остался 86 kB). Код запросов НЕ переписывался —
  обходы P5/P9 работают как есть (WS ⊇ HTTP по операциям).
- **Верификация:** локально typecheck 0 / vitest 102/102 / build OK (middleware 86 kB); **CI e2e зелёный**
  (run 27052814591) — реальные checkout/order/cancel/payment/cart-merge на WS против живого Neon прошли =
  транзакции/сессии работают, компенсации не сломались.
- **Что НЕ трогает эта миграция (другие классы, ОСТАЮТСЯ):** P1 (edge-бандл — `ws` теперь в том же списке
  стабов), P2 (имена env/секретов), P3 (shell-env), **P7 (Neon-ветка БД на каждую git-ветку — схему
  применяет `db push` в `vercel.json`/CI; НЕ про транспорт)**, P8 (полнота модели под адаптеры), P10 (сток
  в e2e — seed-сброс перед прогоном), P11 (единицы денег/URL-гигиена). Они требуют той же дисциплины, что
  и раньше. В частности P2.1c добавляет таблицу `Coupon` + колонки `Order` → схему надо db-push'ить в каждую
  ветку (класс P7).
- **На будущее:** новые мультизаписи можно делать через `$transaction`/`createMany`/nested-create. Перевод
  существующих компенсаций (`placeOrder`/`cancelOrder`/`mergeGuestCart`) на транзакции — отдельные follow-up
  слайсы (по одному месту + e2e), НЕ в этой миграции. Откат миграции = revert коммитов транспорта (код
  запросов не тронут).
- **Коммиты:** `73716b1` (ws), `8d70bdd` (PrismaNeon transport), `0ce9284` (ws вне edge); оценка/план —
  `docs/superpowers/research/2026-06-06-neon-http-vs-websocket-assessment.md`,
  `docs/superpowers/plans/2026-06-06-stride-neon-websocket-migration.md`.

---

## P13. e2e: `getByRole('alert')` ловит служебный Next.js route-announcer (strict mode violation)

- **Когда:** 2026-06-06, Фаза 2.1c (первый CI-прогон e2e купонов).
- **Симптом:** 2 негативных теста купона (`coupon.spec.ts`: EXPIRED, мусорный код) падали:
  `Error: strict mode violation: getByRole('alert') resolved to 2 elements`. Первый — наш
  `<p role="alert">Промокод недействителен</p>`, второй — `<div role="alert" aria-live="assertive"
  id="__next-route-announcer__">` (пустой). Scenario 1 (применение STRIDE10 + заказ) ПРОШЁЛ — баг был
  только в ассертах, не в приложении (29 passed, 2 failed).
- **Причина:** Next.js App Router всегда рендерит скрытый live-region `#__next-route-announcer__` с
  `role="alert"` (озвучивает смену маршрута скринридерам). Любой `getByRole('alert')` матчит его +
  наш алерт → в strict mode (дефолт Playwright) это ошибка «2 elements».
- **Решение:** целиться по тексту/специфичному локатору, а не по роли `alert`:
  `await expect(page.getByText(/Срок действия промокода истёк/)).toBeVisible()` вместо
  `expect(page.getByRole('alert')).toContainText(...)`. Route-announcer пустой → по тексту не матчится.
  Коммит `a2715e3`.
- **На будущее:** в e2e НЕ использовать `getByRole('alert')` напрямую — он всегда неоднозначен в Next App
  Router. Брать ошибку по её тексту (`getByText`) или скопировать локатор (`p[role=alert]` /
  `getByRole('alert').filter({ hasText: ... })`). Локально это не ловится (e2e гоняем только в CI, P4) —
  проявилось лишь на CI-прогоне.

## P14. Async-RSC с `auth()` в общем хедере роняла сессию на пути клиентского `signIn`

- **Когда:** 2026-06-08, Фаза 2.2b (wishlist), несколько CI-прогонов e2e.
- **Симптом:** старый тест `auth.spec.ts` «вход существующего пользователя» детерминированно падал (3/3
  ретрая). Логин проходил («Выйти» появлялась), но следующая навигация на `/profile` **редиректила на
  `/login`** с уже потерянной сессией. Диагностика (`afterEach`, печать в stdout CI) показала:
  `url=/login?callbackUrl=…/profile`, `logoutBtn=0`, тело = форма логина. Сестринский тест
  (регистрация→автологин→`/profile`) ПРОХОДИЛ. В логе — шум `MissingCSRF` + webpack
  `Cannot read properties of undefined (reading 'call')`. Все остальные 35 тестов зелёные.
- **Причина:** в общий `site-header` (рендерится на КАЖДОЙ странице) добавили `WishlistBadge` — **async
  server-компонент** со ВТОРЫМ вызовом `auth()` + `cookies()` + запросом в БД (`getWishlistCount`), рядом с
  уже существующим `AuthNav` (тоже `auth()`). Эта серверная работа в хедере дестабилизировала обработку
  session-cookie именно на пути **клиентского** `signIn` из `next-auth/react` (форма логина), где сессия
  ставится fetch'ем в браузере и теряется на следующей навигации. Серверный `signIn` (регистрация,
  `app/actions/auth.ts`) ставит cookie в ответе экшена надёжно → его `/profile` работал. Точный
  внутренний механизм (почему read-only `auth()`/`cookies()` в хедере роняет сессию) до конца не вскрыт,
  но фикс подтверждён зелёным CI.
- **Решение:** сделать `WishlistBadge` **лёгким клиентским компонентом** (только ♡-иконка + ссылка на
  `/wishlist`, без `auth()`/`cookies()`/БД), зеркаля паттерн `CartBadge` (он клиентский именно поэтому).
  Счётчик временно убран (вернуть — через клиентский fetch к лёгкому роуту, как `CartBadge` ходит в
  `/api/cart`). Коммит `bcbe81b`.
- **На будущее:** НЕ добавлять в общий хедер/layout async server-компоненты, делающие `auth()`/`cookies()`/
  запрос в БД на каждой странице. Бейджи/виджеты хедера — клиентские (как `CartBadge`), данные тянуть
  клиентским fetch. Несколько серверных `auth()` в одном рендере + per-page БД-работа в хедере способны
  дестабилизировать сессию, особенно на клиентском `signIn`. Локально не воспроизвести (Neon-латентность
  вешает каждый `goto`, P4) — диагностировать через временный `afterEach` с печатью `page.url()`/состояния
  в stdout CI.

## P15. Оптимистичный server-action UI: в e2e ждать POST-ответ перед навигацией, иначе экшен прерывается

- **Когда:** 2026-06-08, Фаза 2.2b (wishlist), CI e2e.
- **Симптом:** `wishlist.spec.ts` — гость кликал ♡ на `/catalog`, видел «Убрать из избранного», шёл на
  `/wishlist` → товара НЕТ (пустой список). Падало стабильно.
- **Причина:** `WishlistHeart` оптимистичен — кнопка флипается МГНОВЕННО (до ответа сервера). Тест ждал
  только оптимистичный флип, затем сразу `page.goto('/wishlist')`. Навигация **прерывала in-flight
  server action** `toggleWishlist` до того, как его `Set-Cookie` (гостевой `wishlistToken`) дойдёт до
  браузера → у `/wishlist` нет токена → пусто. Прерванные-на-рендере экшены также давали webpack-/CSRF-шум,
  отравлявший общий dev-сервер (1 на прогон, 2 воркера). Сравни: cart-e2e ждёт server-confirmed «Добавлено»
  (стор обновляется из ОТВЕТА API), не рейсит.
- **Решение:** в тесте дождаться ответа server-action POST перед уходом со страницы:
  `const done = page.waitForResponse((r) => r.request().method() === 'POST'); await heart.click(); await done;`
  (страница не делает других POST — предикат однозначен). Коммит `8dc8f64`.
- **На будущее:** для ЛЮБОГО оптимистичного UI на server actions в e2e — НЕ навигировать сразу после
  оптимистичного изменения; дождаться POST-ответа (Set-Cookie/запись применены) или server-confirmed
  состояния. Иначе `page.goto`/переход прервёт экшен. Побочно: `import { x } from 'crypto'` в server
  action — всегда `'node:crypto'` (как в `app/api/cart/route.ts`), bare-specifier хуже externalize'ится в
  dev-бандле.

## P16. `node:crypto` UnhandledSchemeError в edge-бандле — verified-ticket провайдер через `auth.config.ts`

- **Когда:** 2026-06-09, Фаза 2.2c (email-верификация), Vercel preview билд.
- **Симптом:** билд падал `Command "prisma db push --skip-generate && next build" exited with 1`.
  Лог: `Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
  (Unhandled scheme).` Import trace: `node:crypto ← ./lib/verification/ticket.ts ← ./auth.config.ts`.
  Юнит-тесты (212) и tsc — зелёные; падал только webpack-компайл edge-бандла.
- **Причина:** `auth.config.ts` бандлится в **edge-middleware** (Edge Runtime). Новый Credentials-провайдер
  `verified-ticket` динамически импортит `lib/verification/ticket.ts`, а тот — `import {createHmac} from
  'node:crypto'`. В Edge Runtime `node:crypto` нет, и webpack для edge НЕ обрабатывает `node:`-схему →
  UnhandledSchemeError. Даже dynamic import всё равно тянется в edge-граф (как argon2/prisma в существующих
  провайдерах). `resolve.alias` НЕ перехватывает ни `node:crypto` (это URI-схема, не модуль), ни
  `@/lib/...`-путь (tsconfig-paths резолвится раньше алиаса) — обе попытки заглушить через alias провалились.
- **Решение:** сменить импорт в `ticket.ts` на bare `import {createHmac, timingSafeEqual} from 'crypto'`
  (в Node работает идентично) + добавить в `next.config.mjs` edge-alias `crypto: false` (как argon2/prisma).
  `authorize` provider'а исполняется ТОЛЬКО в Node-рантайме (auth.ts), в edge до него не доходит — заглушка
  безопасна, модуль лишь компилируется пустым. Локально `next build` → EXIT 0. Коммит `16f60c9`.
- **На будущее:** всё, что **достижимо из `auth.config.ts`** (через провайдеры/колбэки), компилируется в edge.
  Node-only зависимости там — bare-specifier + `alias: false` в `if (nextRuntime==='edge')`. ⚠️ Это
  ПРОТИВОРЕЧИТ совету P15 («всегда `node:crypto`») — то про обычные server actions/роуты (Node-бандл, externalize),
  ЗДЕСЬ про edge-достижимый код, где bare `crypto` нужен именно чтобы alias смог его заглушить. Различай по
  тому, тянется ли модуль из `auth.config.ts` (edge) или нет (`pending-cookie.ts`/`unsubscribe-token.ts` тоже
  юзают node:crypto, но НЕ достижимы из edge → их трогать не надо).

## P17. e2e массово падали после жёсткого email-gate — хелперы ждали мгновенный автологин

- **Когда:** 2026-06-09, Фаза 2.2c, CI e2e (12 тестов).
- **Симптом:** 12 e2e упали по таймауту 40с на `getByRole('button',{name:'Выйти'})`. В логе webServer —
  спам `email_not_configured` (RESEND-ключа в CI нет). 26 гостевых тестов зелёные.
- **Причина:** жёсткий gate сломал контракт регистрации: раньше register → автологин → «Выйти». Теперь
  register → **неубираемая модалка верификации** (сессии нет). Все хелперы `register()/registerAndLogin()`
  в 8 спеках ждали «Выйти» сразу → висли. Прочитать код из БД нельзя — он хранится только argon2-хэшем,
  плейн есть лишь в письме (которого в CI нет).
- **Решение:** детерминированный код в тест-режиме. `generateCode()` возвращает `process.env.E2E_TEST_CODE`,
  если задан И `NODE_ENV!=='production'` И формат 6 цифр (в проде ветка недоступна). `playwright.config.ts`
  webServer.env инжектит `E2E_TEST_CODE='424242'`. Общий хелпер `e2e/helpers.ts` `registerAndVerify()`:
  регистрация → заполняет OTP-модалку фикс-кодом → ждёт «Выйти». 8 спеков переключены на него. Теперь e2e
  ПРОХОДИТ весь реальный gate-флоу (модалка→confirmCode→verified-ticket→login), а не обходит. Коммит `cae6dca`.
- **На будущее:** новый обязательный gate/шаг в auth-флоу = чинить ВСЕ e2e-хелперы, не один спек. OTP/секреты,
  хранимые хэшем, в e2e не прочитать из БД — нужен детерминированный код за env-флагом (prod-guarded), а не
  чтение. Флаг ставится только в playwright webServer.env → в прод/preview не течёт.

## P18. Общая Neon-БД + `prisma db push` на каждом деплое — ветка от main дропает чужие таблицы

- **Когда:** 2026-06-09…10, Фаза 2.2c и fix/auth-cart-leak, Vercel билд + CI `prisma:push`.
- **Симптом:** билд падал на `prisma db push`: `⚠️ There might be data loss: You are about to drop the
  EmailVerificationCode table, which is not empty (60 rows). Use the --accept-data-loss flag…` → exit 1.
- **Причина:** Build Command проекта = `prisma db push --skip-generate && next build` — пушит схему на
  КАЖДОМ деплое против ОДНОЙ общей prod-Neon-БД (`ep-hidden-butterfly`). Email-ветка ранее создала там
  таблицы `EmailVerificationCode`/`Subscriber` (60 строк тест-кодов). Ветка `fix/auth-cart-leak` (от main,
  схема БЕЗ этих моделей) на деплое видит «лишние» таблицы → push хочет дропнуть → отказ. Повторяется на
  ЛЮБОЙ ветке от main, пока схема main не узнает про email-таблицы.
- **Решение (быстрое):** добавить модели `EmailVerificationCode`+`Subscriber` в `schema.prisma` fix-ветки
  (ТОЛЬКО схема, без кода) — push видит совпадение → не дропает. Additive, идентичны email-ветке → мерж без
  конфликта (кроме тривиального комментного, см. P21). Коммит `35a3b7f`. ⚠️ `--accept-data-loss` в билд
  добавлять НЕЛЬЗЯ — снесёт таблицы + риск потери реальных данных на других таблицах.
- **На будущее:** `prisma db push` на каждом деплое против общей prod-БД — хрупко: фича-ветки с разной схемой
  дерутся за одну БД. Варианты долгосрочно: (а) изолировать preview на свою Neon-ветку (Vercel-Neon
  integration, но см. P19 про лимит веток); (б) убрать push из билда, отдельный шаг миграций. Пока правило:
  схема main должна быть надмножеством всех незамерженных фича-веток, ИЛИ мержить владельца таблиц первым.

## P19. Локальный `main` отстал на 51 коммит → ветка от неверной базы; и лимит веток Neon

- **Когда:** 2026-06-09, старт fix/auth-cart-leak.
- **Симптом (база ветки):** ветку резали «от main», но в дереве не было auth-стека (phase2.0+), моделей
  `Wishlist/Review/Order`, файла `lib/auth-credentials.ts` — план под фичу ломался. `git fetch` показал
  локальный `main` на **51 коммит позади** `origin/main` (PR9 со всем auth/2.1/2.2 не подтянут).
- **Симптом (Neon, отдельно):** Vercel-деплои падали `Provisioning integrations failed → sneakers-db:
  Create database branch for deployment: Branch limit reached. Upgrade your plan or delete unused branches.`
  Удаление git-веток на GitHub НЕ помогало.
- **Причина:** (1) работали от устаревшего локального `main`; (2) «branch limit» — это лимит **веток БД
  Neon**, не git: Vercel-Neon integration создаёт Neon-ветку на каждый preview-деплой, на free-плане они
  упёрлись в лимит (~10).
- **Решение:** (1) `git fetch && git rebase origin/main` (3 doc-коммита переехали чисто) — база стала
  верной, auth-стек на месте; (2) Neon Console → проект → Branches → удалить старые авто-созданные
  preview-ветки (НЕ трогать production/main-ветку Neon с прод-данными) → Vercel Redeploy.
- **На будущее:** перед `git checkout -b … main` всегда `git fetch` + сверять `git rev-list --count
  main..origin/main`. «Branch limit reached» в Vercel-провижининге = ветки БД Neon, чистить в Neon Console,
  не на GitHub. В Vercel→Integrations→Neon включить авто-удаление ветки БД при удалении деплоя.

## P20. Redirect залогиненного с `/login` вскрыл гонку e2e `waitForURL('**/')` после логаута

- **Когда:** 2026-06-10, fix/auth-cart-leak, CI e2e (1 тест).
- **Симптом:** `auth.spec.ts` «вход существующего» падал: на `/login` локатор `getByLabel('Email').fill`
  таймаутил, разрезолвившись в **disabled `#p-email`** — поле страницы `/profile`, не `/login`. Т.е.
  `goto('/login')` отредиректило на `/profile`. Сестринский тест (логаут с `/profile`) проходил.
- **Причина:** новый фикс бага 1 — middleware/`authorized` редиректит залогиненного с `/login`,`/register`
  → `/profile`. Тест после клика «Выйти» делал `waitForURL('**/')` — но логаут с `/` редиректит `/`→`/`,
  URL НЕ меняется → glob `**/` резолвится МГНОВЕННО, не дождавшись выхода → `goto('/login')` гонкой опережает
  логаут, сессия ещё жива → редирект на `/profile`. На main гонка была безвредной (`/login` всегда
  рендерился); redirect сделал её фатальной. Сестринский тест логаутится с `/profile` (URL меняется
  `/profile`→`/`) → `waitForURL` ждёт корректно.
- **Решение:** заменить `waitForURL('**/')` после «Выйти» на детерминированное ожидание гостевого состояния
  хедера: `await expect(page.getByRole('button',{name:'Выйти'})).toHaveCount(0)`. Поведение редиректа верное —
  чинили тест, не код. Коммит `f6957fe`.
- **На будущее:** `waitForURL('**/')`/loose-glob ненадёжен, если навигация не меняет URL — резолвится сразу.
  После server-action-логаута ждать наблюдаемое состояние (исчезновение «Выйти»/появление «Войти»), не URL.
  Добавление redirect-правил в middleware способно вскрыть латентные гонки в тестах, полагавшихся на старое
  «всё рендерится» поведение.

## P21. Домен `cloudd3r.eu.cc` → Vercel (баг /unsubscribe 404) + тривиальный конфликт `schema.prisma` при мерже

- **Когда:** 2026-06-10, деплой Фазы 2.2c.
- **Симптом (домен):** ссылка отписки в письме вела на `https://cloudd3r.eu.cc/unsubscribe?token=…` →
  «не удаётся получить доступ к сайту». Домен есть (верифицирован в Resend для ОТПРАВКИ), но сайт не отдаётся.
- **Причина (домен):** домен на **Cloudflare** (NS joyce/remy.ns.cloudflare.com), есть MX (Email Routing)+SPF
  для почты, но НЕТ web A/CNAME на apex → по домену ничего не открывается. Плюс роут `/unsubscribe` живёт
  только на email-ветке, а домен отдаёт PRODUCTION (main) → даже с DNS будет 404, пока email-ветка не в main.
- **Решение (домен):** Vercel → проект → **Domains** (переехало на уровень проекта, не в Settings) → Add
  `cloudd3r.eu.cc` → Connect to environment = Production. Vercel выдал запись `A @ → 216.198.79.1`. В
  Cloudflare: A `@` → `216.198.79.1`, **Proxy = DNS only (серое облако)** (оранжевый прокси → цикл SSL,
  Vercel не выпустит сертификат). НЕ трогать MX/SPF/DKIM. Через мин — `Valid Configuration`. Затем мерж
  email-ветки → production получает `/unsubscribe`. `NEXT_PUBLIC_SITE_URL=https://cloudd3r.eu.cc` (Production;
  юзается в robots/sitemap-каноне, yookassa return_url-фолбэке, email-ссылках; `NEXT_PUBLIC_*` вшивается на
  билде → нужен redeploy).
- **Симптом (мерж):** PR email-ветки → main давал конфликт ТОЛЬКО в `prisma/schema.prisma`. `auth.config.ts`,
  `e2e/auth.spec.ts` авто-смержились.
- **Причина (мерж):** обе ветки добавили идентичные модели `EmailVerificationCode`/`Subscriber`; различие —
  только комментарий перед ними (на main из P18, на email-ветке нет) → git брекетит коммент-регион, модели
  (идентичны) вне маркеров.
- **Решение (мерж):** удалить 3 строки-маркера (`<<<<<<<`, `=======`, `>>>>>>>`), оставить коммент один раз +
  модели один раз. GitHub в conflict-editor показывает маркеры как строки с именами веток.
- **На будущее:** кастомный домен для писем — направлять web-A/CNAME на хостинг ОТДЕЛЬНО от почтовых
  MX/DKIM (сосуществуют), Cloudflare-прокси для Vercel = серое облако. Ссылки в письмах работают только если
  роут есть на ветке, что отдаёт домен (production=main) — фича с роутом должна быть замержена.

## P22. Утечка корзины/избранного между юзерами — несброшенная guest-cookie + merge крадёт чужой токен

- **Когда:** 2026-06-10, ручная проверка прода. Баг **пред-существующий** (фазы 2.0 cart-merge / 2.2b
  wishlist-merge), не от email-фазы; воспроизводился и на проде, и на preview.
- **Симптом:** юзер A залогинился, добавил товар в избранное И корзину, разлогинился. Юзер B логинится на
  том же браузере → видит избранное и корзину **юзера A** (чужие данные в своём аккаунте). Критично.
- **Причина:** двойной дефект. (1) При логауте куки `cartToken`/`wishlistToken` НЕ чистились → браузер
  держал токен корзины A. (2) `events.signIn` → `mergeGuestCart(A-токен, B)` / `mergeGuestWishlist`:
  находил по токену корзину A (уже с `userId=A`) и, т.к. `guestCart.userId !== B`, **перепривязывал её к B**
  (`update userId=B`) — кража. Корень глубже: корзина резолвилась ВЕЗДЕ только по cookie-токену
  (`findFirst({where:{token}})`), поле `Cart.userId` для чтения не использовалось (в отличие от wishlist,
  который уже резолвил по userId). Поэтому даже смена сессии не перескопивала корзину.
- **Решение (3 слоя):** (1) `resolveOwnerCart(userId, token, {create})` в `lib/cart.ts` — зеркало
  `resolveOwnerWishlist`: залогинен → корзина по `userId` (живёт с аккаунтом, не с cookie), гость → по token;
  при create для юзера — СВЕЖИЙ token (cookie мог быть чужой → P2002/кража). Подключено во все точки чтения:
  `api/cart` GET/POST, `api/cart/[id]`, `checkout`, `actions/order`, `actions/coupon`. (2) merge-guard в
  `cart-merge.ts`+`wishlist-merge.ts`: `if (guest.userId && guest.userId !== userId) return` — не
  перепривязывать токен, принадлежащий ДРУГОМУ юзеру. (3) logout-action (`auth-nav.tsx`) удаляет
  `cartToken`/`wishlistToken` перед `signOut`. Коммит `0456329`. Тесты: `resolve-owner-cart.test.ts` +
  анти-кража кейсы в cart-merge/wishlist.
- **На будущее:** per-user данные (корзина/избранное/что угодно) резолвить по `userId` для залогиненных, не
  по cookie-токену — иначе данные «следуют за кукой», а не за аккаунтом. Любой merge гостевого→юзер
  guard'ить: НЕ трогать запись, уже принадлежащую другому `userId`. Гостевые токены чистить на логауте, иначе
  следующий гость/юзер на браузере унаследует предыдущего. Несимметрия (wishlist по userId, cart по токену)
  — источник класса багов; держать резолв-паттерн единым.

## P23. Залогиненный мог открыть `/login` и `/register` — вход/регистрация поверх живой сессии

- **Когда:** 2026-06-10, ручная проверка прода. Пред-существующий (фаза 2.0 auth), есть и на проде.
- **Симптом:** залогиненный юзер открывал `/login` или `/register` → видел формы и мог войти/зарегаться
  поверх активной сессии, в т.ч. под ДРУГИМ аккаунтом. Критично.
- **Причина:** matcher middleware = `['/profile','/checkout','/orders']` — `/login` и `/register` НЕ
  защищены, и `authorized`-колбэк не уводил залогиненного с auth-страниц.
- **Решение:** в `authorized` (`auth.config.ts`): `if (isLoggedIn && (path==='/login'||path==='/register'))
  return Response.redirect(new URL('/profile', nextUrl))`; пути добавлены в matcher (`middleware.ts`).
  Коммит `0456329`. Побочно вскрыл гонку e2e — см. P20.
- **На будущее:** auth-страницы (`/login`,`/register`,reset-password) — редиректить залогиненного прочь
  (`/profile`); добавлять их в matcher middleware, иначе колбэк для них не вызовется. Любое новое
  middleware-правило → прогнать e2e: способно вскрыть латентные гонки (P20).
