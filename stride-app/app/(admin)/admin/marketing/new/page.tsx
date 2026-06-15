import { Heading } from '@/components/admin/heading';
import { CouponForm } from '../_components/coupon-form';

export const metadata = { title: 'Новый купон' };

export default function NewCouponPage() {
  return (
    <div className="space-y-8">
      <Heading title="Новый купон" description="Процентный промокод" />
      <CouponForm />
    </div>
  );
}
