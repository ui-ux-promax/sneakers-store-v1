import { test, expect, type Page } from '@playwright/test';

// Уникальный email на каждый прогон — placeOrder пишет реальный Order в БД под этим пользователем.
const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

// Регистрация = автологин (контракт #8): помощник зеркалит e2e/auth.spec.ts.
// Чекбокс согласия не связан с label через htmlFor → берём по role (как в auth.spec.ts).
async function registerAndLogin(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  // После регистрации форма редиректит на '/', сессия активна → в хедере кнопка «Выйти».
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

// Добавление сид-товара в корзину (как cart.spec.ts/product.spec.ts): известный продукт + размер 42.
async function addSeedProductToCart(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  // дождаться завершения POST /api/cart (cookie cartToken) ДО навигации на /checkout
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

test('гость → /checkout редиректит на /login', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login/);
});

test('сквозной COD-заказ: cart → checkout → order → история', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  // Телефон обязателен (checkoutSchema min 5) и НЕ префиллится у юзера без телефона — заполняем явно.
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();

  // Успешное оформление → редирект на страницу заказа.
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await expect(page.getByRole('heading', { name: /Заказ #\d+/ })).toBeVisible();
  await expect(page.getByText('Оформлен')).toBeVisible();

  // Заказ виден в истории профиля.
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Мои заказы' }).click();
  await expect(page.getByText(/Заказ #\d+/).first()).toBeVisible();
});

test('отмена PENDING-заказа переводит его в статус Отменён', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  // Телефон обязателен (checkoutSchema min 5) и НЕ префиллится у юзера без телефона — заполняем явно.
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);

  // CancelOrderButton подтверждает действие через window.confirm — принимаем диалог.
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Отменить заказ' }).click();
  await expect(page.getByText('Отменён')).toBeVisible();
});
