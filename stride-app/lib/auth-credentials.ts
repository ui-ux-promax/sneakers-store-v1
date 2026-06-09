import { normalizeEmail } from '@/lib/auth-identity';
import { verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma-client';

type Role = 'CUSTOMER' | 'ADMIN';
export interface AuthorizedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

// Заранее вычисленный argon2id-хэш фиктивного пароля с теми же параметрами, что и hashPassword
// (m=19456, t=2, p=1). НЕ секрет — это хэш заведомо непригодного пароля. Нужен для constant-time:
// verifyPassword выполняется ВСЕГДА (и при отсутствии пользователя, и для OAuth-аккаунта без
// passwordHash), чтобы убрать timing-энумерацию по разнице «быстрый отказ vs argon2-проверка» (#11).
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$2a8WWB7ZiH+kBMs8nTCCjQ$p1Ep+uloBxIqPETq9YVckxEnLk5CkH3GhbuojbkwrtY';

// Исполняется ТОЛЬКО в Node-рантайме (вызывается из Credentials.authorize в auth.config через
// dynamic import) — поэтому статический импорт prisma/argon2 здесь не утекает в edge-бандл middleware.
export async function authorizeCredentials(creds: unknown): Promise<AuthorizedUser | null> {
  const c = creds as { email?: unknown; password?: unknown } | undefined;
  const email = normalizeEmail(String(c?.email ?? ''));
  const password = String(c?.password ?? '');
  if (!email || !password) return null;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true, passwordHash: true, emailVerified: true } });
  // Всегда тратим один argon2-verify (реальный хэш или dummy) до решения — constant-time.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !ok) return null;

  // Жёсткий gate (P2.2c): неверифицированная почта не пускается. Логин-форма ловит null
  // и поднимает модалку верификации. Google-вход проставляет emailVerified автоматически
  // (auth.ts events), поэтому OAuth этим guard не задет.
  if (!user.emailVerified) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
}
