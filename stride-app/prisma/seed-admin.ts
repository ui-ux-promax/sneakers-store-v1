import { hashPassword } from '../lib/password';

// Тип extended-клиента из lib/prisma-client (с $extends-обёрткой retryOnTransient).
type Db = (typeof import('../lib/prisma-client'))['prisma'];

/**
 * Идемпотентный upsert ADMIN-учётки — БЕЗ truncate/down().
 * Безопасно гонять на ЛЮБОЙ БД, включая прод (не трогает каталог/заказы).
 * emailVerified ставим сразу — иначе hard-gate входа (lib/auth-credentials) не пустит.
 * Поле пароля — passwordHash (argon2). Переиспользуется основным сидом (prisma/seed.ts).
 */
export async function upsertAdmin(prisma: Db, email: string, password: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: norm },
    update: { role: 'ADMIN', passwordHash, emailVerified: new Date() },
    create: { email: norm, name: 'Store Admin', role: 'ADMIN', passwordHash, emailVerified: new Date() },
  });
  return norm;
}

// CLI-раннер: `npm run prisma:seed-admin` (через GH workflow admin-seed, Ubuntu→Neon).
// В отличие от prisma:seed здесь НЕТ down()/каталога — только админ. ADMIN_EMAIL/PASSWORD обязательны.
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL и ADMIN_PASSWORD обязательны для prisma:seed-admin');
  }
  const { prisma } = await import('../lib/prisma-client');
  const norm = await upsertAdmin(prisma, email, password);
  console.log(`ADMIN upserted (без truncate): ${norm}`);
  await prisma.$disconnect();
}

// Запускаем main() только при прямом вызове файла, не при импорте upsertAdmin из seed.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
