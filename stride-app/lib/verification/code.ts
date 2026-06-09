import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/password';

// 6-значный код, криптостойко. randomInt верхняя граница исключается → 0..999999.
// E2E: при заданном E2E_TEST_CODE (только не-prod) возвращаем фикс-код, чтобы Playwright
// мог пройти gate-флоу без чтения почты. В prod ветка недоступна (NODE_ENV==='production').
export function generateCode(): string {
  const fixed = process.env.E2E_TEST_CODE;
  if (fixed && process.env.NODE_ENV !== 'production' && /^\d{6}$/.test(fixed)) {
    return fixed;
  }
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Переиспользуем argon2 из lib/password (тот же профиль OPTS).
export function hashCode(code: string): Promise<string> {
  return hashPassword(code);
}

export function verifyCodeHash(code: string, hashed: string): Promise<boolean> {
  return verifyPassword(code, hashed);
}
