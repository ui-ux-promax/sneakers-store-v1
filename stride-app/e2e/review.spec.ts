import { test, expect, type Page } from '@playwright/test';

// Хелперы зеркалят checkout.spec.ts. Заказ делает товар «купленным» → открывает право на отзыв.
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

async function buyVelocityTrail(page: Page) {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
  await page.goto('/checkout');
  await page.getByLabel('Телефон').fill('+79990000000');
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тверская 1');
  await page.getByRole('radio', { name: /При получении/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ →' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);
}

test('купивший оставляет отзыв → виден; форма исчезает после отправки', async ({ page }) => {
  await registerAndLogin(page);
  await buyVelocityTrail(page);

  await page.goto('/product/stride-velocity-trail');
  // Звёздный radiogroup «Оценка» + текст.
  await page.getByRole('radio', { name: '5 из 5' }).click();
  await page.getByPlaceholder(/Поделитесь впечатлением/).fill('Супер кроссовки e2e');
  await page.getByRole('button', { name: 'Оставить отзыв' }).click();

  await expect(page.getByText('Супер кроссовки e2e')).toBeVisible();

  // Повтор недоступен: после отправки пользователь уже оставил отзыв → формы нет.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0);
});

test('гость на PDP → формы нет, видит «Войдите»', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByText(/Войдите/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0);
});
