# STRIDE Admin — Дизайн-система (референс)

> Живой референс админки. Зафиксирован на эталоне страницы **`/admin/catalog/products`** (Phase 3.3).
> **Любая новая admin-страница/раздел должна использовать ТОЛЬКО эти токены, компоненты и паттерны** —
> чтобы кнопки/селекты/цвета/таблицы были идентичны. Новые элементы добавляются по тем же правилам
> (admin-токены, портал в `.admin-root`, без `dark:`). Эталон-прототипы: `ui-designe and prototypes/prototypes-admin/admin-*.html`.

---

## 0. Главные правила (нарушение = визуальный баг)

1. **Админка на Tailwind**, как и витрина. «Сырой CSS» — только токены (`--admin-*`) и 3 исключения
   (scroll-lock `:has`, перебивка `* {border-color}`, Material Symbols `font-variation-settings`).
2. **Никаких `dark:` вариантов.** Тема light/dark свопается значениями CSS-переменных на `.admin-root.dark`.
   Один и тот же класс `bg-admin-surface` сам становится светлым/тёмным. Всегда пиши `bg-admin-*` / `text-admin-*`.
3. **Любой Radix-поповер, который порталится (Select, DropdownMenu, Dialog, будущие Popover/Tooltip/HoverCard),
   ОБЯЗАН порталиться в `.admin-root`.** Иначе он рендерится в `document.body`, где `var(--admin-*)` не
   определены → прозрачный/бесцветный. Паттерн ниже (§4).
4. **Не использовать storefront-глобалы** (`.btn`, `.inp`, storefront-цвета). Только `components/admin/ui/*`.
5. **Скроллит только `<main>`.** `html`+`body` залочены (`:has(.admin-root)` в globals.css + `<ScrollLock/>`).
   Новые страницы просто рендерятся внутри `main`; высокий контент скроллится в `main`. Не делать скролл на body.
6. **Тексты — на русском. Деньги — ₽ через `formatPrice` (`@/lib/format`). Относительное время — `formatAddedAgo`
   (`@/lib/relative-time`).** Деньги хранятся как `Int` (рубли).
7. **Гейт прав:** server actions → `requireAdminAction()`; RSC-страницы → через `(admin)/layout.tsx`
   (`requireAdminPage`); route-handlers → `requireAdminApi()`. Все из `@/lib/admin/require-admin`.

---

## 1. Токены (`app/globals.css`, scoped под `.admin-root`)

Маппинг в Tailwind: `tailwind.config.ts` → `colors.admin.* = var(--admin-*)`. Класс `bg-admin-surface` ⇒ `background: var(--admin-surface)`.

| Tailwind-класс | переменная | light | dark |
|---|---|---|---|
| `admin-bg` | `--admin-bg` | `#f7f8f4` | `#131313` |
| `admin-surface` | `--admin-surface` | `#ffffff` | `#131313` |
| `admin-surface-low` | `--admin-surface-low` | `#f8f9fb` | `#1c1b1b` |
| `admin-surface-container` | `--admin-surface-container` | `#f3f4f6` | `#201f1f` |
| `admin-surface-high` | `--admin-surface-high` | `#e5e7eb` | `#2a2a2a` |
| `admin-on-bg` / `admin-on-surface` | … | `#111827` | `#e5e2e1` |
| `admin-on-surface-variant` | `--admin-on-surface-variant` | `#6b7280` | `#c2caad` |
| `admin-primary` (акцент-лайм) | `--admin-primary` | `#b2f700` | `#b2f700` |
| `admin-on-primary` (текст на лайме) | `--admin-on-primary` | `#131f00` | `#243600` |
| `admin-secondary-container` (фиолет) | … | `#f3e8ff` | `#563f71` |
| `admin-on-secondary-container` | … | `#3b0764` | `#c9ade7` |
| `admin-error` / `admin-on-error` | … | `#ef4444` / `#fff` | `#ffb4ab` / `#690005` |
| `admin-outline` | `--admin-outline` | `#d1d5db` | `#8c9479` |
| `admin-outline-variant` (бордеры) | `--admin-outline-variant` | `#e5e7eb` | `#424a33` |

**Семантика:** `bg` = фон страницы (`main`); `surface` = карточки/таблицы/инпуты; `surface-high` = шапка таблицы,
пилюли-теги, плейсхолдеры, hover-строки; `primary` = лайм-акцент (primary-кнопка, активный таб/пагинация,
статус «активен»); `secondary-container` = фиолетовый инфо/«скидка»; `error` = опасные действия/«нет в наличии».

**Шрифты:** `font-admin-head` (Anybody — заголовки), `font-admin-body` (Manrope — основной). Иконки — Material Symbols
через `<Icon>` (см. §4). Радиусы по конвенции: карточки/инпуты `rounded-xl`, пилюли/primary-кнопка/селект-фильтры
`rounded-full`, прочие кнопки/мелочь `rounded-lg`.

---

## 2. Оболочка и скелет страницы

- Route-group `app/(admin)/admin/*`. Обёртка `(admin)/layout.tsx`: `requireAdminPage()`, чтение cookie темы,
  `<div class="admin-root [dark] font-admin-body h-screen overflow-hidden">`, `<ScrollLock/>`, `<AdminShell>`.
- `AdminShell` (`components/admin/admin-shell.tsx`): фикс-сайдбар 280px (5 разделов) + фикс-топбар 64px (поиск-заглушка),
  и **`<main class="md:ml-[280px] pt-16 h-screen overflow-y-auto overscroll-contain bg-admin-bg [scrollbar-gutter:stable]">`**
  — единственный скроллер. Контент в `<div class="max-w-[1440px] mx-auto p-8">`.

**Скелет любой страницы** (как `products/page.tsx`):
```tsx
export const dynamic = 'force-dynamic';
export default async function Page() {
  // ... requireAdminPage обеспечен layout'ом; данные через prisma
  return (
    <div className="space-y-8">
      {/* Шапка: заголовок (+счётчик) + подзаголовок + действия справа */}
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Раздел (N)</h2>
          <p className="text-admin-on-surface-variant">Короткое описание раздела.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* опц. toggle */}<Button asChild><Link href="…/new"><Icon name="add" className="text-[18px]"/> Добавить</Link></Button>
        </div>
      </div>
      {/* фильтры → карточка с таблицей → bento-метрики */}
    </div>
  );
}
```
Для секционных заголовков (не главный) — компонент `<Heading title description? />` (`font-admin-head text-2xl`).

---

## 3. Каталог компонентов (`components/admin/**`) — только эти

### Button — `@/components/admin/ui/button`
Варианты: `primary` (лайм, **rounded-full**) · `secondary` (surface+border, rounded-lg) · `ghost` (rounded-lg) ·
`outline` (rounded-lg) · `danger` (error, rounded-lg). Размеры `sm|md|lg`. Пропы: `loading` (спиннер), `asChild` (обёртка `<Link>`).
```tsx
<Button>Сохранить</Button>                         {/* primary лайм-пилюля */}
<Button variant="ghost" onClick={onCancel}>Отмена</Button>
<Button variant="danger" loading={busy} onClick={del}>Удалить</Button>
<Button asChild><Link href="…/new"><Icon name="add" className="text-[18px]"/> Добавить</Link></Button>
```

### Input — `@/components/admin/ui/input`
`h-10 rounded-xl bg-admin-surface border-admin-outline-variant`, фокус-ринг `admin-primary`. forwardRef → работает с `register()`.

### Select (Radix) — `@/components/admin/ui/select`
`Select / SelectTrigger / SelectValue / SelectContent / SelectItem`. **Контент уже порталится в `.admin-root`** (фикс внутри).
Триггер-пилюля для фильтров: `className="rounded-full h-auto px-5 py-2.5"`.
```tsx
<Select value={v ?? '__all__'} onValueChange={set}>
  <SelectTrigger className="rounded-full h-auto px-5 py-2.5"><SelectValue placeholder="…"/></SelectTrigger>
  <SelectContent><SelectItem value="__all__">Все</SelectItem>{opts.map(…)}</SelectContent>
</Select>
```

### Switch (Radix) — `@/components/admin/ui/switch`
Контролируемый: `checked` + `onCheckedChange`. checked = лайм.

### DropdownMenu (Radix) — `@/components/admin/ui/dropdown-menu`
Kebab-действия в таблицах. **Контент порталится в `.admin-root`** (фикс внутри). `DropdownMenu/Trigger(asChild)/Content(align="end")/Item/Separator`.

### Dialog + AlertModal — `@/components/admin/ui/{dialog,alert-modal}`
**Порталятся в `.admin-root`** (фикс внутри). `AlertModal` — подтверждение деструктива (Отмена/Удалить), пропы
`isOpen/onClose/onConfirm/loading/title?/description?`. `Dialog` — инфо/блок-сообщение (напр. «нельзя удалить»).

### Icon — `@/components/admin/icon`
`<Icon name="more_vert" filled? className?/>` — Material Symbols. Размер через `className="text-[18px]"`.

### ImageUploader — `@/components/admin/media/image-uploader`
Мульти-загрузка в Cloudinary + ↑↓ reorder + alt + best-effort delete. `value: UploadedImage[]`, `onChange`, `folder`, `max`.
Новые папки добавлять в `ALLOWED_FOLDERS` (`app/api/admin/media/sign/route.ts`).

### Table — `@/components/admin/ui/table`
Примитивы `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` для простых таблиц (как категории).
Для пиксель-точного совпадения с прототипом продукты используют **сырую `<table>`** (см. §5 «Таблица»).

### Heading — `@/components/admin/heading`
`title` + опц. `description`. `font-admin-head text-2xl`.

---

## 4. Обязательный паттерн портала Radix → `.admin-root`

Любой новый floating-Radix-компонент копирует это (см. `dialog.tsx`/`select.tsx`/`dropdown-menu.tsx`):
```tsx
const [container, setContainer] = React.useState<HTMLElement | null>(null);
React.useEffect(() => { setContainer(document.querySelector<HTMLElement>('.admin-root')); }, []);
return (
  <SomePrimitive.Portal container={container ?? undefined}>
    <SomePrimitive.Content className="… bg-admin-surface border-admin-outline-variant …" />
  </SomePrimitive.Portal>
);
```

---

## 5. Паттерны разметки (копировать с `products`)

**Карточка-контейнер:** `bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden`.

**Фильтр-бар:** `grid grid-cols-1 md:grid-cols-5 gap-4` — поиск-пилюля (Input `rounded-full pl-10` + лидирующий `<Icon name="search"/>`) + Radix-селекты-пилюли.

**Таблица (сырая, как в прототипе):**
```tsx
<div className="overflow-x-auto">
  <table className="w-full text-left">
    <thead className="bg-admin-surface-high">
      <tr><th className="px-6 py-4 text-[12px] font-semibold uppercase tracking-widest text-admin-on-surface-variant">…</th></tr>
    </thead>
    <tbody className="divide-y divide-admin-outline-variant">
      <tr className="group hover:bg-admin-surface-high transition-colors">
        <td className="px-6 py-4">…</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Пагинация (в подвале карточки):** `px-6 py-4 border-t border-admin-outline-variant flex items-center justify-between`;
слева `Показано X–Y из N` (`text-xs text-admin-on-surface-variant`); справа кнопки страниц (`w-8 h-8 rounded-lg`,
активная `bg-admin-primary text-admin-on-primary`, прочие `hover:bg-admin-surface-high`) + chevron-кнопки.

**Статус-пилюля:** `px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit` + `<Icon className="text-[14px]"/>`.
- успех/активно → `bg-admin-primary text-admin-on-primary` (`check_circle` filled);
- инфо/скидка → `bg-admin-secondary-container text-admin-on-secondary-container` (`sell`);
- черновик/архив → `bg-admin-surface-high text-admin-on-surface-variant border border-admin-outline-variant` (`archive`).

**Тег-пилюля (категория):** `px-3 py-1 bg-admin-surface-high rounded-full text-xs font-bold text-admin-on-surface`.

**Статус-дот:** `w-1.5 h-1.5 rounded-full` + цвет (`bg-admin-primary` ок / `bg-admin-on-secondary-container` внимание / `bg-admin-error` нет).

**Thumbnail-бокс:** `w-12 h-12 rounded-lg bg-admin-surface-high border border-admin-outline-variant p-1 flex items-center justify-center overflow-hidden`; `<img class="object-contain w-full h-full group-hover:scale-110 transition-transform"/>`.

**Bento-метрика:** `bg-admin-surface p-6 rounded-xl border border-admin-outline-variant hover:border-admin-primary transition-colors group`;
icon-чип `w-10 h-10 rounded-lg bg-admin-surface-high flex items-center justify-center group-hover:bg-admin-primary`;
лейбл `text-xs uppercase tracking-wider text-admin-on-surface-variant`; значение `font-admin-head text-2xl font-bold`.

**Таб-нав раздела:** `flex gap-1 border-b border-admin-outline-variant`; активная вкладка `border-b-2 border-admin-primary text-admin-on-surface`, прочие `border-transparent text-admin-on-surface-variant`. См. `catalog/_components/catalog-tabs.tsx`.

**Pill-toggle (вид/режим):** `flex bg-admin-surface rounded-full p-1 border`; активная кнопка `bg-admin-primary text-admin-on-primary rounded-full`. См. `products/_components/view-toggle.tsx`.

---

## 6. Паттерн формы (как `product-form` / категории)

- `react-hook-form` + `zodResolver(schema)`; DTO в `services/dto/*.dto.ts`.
- Server actions в `app/actions/admin/*.ts`: `requireAdminAction()` → конверт `{ ok: true; … } | { ok: false; error }`,
  обработка Prisma `P2002` (уникальность) понятным сообщением, `revalidatePath`.
- Поле = label + контрол + ошибка `<p className="text-sm text-admin-error">`. Булевы → `Switch`; enum/FK → `Select`; медиа → `ImageUploader`.
- Низ формы: `<Button>Сохранить/Создать</Button>` + `<Button variant="ghost">Отмена</Button>`.
- На успехе — `router.push(списочный путь)`; конверт ошибки → показать `serverError`.

---

## 7. Добавление НОВОГО элемента

1. Сначала ищи готовое в `components/admin/ui/*` / паттерны §5. Переиспользуй.
2. Если нужен новый примитив: строй на `admin-*` токенах, без `dark:`, радиусы по конвенции (§1),
   floating → портал в `.admin-root` (§4). Деструктив → `danger`/`AlertModal`. Тексты RU, деньги ₽.
3. Специфичные раздела элементы (графики дашборда, таймлайны заказов и т.п.) делай в том же визуальном языке
   (карточки `rounded-xl`, пилюли, лайм-акцент, `surface-high` для подложек). Recharts/SVG — в admin-палитре.

**Эталон для копипасты:** `app/(admin)/admin/catalog/products/{page.tsx,_components/*}`.
