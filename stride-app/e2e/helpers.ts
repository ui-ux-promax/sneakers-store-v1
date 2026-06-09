import { expect, type Page } from '@playwright/test';

// Фикс-код должен совпадать с playwright.config.ts webServer.env.E2E_TEST_CODE.
export const E2E_CODE = '424242';
export const E2E_PASSWORD = 'Passw0rd!1';

export const uniqueEmail = () => `u${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

// Заполняет неубираемую модалку верификации фикс-кодом и ждёт, пока она исчезнет
// (успешная верификация → auto-login → в хедере «Выйти»).
export async function passVerificationGate(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // OTP: 6 раздельных input — вводим по цифре, авто-сабмит на 6-й.
  const cells = dialog.getByRole('textbox');
  await expect(cells).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await cells.nth(i).fill(E2E_CODE[i]);
  }
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

// Полный флоу: регистрация → gate-модалка → верификация → залогинен.
// Зеркалит форму registerFormSchema; чекбокс согласия не связан label'ом → берём по role.
export async function registerAndVerify(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await passVerificationGate(page);
  return email;
}
