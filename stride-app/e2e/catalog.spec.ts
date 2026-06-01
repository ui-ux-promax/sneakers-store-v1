import { test, expect } from '@playwright/test';

test('каталог: фильтр по категории меняет URL и выдачу', async ({ page }) => {
  await page.goto('/catalog');
  const allCount = await page.locator('article').count();
  expect(allCount).toBeGreaterThan(0);

  // выбрать категорию «Беговые»
  await page.getByRole('checkbox', { name: 'Беговые' }).check();
  await expect(page).toHaveURL(/category=running/);
  // должна остаться хотя бы одна карточка и количество не больше исходного
  const filtered = await page.locator('article').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(allCount);
});

test('каталог: пустая выдача при несовместимых фильтрах', async ({ page }) => {
  await page.goto('/catalog?q=zzzнеттакого');
  await expect(page.getByText('Таких кроссовок нет')).toBeVisible();
});
