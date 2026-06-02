import { test, expect } from '@playwright/test';

// Статичные legal-страницы (без БД) — проверяем, что h1 каждой рендерится.
const pages: [string, RegExp][] = [
  ['/legal/privacy', /Политика конфиденциальности/],
  ['/legal/terms', /Условия/],
  ['/legal/delivery', /Доставка/],
  ['/legal/refund', /Возврат/],
];

for (const [path, heading] of pages) {
  test(`legal: ${path} рендерится`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
}

test('футер ведёт на legal: «Условия» → /legal/terms', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Условия' }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: /Условия/ })).toBeVisible();
});
