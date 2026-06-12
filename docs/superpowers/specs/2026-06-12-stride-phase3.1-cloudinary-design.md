# STRIDE — Фаза 3.1: Cloudinary media foundation (design)

> Артефакт design-фазы (проспективный — оформлен 2026-06-12 ДО реализации, первая фаза полного цикла
> brainstorming→spec→plan→code). Слайс P3.1. Предпосылка: P3.0 (admin foundation) в main.
> Spec 3.0: `docs/superpowers/specs/2026-06-12-stride-phase3.0-admin-foundation-design.md`.

## 1. Проблема и цель

После фундамента 3.0 админка имеет гейт/тему/оболочку/примитивы, но не умеет работать с изображениями.
Доменные фазы 3.2 (Categories) и 3.3 (Products) будут грузить картинки (`Category.coverImage`,
`ProductImage`), и им нужен общий media-пайплайн. Сейчас картинки — локальные файлы из Фазы 1
(`public/`); `cloudinary` SDK не установлен, `lib/cloudinary` нет; в whitelist `next.config` уже стоит
`res.cloudinary.com`.

**Цель P3.1**: переиспользуемый media-фундамент — загрузка/удаление изображений в Cloudinary из admin
через **signed direct-to-Cloudinary** (клиент грузит файл напрямую в Cloudinary с серверной подписью),
плюс admin-компонент `<ImageUploader>`, изоморфный URL-билдер трансформаций и типы метаданных.
Фундамент **возвращает метаданные наверх** (callback) — персистентность решают потребители.

**Не-цель** (out of scope, явно):
- любая привязка к доменным сущностям и формам (Categories — 3.2, Products — 3.3);
- **изменения Prisma-схемы** (поля `publicId` и т.п. добавят потребители в своих фазах);
- автоматический sweep осиротевших ассетов (cron/фоновая уборка) — техдолг, см. §8;
- crop-UI, Cloudinary Upload Widget, мультиаккаунт, видео/raw — YAGNI;
- client-side resize до загрузки (грузим оригинал, оптимизация на отдаче).

## 2. Контекст-якоря (проверено в коде на момент старта)

- **Prisma** (`prisma/schema.prisma`): `ProductImage { id, colorwayId, url, alt?, sortOrder }` — хранит **голый
  `url`** (string), `publicId` НЕТ. `Category.coverImage String?`, `User.image String?` — тоже URL. Схему 3.1
  НЕ трогает.
- **Admin-гейт** (`lib/admin/require-admin.ts`): `requireAdminApi()` → `NextResponse|null` (early-return 401/403),
  `requireAdminAction()`, `requireAdminPage()`. Роль из JWT (Auth.js v5), без обращения к Prisma.
- **Admin api-утилиты** (`lib/admin/api-error.ts`): `apiError`, `apiZodError` (флэттит Zod), `apiInternalError`
  (логирует в Sentry). Envelope `{message, issues?}`.
- **Admin-примитивы** (`components/admin/ui/*`, `components/admin/icon.tsx`): `Button` (variant
  primary/secondary/ghost/outline/danger, состояние loading), `Icon` (Material Symbols), admin-токены/тема.
  `cn` из `lib/utils`.
- **next.config.mjs**: `images.remotePatterns` уже включает `res.cloudinary.com` (pathname `/**`).
  `serverExternalPackages` — список node-only пакетов, не бандлящихся в edge.
- **Заглушка** `app/(admin)/admin/catalog/page.tsx` — статичный стаб (помечен «Phase 3.2-3.3»).
- **Fail-soft прецедент** (P2.3): rate-limit без env работает fail-open. Тот же подход к Cloudinary без env.
- **Тесты**: vitest node-only (`tests/**/*.test.ts`), мок `@/auth` и `@/lib/*`; UI не юнит-тестим.
- **i18n**: весь user-facing текст — русский; логи — английский.
- Отсутствуют: пакет `cloudinary`, `lib/cloudinary/*`, любые media-роуты/компоненты.

## 3. Архитектура

### 3.1 Data flow — signed direct-to-Cloudinary

```
ImageUploader (client, 'use client')
  1. локальная валидация файла: формат ∈ {jpeg,png,webp,avif}, размер ≤ 10 MB  — ДО сети
  2. POST /api/admin/media/sign  { folder }                       ── requireAdminApi
     ← { signature, timestamp, apiKey, cloudName, folder }
  3. POST multipart → https://api.cloudinary.com/v1_1/{cloudName}/image/upload
       (file + folder + timestamp + api_key + signature)          ── НАПРЯМУЮ, минуя наш сервер
     ← { public_id, secure_url, width, height, format, bytes, ... }
  4. нормализую → UploadedImage; onChange(images[]) наверх; превью в гриде
  5. удаление из превью → POST /api/admin/media/delete { publicId }  ── requireAdminApi
       → cloudinary.uploader.destroy(publicId)   (best-effort)
```

**Почему direct, а не proxy**: прямая загрузка обходит лимит тела Vercel serverless (~4.5 MB) — фото
кроссовок до 10 MB проходят; `api_secret` не покидает сервер; параметры (`folder`) подписываются сервером,
клиент не может грузить вне заданной папки. (Proxy упирается в 4.5 MB и тратит function-время; unsigned
widget даёт публичный preset и сторонний UI вне admin-стиля — оба отклонены.)

### 3.2 Подпись (sign)

`POST /api/admin/media/sign` за `requireAdminApi`:
- zod-вход `{ folder?: string }`; на 3.1 whitelist допустимых папок = `{ "stride/uploads" }` (он же дефолт),
  потребители 3.2/3.3 расширят список (`stride/categories`, `stride/products`);
- `503 { message: "Cloudinary не настроен" }`, если нет env (см. §4, fail-soft);
- подпись через node SDK `cloudinary.v2.utils.api_sign_request({ timestamp, folder }, api_secret)`;
- ответ `{ signature, timestamp, apiKey, cloudName, folder }`. Подписываются **только** серверные параметры
  (`timestamp`, `folder`) — клиент не подмешивает произвольные. Подпись валидна в окне Cloudinary (~1 ч).

### 3.3 Удаление (delete)

`POST /api/admin/media/delete` за `requireAdminApi`:
- zod-вход `{ publicId: string }`;
- `503`, если не сконфижено;
- `cloudinary.v2.uploader.destroy(publicId)`; **best-effort** — при фейле лог + `200 { ok: false }` (UI уже
  убрал картинку, не блокируем). Успех → `200 { ok: true }`.

### 3.4 URL-трансформации

`lib/cloudinary/url.ts` — **изоморфный** чистый билдер (без SDK): `buildImageUrl(publicId, preset)`.
Пресеты с `f_auto,q_auto` (Cloudinary сам отдаёт WebP/AVIF и подбирает качество):
- `thumb` — `c_fill,w_160,h_160,f_auto,q_auto`
- `card` — `c_fill,w_640,h_480,f_auto,q_auto`
- `full` — `c_limit,w_1600,f_auto,q_auto`

Грузим **оригинал**, оптимизация — на отдаче через эти пресеты. `cloudName` берётся из
`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (не секрет — виден в URL).

## 4. Конфиг / env

- `.env.example` += `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
- `lib/cloudinary/config.ts`: читает env, экспортит `isCloudinaryConfigured: boolean` и `cloudName`.
  `api_secret`/`api_key` — **только сервер** (без `NEXT_PUBLIC_`).
- `cloudinary` SDK → добавить в `serverExternalPackages` (node-only, не в edge-бандл). На клиенте SDK не нужен —
  прямой `fetch` к Cloudinary REST.
- `res.cloudinary.com` в whitelist — уже есть, не трогаем.
- **Fail-soft** (как rate-limit P2.3): без env sign/delete отдают `503`; `<ImageUploader>` рендерит
  disabled-состояние с подсказкой «Cloudinary не настроен». Билд/локальная разработка не падают.

## 5. Файлы

**lib/cloudinary/**
- `config.ts` — env + `isCloudinaryConfigured` + `cloudName` + ленивый init SDK.
- `sign.ts` — `buildUploadSignature(params)` (сервер).
- `server.ts` — `deleteAsset(publicId)` (сервер).
- `url.ts` — `buildImageUrl(publicId, preset)` + словарь пресетов (изоморфный).
- `validate.ts` — `validateImageFile({type, size})` → `{ok}|{ok:false, error}` (клиент+сервер, чистая).
- `types.ts` — `UploadedImage { publicId, url, width, height, format, bytes, alt? }`, `TransformPreset`,
  `ALLOWED_FORMATS`, `MAX_FILE_BYTES`.

**app/api/admin/media/**
- `sign/route.ts` — POST, `requireAdminApi`, zod, 503-fail-soft, подпись.
- `delete/route.ts` — POST, `requireAdminApi`, zod, 503-fail-soft, destroy best-effort.

**components/admin/media/**
- `image-uploader.tsx` (`'use client'`) — drag-drop + `<input type=file multiple>`, прогресс загрузки,
  превью-грид, удаление, `alt`-инпут на карточку, drag-reorder (управляет `sortOrder`). Props:
  `value: UploadedImage[]`, `onChange(images)`, `folder?`, `max?`. На admin-примитивах (`Button`/`Icon`) и
  admin-токенах. Disabled-состояние при не-сконфижено.
- `image-preview-card.tsx` — карточка превью (картинка через `thumb`-пресет, alt-инпут, кнопка delete).

**Демо (ручная проверка):**
- `app/(admin)/admin/catalog/page.tsx` — заглушку заменяю на демо-секцию с живым `<ImageUploader>`
  (локальный client-state, ничего не персистит). 3.2/3.3 заменят на реальные формы.

## 6. Error handling

- Клиентская валидация (формат/размер) → инлайн-ошибка под drop-зоной (ru), до сети.
- sign-роут: `apiZodError` (невалидный вход), `requireAdminApi` (401/403), `503` (не сконфижено),
  `apiInternalError`→Sentry (неожиданное).
- Прямой upload в Cloudinary: 4xx/сетевые ошибки → парсю ответ Cloudinary, показываю ru-сообщение на карточке.
- delete: best-effort — фейл логируется, UI не блокируется (тост-warning), `200 {ok:false}`.

## 7. Тесты (vitest, node-only)

- `validate.test.ts` — допустимые/недопустимые форматы, граница 10 MB, пустой файл.
- `sign.test.ts` — детерминизм подписи на фиксированном мок-`api_secret`; в подпись входят только
  `timestamp`+`folder` (нет лишних параметров).
- `url.test.ts` — пресеты `thumb/card/full` содержат `f_auto,q_auto` и верные размеры; корректный энкодинг `publicId`.
- `sign.route.test.ts` / `delete.route.test.ts` — мок `@/auth` (гейт 401/403), zod-валидация входа,
  `503` при не-сконфижено (мок env), happy-path с мок-SDK.
- **UI не юнит-тестим** (vitest node-only) — `<ImageUploader>` проверяется вручную через демо на /admin/catalog.

## 8. Безопасность и техдолг

**Безопасность**: `api_secret` только сервер · обе media-route за `requireAdminApi` · `folder` подписывается
сервером (whitelist папок) · подпись с TTL Cloudinary · zod на входах.

**Техдолг (явный)**:
- Осиротевшие ассеты при «закрыл вкладку, не сохранив» — компонент чистит при ручном удалении из превью, но
  полного фонового sweep нет. Документируется; уборка/cron — будущая задача.
- Персистентность метаданных и поле `publicId` в схеме — ответственность потребителей (3.2/3.3).

## 9. Git

- Ветка: `feat/phase3.1-cloudinary-media` (база уточняется при переходе к плану: от `main`, если P3.0 смержена,
  иначе от `feat/phase3.0-admin-foundation`).
- Коммиты/PR — английский, единственный автор, без Co-Authored-By (конвенция репо).
- CI: vitest node-only зелёный; `prisma db push` на деплое идемпотентен (схема 3.1 не меняется).

## 10. Acceptance criteria

1. `lib/cloudinary/{config,sign,server,url,validate,types}.ts` существуют; типы экспортируются.
2. `POST /api/admin/media/sign` за гейтом возвращает валидную подпись; `503` без env.
3. `POST /api/admin/media/delete` за гейтом вызывает destroy; best-effort на фейле; `503` без env.
4. `<ImageUploader>` грузит файл direct-to-Cloudinary, показывает превью, удаляет, отдаёт `UploadedImage[]`
   через `onChange`; disabled без env.
5. Демо на /admin/catalog позволяет вручную загрузить/удалить картинку (при сконфиженном env).
6. Vitest (validate/sign/url/routes) зелёный; CI проходит.
7. Prisma-схема не изменена.
