# STRIDE — Фаза 3.0: аудит переносимости pizza-admin → stride (research)

> Артефакт research-фазы (ретроспективный — оформлен 2026-06-12 по результатам 8-агентного
> workflow-аудита, проведённого до реализации 3.0). Источник: эталон `D:\Projects\next-pizza-reference\pizza-admin`
> (Next 15 / next-auth v4 / Int-id / @tanstack/react-table), цель — админка для stride-app.

## 1. Вопрос

Можно ли взять максимум из готовой админки pizza-admin, переписав лишь то, что требует домен/схема stride?
Оценить пофайлово (~110 файлов) по подсистемам: что переносится `reuse` / `adapt` / `rewrite` / `drop`.

## 2. Метод

8 параллельных агентов-ридеров (workflow `admin-portability-audit`), каждый — одна подсистема pizza-admin,
сверка со схемой stride (`prisma/schema.prisma`) и существующим кодом. Каждый вернул структурированный
вердикт (`overallVerdict`, пофайловые `verdict`+`reason`, `schemaGaps`, `strideAlreadyHas`, `risks`).

## 3. Ключевые дельты (pizza-admin → stride)

- **ID**: pizza `Int autoincrement` везде; stride `String cuid` везде → каждый `Number(id)`/`parseInt` парсер переписать.
- **Каталог (глубина)**: pizza `Product → ProductItem` (плоско: price/size/pizzaType). stride
  `Product → ProductColorway → (ProductImage[] + ProductVariant[])`; вариант = sizeEu Decimal(3,1), sku unique,
  price, compareAtPrice, stock, active. Плюс Product: brand, gender enum, specs Json, fitNote, isBestseller,
  денормализованные **minPrice/discountPct/salesCount** (пересчитывать при любой записи цены/варианта).
- **Заказы**: pizza Order.items = JSON-блоб + fulfillmentStatus + OrderEvent[] + Refund[] + adminNote.
  stride — реляционные OrderItem[], Payment (YooKassa), OrderStatus = PENDING/PROCESSING/SHIPPED/DELIVERED/
  CANCELLED, orderNumber Int. НЕТ OrderEvent/Refund/fulfillmentStatus/adminNote.
- **Маркетинг**: pizza Promo + PromoRedemption + Story. stride — только Coupon (code/percent/active/expiresAt).
  Story-модели нет.
- **RBAC**: pizza ADMIN/OWNER/OPERATOR/MARKETER/USER + матрица прав. stride — только CUSTOMER/ADMIN.
- **Auth**: pizza next-auth v4 (constants/auth-options). stride Auth.js v5 (auth.ts/auth.config.ts), роль уже в сессии.
- **Картинки**: stride — пайплайна загрузки нет (cloudinary не подключён). pizza — cloudinary-upload + image-upload.
- **Дизайн**: stride admin = dark/light "Command Center" из прототипов (lime, Anybody/Manrope, Material Symbols,
  rounded-xl). pizza — generic shadcn light/dark.

## 4. Итоговая матрица (по подсистемам)

| Подсистема | Вердикт | Суть |
|---|---|---|
| Auth / RBAC | ~90% уже есть | Не портим. Нужен `requireAdmin()` + `/admin` в `authorized()` + matcher. Вся v4-auth/permissions — drop. |
| Инфра-libs | берём 3 | `pagination`, `api-error` (в stride-конверт), `cloudinary-upload` (client-guards). `logger/rate-limit/request-context/utils/revalidate-storefront/admin-data-cache` — drop (stride сильнее). |
| Shell + UI | mostly-rewrite | Паттерн sidebar/data-table берём, визуал — заново под прототип. +deps `@tanstack/react-table`, 3 radix. |
| Categories / reorder | heavy-adapt | `sort-order-service` ценен (написан под Neon-без-транзакций). Шаблон `page→client→columns→cell-action→form`, Int→cuid, +slug/tagline/coverImage. |
| Products | rewrite ядра | Форма+сервис net-new (дерево Colorway/Image/Variant, Decimal sizeEu, unique sku, пересчёт денорм через `lib/product-aggregates`). |
| Orders | тиерами | Список/деталь/статус-селект переносятся; смена статуса ОБЯЗАНА идти через `lib/payment-sync` (сток+salesCount). fulfillment — drop. timeline/refunds — новые модели (отложены). |
| Customers / Users | heavy-adapt | Сервисы адаптируются (Int→cuid, fullName→name, verified→emailVerified). 2 роли → Users схлопывается в Customers. blacklisted/adminNote отсутствуют. |
| Dashboard | rewrite презентации | Движок `admin-analytics` портируем под OrderItem (Units Sold + Best Sellers бонусом); чарты заново; Conv.Rate нечем питать. |
| Marketing | thin/drop | Тонкий percent-only Coupon CRUD поверх `lib/coupon.ts`. Промо-движок пиццы и Stories — не портим. |

## 5. Главный вывод

**Брать архитектуру и «проводку», а не код.** Pizza-admin — отдельное приложение на устаревшем относительно
stride стеке; пофайловое копирование наполовину не скомпилируется, наполовину продублирует то, что в stride
уже лучше. Стратегия: админка ВНУТРИ stride (`app/(admin)/admin/*`), переиспользуем инфра-слой stride +
перенимаем проверенные паттерны pizza + ~5 доменно-нейтральных файлов.

## 6. Решения, зафиксированные с заказчиком (2026-06-12)

1. Тема — **светлая + тёмная** с тогглом (истина = `prototypes-admin/admin-main{,-dark}.html`; `DESIGN.md` frontmatter устарел).
2. Картинки — **Cloudinary** (next.config уже whitelist'ит `res.cloudinary.com`).
3. Заказы — **MVP** (список+деталь+смена статуса через payment-sync, без новых моделей).
4. Купоны — **тонкий percent-only CRUD** поверх `lib/coupon.ts`.

## 7. Точка продолжения

→ spec `docs/superpowers/specs/2026-06-12-stride-phase3.0-admin-foundation-design.md`
→ plan `docs/superpowers/plans/2026-06-12-stride-phase3.0-admin-foundation.md`
Роадмап фаз: 3.0 foundation → 3.1 Cloudinary → 3.2 Categories → 3.3 Products → 3.4 Orders → 3.5 Customers
→ 3.6 Dashboard → 3.7 Coupons.
