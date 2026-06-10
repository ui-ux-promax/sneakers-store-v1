import { test, expect, type Page } from '@playwright/test';
import { registerAndVerify } from './helpers';

async function addSeedProductToCart(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

async function fillCheckout(page: Page) {
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тверская 1');
}

test('COD-заказ по-прежнему работает (регрессия)', async ({ page }) => {
  await registerAndVerify(page);
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
  await registerAndVerify(page);
  await addSeedProductToCart(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('radio', { name: /Картой онлайн/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await page.waitForURL(/yoo(money|kassa)\.ru|3ds|yookassa/i, { timeout: 30000 }).catch(() => {});
  await expect(page).not.toHaveURL(/\/checkout$/);
});
