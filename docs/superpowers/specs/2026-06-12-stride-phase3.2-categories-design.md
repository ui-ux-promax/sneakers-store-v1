# STRIDE — Фаза 3.2: Categories CRUD + reorder (design)

> Артефакт design-фазы (проспективный — оформлен 2026-06-12 ДО реализации). Слайс P3.2.
> Предпосылка: P3.1 (Cloudinary media foundation) в main (PR #17, 75a8627).
> Spec 3.1: `docs/superpowers/specs/2026-06-12-stride-phase3.1-cloudinary-design.md`.

## 1. Проблема и цель

После media-фундамента 3.1 админка умеет грузить картинки, но не управляет доменными сущностями.
Первая CRUD-сущность — `Category`. Модель уже в схеме (`name/slug/tagline/coverImage/sortOrder`),
наполняется только сидом; UI управления нет.

**Цель P3.2**: раздел `/admin/catalog` с полным CRUD категорий — список, создание, редактирование,
удаление, упорядочивание (reorder ↑/↓), обложка через `ImageUploader` из 3.1. Мутации — server actions
(паттерн проекта). Первый потребитель media-фундамента 3.1.

**Не-цель** (out of scope, явно):
- любая интеграция с витриной: `main-nav`/`mobile-nav`/`category-bento` остаются с хардкод-слагами,
  `coverImage` витрина по-прежнему не читает (динамические категории на витрине — отдельная задача);
- Products CRUD (3.3), drag-and-drop reorder (берём стрелки), bulk-операции, мягкое удаление/архив — YAGNI.

## 2. Контекст-якоря (проверено в коде на момент старта)

- **Category** (`prisma/schema.prisma:18-28`): `{ id cuid, name, slug @unique, tagline?, coverImage?,
  sortOrder @default(0), products[] }`, `@@index([sortOrder])`. `Product.categoryId` — **required**, у связи
  `Product→Category` нет `onDelete` → дефолт **RESTRICT** (удаление категории с товарами падает P2003).
- **Storefront-потребители Category** (НЕ трогаем): `app/(shop)/page.tsx:22` (bento, orderBy sortOrder),
  `lib/find-products.ts:34` (facets), `lib/get-product.ts:5` / `lib/product-summary.ts:5` (breadcrumb/label),
  `lib/catalog-filters.ts` (slug в URL). `coverImage` сейчас не читается нигде. Nav/bento хардкодят слаги
  `running/lifestyle/platform`.
- **Admin-гейт** (`lib/admin/require-admin.ts`): `requireAdminAction()` → `{ok:true,session}|{ok:false,error}`,
  `requireAdminPage()` (RSC redirect). Роль из JWT.
- **Server-actions паттерн** (`app/actions/*`): `'use server'`, zod-парсинг → `{ok:false,error}`, гейт,
  prisma-мутация с ловлей `Prisma.PrismaClientKnownRequestError` по коду, `revalidatePath`, возврат
  `{ok:true}|{ok:false,error}`.
- **Формы**: `react-hook-form@7` + `@hookform/resolvers@3` + `zod@3`; zod-DTO в `services/dto/*.dto.ts`;
  `zodResolver(schema)` инлайн в `useForm`. Пример: `components/shared/auth/login-form.tsx`.
- **Admin-примитивы** (`components/admin/ui/*`): `Button` (variant/size/loading), `Input`, `Table`/`DataTable`,
  `AlertModal {isOpen,onClose,onConfirm,loading,title?,description?}`, `Dialog`, `Select`, `Switch`, `Icon`.
- **ImageUploader 3.1** (`components/admin/media/image-uploader.tsx`): props `{value: UploadedImage[],
  onChange, folder?, max?}`; `UploadedImage {publicId,url,width,height,format,bytes,alt?}`. Удаление —
  `deleteAsset` (`lib/cloudinary/server.ts`) + delete-route, best-effort.
- **Neon WebSocket** (`lib/prisma-client.ts`): `$transaction`/`updateMany` поддержаны.
- **Нет** `slugify`-утилиты, **нет** `@dnd-kit`. Slug сейчас — строковые литералы в `prisma/seed-data.ts`.
- **Заглушка** `app/(admin)/admin/catalog/page.tsx` сейчас держит демо-аплоадер 3.1 — заменяется на список.
- **Nav** (`components/admin/admin-shell.tsx`): пункт `Catalog → /admin/catalog`, активен по
  `startsWith('/admin/catalog')` → подсветится и на `/new`, `/[id]/edit`.
- **Тесты**: vitest node-only; мок `@/auth`, `@/lib/prisma-client`, `next/cache` (`revalidatePath`) — паттерн
  в `tests/toggle-wishlist.test.ts` / `tests/submit-review.test.ts`. UI не юнит-тестим.

## 3. Изменение схемы

Добавляется одна нулабельная колонка — нет потери данных, `db push` идемпотентен:
```prisma
model Category {
  // ...существующие поля...
  coverImage         String?
  coverImagePublicId String?   // NEW (P3.2): Cloudinary public_id обложки — для чистого удаления/замены
}
```
`coverImage` хранит `secure_url`, `coverImagePublicId` — `public_id` (для `deleteAsset` при замене/удалении).

## 4. Архитектура / data flow

```
/admin/catalog              (RSC) prisma.category.findMany({ orderBy:{sortOrder:'asc'},
                                    include:{_count:{select:{products:true}}} }) → CategoryTable (client)
/admin/catalog/new          (RSC) → CategoryForm (mode=create)
/admin/catalog/[id]/edit    (RSC) prisma.category.findUnique → CategoryForm (mode=edit)

Server actions (app/actions/admin/categories.ts), все за requireAdminAction, envelope {ok,error}:
  createCategory(input)     zod → slugify(если slug пуст) → prisma.create; P2002→{ok:false,'Slug занят'}; revalidate
  updateCategory(id,input)  zod → prisma.update; если coverImagePublicId сменился — deleteAsset(старый) best-effort; revalidate
  deleteCategory(id)        _count.products>0 → {ok:false,'Нельзя удалить: N товаров'};
                            иначе deleteAsset(coverImagePublicId) best-effort → prisma.delete → revalidate
  moveCategory(id,dir)      найти соседа по sortOrder (dir='up'→max меньший, 'down'→min больший),
                            swap sortOrder в $transaction([update,update]); revalidate
```

## 5. Файлы

**Схема / lib / dto:**
- `prisma/schema.prisma` — +`coverImagePublicId String?` (modify).
- `lib/slugify.ts` — `slugify(input): string` — транслит RU→латиница (карта) + lowercase +
  `[^a-z0-9]+`→`-` + trim `-`. Чистая, тестируемая.
- `services/dto/category.dto.ts` — `categorySchema` (zod): `name` (1..100), `slug`
  (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, 1..100), `tagline?` (≤200), `coverImage?` (url),
  `coverImagePublicId?`. Экспорт `CategoryValues`.

**Server actions:**
- `app/actions/admin/categories.ts` — `createCategory`/`updateCategory`/`deleteCategory`/`moveCategory`.

**Media (расширение 3.1):**
- `app/api/admin/media/sign/route.ts` (modify) — добавить `'stride/categories'` в `ALLOWED_FOLDERS`
  (сейчас только `'stride/uploads'`; иначе обложка категории получит 400 «Недопустимая папка»). 3.1 это
  предусматривал («потребители 3.2/3.3 расширят список»). +кейс в `tests/media-sign-route.test.ts`.

**Admin UI:**
- `app/(admin)/admin/catalog/page.tsx` — список (RSC), заменяет демо 3.1 (импорт UploaderDemo убирается).
- `app/(admin)/admin/catalog/_components/category-table.tsx` (`'use client'`) — таблица (admin `Table`),
  колонки: обложка(thumb)/имя/slug/tagline/кол-во товаров/порядок(↑↓)/действия(edit-link, delete via `AlertModal`).
- `app/(admin)/admin/catalog/new/page.tsx`, `app/(admin)/admin/catalog/[id]/edit/page.tsx` — RSC-обёртки.
- `app/(admin)/admin/catalog/_components/category-form.tsx` (`'use client'`) — react-hook-form + zodResolver,
  admin `Input` (name/slug/tagline), `ImageUploader` (max=1, bridge single↔array) для обложки.
  Авто-slug: при изменении `name` заполняет `slug`, пока slug не тронут вручную (dirty-флаг).

## 6. coverImage через 3.1 (single-image мост)

`ImageUploader` работает с массивом. Форма держит `cover: UploadedImage | null`:
```
value={cover ? [cover] : []}
onChange={(imgs) => setCover(imgs[0] ?? null)}
max={1}
folder="stride/categories"
```
В сабмите: `coverImage = cover?.url ?? null`, `coverImagePublicId = cover?.publicId ?? null`.
При edit初始: если у категории есть `coverImage`+`coverImagePublicId`, восстанавливаем частичный
`UploadedImage {publicId, url, width:0,height:0,format:'',bytes:0}` (для рендера превью хватает url+publicId).

## 7. Reorder (стрелки ↑/↓)

`moveCategory(id, dir)`:
1. Прочитать целевую категорию (sortOrder = S).
2. Найти соседа: `dir='up'` → запись с наибольшим sortOrder < S; `dir='down'` → с наименьшим > S.
3. Нет соседа (край списка) → `{ok:true}` (no-op) — UI всё равно блокирует кнопку на краю.
4. `$transaction([update target→neighbor.sortOrder, update neighbor→S])`.
5. `revalidatePath('/admin/catalog')`.

UI: первая строка — `↑` disabled, последняя — `↓` disabled.

## 8. slug

`slugify('Беговые')` → `begovye`. Форма: `onChange` name → если slug не «грязный», ставит `slugify(name)`.
Пользователь может переопределить slug вручную (тогда автозаполнение отключается). Бэкенд:
если `input.slug` пуст → `slugify(input.name)`. `slug @unique` → P2002 → `{ok:false, error:'Slug занят'}`.
zod-regex — финальная страховка от мусора.

## 9. Error handling

- zod-fail в action → `{ok:false, error}` (первое сообщение `error.issues[0].message`).
- P2002 (slug duplicate) → `{ok:false, error:'Slug занят'}`.
- delete с товарами → `{ok:false, error:'Нельзя удалить: N товаров'}` (через `_count.products`).
- `requireAdminAction` гейт во всех action (аноним/customer → `{ok:false,error}`).
- `deleteAsset` (cover cleanup) — best-effort: фейл логируется, мутацию не блокирует.
- Форма показывает `error` инлайн (ru); успех → `router.push('/admin/catalog')`.

## 10. Тесты (vitest, node-only)

- `slugify.test.ts` — кириллица-транслит, пробелы/спецсимволы→`-`, коллапс повторов, trim, lowercase, пустой ввод.
- `category-dto.test.ts` — валидные/невалидные name/slug/tagline (regex, длины).
- `categories-action.test.ts` (мок `@/auth`, `@/lib/prisma-client`, `next/cache`, `@/lib/cloudinary/server`):
  - create: happy, авто-slug при пустом, P2002→'Slug занят', zod-fail, auth-gate (аноним/customer);
  - update: happy, смена cover → `deleteAsset(старый)` вызван;
  - delete: `_count.products>0` → блок; =0 → `deleteAsset(cover)` + delete; auth-gate;
  - move: swap sortOrder (up/down), край списка → no-op.
- **UI не юнит-тестим** — форма/таблица проверяются вручную (seed даёт 3 категории).

## 11. Безопасность / прочее

Все мутации за `requireAdminAction` · slug regex (zod) · `deleteAsset` best-effort · нет новых npm-зависимостей ·
schema change (`coverImagePublicId`) применяется `db push` в CI/Vercel (НЕ локально — Neon hang).

## 12. Git

Ветка `feat/phase3.2-categories` (от свежего main 75a8627, уже создана). Коммиты/PR — английский,
единственный автор, без Co-Authored-By. PR в web UI (`gh` не установлен).

## 13. Acceptance criteria

1. `Category.coverImagePublicId` добавлен в схему; остальное не тронуто.
2. `lib/slugify.ts` + `services/dto/category.dto.ts` существуют, экспортируют документированное API; тесты зелёные.
3. `app/actions/admin/categories.ts`: create/update/delete/move за гейтом, envelope `{ok,error}`, P2002/delete-guard
   обработаны; тесты зелёные.
4. `/admin/catalog` показывает список категорий (обложка/имя/slug/tagline/кол-во товаров/порядок/действия).
5. Создание/редактирование через форму (валидация, авто-slug, обложка через ImageUploader) работает.
6. Reorder ↑/↓ меняет порядок (swap sortOrder), края disabled.
7. Удаление: блок при наличии товаров; иначе удаляет + чистит обложку из Cloudinary.
8. Vitest зелёный (slugify/dto/action); typecheck 0; витрина не затронута.
9. `ALLOWED_FOLDERS` в sign-route включает `stride/categories` (обложки категорий грузятся без 400).
