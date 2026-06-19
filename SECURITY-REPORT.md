# Security Review: STRIDE sneakers store

Дата: 2026-06-19

## Сводка

- Всего findings: 8
- Critical: 2, исправлены
- High: 2, исправлены / снижены
- Medium: 3, исправлены
- Recommendations: 1, реализована
- Остаточный риск после исправлений: Medium, из-за forced/breaking dependency advisory в `next`/`postcss`
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

Статус: частично исправлено, остаточный риск снижен

- Файлы:
  - `stride-app/package-lock.json` (`form-data`, `ws`, `@opentelemetry/core` обновлены безопасным `npm audit fix`)
  - `stride-app/package-lock.json` (`next/node_modules/postcss` остается в forced/breaking audit path)
- Риск: Medium после safe fix
- Уверенность: High
- Описание: безопасный `npm audit fix` снял production high findings по `form-data`, `ws` и `@opentelemetry/core`. Остался production moderate advisory по `postcss` внутри `next`; `npm audit` предлагает только `--force`, который ведет к breaking downgrade `next@9.3.3`.
- Сценарий атаки: остаточный `postcss` advisory связан с CSS stringify output; текущий app не принимает пользовательский CSS для серверной stringify-обработки, поэтому риск ниже исходного dependency finding.
- Исправление: не применять `npm audit fix --force`; ждать безопасный патч в Next.js или vendor override после отдельной проверки совместимости.

### [HIGH-002] Публичный DaData proxy можно использовать для сжигания provider quota

Статус: исправлено

- Файл: `stride-app/app/api/dadata/suggest/route.ts:8`
- Риск: High
- Уверенность: High
- Описание: endpoint публичный, не требует auth/session и не применяет rate limit перед запросом к DaData с серверным `DADATA_TOKEN`. Пользовательский `query` напрямую уходит во внешний paid/provider API.
- Сценарий атаки: атакующий запускает массовые POST-запросы на `/api/dadata/suggest`, заставляет backend расходовать лимиты/квоту DaData и генерирует upstream traffic от имени приложения.
- Исправление: добавлен `checkDadataRateLimit(ip)`, trimming и hard cap `query <= 120` до upstream fetch. Тест: `stride-app/tests/dadata-suggest-route.test.ts`.

## Medium

### [MED-001] Email verification gate может обходить resend limiter

Статус: исправлено

- Файл: `stride-app/app/actions/verification.ts:72`
- Риск: Medium
- Уверенность: High
- Описание: `resendVerificationCode()` проверяет `checkResendRateLimit()`, но `ensureVerificationGate()` для существующего неверифицированного пользователя вызывает `issueCode(norm)` без direct resend limit.
- Сценарий атаки: повторные login attempts на известный неверифицированный email могут многократно отправлять письма и перезаписывать verification code, создавая email flood/DoS для пользователя.
- Исправление: `ensureVerificationGate()` теперь вызывает `checkResendRateLimit(norm)` перед `issueCode(norm)` и сохраняет non-enumerating `{ gated: true }`. Тест: `stride-app/tests/verification-actions.test.ts`.

### [MED-002] Admin DTO принимают произвольные image URLs

Статус: исправлено

- Файлы:
  - `stride-app/services/dto/product.dto.ts:33`
  - `stride-app/services/dto/category.dto.ts:15`
- Риск: Medium
- Уверенность: High
- Описание: product/category DTO валидируют только синтаксически корректный URL. Это обходит ожидаемую границу signed Cloudinary upload и позволяет сохранить сторонний image URL.
- Сценарий атаки: при компрометации admin-сессии или через future admin bug атакующий сохраняет URL на внешний tracking/content host. Storefront будет загружать сторонний ресурс в пользовательских браузерах.
- Исправление: добавлен общий DTO helper `stride-app/services/dto/cloudinary-image.ts`; product/category схемы принимают только `https://res.cloudinary.com/${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/...` с `publicId` prefix `stride/uploads/` или `stride/categories/`. Тесты: `product-dto.test.ts`, `category-dto.test.ts`.

### [MED-003] Нет CSP и HSTS headers

Статус: исправлено

- Файл: `stride-app/next.config.mjs:30`
- Риск: Medium
- Уверенность: High
- Описание: конфиг выставляет `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, но не задает `Content-Security-Policy` и `Strict-Transport-Security`.
- Сценарий атаки: при появлении XSS CSP не ограничит загрузку script/connect/img источников; без HSTS браузер не закрепляет HTTPS policy для домена.
- Исправление: security headers вынесены в `stride-app/lib/security/headers.mjs`; `next.config.mjs` добавляет CSP и production HSTS. Тест: `stride-app/tests/security-headers.test.ts`.

## Recommendations

### [REC-001] Добавить central CSRF origin/fetch-metadata guard

Статус: реализовано

- Файлы: `stride-app/app/api/cart/route.ts`, `stride-app/app/api/cart/[id]/route.ts`, `stride-app/app/actions/*`
- Риск: Defense-in-depth
- Уверенность: High
- Описание: cookie baseline через `SameSite=Lax` снижает CSRF риск, но нет единого server-side Origin / `Sec-Fetch-Site` guard для state-changing route handlers и server actions.
- Сценарий атаки: если browser/client path или будущая cookie policy ослабит SameSite assumptions, state-changing endpoints останутся без централизованной проверки происхождения запроса.
- Исправление: добавлен `stride-app/lib/security/csrf.ts`; middleware применяет Fetch Metadata / Origin / Referer guard к state-changing requests на broad app matcher, с исключением для provider webhook. Тест: `stride-app/tests/csrf.test.ts`.

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
4. `stride-app/package-lock.json` - safe `npm audit fix` снял production high findings по `form-data`, `ws`, `@opentelemetry/core`.
5. `stride-app/app/api/dadata/suggest/route.ts` - добавлены rate limit и cap длины query перед upstream DaData.
6. `stride-app/app/actions/verification.ts` - email verification gate больше не обходит resend limiter.
7. `stride-app/services/dto/*` - добавлена Cloudinary allowlist validation для product/category image URL.
8. `stride-app/next.config.mjs`, `stride-app/middleware.ts` - добавлены CSP/HSTS и central CSRF guard.

## Verification

- `npm.cmd run typecheck` - passed.
- `npm.cmd run test -- tests/dadata-suggest-route.test.ts` - passed, 3/3.
- `npm.cmd run test -- tests/verification-actions.test.ts` - passed, 10/10.
- `npm.cmd run test -- tests/product-dto.test.ts tests/category-dto.test.ts` - passed, 24/24.
- `npm.cmd run test -- tests/csrf.test.ts tests/security-headers.test.ts` - passed, 5/5.
- `npm.cmd run test` - passed, 72 files / 502 tests.
- `npm.cmd audit --omit=dev --audit-level=moderate` - remaining: 4 moderate vulnerabilities in forced/breaking `next` → nested `postcss` path.
- `npm.cmd audit --audit-level=moderate` - remaining: 9 vulnerabilities in full tree, including dev `vitest/vite/esbuild`; fixes require `--force` / breaking upgrades.
- `npm.cmd run build` - passed with network permission for Google Fonts fetch.
