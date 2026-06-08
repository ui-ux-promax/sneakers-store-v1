import { request } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

// Прогрев перед e2e: будит Neon-compute и WRITE-путь, компилирует dev-маршруты,
// чтобы первый тест не нёс на себе cold-start (один запрос к Neon может упереться
// в fetch-таймаут, а POST /api/cart делает несколько последовательных запросов).
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3000' });

  // 1) READ-маршруты (компиляция dev + пробуждение compute)
  for (const u of ['/api/cart', '/', '/catalog', '/catalog?category=running', '/product/stride-velocity-trail', '/wishlist']) {
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const res = await ctx.get(u, { timeout: 60_000 });
        if (res.ok()) break;
      } catch {
        /* транзиентный cold-start — повторяем */
      }
    }
  }

  // 2) WRITE-путь: реальный POST /api/cart (findOrCreateCart→variant→cartItem→recalc) прогревает запись.
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  try {
    if (url) {
      const sql = neon(url);
      // neon http sql() работает как tagged template; выполняем сырую строку через искусственный массив
      const q = 'SELECT id FROM "ProductVariant" WHERE sku = \'SVT-LIME-42\' LIMIT 1';
      const t = [q] as unknown as TemplateStringsArray;
      (t as unknown as { raw: string[] }).raw = [q];
      const rows = (await (sql as unknown as (s: TemplateStringsArray) => Promise<Array<{ id: string }>>)(t));
      const vid = rows?.[0]?.id;
      if (vid) {
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const res = await ctx.post('/api/cart', { data: { productVariantId: vid }, timeout: 60_000 });
            if (res.ok()) break;
          } catch {
            /* прогреваем — игнорируем */
          }
        }
      }
    }
  } catch {
    /* прогрев write-пути необязателен */
  }

  await ctx.dispose();

  // 3) KEEP-WARM: пока идёт прогон, лёгкий SELECT 1 каждые 15с не даёт Neon-compute
  // повторно «заснуть» по idle-таймауту (последние по алфавиту спеки — product.* — иначе
  // бьют по холодному compute, цепочки HTTP round-trip упираются в таймауты Playwright).
  // globalSetup, вернувший функцию, вызывает её как globalTeardown — там гасим интервал.
  let keepWarm: ReturnType<typeof setInterval> | undefined;
  if (url) {
    const sql = neon(url);
    keepWarm = setInterval(() => {
      void (sql as unknown as (s: TemplateStringsArray) => Promise<unknown>)(
        Object.assign(['SELECT 1'], { raw: ['SELECT 1'] }) as unknown as TemplateStringsArray,
      ).catch(() => { /* транзиентный — игнор */ });
    }, 15_000);
    keepWarm.unref?.(); // не держать процесс живым ради интервала
  }

  return async () => {
    if (keepWarm) clearInterval(keepWarm);
  };
}
