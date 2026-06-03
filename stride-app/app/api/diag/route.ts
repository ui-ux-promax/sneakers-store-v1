import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma-client';

// ВРЕМЕННЫЙ диагностический эндпоинт (удалить после отладки P2.0): /api/diag
// Показывает, какую БД/схему реально видит prisma-клиент приложения в рантайме
// и существуют ли там таблицы User/CartItem — чтобы развести «консоль vs приложение».
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const info = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      // current_database()/current_schema() возвращают PG-тип `name` (OID 19), который
      // Neon-адаптер Prisma не умеет десериализовать (P2010) — приводим к text.
      `select current_database()::text as database, current_schema()::text as schema, version() as version`,
    );
    const reg = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `select to_regclass('public."User"')::text as user_table,
              to_regclass('public."Account"')::text as account_table,
              to_regclass('public."CartItem"')::text as cartitem_table`,
    );
    const tablesRows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      // information_schema.tables.table_name — домен sql_identifier поверх `name`; тот же P2010.
      `select table_name::text as table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const counts: Record<string, unknown> = {};
    try {
      const userCount = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`select count(*)::int as n from "User"`);
      counts.userCount = Number(userCount[0]?.n ?? -1);
    } catch (e) {
      counts.userCountError = (e as { code?: unknown })?.code ?? String((e as Error)?.message ?? e);
    }
    return NextResponse.json({
      ok: true,
      info: info[0],
      regclass: reg[0],
      counts,
      tables: tablesRows.map((t) => t.table_name),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, code: (e as { code?: unknown })?.code, error: String((e as Error)?.message ?? e) },
      { status: 500 },
    );
  }
}
