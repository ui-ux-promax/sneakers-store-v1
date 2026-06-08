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

test('каталог: пагинация на уровне БД — переход на страницу 2 меняет URL и выдачу', async ({ page }) => {
  await page.goto('/catalog');
  // Сид содержит >12 товаров (PAGE_SIZE) → есть вторая страница.
  const pager = page.getByRole('navigation', { name: 'Пагинация' });
  await expect(pager).toBeVisible();

  const firstNameP1 = await page.locator('article h3').first().textContent();
  const countP1 = await page.locator('article').count();
  expect(countP1).toBe(12); // первая страница заполнена ровно PAGE_SIZE

  await pager.getByRole('button', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);

  const countP2 = await page.locator('article').count();
  expect(countP2).toBeGreaterThan(0);
  const firstNameP2 = await page.locator('article h3').first().textContent();
  expect(firstNameP2).not.toBe(firstNameP1); // другой набор товаров
});

test('каталог: сортировка по цене (asc) — видимые цены не убывают', async ({ page }) => {
  await page.goto('/catalog?sort=price-asc');
  // Активная цена — первый <span> в блоке цены карточки; парсим цифры из "6 990 ₽".
  const priceTexts = await page.locator('article .tnum.font-bold > span:first-child').allTextContents();
  const prices = priceTexts.map((t) => Number(t.replace(/[^\d]/g, ''))).filter((n) => n > 0);
  expect(prices.length).toBeGreaterThan(1);
  for (let i = 1; i < prices.length; i++) {
    expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
  }
});
