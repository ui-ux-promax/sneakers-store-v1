import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/password';

// 6-значный код, криптостойко. randomInt верхняя граница исключается → 0..999999.
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Переиспользуем argon2 из lib/password (тот же профиль OPTS).
export function hashCode(code: string): Promise<string> {
  return hashPassword(code);
}

export function verifyCodeHash(code: string, hashed: string): Promise<boolean> {
  return verifyPassword(code, hashed);
}
