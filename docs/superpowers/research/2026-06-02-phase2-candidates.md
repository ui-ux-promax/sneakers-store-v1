# STRIDE — Фаза 2: карта кандидатов (исследование перед брейнстормингом)

> Артефакт understand-фазы (fan-out по спеке Фазы 1, docs, прототипам, заглушкам в коде, схеме Prisma).
> Дата: 2026-06-02. Источник: workflow `phase2-context-understand` (7 агентов).
> **СТАТУС: пауза в брейнсторминге.** Мы на шаге «выбор границы Фазы 2» (см. конец файла).

## Что уже готово (Фаза 1 — НЕ дублировать)

Лендинг, каталог (фасеты/сортировка/пагинация/empty/skeleton), PDP (галерея, расцветки `?color=`, размеры, add-to-cart, specs, related, 404), корзина (client + Zustand), Cart REST (`GET/POST /api/cart`, `PATCH/DELETE /api/cart/[id]`, дедуп, проверка стока/active, cookie `cartToken`), SEO (sitemap/robots), движок фильтров/бейджей, prisma-client (Neon HTTP + retry), логгер+PII-scrub, UI-kit, конфиг-константы, тесты (Vitest + Playwright e2e/a11y, CI на Ubuntu).

Доменная модель: `Category, Product, ProductColorway, ProductImage, ProductVariant, Cart (token, userId? — зарезервирован, не используется), CartItem`, enum `Gender`.

## Кандидаты Фазы 2 (сгруппированы, с доказательствами)

### P2.0 — Фундамент: Auth + Account
- **User / Auth** (phone-OTP + email/пароль + Google) — `effort: L`. Якорь схемы: `Cart.userId` зарезервирован, но нет модели `User`. Прототип `auth.html` (4 под-состояния). Спека §2/§3. Зависимостей нет.
- **Слияние гостевой корзины при логине** — `S`. `Cart.userId` — крючок, логика не реализована. Зависит от Auth.
- **Профиль «Личные данные»** (имя/телефон/email/дата рождения + настройки) — `S`. `profile.html` вкладка. Зависит от Auth.
- **Legal-страницы** (Privacy, Terms, Delivery, Refund) — `S`. 4 прототипа `legal-*.html`; футер-ссылки сейчас `href="#"`. Backend не нужен. Предпосылка для согласия на PII перед checkout.

### P2.1 — Ядро конверсии: Checkout + Orders + Payments
- **Address** (shipping/billing) — `S`. Нет модели. `checkout.html`. Зависит от Auth.
- **Order + OrderItem** (+ enum OrderStatus, снапшот `unitPrice`/SKU/name) — `L`. Цена варианта может меняться → снапшот обязателен. Деньги Int. Зависит от Auth + Address.
- **Резерв стока** (условный update, БЕЗ транзакций — ограничение Neon HTTP) — `M`. Сейчас `stock Int` один счётчик, проверка только при add-to-cart, не списывается → возможен oversell. Вопрос дизайна: `reserved` колонка vs таблица `InventoryReservation` + `expiresAt`. Спека §10.
- **Payment + ЮKassa** (₽→копейки) — `L`. Нет модели `Payment`. Спека §3/§6/§14. Зависит от Order.
- **Checkout UI + `/checkout` + order API** — `XL`. Литеральный «шов»: задизейбленная кнопка «Оформить заказ» (`order-summary.tsx:40`, title='…Фазе 2'). `checkout.html` (контакты/адрес/доставка/оплата/итог). Зависит от Order+Auth+Address+резерв.
- **Промокоды / Coupon** — `M`. UI-заглушка промо-инпута в order-summary. Нет движка/модели. Зависит от Order.
- **Профиль «Мои заказы»** (история + статусы + трекинг «Где мой заказ?») — `M`. `profile.html`; `promo-top-bar.tsx:5` ссылка `href="#"`. Зависит от Auth + Order.

### P2.2 — Discovery (auth-gated, не на критическом пути)
- **Reviews + рейтинги** (`Review`, verified-purchase) — `M`. Зависит от Auth + Order. Нет модели/прототипа (слот на PDP).
- **Wishlist / избранное (♡)** — `M`. Зависит от Auth. **Прототипа НЕТ** → нужен дизайн UI.
- **Бэкенд рассылки** — `S`. Две UI-only формы (футер + drop-promo) только флипают локальный стейт. Нужен endpoint/ESP.
- **Back-in-stock уведомления** — `M`. Зависит от Auth + рассылки.
- **DB-уровень сортировки/пагинации + реальная «популярность» из продаж** — `M`. Сейчас сортировка/пагинация в памяти (ок для демо); «популярное» — прокси по sortOrder. Зависит от Order.

### P2.3 — Инфра-хардening (параллельно, без зависимостей по схеме)
- **Реальный rate-limit** (Upstash sliding-window) — `S`. `checkCartRateLimit` — NOOP fail-open И НЕ подключён ни к одному роуту. Каркас (extractClientIp/isRateLimitConfigured) есть.
- **Sentry** — `S`. Нет зависимости/init; только console.error. Логгер сознательно лишён Sentry с путём возврата.
- **Cloudinary** — `S`. `remotePatterns` уже whitelist'ит res.cloudinary.com, но инертно (все картинки локальные `/public`).
- **PDP polish**: lightbox/zoom + интерактивная таблица размеров (есть `SIZE_CONVERSION`) — `S`.
- **/search** (пограничный) — `S`. `HeaderSearch` уже редиректит в `/catalog?q=`; отдельная страница может быть избыточна. Прототипа нет.

### Phase 3 (НЕ Фаза 2)
- **stride-admin** (дашборд + CRUD товаров/заказов) — `XL`. Спека прямо сводит его в отдельную фазу ПОСЛЕ checkout. Прототипы `admin-*.html` (+ конфликт дизайн-токенов: prototypes-admin/DESIGN.md Archivo Narrow/dark/0px vs спека Anybody/Manrope — разрешить до сборки).
- **Drop как сущность** (countdown + резерв размера) — вне MVP; «Лимитка» остаётся бейджем.

## Рекомендованная группировка (dependency-aware)
1. **P2.0 Foundation** (Auth + cart-merge + профиль-личные + legal) — фундамент, всё FK на `User.id`.
2. **P2.1 Checkout+Orders+Payments** — ядро конверсии. Порядок: Address+Order → резерв → Payment/ЮKassa → checkout UI → промо → история заказов.
3. **P2.2 Discovery** — reviews/wishlist/newsletter/back-in-stock/DB-sort.
4. **P2.3 Infra** — rate-limit/Sentry/Cloudinary/PDP polish/search (rate-limit+Sentry лучше вместе с P2.1).
- Admin → **Phase 3**.

## Открытые вопросы (решить при возврате)
1. **Граница Фазы 2**: auth+checkout+payments+orders = одна Фаза 2, или auth — отдельный под-проект? (рекомендация: декомпозировать, начать с Auth-фундамента).
2. **Auth-стратегия**: NextAuth/Auth.js vs custom credentials? (влияет на таблицы Account/Session/VerificationToken). Провайдер OTP/SMS? Настройка Google OAuth.
3. **Admin в Фазе 2 или Phase 3?** (рекомендация: Phase 3).
4. **Резерв стока**: `reserved Int` на ProductVariant (available=stock-reserved) vs таблица `InventoryReservation` + sweep? Без `$transaction` (Neon HTTP) → условные update + компенсация.
5. **Доставка/налоги**: нужны `shippingAmount`/`taxAmount` и калькулятор, или доставка флэт/бесплатно в Фазе 2?
6. **Деньги/валюта**: ₽-only Int (копейки на границе ЮKassa) достаточно, или мультивалюта?
7. **Гейтинг отзывов**: требовать завершённый Order (verifiedPurchase) или любой авторизованный?
8. **Промо-скоуп**: только cart-level коды, или лимиты на пользователя (CouponRedemption) + стэкинг?
9. **Wishlist UI**: прототипа нет — новая вкладка профиля, отдельная `/wishlist`, или обе?
10. **/search**: нужен или достаточно `/catalog?q=`?
11. **E2E/CI с ЮKassa sandbox** в CI (тот же Ubuntu-паттерн с прогревом Neon).

## Точка продолжения
Брейнсторминг Фазы 2, чеклист superpowers:brainstorming. Сделано: «исследовать контекст» ✅. **Следующий шаг — ответ пользователя на вопрос о границе Фазы 2** (варианты: Auth-фундамент первым (рекомендация) / сразу всё ядро Auth+Checkout+Orders+Payments / сначала инфра). После выбора — clarifying-вопросы по одному (auth-стратегия и т.д.), затем 2-3 подхода, дизайн по секциям, spec в `docs/superpowers/specs/`, ревью, writing-plans.
