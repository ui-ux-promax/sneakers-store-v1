import type { UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { ROLE_FILTER_VALUES, CUSTOMER_SORT_VALUES, buildCustomerOrderByClause, escapeLike } from '@/lib/customer-admin';
import { CustomerFilters } from './_components/customer-filters';
import { CustomerTable, type CustomerRow } from './_components/customer-table';

export const metadata = { title: 'Клиенты' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

// Форма строки из raw-запроса. Алиасы snake_case как в SQL; ::int приводит COUNT/SUM к JS number.
type CustomerListRaw = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  order_count: number;
  total_spent: number;
  created_at: Date;
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const role = readEnumParam(sp, 'role', ROLE_FILTER_VALUES);
  const sort = readEnumParam(sp, 'sort', CUSTOMER_SORT_VALUES);

  // Фрагменты WHERE: значения через placeholders (инъекций нет). role сравниваем как text,
  // чтобы не кастовать параметр к enum-типу. Поиск — ILIKE по name/email/phone с экранированием.
  const roleCond = role ? Prisma.sql`AND u.role::text = ${role}` : Prisma.empty;
  const searchCond = q
    ? (() => {
        const pat = `%${escapeLike(q)}%`;
        return Prisma.sql`AND (u.name ILIKE ${pat} OR u.email ILIKE ${pat} OR u.phone ILIKE ${pat})`;
      })()
    : Prisma.empty;

  // ORDER BY — из whitelist (не из ввода) → безопасно через Prisma.raw.
  const orderBy = Prisma.raw(buildCustomerOrderByClause(sort));

  const [rowsRaw, totalRows] = await Promise.all([
    prisma.$queryRaw<CustomerListRaw[]>(Prisma.sql`
      SELECT u.id, u.name, u.email, u.role,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o."totalAmount") FILTER (WHERE o.status::text <> 'CANCELLED'), 0)::int AS total_spent,
             u."createdAt" AS created_at
      FROM "User" u
      LEFT JOIN "Order" o ON o."userId" = u.id
      WHERE 1=1 ${roleCond} ${searchCond}
      GROUP BY u.id
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${skip}
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM "User" u WHERE 1=1 ${roleCond} ${searchCond}
    `),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const meta = buildPaginationMeta({ page, limit }, total);

  const rows: CustomerRow[] = rowsRaw.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    orderCount: r.order_count,
    totalSpent: r.total_spent,
    createdAt: r.created_at,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Клиенты ({total})</h2>
        <p className="text-admin-on-surface-variant">База покупателей, история заказов и управление ролями.</p>
      </div>

      <CustomerFilters />

      {rows.length > 0 ? (
        <CustomerTable rows={rows} page={meta.page} totalPages={meta.totalPages} total={total} limit={limit} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Клиенты не найдены.
        </div>
      )}
    </div>
  );
}
