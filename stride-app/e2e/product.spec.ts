import { test, expect } from '@playwright/test';

test('PDP: переключение расцветки, выбор размера, добавление в корзину', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByRole('heading', { name: /Velocity Trail/ })).toBeVisible();

  // переключить расцветку → меняется ?color= (свотчи — ссылки <Link>, role=link, для шарящегося URL/SEO)
  await page.getByRole('link', { name: /Цвет Trail Black/ }).click();
  await expect(page).toHaveURL(/color=trail-black/);

  // вернуться на дефолтную и выбрать доступный размер 42
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: /В корзину/ }).click();

  // бейдж корзины показывает 1
  await expect(page.getByRole('link', { name: /Корзина, 1 товара/ })).toBeVisible();
});

test('PDP: недоступный размер (stock 0) — disabled', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await expect(page.getByRole('button', { name: '43', exact: true })).toBeDisabled();
});

test('Корзина: повторное добавление того же варианта увеличивает количество (дедуп)', async ({ page }) => {
  await page.goto('/product/stride-velocity-trail');
  await page.getByRole('button', { name: '42', exact: true }).click();
  const addBtn = page.getByRole('button', { name: /В корзину/ });
  await addBtn.click();
  // дождаться подтверждения первого добавления, затем возврата кнопки к «В корзину» — и добавить снова
  await expect(page.getByRole('button', { name: /Добавлено/ })).toBeVisible();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await page.goto('/cart');
  // одна позиция, количество 2
  await expect(page.locator('article').filter({ hasText: 'Velocity Trail' })).toHaveCount(1);
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
});
