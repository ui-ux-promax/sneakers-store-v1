import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { prisma } from '@/lib/prisma-client';
import { readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { normalizeCouponCode } from '@/lib/coupon';
import { couponStatus } from '@/lib/coupon-status';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { CouponFilters } from './_components/coupon-filters';
import { CouponTable, type CouponRow } from './_components/coupon-table';

export const metadata = { title: 'Купоны' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const STATUS_VALUES = ['active', 'inactive', 'expired'] as const;

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = readSearchQuery(sp);
  const status = readEnumParam(sp, 'status', STATUS_VALUES);
  const now = new Date();

  const where: Prisma.CouponWhereInput = {
    ...(q ? { code: { contains: normalizeCouponCode(q) } } : {}),
    ...(status === 'active'
      ? { active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
      : status === 'inactive'
        ? { active: false }
        : status === 'expired'
          ? { expiresAt: { lt: now } }
          : {}),
  };

  const coupons = await prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });

  const rows: CouponRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    percent: c.percent,
    active: c.active,
    status: couponStatus(c, now),
    expiresLabel: c.expiresAt ? formatDate(c.expiresAt) : 'Бессрочный',
    createdLabel: formatDate(c.createdAt),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Купоны ({rows.length})</h2>
          <p className="text-admin-on-surface-variant">Процентные промокоды на сумму товаров.</p>
        </div>
        <Button asChild>
          <Link href="/admin/marketing/new">
            <Icon name="add" className="text-[18px]" /> Добавить купон
          </Link>
        </Button>
      </div>

      <CouponFilters />

      {rows.length > 0 ? (
        <CouponTable rows={rows} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Купоны не найдены.
        </div>
      )}
    </div>
  );
}
