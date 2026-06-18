import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Один воркер: e2e гоняется на `next dev`, и при 2 воркерах разные spec-файлы шлют
  // КОНКУРЕНТНЫЕ server actions → Next 15.1.x в dev периодически теряет async-request-scope
  // → `cookies()` бросает "outside request scope" в логаут-экшене (флак auth-теста). Прод на
  // Vercel serverless-изолирован, там этого нет. Сериализация убирает гонку (e2e чуть дольше).
  workers: 1,
  retries: 2, // транзиентные Neon-аборты (cold start «operation aborted») на медленном соединении
  timeout: 120_000,
  expect: { timeout: 40_000 },
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 40_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // dev-сервер: NODE_ENV=development → cookie cartToken без secure → сохраняется по http
    // (в prod-сборке secure:true и cookie не персистится по http в e2e). Прогрев маршрутов — в globalSetup.
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 180_000,
    // E2E-фикс код верификации: generateCode вернёт его вместо случайного (только не-prod),
    // чтобы хелпер registerAndVerify прошёл gate-модалку. Прод этой ветки не касается.
    env: {
      E2E_TEST_CODE: '424242',
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, 'e2e', 'next-font-google-mocks.cjs'),
    },
  },
});
