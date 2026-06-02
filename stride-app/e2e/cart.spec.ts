import { test, expect } from '@playwright/test';

test('корзина: степпер меняет подытог, удаление очищает', async ({ page }) => {
  // добавить товар
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();
  // дождаться завершения добавления (POST + cookie) ДО навигации, иначе переход прервёт запрос
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
  await page.goto('/cart');

  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  // увеличить количество
  await page.getByRole('button', { name: 'Увеличить количество' }).click();
  await expect(page.getByText('25 980 ₽').first()).toBeVisible();
  // удалить
  await page.getByRole('button', { name: /Удалить/ }).click();
  await expect(page.getByText('Корзина пустая')).toBeVisible();
});
