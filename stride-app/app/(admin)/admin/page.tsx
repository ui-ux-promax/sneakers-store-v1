import { prisma } from '@/lib/prisma-client';
import { formatPrice } from '@/lib/format';
import {
  resolvePeriod,
  getKpis,
  getRevenueSeries,
  getStatusDistribution,
  getBestSellers,
  getLowStock,
  getRecentOrders,
} from '@/lib/admin/analytics';
import { PeriodToggle } from './_components/period-toggle';
import { KpiCard } from './_components/kpi-card';
import { RevenueChart } from './_components/revenue-chart';
import { StatusDonut } from './_components/status-donut';
import { BestSellers } from './_components/best-sellers';
import { LowStock } from './_components/low-stock';
import { RecentOrders } from './_components/recent-orders';

export const metadata = { title: 'Дашборд' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = resolvePeriod(sp, new Date());

  const [kpis, revenueSeries, statusDist, bestSellers, lowStock, recentOrders] = await Promise.all([
    getKpis(prisma, range),
    getRevenueSeries(prisma, range),
    getStatusDistribution(prisma),
    getBestSellers(prisma, range),
    getLowStock(prisma),
    getRecentOrders(prisma),
  ]);

  return (
    <div className="space-y-8">
      {/* Шапка */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Performance Hub</h2>
          <p className="text-admin-on-surface-variant">Метрики магазина STRIDE за выбранный период</p>
        </div>
        <PeriodToggle />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <KpiCard icon="payments" label="Выручка" value={formatPrice(kpis.revenue.value)} trend={kpis.revenue.trend} />
        <KpiCard icon="shopping_bag" label="Заказы" value={String(kpis.orders.value)} trend={kpis.orders.trend} />
        <KpiCard icon="analytics" label="Средний чек" value={formatPrice(kpis.avgOrder.value)} trend={kpis.avgOrder.trend} />
        <KpiCard icon="person_add" label="Новые клиенты" value={String(kpis.newCustomers.value)} trend={kpis.newCustomers.trend} />
        <KpiCard icon="inventory" label="Продано пар" value={String(kpis.unitsSold.value)} trend={kpis.unitsSold.trend} />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8 bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
          <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Выручка по дням</h3>
          <RevenueChart data={revenueSeries} />
        </div>
        <div className="col-span-12 xl:col-span-4 bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
          <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Статусы заказов</h3>
          <StatusDonut segments={statusDist.segments} total={statusDist.total} />
        </div>
      </div>

      {/* Нижний ряд */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5">
          <BestSellers items={bestSellers} />
        </div>
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <LowStock rows={lowStock} />
          <RecentOrders rows={recentOrders} />
        </div>
      </div>
    </div>
  );
}
