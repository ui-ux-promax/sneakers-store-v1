import type { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { ORDER_STATUS_META } from '@/lib/order';
import { ORDER_STATUS_VALUES, PAYMENT_STATUS_VALUES } from '@/lib/order-admin';
import { formatDateTime } from '@/lib/format';
import { OrderFilters } from './_components/order-filters';
import { OrderTable, type OrderRow } from './_components/order-table';

export const metadata = { title: 'Заказы' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

const PAYMENT_FILTER_VALUES = [...PAYMENT_STATUS_VALUES, 'none'] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const status = readEnumParam(sp, 'status', ORDER_STATUS_VALUES);
  const payment = readEnumParam(sp, 'payment', PAYMENT_FILTER_VALUES);

  // Числовой запрос трактуем как номер заказа — точное совпадение по orderNumber, БЕЗ матча по
  // контактам (иначе цифры из email/телефона дают ложные строки). Текст → поиск по контактам.
  const qNum = /^\d+$/.test(q) && Number(q) <= 2147483647 ? Number(q) : undefined;
  const searchOR: Prisma.OrderWhereInput[] = !q
    ? []
    : qNum !== undefined
      ? [{ orderNumber: qNum }]
      : [
          { contactName: { contains: q, mode: 'insensitive' } },
          { contactPhone: { contains: q, mode: 'insensitive' } },
          { contactEmail: { contains: q, mode: 'insensitive' } },
        ];

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(payment === 'none'
      ? { payment: { is: null } }
      : payment
        ? { payment: { is: { status: payment } } }
        : {}),
    ...(searchOR.length ? { OR: searchOR } : {}),
  };

  const [total, orders, statusGroups] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
        contactName: true,
        contactEmail: true,
        createdAt: true,
        payment: { select: { status: true } },
        items: { select: { imageUrl: true, quantity: true } },
      },
    }),
    // Сводка-чипы: счётчик заказов по каждому статусу (без учёта фильтров — общая картина).
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const meta = buildPaginationMeta({ page, limit }, total);
  const rows: OrderRow[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.payment?.status ?? null,
    paymentMethod: o.paymentMethod,
    contactName: o.contactName,
    contactEmail: o.contactEmail,
    itemCount: o.items.reduce((s, it) => s + it.quantity, 0),
    totalAmount: o.totalAmount,
    coverImage: o.items.find((it) => it.imageUrl)?.imageUrl ?? null,
    createdLabel: formatDateTime(o.createdAt),
  }));

  const countByStatus = new Map<OrderStatus, number>();
  for (const g of statusGroups) countByStatus.set(g.status, g._count._all);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Заказы ({total})</h2>
        <p className="text-admin-on-surface-variant">Просмотр заказов, смена статуса и отмена.</p>
      </div>

      {/* Чипы-счётчики по статусам */}
      <div className="flex flex-wrap gap-3">
        {ORDER_STATUS_VALUES.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 bg-admin-surface border border-admin-outline-variant rounded-full px-4 py-2"
          >
            <span className={ORDER_STATUS_META[s].badge}>{ORDER_STATUS_META[s].label}</span>
            <span className="font-bold text-admin-on-surface tabular-nums">{countByStatus.get(s) ?? 0}</span>
          </div>
        ))}
      </div>

      <OrderFilters />

      {rows.length > 0 ? (
        <OrderTable rows={rows} page={meta.page} totalPages={meta.totalPages} total={total} limit={limit} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Заказы не найдены.
        </div>
      )}
    </div>
  );
}
