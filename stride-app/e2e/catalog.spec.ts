import { test, expect } from '@playwright/test';

test('каталог: фильтр по категории меняет URL и выдачу', async ({ page }) => {
  await page.goto('/catalog');
  const allCount = await page.locator('article').count();
  expect(allCount).toBeGreaterThan(0);

  // выбрать категорию «Беговые»
  // контролируемый чекбокс инициирует навигацию (URL-driven) → используем click + проверку URL,
  // а не check() (он ждёт мгновенной смены state на том же элементе до ре-рендера).
  await page.getByRole('checkbox', { name: 'Беговые' }).click();
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
