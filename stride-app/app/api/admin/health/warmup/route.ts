import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma-client';

/**
 * Opportunistic database warm-up endpoint.
 *
 * Neon приостанавливает compute после ~5 минут простоя. Первый запрос
 * после долгого idle занимает 1-10с на «пробуждение». Клиент вызывает
 * этот endpoint сразу при монтировании страницы логина (параллельно с
 * рендером формы), чтобы к моменту отправки учётных данных БД уже была
 * разогрета.
 *
 * Intentionally fire-and-forget — ошибки здесь не показываются пользователю.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    // warn, а не error: cold-start failure не является системным инцидентом.
    logger.warn('warmup_db_not_ready', { err });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

// Всегда выполнять на сервере, не кэшировать.
export const dynamic = 'force-dynamic';
