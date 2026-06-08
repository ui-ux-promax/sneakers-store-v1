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

// Лайкнуть первый товар и ДОЖДАТЬСЯ серверного подтверждения (POST server-action),
// прежде чем уходить со страницы. Оптимистичный ♡ флипается мгновенно — нельзя
// навигировать сразу, иначе навигация прервёт in-flight экшен (cookie/запись не успеют).
async function likeFirstProduct(page: Page) {
  const actionDone = page.waitForResponse(
    (r) => r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await actionDone;
  await expect(page.getByRole('button', { name: 'Убрать из избранного' }).first()).toBeVisible();
}

test('гость лайкает товар → виден в /wishlist; убрать → пустое состояние', async ({ page }) => {
  await page.goto('/catalog');
  await likeFirstProduct(page);

  await page.goto('/wishlist');
  await expect(page.locator('article').first()).toBeVisible();

  // Убрать с /wishlist — тоже дождаться серверного подтверждения перед проверкой пустого состояния.
  const removeDone = page.waitForResponse(
    (r) => r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Убрать из избранного' }).first().click();
  await removeDone;
  await expect(page.getByText('В избранном пока пусто')).toBeVisible();
});

test('merge: гость лайкнул → регистрация → товар в /wishlist', async ({ page }) => {
  await page.goto('/catalog');
  await likeFirstProduct(page);

  await register(page);

  await page.goto('/wishlist');
  await expect(page.locator('article').first()).toBeVisible();
});
