# STRIDE — Фаза 2.0: Auth-фундамент (дизайн-спецификация)

- **Дата:** 2026-06-02
- **Проект:** STRIDE — интернет-магазин кроссовок (Next.js e-commerce)
- **Фаза:** 2.0 (фундамент авторизации; первый под-проект Фазы 2 — до checkout/оплаты/заказов)
- **Статус:** на ревью
- **Предшественник:** Фаза 1 (каталог + корзина) — завершена, в проде на `main`.
- **Исследование:** `docs/superpowers/research/2026-06-02-phase2-candidates.md` (карта кандидатов Фазы 2) + workflow `phase2-auth-strategy-research` (выбор auth-стратегии).
- **UI-контракт:** `ui-designe and prototypes/prototypes-app/{auth,profile,legal-*}.html`.

---

## 1. Контекст и цель

Фаза 1 дала анонимную витрину (каталог + корзина по cookie). «Фаза 2 целиком» (auth + checkout + оплата + заказы + discovery) — несколько независимых подсистем; ведём по одному под-проекту за цикл spec → план → реализация. **Этот spec — первый под-проект: Auth-фундамент (P2.0).** Он закладывает модель пользователя и механизм входа, на которые позже опираются checkout, заказы, профиль-заказы, отзывы, wishlist.

**Цель P2.0:** пользователь может зарегистрироваться и войти (email/пароль или Google), увидеть и отредактировать профиль «Личные данные», а его гостевая корзина сохраняется после входа. Доступны legal-страницы. Без оформления заказа, оплаты, phone-OTP и почтовых писем.

---

## 2. Решения брейнсторминга (трассируемость)

| # | Развилка | Решение |
|---|----------|---------|
| 1 | Граница Фазы 2 | **P2.0 = только Auth-фундамент** (отдельный spec). Checkout/orders/payments — следующий spec. |
| 2 | Auth-стратегия | **Auth.js v5 (`next-auth@5`) + `@auth/prisma-adapter` + `session.strategy='jwt'`.** Адаптер не использует `$transaction` (Neon-HTTP-safe); JWT → ноль БД-I/O на запрос (лечит латентность Neon). |
| 3 | Методы входа в фундаменте | **email/пароль + Google.** Email/пароль — `Credentials`-провайдер (argon2id). Google — `GoogleProvider`. |
| 4 | phone-OTP | **Отложен** в отдельный слайс. Убирает RU-регуляторку (Роскомнадзор оператор ПД + SMS-sender + РФ-шлюз) и всю OTP-инфраструктуру из фундамента — нет launch-блокеров. |
| 5 | Идентичность | **Email-first.** `User.email` — `@unique`, NOT NULL, канонический ключ. |
| 6 | Подтверждение email | **Отложено.** Регистрация email/пароль активна сразу (`emailVerified=null`). Google-email уже verified провайдером. Верификация по ссылке — в P2.1 вместе с почтовым сервисом. |
| 7 | Восстановление пароля | **Отложено** (шлёт письмо → нужен почтовый сервис). В P2.1. Обходной путь на фундаменте: вход через Google с тем же email. |
| 8 | Сессии | **JWT в httpOnly-cookie** (не БД-сессии). Короткий TTL; `Session`-модель не заводим. |
| 9 | Телефон в профиле | `User.phone` — простое контактное поле (`String?`, **без** `@unique`/верификации). Пригодится в checkout (P2.1). |
| 10 | Роли | `User.role` enum `CUSTOMER`/`ADMIN`, по умолчанию `CUSTOMER` — задел под админку (Phase 3). |
| 11 | Слияние корзины | На входе гостевая корзина (`cartToken`) привязывается к `User`; при наличии корзины аккаунта — items сливаются (сумма количеств), пересчёт итога. Последовательно, без `$transaction`. |

---

## 3. Объём P2.0

### В объёме
- Доменные модели: `User`, `Account`, `VerificationToken` (задел), enum `UserRole`; связь `Cart.userId → User`.
- Auth.js v5: конфиг (edge-split), route handler, middleware-защита приватных страниц.
- Провайдеры: `Credentials('password')` (argon2id), `GoogleProvider`.
- Экраны: `/login`, `/register` (по `auth.html`), `/profile` вкладка «Личные данные» (по `profile.html`), legal-страницы `/legal/{privacy,terms,delivery,refund}` (по `legal-*.html`).
- API/server-actions: профиль (`GET`/`PATCH`), эндпоинты Auth.js.
- Слияние гостевой корзины при входе.
- Реальный rate-limit на попытки входа (замена NOOP-заглушки Фазы 1).
- Обновление футера: legal-ссылки `href="#"` → реальные маршруты.
- Тесты: unit (хеш пароля, слияние корзины, правила идентичности) + e2e/a11y (регистрация/вход/выход, защита `/profile`, правка профиля, слияние корзины, legal) + CI на Ubuntu.

### Вне объёма (явно, с обоснованием)
| Не делаем | Почему / когда |
|-----------|----------------|
| phone-OTP вход | RU-регуляторка (Роскомнадзор/SMS-sender/шлюз) — отдельный слайс |
| Подтверждение email | Нужен почтовый сервис — P2.1 |
| Восстановление пароля | Нужен почтовый сервис — P2.1 |
| Почтовый сервис (Resend/SMTP) | Заводится в P2.1 (письма заказов + верификация) |
| Вкладка «Мои заказы» (наполнение) | Зависит от заказов — P2.1 (на фундаменте — заглушка «Заказов пока нет») |
| Checkout, оплата, заказы | Следующий spec (P2.1) |
| Доп. соц-провайдеры (VK/Yandex/Apple) | Позже; Auth.js даёт лёгкий путь добавления |

---

## 4. Доменная модель (Prisma)

Добавляется к существующей `stride-app/prisma/schema.prisma`. Деньги остаются `Int`; `$transaction` не используется.

```prisma
enum UserRole {
  CUSTOMER
  ADMIN
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique           // anchor (email-first), NOT NULL
  emailVerified DateTime?                    // задел; верификация — P2.1
  passwordHash  String?                      // email/пароль; null у Google-only
  name          String?
  phone         String?                      // контакт для checkout; без @unique/верификации
  birthdate     DateTime?
  role          UserRole  @default(CUSTOMER) // задел под admin (Phase 3)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  carts         Cart[]                       // обратная сторона Cart.userId
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Правка существующей модели `Cart`:
```prisma
model Cart {
  // ... существующие поля ...
  userId String?
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@index([userId])
}
```

> `Session`-модель НЕ добавляется (стратегия JWT). Поля `Account` соответствуют ожиданиям `@auth/prisma-adapter`.

**Правила идентичности (email-first):**
- `email` — единственный канонический ключ. Регистрация и Google-вход находят/создают `User` по email.
- Google: `allowDangerousEmailAccountLinking: true` — безопасно (Google верифицирует email), авто-линк к существующему `User` с тем же email.
- email/пароль: lookup по `email`, при создании полагаемся на `@unique` + перехват `P2002` (без предчтения find-then-create — нет `$transaction`).
- Коллизии «уже существует» решаются constraint'ом БД, не гонкой кода.

---

## 5. Auth-архитектура (Auth.js v5)

**Файлы:**
- `auth.config.ts` — edge-safe конфиг (без адаптера и без БД): провайдеры-метаданные, страницы, `authorized`-callback для middleware (только чтение JWT).
- `auth.ts` — полный конфиг: `PrismaAdapter`, `session: { strategy: 'jwt' }`, провайдеры с `authorize`, callbacks. Работает на `runtime='nodejs'`.
- `app/api/auth/[...nextauth]/route.ts` — handlers Auth.js (`runtime='nodejs'`).
- `middleware.ts` — использует `auth.config.ts`; защищает `/profile` (и задел `/checkout`), редирект на `/login`.

**Провайдеры:**
- `Credentials('password')`: `authorize` нормализует email, ищет `User`, сверяет `passwordHash` через **argon2id** (`runtime='nodejs'`). Неуспех → `null`.
- `GoogleProvider({ allowDangerousEmailAccountLinking: true })`.

**Сессия (JWT):**
- `session.strategy='jwt'` (обязательно — иначе с адаптером Auth.js пишет `Session` на каждый запрос по Neon HTTP; плюс `Credentials` требует JWT).
- `callbacks.jwt`: при входе кладёт `userId`, `role` в токен.
- `callbacks.session`: прокидывает `userId`, `role` в `session.user`.
- TTL короткий (напр. 30 дней с ротацией при активности — финальное значение в плане). Серверный отзыв до истечения — вне scope (приемлемо для фундамента).

**Env (операционные задачи пользователя — см. §10):** `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

---

## 6. Потоки

**Регистрация (email/пароль):**
```
/register: email + пароль + имя → Zod-валидация
→ hash argon2id → prisma.user.create (email @unique; P2002 → «email занят»)
→ signIn('credentials') → JWT-cookie → редирект (в профиль/назад)
```

**Вход (email/пароль):**
```
/login: email + пароль → Credentials.authorize → сверка argon2id
→ успех: JWT-cookie; неуспех: единое сообщение «неверный email или пароль»
```

**Google (вход и регистрация одной кнопкой):**
```
«Войти через Google» → Auth.js OAuth (state/PKCE/CSRF — на стороне библиотеки)
→ adapter: найти User по email → есть: link/login; нет: createUser+linkAccount
→ JWT-cookie
```

**Выход:** `signOut` → очистка cookie.

**Слияние гостевой корзины (`events.signIn`):**
```
guestToken = cookie cartToken (если есть)
mergeGuestCart(guestToken, userId):
  - найти гостевую Cart по token и Cart пользователя (userId)
  - если у юзера нет корзины → переназначить гостевую: Cart.userId = userId
  - если есть обе → для каждого item гостевой: upsert по @@unique([cartId, productVariantId])
      (существует → quantity += ; нет → создать), затем удалить гостевую Cart
  - recalc total последним
  - всё последовательными await + retryOnTransient (без $transaction)
```

---

## 7. Маршруты и компоненты

| Маршрут | Тип | Источник | Заметки |
|---------|-----|----------|---------|
| `/login` | client form | `auth.html` | email/пароль + кнопка Google; ссылка на `/register` |
| `/register` | client form | `auth.html` | email/пароль/имя + кнопка Google |
| `/profile` | защищён (middleware) | `profile.html` | вкладки: «Личные данные» (актив), «Мои заказы» (заглушка) |
| `/legal/privacy` `/legal/terms` `/legal/delivery` `/legal/refund` | static RSC | `legal-*.html` | контент из прототипов |
| `/api/auth/[...nextauth]` | route (nodejs) | Auth.js | — |
| профиль (чтение) | RSC | `profile.html` | данные грузятся в серверном компоненте `/profile` из сессии+БД |
| `updateProfile` | **Server Action** | — | правка имя/телефон/дата рождения; авто-CSRF Next 15 |

Формы — React Hook Form + Zod (как в стеке Фазы 1). Обновить `site-footer.tsx`: legal-ссылки `#` → реальные пути. Хедер: при наличии сессии — ссылка на профиль/выход вместо «Войти».

---

## 8. Безопасность и ограничения

- **Neon HTTP без `$transaction`**: все мультизаписи (слияние корзины, create+link) — последовательные await + компенсация + `retryOnTransient` (как в Фазе 1). Никаких интерактивных транзакций.
- **Пароли**: argon2id (OWASP-параметры), `runtime='nodejs'`; в логи/ответы не попадают (логгер уже скрабит `password`).
- **`session.strategy='jwt'`** — явно (footgun: с адаптером дефолт `database`).
- **Адаптер не импортируется в `middleware`** (edge-split строго).
- **Rate-limit**: реальный лимитер на `/api/auth` вход (per-IP + per-email), замена NOOP-заглушки `lib/rate-limit.ts`. Реализация (Upstash sliding-window или эквивалент) — деталь плана; каркас `extractClientIp`/`isRateLimitConfigured` уже есть.
- **CSRF**: для эндпоинтов Auth.js — на стороне библиотеки. Правка профиля реализуется как **Server Action** (`updateProfile`) — Next 15 даёт авто-CSRF для Server Actions, ручная Origin-проверка не нужна. Если в P2.1 появятся собственные мутирующие route-handlers — для них добавить проверку Origin/Referer vs Host + sameSite-cookie.
- **P2002** вместо find-then-create как гонко-guard.

---

## 9. Тесты

**Unit (Vitest):**
- хеширование/проверка пароля (argon2id round-trip, неверный пароль).
- `mergeGuestCart` — чистая логика слияния (сумма количеств, дедуп по варианту, перенос при отсутствии корзины пользователя).
- правила идентичности (нормализация email, обработка дубликата email).

**E2E (Playwright, CI на Ubuntu — как Фаза 1):**
- регистрация email/пароль → автологин → виден профиль.
- вход → выход → защита `/profile` (редирект на `/login` без сессии).
- правка профиля (имя/телефон/дата рождения) сохраняется.
- **слияние корзины**: гость добавил товар → зарегистрировался/вошёл → товар в корзине.
- legal-страницы рендерятся; футер-ссылки ведут на них.
- a11y (axe) на `/login`, `/register`, `/profile`, legal.
- Google-вход — мок/пропуск в e2e (внешний редирект); покрывается ручной проверкой на превью.

Инфраструктура e2e — как в Фазе 1 (global-setup прогрев/keep-warm Neon, retries, CI на Ubuntu).

---

## 10. Операционные задачи пользователя (вне кода)

- **Google OAuth**: создать OAuth-клиент в Google Cloud Console; redirect URI `https://<домен>/api/auth/callback/google` (+ localhost для dev); получить `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.
- **Env в Vercel + `.env`**: `AUTH_SECRET` (сгенерировать), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. (При наличии Upstash для rate-limit — его ключи.)
- Прод-ветка/CI — как в Фазе 1 (см. memory [[vercel-deploy-setup]], [[local-e2e-neon-latency]]).

---

## 11. Критерии готовности P2.0

- Миграция схемы (`User`/`Account`/`VerificationToken` + `Cart.userId`) применена; `prisma generate` ок.
- Регистрация и вход работают обоими методами (email/пароль, Google); JWT-сессия держится между страницами.
- `/profile` защищён; «Личные данные» читаются/редактируются; «Мои заказы» — заглушка.
- Гостевая корзина переживает вход (слияние корректно: количества суммируются, дубликатов позиций нет).
- Legal-страницы доступны; футер-ссылки реальны.
- Rate-limit на вход активен.
- `typecheck` + unit зелёные локально; e2e + a11y зелёные в CI (Ubuntu); `next build` чистый.
- Соблюдены non-negotiables §8 (jwt-стратегия, nodejs-runtime для argon2, адаптер не в middleware, P2002-guard, без `$transaction`).

---

## 12. Что дальше (после P2.0)

P2.1 — Checkout + Orders + Payments (ЮKassa) + почтовый сервис (тогда же: верификация email, восстановление пароля, письма заказов, наполнение вкладки «Мои заказы»). Далее P2.2 (отзывы/wishlist/рассылка), P2.3 (инфра: Sentry/Cloudinary/PDP-polish). Admin — Phase 3. Полная карта: `docs/superpowers/research/2026-06-02-phase2-candidates.md`.
