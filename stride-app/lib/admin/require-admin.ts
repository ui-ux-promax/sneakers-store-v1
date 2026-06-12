/**
 * Три варианта проверки прав администратора:
 *   requireAdminApi    — для route-handler'ов (возвращает NextResponse или null)
 *   requireAdminPage   — для RSC-страниц (бросает redirect, никогда не возвращает гостю)
 *   requireAdminAction — для server action'ов (возвращает {ok} envelope, как везде в проекте)
 *
 * Роль живёт в JWT (token.role → session.user.role) — prisma не нужна.
 * Импортируем auth() из @/auth, который использует Node-рантайм (не edge).
 */

import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '@/auth';

// auth() в Auth.js v5 перегружен (middleware-обёртка + аксессор сессии), поэтому
// ReturnType<typeof auth> резолвится в неправильную перегрузку. Берём тип Session напрямую.
type AdminSession = Session | null;

/** Route-handler guard. Возвращает NextResponse для ранней отдачи, либо null — значит вызывающий является ADMIN. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  return null;
}

/** RSC page guard. Не-админу никогда не возвращается — redirect() бросает исключение (never). */
export async function requireAdminPage(): Promise<NonNullable<AdminSession>> {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/admin');
  if (session.user.role !== 'ADMIN') redirect('/');
  return session;
}

/** Server-action guard. Возвращает {ok} envelope в стиле проекта. */
export async function requireAdminAction():
  Promise<{ ok: true; session: NonNullable<AdminSession> } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Не авторизован' };
  if (session.user.role !== 'ADMIN') return { ok: false, error: 'Доступ запрещён' };
  return { ok: true, session };
}
