import { test, expect, type Page } from '@playwright/test';

// Купоны заводит seed (STRIDE10=10%, EXPIRED=истёкший). Зеркалит хелперы checkout.spec.ts.
const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

async function registerAndLogin(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

async function addSeedProductToCart(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

test('купон STRIDE10 даёт скидку 10% и сохраняется в заказе', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тверская 1');

  // Применить промокод → preview-скидка.
  await page.getByPlaceholder('Промокод').fill('STRIDE10');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Промокод STRIDE10 (10%)')).toBeVisible();
  await expect(page.getByText('Скидка', { exact: true })).toBeVisible();

  // Оформить COD-заказ (online ушёл бы в YooKassa, которого нет в CI).
  await page.getByRole('radio', { name: /При получении/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();

  // На странице заказа скидка с кодом сохранена.
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await expect(page.getByText(/Скидка \(STRIDE10\)/)).toBeVisible();
});

test('истёкший купон EXPIRED → ошибка, без скидки', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  await page.getByPlaceholder('Промокод').fill('EXPIRED');
  await page.getByRole('button', { name: 'Применить' }).click();

  await expect(page.getByRole('alert')).toContainText(/истёк/);
  await expect(page.getByText('Скидка', { exact: true })).toHaveCount(0);
});

test('несуществующий купон → ошибка', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  await page.getByPlaceholder('Промокод').fill('NOPE123');
  await page.getByRole('button', { name: 'Применить' }).click();

  await expect(page.getByRole('alert')).toContainText(/недействителен/);
});
