# Security Review: STRIDE sneakers store

Дата: 2026-06-19

## Сводка

- Всего findings: 8
- Critical: 2, оба исправлены автоматически
- High: 2, требуют отдельного PR
- Medium: 3, требуют hardening
- Recommendations: 1
- Остаточный риск после исправлений: High
- Уверенность: высокая для всех перечисленных findings

Проверены: Next.js App Router routes/actions, auth/admin gate, платежный workflow YooKassa, email verification, upload/media boundary, raw SQL, redirects, API routes, security headers, dependency audit.

## Critical

### [CRIT-001] YooKassa webhook доверял публичному payload и мог менять статус заказа

Статус: исправлено

- Файл: `stride-app/app/api/yookassa/webhook/route.ts:20`
- Риск: Critical
- Уверенность: High
- Описание: публичный webhook принимал JSON-уведомление и применял `payment.succeeded` / `payment.canceled` к локальному заказу на основании входящего payload. Подпись webhook в этом SDK-коде не проверялась, а источник истины у YooKassa не запрашивался.
- Сценарий атаки: атакующий, получивший или угадавший `paymentId`, отправляет POST на webhook с событием `payment.succeeded`. До исправления приложение могло пометить заказ оплаченным и запустить локальные эффекты оплаты без подтверждения провайдера.
- Исправление: webhook теперь перед локальными эффектами запрашивает актуальный статус платежа у YooKassa через `getPaymentStatus(notification.object.id)` и применяет событие только при совпадении статуса.
- Доказательство исправления:

```ts
const remoteStatus = await getPaymentStatus(notification.object.id);
if (notification.event === 'payment.succeeded') {
  if (remoteStatus !== 'succeeded') return NextResponse.json({ ok: true });
  await applyPaymentSucceeded(notification.object.id);
}
```

- Тест: `stride-app/tests/yookassa-webhook.test.ts:54` проверяет, что при несовпадающем remote status локальные payment effects не вызываются.

### [CRIT-002] Critical advisories в production dependency `next`

Статус: исправлено

- Файл: `stride-app/package.json:51`
- Риск: Critical
- Уверенность: High
- Описание: `npm audit --omit=dev --audit-level=moderate` показывал critical advisories для установленного `next@15.1.11`.
- Сценарий атаки: exploitability зависит от конкретного advisory и deployment path, но уязвимость находится на уровне web framework, поэтому риск для request handling/auth/middleware surfaces критический.
- Исправление: Next.js обновлен до `15.5.19`.
- Доказательство исправления:

```json
"next": "15.5.19"
```

- Проверка: повторный `npm audit --omit=dev --audit-level=moderate` больше не показывает critical findings.

## High

### [HIGH-001] Остались production dependency advisories

Статус: не исправлено

- Файлы:
  - `stride-app/package-lock.json:2082` (`@opentelemetry/core`)
  - `stride-app/package-lock.json:7949` (`ws` через `engine.io`)
  - `stride-app/package-lock.json:8348` (`form-data`)
  - `stride-app/package-lock.json:9408` (`postcss` в nested dependency)
- Риск: High
- Уверенность: High
- Описание: после обновления Next.js audit все еще сообщает 12 vulnerabilities: 1 low, 7 moderate, 4 high. Critical больше нет, но high/moderate остаются в production dependency graph.
- Сценарий атаки: в зависимости от достижимости конкретного пакета возможны DoS через websocket/memory exhaustion, CRLF/header injection при multipart construction и memory exhaustion в telemetry baggage parsing.
- Исправление: отдельным PR выполнить scoped dependency update/audit pass, затем прогнать `typecheck`, unit tests и production build. Не применять `npm audit fix --force` без ревью diff, потому что он может подтянуть breaking upgrades.

### [HIGH-002] Публичный DaData proxy можно использовать для сжигания provider quota

Статус: не исправлено

- Файл: `stride-app/app/api/dadata/suggest/route.ts:6`
- Риск: High
- Уверенность: High
- Описание: endpoint публичный, не требует auth/session и не применяет rate limit перед запросом к DaData с серверным `DADATA_TOKEN`. Пользовательский `query` напрямую уходит во внешний paid/provider API.
- Сценарий атаки: атакующий запускает массовые POST-запросы на `/api/dadata/suggest`, заставляет backend расходовать лимиты/квоту DaData и генерирует upstream traffic от имени приложения.
- Исправление: добавить IP-based rate limit, ограничение длины `query`, минимальную длину запроса и, если UX позволяет, привязку к checkout/session flow.

## Medium

### [MED-001] Email verification gate может обходить resend limiter

Статус: не исправлено

- Файл: `stride-app/app/actions/verification.ts:72`
- Риск: Medium
- Уверенность: High
- Описание: `resendVerificationCode()` проверяет `checkResendRateLimit()`, но `ensureVerificationGate()` для существующего неверифицированного пользователя вызывает `issueCode(norm)` без direct resend limit.
- Сценарий атаки: повторные login attempts на известный неверифицированный email могут многократно отправлять письма и перезаписывать verification code, создавая email flood/DoS для пользователя.
- Исправление: перед `issueCode(norm)` в `ensureVerificationGate()` применить тот же resend limiter или отдельный limiter по `ip:email`, сохранив наружный non-enumerating ответ.

### [MED-002] Admin DTO принимают произвольные image URLs

Статус: не исправлено

- Файлы:
  - `stride-app/services/dto/product.dto.ts:33`
  - `stride-app/services/dto/category.dto.ts:15`
- Риск: Medium
- Уверенность: High
- Описание: product/category DTO валидируют только синтаксически корректный URL. Это обходит ожидаемую границу signed Cloudinary upload и позволяет сохранить сторонний image URL.
- Сценарий атаки: при компрометации admin-сессии или через future admin bug атакующий сохраняет URL на внешний tracking/content host. Storefront будет загружать сторонний ресурс в пользовательских браузерах.
- Исправление: allowlist `https://res.cloudinary.com/${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/...`, требовать допустимые `publicId` prefixes и отклонять image URL без соответствующего Cloudinary public id.

### [MED-003] Нет CSP и HSTS headers

Статус: не исправлено

- Файл: `stride-app/next.config.mjs:30`
- Риск: Medium
- Уверенность: High
- Описание: конфиг выставляет `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, но не задает `Content-Security-Policy` и `Strict-Transport-Security`.
- Сценарий атаки: при появлении XSS CSP не ограничит загрузку script/connect/img источников; без HSTS браузер не закрепляет HTTPS policy для домена.
- Исправление: добавить production CSP, совместимую с Next.js, Cloudinary, YooKassa redirect, Sentry/analytics, и HSTS `max-age=31536000; includeSubDomains; preload` после проверки домена.

## Recommendations

### [REC-001] Добавить central CSRF origin/fetch-metadata guard

Статус: рекомендация

- Файлы: `stride-app/app/api/cart/route.ts`, `stride-app/app/api/cart/[id]/route.ts`, `stride-app/app/actions/*`
- Риск: Defense-in-depth
- Уверенность: High
- Описание: cookie baseline через `SameSite=Lax` снижает CSRF риск, но нет единого server-side Origin / `Sec-Fetch-Site` guard для state-changing route handlers и server actions.
- Сценарий атаки: если browser/client path или будущая cookie policy ослабит SameSite assumptions, state-changing endpoints останутся без централизованной проверки происхождения запроса.
- Исправление: добавить helper/middleware для POST/PATCH/DELETE и server actions: разрешать same-origin/same-site trusted origins, блокировать cross-site, исключить только provider webhooks.

## Что проверено и не вынесено как finding

- Admin API/actions используют `requireAdminApi()` / `requireAdminAction()`; явного unauthenticated admin path не найдено.
- Raw SQL в customers page использует `Prisma.sql` placeholders, `escapeLike()` и whitelist для `ORDER BY`; SQL injection не подтверждена.
- `safeCallbackUrl()` режет external origins, protocol-relative URLs, backslash и control chars; open redirect не подтвержден.
- `dangerouslySetInnerHTML` используется для JSON-LD с `JSON.stringify(...)`; user-controlled raw HTML sink не подтвержден.
- Password storage использует Node-only auth path и argon2 dependency; plain/weak password hashing не найден.
- Cloudinary signing/delete endpoints закрыты admin gate.

## Автоматически внесенные исправления

1. `stride-app/app/api/yookassa/webhook/route.ts` - добавлена сверка terminal status у YooKassa перед применением локальных payment effects.
2. `stride-app/tests/yookassa-webhook.test.ts` - добавлены regression tests для remote status verification и failure path.
3. `stride-app/package.json` / `stride-app/package-lock.json` - `next` обновлен с `15.1.11` до `15.5.19`.

## Verification

- `npm.cmd run typecheck` - passed.
- `npm.cmd run test -- tests/yookassa-webhook.test.ts` - passed, 6/6.
- `npm.cmd run test` - passed, 69 files / 489 tests.
- `npm.cmd audit --omit=dev --audit-level=moderate` - critical findings removed; remaining: 12 vulnerabilities (1 low, 7 moderate, 4 high).
- `npm.cmd run build` - не завершился из-за sandbox/network `EACCES` при загрузке Google Fonts (`Anybody`, `Manrope`, `Unbounded`) в `app/layout.tsx`; это ограничение сетевого доступа, не TypeScript/app compile error.
