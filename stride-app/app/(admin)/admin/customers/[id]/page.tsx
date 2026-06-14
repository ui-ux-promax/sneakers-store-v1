import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma-client';
import { Icon } from '@/components/admin/icon';
import { formatPrice, formatDateTime, formatDate } from '@/lib/format';
import { orderStatusView } from '@/lib/order';
import { roleView } from '@/lib/customer-admin';
import { RoleToggle } from '../_components/role-toggle';

export const metadata = { title: 'Клиент' };
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 50;

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      phone: true,
      birthdate: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  const [orderCount, spentAgg, reviewAgg, wishlistCount, cartCount, subscriber, orders] = await Promise.all([
    prisma.order.count({ where: { userId: id } }),
    prisma.order.aggregate({ where: { userId: id, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
    prisma.review.aggregate({ where: { userId: id }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.wishlistItem.count({ where: { wishlist: { userId: id } } }),
    prisma.cartItem.count({ where: { cart: { userId: id } } }),
    prisma.subscriber.findUnique({ where: { email: user.email }, select: { unsubscribedAt: true } }),
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        payment: { select: { status: true } },
      },
    }),
  ]);

  const totalSpent = spentAgg._sum.totalAmount ?? 0;
  const reviewCount = reviewAgg._count._all;
  const avgRating = reviewAgg._avg.rating;
  const newsletterActive = !!subscriber && subscriber.unsubscribedAt === null;
  const rv = roleView(user.role);

  return (
    <div className="space-y-8">
      {/* Назад */}
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-admin-on-surface-variant hover:text-admin-on-surface"
      >
        <Icon name="arrow_back" className="text-[18px]" /> К клиентам
      </Link>

      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface">
          {user.name?.trim() || 'Без имени'}
        </h2>
        <span className={rv.badge}>{rv.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* История заказов */}
        <div className="lg:col-span-2 space-y-6">
          <Section title={`История заказов${orderCount > HISTORY_LIMIT ? ` (последние ${HISTORY_LIMIT} из ${orderCount})` : ''}`}>
            {orders.length === 0 ? (
              <p className="text-sm text-admin-on-surface-variant">Заказов нет.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[12px] uppercase tracking-widest text-admin-on-surface-variant">
                      <th className="px-2 py-2">Заказ</th>
                      <th className="px-2 py-2">Дата</th>
                      <th className="px-2 py-2">Статус</th>
                      <th className="px-2 py-2 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-outline-variant">
                    {orders.map((o) => {
                      const sv = orderStatusView(o.status, o.payment?.status);
                      return (
                        <tr key={o.id} className="hover:bg-admin-surface-high transition-colors">
                          <td className="px-2 py-3">
                            <Link
                              href={`/admin/orders/${o.id}`}
                              className="font-bold text-admin-on-surface hover:underline tabular-nums"
                            >
                              #{o.orderNumber}
                            </Link>
                          </td>
                          <td className="px-2 py-3 text-admin-on-surface-variant tabular-nums">{formatDateTime(o.createdAt)}</td>
                          <td className="px-2 py-3"><span className={sv.badge}>{sv.label}</span></td>
                          <td className="px-2 py-3 text-right font-bold text-admin-on-surface tabular-nums">{formatPrice(o.totalAmount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Боковая колонка */}
        <div className="space-y-6">
          <Section title="Профиль">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-admin-surface-high border border-admin-outline-variant overflow-hidden flex items-center justify-center shrink-0">
                {user.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- admin avatar */
                  <img src={user.image} alt="" className="object-cover w-full h-full" />
                ) : (
                  <Icon name="person" className="text-admin-on-surface-variant" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-admin-on-surface truncate">{user.email}</span>
                  <Icon
                    name={user.emailVerified ? 'verified' : 'gpp_maybe'}
                    className={user.emailVerified ? 'text-[16px] text-admin-primary' : 'text-[16px] text-admin-on-surface-variant'}
                  />
                </div>
                <div className="text-xs text-admin-on-surface-variant">
                  {user.emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
                </div>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Телефон" value={user.phone || '—'} />
              <Row label="Дата рождения" value={user.birthdate ? formatDate(user.birthdate) : '—'} />
              <Row label="Регистрация" value={formatDateTime(user.createdAt)} />
            </dl>
          </Section>

          <Section title="Сводка">
            <dl className="space-y-2 text-sm">
              <Row label="Заказов" value={String(orderCount)} />
              <Row label="Потрачено" value={formatPrice(totalSpent)} />
              <Row
                label="Отзывов"
                value={reviewCount > 0 && avgRating != null ? `${reviewCount} (★ ${avgRating.toFixed(1)})` : String(reviewCount)}
              />
              <Row label="В избранном" value={String(wishlistCount)} />
              <Row label="В корзине" value={String(cartCount)} />
              <Row label="Рассылка" value={newsletterActive ? 'Подписан' : 'Нет'} />
            </dl>
          </Section>

          <Section title="Роль">
            <RoleToggle userId={user.id} currentRole={user.role} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-admin-on-surface-variant shrink-0">{label}</dt>
      <dd className="text-admin-on-surface text-right break-words">{value}</dd>
    </div>
  );
}
