import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma-client';
import { Heading } from '@/components/admin/heading';
import { CouponForm } from '../../_components/coupon-form';

export const metadata = { title: 'Редактирование купона' };
export const dynamic = 'force-dynamic';

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) notFound();

  return (
    <div className="space-y-8">
      <Heading title="Редактирование купона" description={coupon.code} />
      <CouponForm
        initial={{
          id: coupon.id,
          code: coupon.code,
          percent: coupon.percent,
          active: coupon.active,
          expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
        }}
      />
    </div>
  );
}
