import { test, expect } from '@playwright/test';

test('лендинг рендерит hero, категории, бестселлеры', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Смотреть каталог' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Бестселлеры' })).toBeVisible();
  // хотя бы одна карточка товара ведёт на /product/
  await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
});
