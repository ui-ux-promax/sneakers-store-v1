import { test, expect, type Page } from '@playwright/test';

const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
const PASSWORD = 'Passw0rd!1';

async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

test('гость лайкает товар → виден в /wishlist; убрать → пустое состояние', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного' }).first()).toBeVisible();

  await page.goto('/wishlist');
  await expect(page.locator('article').first()).toBeVisible();

  await page.getByRole('button', { name: 'Убрать из избранного' }).first().click();
  await expect(page.getByText('В избранном пока пусто')).toBeVisible();
});

test('merge: гость лайкнул → регистрация → товар в /wishlist', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного' }).first()).toBeVisible();

  await register(page);

  await page.goto('/wishlist');
  await expect(page.locator('article').first()).toBeVisible();
});
