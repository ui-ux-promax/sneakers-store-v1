# STRIDE — Фаза 2.3 (Email-верификация + Newsletter на Resend): дизайн

> **Статус:** дизайн (брейнсторминг завершён, ожидает план).
> **Дата:** 2026-06-09. **Ветка (план):** `feat/phase2.3-email-resend` (от `main`).
> Артефакт брейнсторминга (superpowers:brainstorming). Прототипа не было — дизайн с нуля.
> Сервис рассылки: **Resend** (https://resend.com/docs/send-with-nextjs), домен уже верифицирован.

## 1. Цель

Две связанные подсистемы на одном email-транспорте (Resend):

1. **Верификация почты при регистрации** — после регистрации по email пользователю
   приходит 6-значный код; он вводит его в **неубираемой модалке** (жёсткий gate).
   Аккаунт считается подтверждённым только после верного кода. Google-вход —
   verified автоматически (OAuth-почта уже проверена).
2. **Newsletter (рассылка)** — реальный бэкенд подписки из футера: своя таблица
   `Subscriber` (source of truth) + синк в **Resend Audience**, single opt-in,
   welcome-письмо, отписка по ссылке.

## 2. Зафиксированные решения (брейнсторминг)

| Вопрос | Решение |
|---|---|
| Жёсткость gate | **Жёсткий gate при регистрации.** До ввода кода войти нельзя вообще. |
| Блокировка входа | **Блокировать вход по паролю** для неверифицированной почты (не только checkout). |
| Модалка | **Неубираемая** (нет крестика/Esc/клика вне) **и переживает перезагрузку** страницы. |
| Хранение кодов | **Новая модель `EmailVerificationCode`** (хэш кода, attempts, expiresAt, consumedAt). |
| Хранение подписчиков | **Своя таблица `Subscriber` + синк в Resend Audience.** |
| Double opt-in | **Нет, single opt-in** (подписан сразу, welcome-письмо). |
| Шаблоны писем | **React Email** (`react-email` + `@react-email/components`). |
| Транспорт | **Resend** (`resend` SDK, `react` проп в `emails.send`). |

## 3. Ключевая развилка: как пережить перезагрузку без сессии

«Блокировать вход» + «модалка не закрывается и появляется при перезагрузке» —
внутренне противоречиво: если вход заблокирован, сессии нет, и после reload система
не знает, кому показывать модалку.

**Решение (Подход A — подписанная cookie `pending_verification`):**
при регистрации **НЕ логиним**, ставим httpOnly+signed cookie `{email, exp}`.
`RootLayout` (server) читает её: если cookie есть И сессии нет → рендерит модалку-гейт.
Reload → cookie на месте → гейт снова тут. Верный код → создаём сессию, гасим cookie.

Отклонённые альтернативы:
- **B — pre-session с JWT-флагом `unverified`:** настоящая сессия у неверифицированного
  юзера противоречит «блокировать вход», легко протечь в защищённые места.
- **C — localStorage-флаг:** обходится через DevTools, не serverside-надёжно.

## 4. Модель данных

Добавить в `prisma/schema.prisma`. `User.emailVerified DateTime?` уже существует
(стандарт NextAuth) — **переиспользуем как флаг верификации** (null = не подтверждён).

```prisma
model EmailVerificationCode {
  id         String    @id @default(cuid())
  email      String                          // нормализованный (normalizeEmail)
  codeHash   String                          // argon2-хэш кода (НЕ плейн), как passwordHash
  expiresAt  DateTime                         // now + 10 мин
  attempts   Int       @default(0)            // ++ на каждую неверную попытку; лимит 5
  consumedAt DateTime?                         // одноразовость: ≠ null → код использован/инвалидирован
  createdAt  DateTime  @default(now())

  @@index([email])                            // берём последний активный по email
  @@index([expiresAt])                         // для будущей чистки протухших
}

model Subscriber {
  id              String    @id @default(cuid())
  email           String    @unique           // нормализованный
  source          String    @default("footer") // footer | register | checkout — откуда пришёл
  resendContactId String?                       // id контакта в Resend Audience (после синка)
  unsubscribedAt  DateTime?                      // null = активен; отписка через ссылку в письме
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

**Заметки:**
- **`codeHash`, не плейн** — утечка БД не раскрывает коды; сверка через `verifyPassword`
  (argon2 уже в `lib/password.ts`). Онлайн-брут прикрыт `attempts`-лимитом + rate-limit.
- **`attempts` + лимит 5** — после 5 неверных код помечается consumed (нужен ресенд).
- **`expiresAt` 10 мин** (короткоживущий секрет) — отдельно от cookie 30 мин (окно «дойти до ввода»).
- **Один активный код на email** — при ресенде старые коды email помечаем consumed/удаляем.
- **`Subscriber.email @unique`** — повторная подписка идемпотентна (upsert; реактивация при отписке).
- **`resendContactId` nullable** — синк best-effort; null = «в нашей БД есть, в Resend не долетел».
- **Чистка протухших кодов** — лениво (при следующем `issueCode` для email), без отдельного крона.

⚠️ **Миграция:** по [[never-run-db-against-neon-locally]] `prisma db push` к Neon **не гоняем
локально на Windows** (зависает, P1017) — только в CI / на Vercel. Учесть в плане.

## 5. Email-транспорт (`lib/email/`)

**Новые зависимости:** `resend`, `react-email`, `@react-email/components`.
Письма рендерятся через `react`-проп `resend.emails.send` (SDK сам вызывает рендер).

- **`lib/email/resend-client.ts`** — ленивый синглтон, fail-friendly (нет `RESEND_API_KEY` →
  `null`, как `lib/rate-limit.ts` при отсутствии Upstash). `isEmailConfigured(): boolean`.
- **`lib/email/send-email.ts`** — единая обёртка `sendEmail(opts): Promise<SendResult>`,
  где `SendResult = { ok: true; id } | { ok: false; error }`:
  - **Два отправителя** (передаётся вызывающим, дефолт — транзакционный):
    транзакционные письма (код верификации, welcome после верификации) → `EMAIL_FROM_TRANSACTIONAL`
    (`Stride <no-reply@cloudd3r.eu.cc>`); newsletter (welcome подписки) → `EMAIL_FROM_NEWSLETTER`
    (`Stride <hello@cloudd3r.eu.cc>`). Опц. `replyTo` из `EMAIL_REPLY_TO`.
  - зовёт `resend.emails.send({ from, to, subject, react })`, разбирает `{ data, error }`
    (SDK **не бросает** — проверяем `error`).
  - `!isEmailConfigured()` → warn + `{ ok:false }` (в dev без ключа приложение не падает;
    в проде ключ обязателен).
  - логирует через `logger` с PII-scrub (`lib/pii-scrub.ts`); **код письма не логируется в проде**.
  - **dev-режим без ключа:** код верификации дополнительно пишется в `logger.info` —
    чтобы пройти флоу локально/в CI без реальной почты. Никогда в проде.

**Шаблоны `emails/` (React Email, общий брендовый layout):**
- `_layout.tsx` — обёртка (лого Stride, тёмная шапка под стиль сайта, футер с отпиской). Переиспользуется.
- `verification-code.tsx` — крупный 6-значный код, «действует 10 минут», «не вы — проигнорируйте».
- `welcome.tsx` — после верификации (приветствие + ссылка в каталог).
- `newsletter-welcome.tsx` — после подписки (single opt-in), внизу ссылка отписки.

**Превью писем (dev):** скрипт `email:dev` (react-email preview-сервер на :3001), без отправки.

## 6. Верификация: логика и server actions

**`lib/verification/` (ядро, без React):**
- `code.ts` — `generateCode()` → 6 цифр криптостойко (`crypto.randomInt(0, 1_000_000)`, pad до 6).
  `hashCode`/`verifyCodeHash` поверх `lib/password.ts`.
- `pending-cookie.ts` — `setPending(email)` / `readPending()` / `clearPending()`.
  Cookie `pending_verification`: httpOnly, secure, sameSite=lax, **подписана HMAC по `AUTH_SECRET`**
  (payload `{ email, exp }`), maxAge 30 мин. Подпись = защита от подмены email.
- `service.ts`:
  - `issueCode(email, source)` — чистит старые коды email, генерит, пишет `EmailVerificationCode`,
    шлёт письмо; возвращает cooldown-инфо.
  - `confirmCode(email, code)` — берёт последний активный (не consumed, не истёкший);
    нет → `expired`; `attempts>=5` → `locked`; неверный → `attempts++` → `wrong`;
    верный → `consumedAt=now` → `ok`. Гонку двойного сабмита закрывает условие `consumedAt IS NULL`
    в апдейте по `id`.

**Server actions `app/actions/verification.ts`** (результаты — дискриминированные union):
- `verifyEmailCode(formData)` — email берётся **из cookie** (не из клиента; клиент шлёт только код).
  При `ok`: `User.emailVerified=now()`, `clearPending()`, автологин (см. §7). Возврат: `ok | wrong | expired | locked`.
- `resendVerificationCode()` — cooldown 60 сек, ≤5 ресендов/час на email, email из cookie, зовёт `issueCode`.

## 7. Интеграция в Auth (NextAuth v5)

**Автологин после кода (проблема и решение).** После верификации у нас нет пароля
(юзер ввёл только код), а `credentials`-провайдер требует пароль. Пароль в cookie — нельзя.

**Решение — второй Credentials-провайдер `verified-ticket`** в `auth.config.ts`:
- `confirmCode` при успехе выдаёт **одноразовый подписанный тикет** (HMAC по `AUTH_SECRET`,
  payload `{ userId/email, exp }`, живёт 60 сек).
- провайдер `verified-ticket`: `authorize` валидирует тикет + сверяет, что `User.emailVerified ≠ null`,
  пускает уже верифицированного юзера. Стандартный паттерн «passwordless after action».
- `signIn('verified-ticket', { ticket, redirect:false })` вызывается из `verifyEmailCode`.

**Вход по паролю (`lib/auth-credentials.ts` / `authorizeCredentials`):**
- добавить проверку: `user.emailVerified == null` → вернуть null с причиной `EmailNotVerified`.
  login-форма ловит причину → ставит `pending` cookie (через action) → показывает гейт.
- constant-time dummy-hash и rate-limit-гейт в `auth.config.ts` остаются нетронутыми.

**Google-вход:** в `events.signIn` (или `events.linkAccount`) — если провайдер google и
`emailVerified == null`, проставить `emailVerified=now()`.
`allowDangerousEmailAccountLinking` остаётся **выключенным** ([[phase2-planning-state]] / #1).

**Поток регистрации (итог):**
```
RegisterForm.submit
  → registerUser: создаёт User (emailVerified=null), НЕ логинит,
      issueCode(email,'register'), setPending(email)
  → форма: { ok, needsVerification:true } → router.refresh()/redirect '/'
  → RootLayout (server): cookie + нет сессии → <VerificationGate/>
  → verifyEmailCode(code): confirmCode → ok →
      emailVerified=now(), clearPending(), signIn('verified-ticket') → refresh → гейт исчез
```

## 8. UI — неубираемая модалка-гейт

**`components/shared/auth/verification-gate.tsx`** (client), рендер из `app/layout.tsx` (server).

- `RootLayout` читает `pending` cookie + сессию → показ при «cookie есть И сессии нет».
- **Нельзя закрыть:** Radix `<Dialog open>` без `onOpenChange`/`<DialogClose>`/крестика;
  `onEscapeKeyDown` / `onPointerDownOutside` / `onInteractOutside` → `preventDefault()`;
  focus-trap (Radix по умолчанию). Выходы только: верный код или истечение cookie (30 мин).
- **Содержимое:** «Подтвердите почту», «Код отправлен на `e***@домен`» (email маскируется);
  **6 раздельных полей (segmented OTP)** — автофокус, авто-переход, paste 6 цифр, `inputMode=numeric`,
  `autocomplete="one-time-code"`; кнопка «Подтвердить» (loading); «Отправить снова» с таймером 60 сек;
  инлайн-ошибки (wrong / expired / locked).
- **A11y:** `role="dialog"`, `aria-modal`, связанный заголовок, ошибки `role="alert"`.
- **Переиспользование:** тот же гейт триггерится после регистрации и при входе неверифицированным.
- **Исполнение:** на реализации — `frontend-design` + `ui-ux-pro-max` (segmented OTP, тёмная тема),
  `react-best-practices` / `vercel-react-best-practices` (server/client split, no layout shift).

## 9. Newsletter (рассылка)

**Поток (single opt-in):** email в футере → `Subscriber` (upsert) → синк в Resend Audience
(best-effort) → welcome-письмо.

**`app/actions/newsletter.ts` → `subscribeToNewsletter(formData)`:**
- Zod `newsletterSchema` (`services/dto/newsletter.dto.ts`), `normalizeEmail`, rate-limit по IP.
- `upsert` по `Subscriber.email`: новый → создаём (`source`); был с `unsubscribedAt` → реактивация;
  был активен → идемпотентно «уже подписаны» (welcome не дублируем).
- Синк: `resend.contacts.create({ email, audienceId: RESEND_AUDIENCE_ID, unsubscribed:false, firstName })`.
  Сбой синка / «уже существует» → логируем, **подписку не роняем**, `resendContactId` может остаться null.
- Welcome-письмо best-effort. Возврат: `{ ok:true, alreadySubscribed? } | { ok:false, error }`.

**`newsletter-form.tsx`** — заменить заглушку (`setDone(true)`) на реальный вызов action:
состояния idle/loading/success/error, тексты «Подписались!» / «Вы уже с нами» / ошибка. Вёрстка футера сохраняется.

**Отписка:** `app/unsubscribe/page.tsx` + ссылка с подписанным токеном (email+HMAC) в футере писем:
ставим `unsubscribedAt=now()` + `resend.contacts.update({ unsubscribed:true })`. Нужно для деливерабилити/CAN-SPAM.

**Опционально (решить на ревью плана, по умолчанию НЕ включаем — YAGNI):** чекбокс «подписаться»
на странице регистрации → при верификации `Subscriber(source:'register')`.

## 10. Безопасность и rate-limit

Rate-limit — Upstash sliding-window, fail-open (паттерн `lib/rate-limit.ts`):
- `verifyEmailCode` — лимит по `pending`-email+IP (поверх БД-`attempts`: двойная защита).
- `resendVerificationCode` — cooldown 60 сек + ≤5/час на email (анти-email-bombing чужого ящика).
- `registerUser` — подключить **реальный** `checkAuthRateLimit` (сейчас NOOP) — иначе массовая
  регистрация жжёт отправку писем.
- `subscribeToNewsletter` — лимит по IP.

Безопасность:
- Код — только хэш в БД; email в cookie — подписан HMAC (нельзя верифицировать чужую почту).
- `verifyEmailCode` берёт email **из cookie**, не из клиента.
- **Enumeration:** ответы регистрации/подписки/ресенда нейтральны; существующий текст
  «email уже зарегистрирован» в `registerUser` оставляем как есть (осознанный UX-trade-off, не расширяем).
- PII скрабится в логах; код в проде не логируется. Google-линковка остаётся off.

## 11. Edge-cases (явно)

- Истёкшая cookie + не залогинен → гейта нет; при входе по паролю гейт поднимется снова.
- Другое устройство/вкладка → код в письме, cookie на другом устройстве: вход по паролю поднимет гейт + переотправку.
- Повторная регистрация на тот же **неверифицированный** email → переиспользуем юзера, шлём новый код
  (не плодим дубли, не отдаём «занято» для своего же неподтверждённого).
- Resend down → регистрация проходит, письмо не ушло → «отправить снова»; в проде — алерт в лог.
- Двойной сабмит кода → `consumedAt` + условие `consumedAt IS NULL` в апдейте гарантируют одноразовость.

## 12. Тесты (vitest, образец — существующие ~156)

Unit (локально, без БД — по [[never-run-db-against-neon-locally]]):
- `generateCode` (длина/диапазон/цифры), `hashCode`/`verifyCodeHash`.
- cookie/тикет sign-verify (валид / протухший / поддельная подпись).
- `send-email`: без ключа → `{ok:false}`, не бросает; `error` от Resend обрабатывается.
- Resend замокан (реальные письма не шлём).

Интеграция (CI / Ubuntu):
- `confirmCode`: ok / wrong+attempts / expired / locked после 5 / consumed-одноразовость.
- newsletter: новый / реактивация / уже подписан / сбой Resend-синка не роняет подписку.
- e2e (Playwright): регистрация → модалка → ввод кода (код из лог-перехвата в dev/CI, не из почты).

## 13. Конфигурация (env — от пользователя)

| Переменная | Значение |
|---|---|
| `RESEND_API_KEY` | `re_...` — ключ Resend, **Full access** (нужны и Sending, и Contacts/Audiences) |
| `EMAIL_FROM_TRANSACTIONAL` | `Stride <no-reply@cloudd3r.eu.cc>` (код верификации, welcome) |
| `EMAIL_FROM_NEWSLETTER` | `Stride <hello@cloudd3r.eu.cc>` (newsletter) |
| `EMAIL_REPLY_TO` | опц., `hello@cloudd3r.eu.cc` |
| `RESEND_AUDIENCE_ID` | UUID аудитории General (Resend → Audience → ⋯ → Copy ID) |
| `AUTH_SECRET` | уже есть — им подписываются cookie `pending_verification` и `verified-ticket` |

Домен `cloudd3r.eu.cc` уже верифицирован в Resend.

Секреты — в `.env.local` (dev) и Vercel env (preview/prod), не в репозитории.
Деплой-нюансы монорепо — [[vercel-deploy-setup]].

## 14. Сводка файлов

**Schema:** `prisma/schema.prisma` (+`EmailVerificationCode`, +`Subscriber`).
**Email:** `lib/email/{resend-client,send-email}.ts`, `emails/{_layout,verification-code,welcome,newsletter-welcome}.tsx`.
**Verification:** `lib/verification/{code,pending-cookie,ticket,service}.ts`, `app/actions/verification.ts`.
**Auth-правки:** `auth.ts` (events google-verified), `auth.config.ts` (+`verified-ticket` провайдер),
`lib/auth-credentials.ts` (+`EmailNotVerified`), `app/actions/auth.ts` (registerUser: не логинит, issueCode+setPending).
**UI:** `components/shared/auth/verification-gate.tsx` (+OTP-input), правка `app/layout.tsx`, `newsletter-form.tsx`.
**Newsletter:** `app/actions/newsletter.ts`, `lib/newsletter/service.ts`, `app/unsubscribe/page.tsx`.
**DTO:** `services/dto/{auth.dto.ts (verifyCodeSchema), newsletter.dto.ts}`.
**Тесты:** `lib/verification/*.test.ts`, `lib/email/*.test.ts`, `lib/newsletter/*.test.ts`, e2e.
**Scripts:** `package.json` (+`email:dev`).

## 15. Вне scope (YAGNI)

SMS-OTP; восстановление пароля (отдельная фаза); magic-link вход; double opt-in;
Resend segments/topics; broadcast-UI; крон-чистка кодов (делаем лениво); чекбокс newsletter при регистрации (опц.).
