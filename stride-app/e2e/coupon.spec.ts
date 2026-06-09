import { test, expect, type Page } from '@playwright/test';
import { registerAndVerify } from './helpers';

async function addSeedProductToCart(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
}

test('купон STRIDE10 даёт скидку 10% и сохраняется в заказе', async ({ page }) => {
  await registerAndVerify(page);
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
  await registerAndVerify(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  await page.getByPlaceholder('Промокод').fill('EXPIRED');
  await page.getByRole('button', { name: 'Применить' }).click();

  // Целимся по тексту ошибки, а не getByRole('alert') — последний матчит ещё и
  // служебный Next.js route-announcer (<div role="alert" id="__next-route-announcer__">).
  await expect(page.getByText(/Срок действия промокода истёк/)).toBeVisible();
  await expect(page.getByText('Скидка', { exact: true })).toHaveCount(0);
});

test('несуществующий купон → ошибка', async ({ page }) => {
  await registerAndVerify(page);
  await addSeedProductToCart(page);

  await page.goto('/checkout');
  await page.getByPlaceholder('Промокод').fill('NOPE123');
  await page.getByRole('button', { name: 'Применить' }).click();

  await expect(page.getByText(/Промокод недействителен/)).toBeVisible();
});
