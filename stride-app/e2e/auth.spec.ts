import { test, expect, type Page } from '@playwright/test';

// Уникальный email на каждый прогон — регистрация пишет реального пользователя в БД.
const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

// Полная форма регистрации: имя, email, пароль + подтверждение + согласие (registerFormSchema).
async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
}

// После успешного входа/регистрации в хедере появляется кнопка выхода (server-side AuthNav).
const expectSignedIn = (page: Page) =>
  expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();

// ВРЕМЕННАЯ ДИАГНОСТИКА (убрать после фикса CI): при падении печатает реальное
// состояние страницы в stdout CI — что на /profile (форма логина / профиль / ошибка).
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const url = page.url();
  const loginBtn = await page.getByRole('button', { name: 'Войти', exact: true }).count().catch(() => -1);
  const profileH = await page.getByRole('heading', { name: 'Профиль' }).count().catch(() => -1);
  const logoutBtn = await page.getByRole('button', { name: 'Выйти' }).count().catch(() => -1);
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300)).catch(() => '<no body>');
  // eslint-disable-next-line no-console
  console.log(`\n[DIAG "${testInfo.title}"] status=${testInfo.status} url=${url}\n[DIAG] loginBtn=${loginBtn} profileHeading=${profileH} logoutBtn=${logoutBtn}\n[DIAG] body="${(bodyText ?? '').replace(/\s+/g, ' ')}"`);
});

test('регистрация → автологин → профиль с данными; после выхода /profile под защитой', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expectSignedIn(page); // форма редиректит на '/', сессия активна

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(email); // email — value disabled-инпута

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.waitForURL('**/'); // signOut redirectTo: '/'
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/); // middleware защищает /profile
});

test('защита /profile без входа → редирект на /login', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('вход существующего пользователя по email/паролю', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expectSignedIn(page);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.waitForURL('**/');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expectSignedIn(page);

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
});

test('слияние гостевой корзины: гость добавил товар → зарегистрировался → товар в корзине', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();

  await register(page, uniqueEmail());
  await expectSignedIn(page);

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  // Корзина не пустая → есть степпер количества; гостевая корзина пережила вход.
  await expect(page.getByText('Корзина пустая')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Увеличить количество' })).toBeVisible();
});
