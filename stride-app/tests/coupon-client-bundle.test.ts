import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Регрессия: client-острова НЕ должны импортить prisma-тянущие модули. Иначе PrismaClient
// инициализируется в браузере → рантайм-краш (ловится ТОЛЬКО на preview, не tsc/vitest).
// Грабли: lib/coupon тянет lib/prisma-client; client-safe аналог нормализации — инлайн,
// статус — @/lib/coupon-status.
const CLIENT_ISLANDS = [
  'app/(admin)/admin/marketing/_components/coupon-form.tsx',
  'app/(admin)/admin/marketing/_components/coupon-table.tsx',
  'app/(admin)/admin/marketing/_components/coupon-filters.tsx',
];

const FORBIDDEN = [
  /from\s+['"]@\/lib\/prisma-client['"]/,
  // lib/coupon тянет prisma; client-safe аналог статуса — @/lib/coupon-status (с '-status' regex не матчит)
  /from\s+['"]@\/lib\/coupon['"]/,
];

describe('coupon admin client islands stay prisma-free', () => {
  for (const rel of CLIENT_ISLANDS) {
    it(`${rel} does not import prisma-dragging modules`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src.startsWith("'use client'")).toBe(true);
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} imports forbidden module matching ${re}`).toBe(false);
      }
    });
  }
});
