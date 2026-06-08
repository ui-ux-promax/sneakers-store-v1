import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const path of ['/', '/catalog', '/product/stride-velocity-trail', '/cart', '/wishlist', '/login', '/register', '/legal/privacy']) {
  test(`a11y: нет серьёзных нарушений на ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
}

// /checkout под защитой + требует непустую корзину: регистрируемся и кладём сид-товар,
// иначе страница редиректит на /login (гость) или /cart (пустая корзина). Помощники зеркалят
// e2e/auth.spec.ts: чекбокс согласия не связан label'ом → берём по role.
async function registerAndLogin(page: Page) {
  const email = `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Passw0rd!1');
  await page.getByLabel('Повторите пароль', { exact: true }).fill('Passw0rd!1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

test('a11y: нет серьёзных нарушений на /checkout', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: 'Оформить заказ →' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
