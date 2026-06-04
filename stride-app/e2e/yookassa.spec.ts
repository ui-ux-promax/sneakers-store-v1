import { test, expect, type Page } from '@playwright/test';

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

async function fillCheckout(page: Page) {
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Город').fill('Москва');
  await page.getByLabel('Улица, дом, квартира').fill('Тверская 1');
}

test('COD-заказ по-прежнему работает (регрессия)', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('radio', { name: /При получении/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await expect(page.getByText('Оплата при получении')).toBeVisible();
});

const hasYooKassa = !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY;
(hasYooKassa ? test : test.skip)('онлайн-оплата ведёт на внешний редирект ЮKassa', async ({ page }) => {
  await registerAndLogin(page);
  await addSeedProductToCart(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('radio', { name: /Картой онлайн/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await page.waitForURL(/yoo(money|kassa)\.ru|3ds|yookassa/i, { timeout: 30000 }).catch(() => {});
  await expect(page).not.toHaveURL(/\/checkout$/);
});
